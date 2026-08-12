---
name: real-wargame-orchestration
description: "Use when Codex must orchestrate a Real-Wargame task across the user and a Web Chat: choose simple or orchestrated mode, resolve the exact feature branch and commit SHA, prepare a Web Chat handoff, verify the exact pushed SHA, review or test it independently, send actionable fixes, or coordinate transfer after explicit user GO."
license: MIT
---

# Real-Wargame Orchestration

Codex is the orchestrator and independent reviewer/tester/operator. The Web Chat remains the normal owner of product-code implementation. GitHub is the persistent shared state; exact commit SHA is the unit of handoff and review.

Canonical protocol:

```text
docs/orchestration/ORCHESTRATION_PROTOCOL.md
```

## Algorithm

1. **Receive the task.** Record the goal, the owning subproject if any, and the forbidden areas.
2. **Choose the mode.**
   - Simple: a normal product task goes directly to the Web Chat via `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`.
   - Orchestrated: the task needs coordination, independent review or multiple sessions. Orchestrate it.
3. **Resolve the exact base.** Fetch the current remote `real-wargame-preview` HEAD and record the full 40-character `base_commit`. Never assume a SHA.
4. **Prepare the handoff.** State one feature branch `feature/YYYYMMDD-short-kebab-slug`, `base_commit`, goal, allowed/forbidden changes and required output (see `docs/orchestration/RESULT_TEMPLATE.md`). Use GitHub as the shared channel; record required context in the branch, in docs or in an Issue, never only locally.
5. **Receive the commit.** The Web Chat returns the pushed feature branch with `current_commit` and `base_commit`.
6. **Fetch and verify the exact SHA.** Fetch the branch, checkout the claimed commit and confirm `git rev-parse HEAD` matches the reported SHA. Review the `base_commit...current_commit` diff.
7. **Review or test independently.** Inspect scope, imports, generated files and secrets. Run focused checks when the environment allows. Use GitHub, skills, MCP and browser/screenshots only through the repository skills:
   - screenshots/visual QA: `.agents/skills/real-wargame-screenshots/SKILL.md`;
   - runtime/perf: `.agents/skills/real-wargame-performance/SKILL.md`;
   - deploy: `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`.
8. **Send actionable fixes or hand to the user.** Each remark: where, what, why, expected result. Do not write product code yourself; send fixes to the Web Chat on the same feature branch.
9. **After explicit user GO**, coordinate transfer of the exact accepted commit into `real-wargame-preview`. Transfer and deployment remain separate permissions.

## Boundaries

- Codex does not implement product code, merge, retarget or transfer without explicit permission.
- Codex never writes to `main`, never deploys without an explicit user request, and never touches `real-wargame-preview` before GO.
- Product fixes stay on the same feature branch.
- An Issue is needed only for a long-lived multi-session unit, a public decision record or cross-branch tracking, never for every small task.
- Do not store handoff context only locally: branch + exact SHA + report must be reachable through GitHub.
- Use separate worktrees for feature work; a worktree is not shared memory.

## Handoff format

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit:
feature_branch:
goal:
allowed_changes:
forbidden_changes:
required_output: feature_branch, current_commit, changed_files, checks_run, not_checked, manual_checks_needed, preview_touched: no, main_touched: no
```

Report every result with the practical summary first, in simple Russian, followed by exact SHA.
