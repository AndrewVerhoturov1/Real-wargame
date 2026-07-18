# Web Chat Start

Short entry point for a GitHub-aware Web Chat working on `Real-Wargame`.

## 1. Facts that must not be guessed

- Repository: `AndrewVerhoturov1/Real-wargame`.
- Working branch: `real-wargame-preview`.
- Stable branch: `main`.
- Feature branch pattern: `feature/YYYYMMDD-short-kebab-slug`.
- Canonical launcher: `Run-Real-Wargame-Lab.bat`.
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
5. the relevant project skill from `docs/ai/SKILLS_INDEX.md`.

For any task that can affect runtime cost, additionally read before design or implementation:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

Do not read all journals, plans, screenshots, reports or skills by default.

## 3. Mandatory start for every implementation task

1. Resolve the exact current head of `real-wargame-preview`.
2. Record that SHA as `base_commit`.
3. Create one branch from that exact commit:

```text
feature/YYYYMMDD-short-kebab-slug
```

4. Do all implementation, commits, pushes and later fixes on that branch.
5. Do not modify `real-wargame-preview` during development.
6. Do not modify `main`.

A Pull Request is not the default development route.

## 4. Web Chat responsibilities

The Web Chat owns:

- repository investigation;
- implementation and focused tests;
- feature-branch commits and pushes;
- focused non-browser verification;
- the manual live-test checklist;
- fixes after user testing on the same feature branch;
- optional visual GitHub Actions verification after explicit approval;
- final transfer into `real-wargame-preview` after explicit user GO.

Do not hand implementation or bug fixing to Codex.

## 5. Focused non-browser verification

Before reporting the branch ready for live testing, run the smallest sufficient matrix:

```text
npx tsc --noEmit
+ focused smoke tests for the changed subsystem
+ npm run build
+ docs checks when applicable
```

Do not run by default:

- every smoke test;
- broad integration matrices;
- Chromium or Playwright;
- performance workflows without a concrete reason;
- Vercel deployment.

If the current environment cannot run Node commands, report that honestly. A small non-browser GitHub Actions check is an optional fallback.

## 6. Readiness report

The branch-ready report includes:

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

For user-visible work, explain what the human must try in the live application.

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

Codex does not modify code, create replacement commits, fix bugs, merge or transfer branches.

The deployment must follow later pushes to the same feature branch without requiring Codex again.

## 8. Live-test revision loop

When the user reports a problem:

1. stay on the same feature branch;
2. reproduce the issue;
3. add or update a focused regression test when practical;
4. fix the code;
5. rerun focused non-browser checks;
6. commit and push the same branch;
7. report the new exact commit.

Do not create a new branch for every live-test defect.

## 9. Visual verification

For launch, screenshots, Playwright or visual QA, read:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

Prepare the scenario for user-visible changes, but do not run the browser workflow until the user explicitly asks.

A valid visual claim requires the exact feature commit, the real application, a real browser, fresh PNG files, matching artifact SHA and opened/inspected key frames.

## 10. Transfer gate

Transfer into `real-wargame-preview` only after explicit user GO for the exact tested feature commit.

Before transfer:

- update the feature branch from the current preview state when necessary;
- resolve conflicts on the feature branch;
- rerun the focused checks required by the final diff;
- transfer the accepted result;
- report the resulting preview commit.

A PR may be used only when the user explicitly asks for PR review/transfer or repository protection requires it.

Never:

- implement directly on `real-wargame-preview`;
- write to `main` without explicit human GO;
- merge without explicit human GO;
- enable auto-merge;
- claim a local PC run when only GitHub Actions ran;
- claim visual success without opening fresh PNG artifacts;
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

Worker chats do not update preview and do not create their own Codex deployment path.

## 12. Task routing

Use:

```text
docs/ai/TASK_ROUTER.md
```

Current status is edited only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run:

```text
npm run docs:sync
```

Do not manually edit files marked `GENERATED FILE`.

## 13. Required final report

Use the report contract from `AGENTS.md` and `docs/orchestration/RESULT_TEMPLATE.md`. Explain the result in simple Russian. The user is not required to work with Git or the terminal.