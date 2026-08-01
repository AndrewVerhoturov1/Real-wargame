#!/usr/bin/env bash
set -u

mode="${1:-}"
required_start="cd802d92613b64df76552c429a664bb4cbcd909c"
platform_head="af9e54036658e95a8df680658be73e589efae4b4"
shell_head="26e7cc7fe9c6fc7855d2781fc2c0a539cbb1a049"
failures=0

run_check() {
  local label="$1"
  shift
  echo "===== ${label} ====="
  "$@"
  local code=$?
  echo "EXIT_CODE ${label}: ${code}"
  if [ "${code}" -ne 0 ]; then failures=1; fi
  return 0
}

run_shell() {
  local label="$1"
  local command="$2"
  run_check "${label}" bash -lc "${command}"
}

verify_clean_tree() {
  local label="$1"
  local status
  status="$(git status --short)"
  printf '%s\n' "${status}"
  if [ -n "${status}" ]; then
    echo "${label}: working tree is not clean"
    return 1
  fi
}

run_baseline() {
  local worktree="/tmp/wave1-baseline-${GITHUB_RUN_ID:-manual}"
  rm -rf "${worktree}"
  git worktree add --detach "${worktree}" "${required_start}"
  pushd "${worktree}" >/dev/null
  echo "HEAD: $(git rev-parse HEAD)"
  run_shell "required starting HEAD" "test \"$(git rev-parse HEAD)\" = \"${required_start}\""
  run_check "clean starting tree" verify_clean_tree "starting"
  run_shell "platform merge base" "test \"$(git merge-base HEAD ${platform_head})\" = \"${platform_head}\""
  run_shell "shell history merge base" "test \"$(git merge-base HEAD ${shell_head})\" = \"233e14fb17cdfa3edcf76724042d4c35fd4ae5f1\""
  run_shell "npm ci --no-audit --no-fund" "npm ci --no-audit --no-fund"

  set +e
  npm run app-shell-overlay:smoke
  local shell_code=$?
  npm run posture-transition:smoke
  local posture_code=$?
  set -e
  echo "EXPECTED_RED app-shell-overlay: ${shell_code}"
  echo "EXPECTED_RED posture-transition: ${posture_code}"
  if [ "${shell_code}" -eq 0 ] || [ "${posture_code}" -eq 0 ]; then
    echo "Both known defects must reproduce on the exact starting HEAD."
    failures=1
  fi
  popd >/dev/null
  git worktree remove --force "${worktree}"
}

run_red() {
  run_shell "npm ci --no-audit --no-fund" "npm ci --no-audit --no-fund"
  set +e
  npm run posture-transition:smoke
  local code=$?
  set -e
  echo "EXPECTED_RED strengthened posture regression: ${code}"
  if [ "${code}" -eq 0 ]; then
    echo "Strengthened regression unexpectedly passed before production fix."
    failures=1
  fi
}

run_focused() {
  run_shell "npm ci --no-audit --no-fund" "npm ci --no-audit --no-fund"
  run_shell "npm run app-shell-overlay:smoke" "npm run app-shell-overlay:smoke"
  run_shell "npm run posture-transition:smoke" "npm run posture-transition:smoke"
  run_shell "npm run infantry-combat-stage9:verify" "npm run infantry-combat-stage9:verify"
  run_check "clean tree after focused checks" verify_clean_tree "focused"
}

run_full_matrix() {
  run_shell "npm ci --no-audit --no-fund" "npm ci --no-audit --no-fund"
  run_shell "git diff --check platform...HEAD" "git diff --check ${platform_head}...HEAD"
  run_check "git status --short before" verify_clean_tree "before matrix"
  run_shell "npm run app-shell-overlay:smoke" "npm run app-shell-overlay:smoke"
  run_shell "npm run shared-game-editors:smoke" "npm run shared-game-editors:smoke"
  run_shell "npm run typecheck" "npm run typecheck"
  run_shell "npm run combat-lab-ui-contract:smoke" "npm run combat-lab-ui-contract:smoke"
  run_shell "npm run editor:smoke" "npm run editor:smoke"
  run_shell "npm run workspace-architecture-contract:smoke" "npm run workspace-architecture-contract:smoke"
  run_shell "npm run performance-contract:smoke" "npm run performance-contract:smoke"
  run_shell "npm run graph-v2:smoke" "npm run graph-v2:smoke"
  run_shell "npm run movement-profiles:smoke" "npm run movement-profiles:smoke"
  run_shell "npm run combat-catalog-editor:smoke" "npm run combat-catalog-editor:smoke"
  run_shell "npm run attention-profiles:smoke" "npm run attention-profiles:smoke"
  run_shell "npm run directional-terrain:smoke" "npm run directional-terrain:smoke"
  run_shell "npm run environment-materials:smoke" "npm run environment-materials:smoke"
  run_shell "npm run posture-transition:smoke" "npm run posture-transition:smoke"
  run_shell "npm run combat-lab-scenario-system:verify" "npm run combat-lab-scenario-system:verify"
  run_shell "npm run combat-lab-experiment:smoke" "npm run combat-lab-experiment:smoke"
  run_shell "npm run combat-lab-batch:smoke" "npm run combat-lab-batch:smoke"
  run_shell "npm run infantry-combat-stage9:verify" "npm run infantry-combat-stage9:verify"
  run_shell "npm run build" "npm run build"
  run_check "git status --short after" verify_clean_tree "after matrix"
}

run_browser() {
  if [ "${failures}" -ne 0 ]; then
    echo "Browser verification skipped because the mandatory command matrix is not green."
    return
  fi
  run_shell "install temporary Playwright runtime" "npm install --no-save --package-lock=false playwright@1.54.2"
  run_shell "install Chromium" "npx playwright install --with-deps chromium"
  if [ "${failures}" -ne 0 ]; then return; fi

  npm run preview -- --host 127.0.0.1 --port 4173 > /tmp/wave1-vite-preview.log 2>&1 &
  local preview_pid=$!
  local ready=0
  for _ in $(seq 1 60); do
    if curl --fail --silent http://127.0.0.1:4173/ > /dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "${ready}" -ne 1 ]; then
    cat /tmp/wave1-vite-preview.log
    failures=1
  else
    run_shell "browser verification" "node scripts/.tmp-wave1-browser-verification.mjs"
  fi
  kill "${preview_pid}" 2>/dev/null || true
  wait "${preview_pid}" 2>/dev/null || true
  run_check "clean tree after browser verification" verify_clean_tree "browser"
}

echo "MODE: ${mode}"
echo "TRIGGER_HEAD: $(git rev-parse HEAD)"
echo "STARTED_UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

case "${mode}" in
  baseline) run_baseline ;;
  red) run_red ;;
  focused) run_focused ;;
  verify)
    run_full_matrix
    run_browser
    ;;
  *)
    echo "Unknown verification mode: ${mode}"
    failures=1
    ;;
esac

echo "FINISHED_UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "FINAL_RESULT: $([ "${failures}" -eq 0 ] && echo PASS || echo FAIL)"
exit "${failures}"
