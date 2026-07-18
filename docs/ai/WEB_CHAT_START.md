# Web Chat Start

Short entry point for a GitHub-aware Web Chat working on `Real-Wargame`.

## 1. Facts that must not be guessed

- Repository: `AndrewVerhoturov1/Real-wargame`.
- Working branch: `real-wargame-preview`.
- Stable branch: `main`.
- Feature branch pattern: `feature/YYYYMMDD-short-kebab-slug`.
- Stack: Vite + TypeScript + PixiJS **8**.
- This is not a Godot project.
- Canonical development names are English.
- Russian is the default human-facing language and must be complete.

Machine-readable source:

```text
docs/ai/repo-context.json
```

Canonical delivery workflow:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## 2. Minimal reading route

Read only:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant skill from `docs/ai/SKILLS_INDEX.md`.

For runtime-affecting work also read:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

Do not read all journals, plans, screenshots or skills by default.

## 3. Mandatory task start

For every implementation task:

1. resolve the exact current head of `real-wargame-preview`;
2. record it as `base_commit`;
3. create one `feature/YYYYMMDD-short-kebab-slug` branch from that exact commit;
4. do implementation, commits, pushes and later product fixes on that branch;
5. do not modify `real-wargame-preview` during development;
6. do not modify `main`.

A Pull Request is not the default development route.

## 4. Web Chat responsibilities

Web Chat owns:

- investigation and implementation;
- focused tests and non-browser verification;
- feature-branch commits and pushes;
- manual live-test instructions;
- all product fixes on the same feature branch;
- visual verification after explicit approval;
- transfer into preview after explicit user GO.

Do not hand implementation or bug fixing to Codex.

## 5. Focused non-browser verification

Before live testing, run the smallest sufficient matrix:

```text
npx tsc --noEmit
+ focused subsystem smoke tests
+ npm run build
+ docs checks when applicable
```

Do not run by default every smoke test, broad matrices, Chromium, Playwright, unjustified performance workflows or Vercel deployment.

If Node commands are unavailable, report that honestly. A small non-browser Actions check is an optional fallback.

## 6. Readiness report

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
changed_files:
checks_run:
not_checked:
manual_checks_needed:
visual_qa_prepared:
preview_touched: no
main_touched: no
```

For user-visible work, explain exactly what the human should try in the live application.

## 7. Codex handoff

The user gives Codex the repository, feature branch and exact commit.

Codex only exposes the already-pushed branch as a branch-linked Vercel Preview and returns:

```text
feature_branch:
current_commit:
vercel_branch_preview:
vercel_commit_preview:
deployment_status:
code_changed: no
preview_touched: no
main_touched: no
```

Codex does not modify code, create replacement commits, fix bugs, merge or transfer branches. Later pushes to the same feature branch must update the Preview without Codex re-entry.

## 8. Live-test revision loop

When the user reports a product problem:

1. stay on the same feature branch;
2. reproduce it;
3. add/update focused regression coverage when practical;
4. fix product code there;
5. rerun focused non-browser checks;
6. commit and push the same branch;
7. report the new exact commit.

Do not create a new feature branch for every defect.

## 9. Visual verification: automatic mandatory skill selection

The user does not need to name a skill.

These and equivalent phrases are sufficient:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь Vercel Preview
```

When visual verification is requested, first determine whether the current Web Chat can directly control a real browser against the target deployment.

### Direct browser available

Read and use:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Direct browser unavailable

**MUST read and use:**

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

Do not wait for the user to say the skill name. User intent is the trigger.

The deployed-Vercel skill is mandatory when:

- the user requested visual/browser/screenshot/Playwright verification;
- the branch-linked Vercel Preview URL exists;
- the current environment cannot directly control a browser against it.

It uses temporary CI-only base/head branches and a temporary PR that must never be merged. Product code is not fixed on CI branches. Application defects return to the canonical feature branch; a new product SHA requires fresh CI branches and fresh evidence.

Never commit Vercel share tokens or bypass secrets, including to temporary branches.

A valid result requires the real deployed app, a real browser, a state-changing scenario, `evidence.json`, fresh PNGs, run/artifact identity checks and opened/inspected key frames.

Canonical policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## 10. Transfer gate

Transfer into `real-wargame-preview` only after explicit user GO for the exact tested feature commit.

Before transfer:

- update the feature branch from current preview when necessary;
- resolve conflicts on the feature branch;
- rerun focused checks for the final diff;
- transfer the accepted result;
- report the resulting preview commit.

A PR may be used only when explicitly requested or technically required by repository protection.

Never:

- implement directly on preview;
- write to `main` without explicit human GO;
- merge without explicit human GO;
- enable auto-merge;
- claim a local-PC run when only Actions ran;
- claim visual success without inspecting fresh evidence;
- treat visual success as preview-transfer approval;
- publish `.env`, tokens, private keys or personal data.

## 11. Parallel ordinary chats

Parallel chats may help with research or competing proposals. One designated Web Chat still owns the canonical feature branch and integrates selected results there.

Read:

```text
docs/orchestration/CHAT_WORKFLOW.md
docs/orchestration/ORCHESTRATOR_PROMPT.md
docs/orchestration/WORKER_PROMPT.md
docs/orchestration/INTEGRATOR_PROMPT.md
```

Workers do not update preview and do not create their own Codex or visual-delivery route.

## 12. Task routing and status

Use:

```text
docs/ai/TASK_ROUTER.md
```

Current status is edited only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run `npm run docs:sync`. Do not edit generated files manually.

## 13. Required final report

Use `AGENTS.md` and `docs/orchestration/RESULT_TEMPLATE.md`. Explain the result in simple Russian. The user is not required to work with Git or the terminal.