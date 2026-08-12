# Real-Wargame Agent Contract

This is the canonical short contract for work in `AndrewVerhoturov1/Real-wargame`.

## 1. Project facts

```text
repository: AndrewVerhoturov1/Real-wargame
working branch: real-wargame-preview
stable branch: main
feature branch pattern: feature/YYYYMMDD-short-kebab-slug
canonical launcher: Run-Real-Wargame-Lab.bat
stack: Vite + TypeScript + PixiJS 8
```

This is not a Godot project.

Canonical sources:

```text
docs/ai/repo-context.json
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
docs/orchestration/ORCHESTRATION_PROTOCOL.md
```

## Mandatory screenshot and visual-QA routing

For any request involving screenshots, visual inspection, browser verification, UI layout, a deployed page, Chrome, Chromium or Playwright, read this router **до ответа и до составления плана**:

```text
.agents/skills/real-wargame-screenshots/SKILL.md
```

The user does not need to name the skill. Typical triggers include:

```text
скриншот / скриншоты / сделай скрины;
покажи экран;
открой игру;
зайди на деплой;
посмотри интерфейс;
проверь верстку;
проверь визуально;
проверь глазами;
открой в браузере;
проверь Combat Lab;
проверь редактор ИИ;
можешь ли ты зайти на сайт.
```

Do not claim that browser access is unavailable before reading the router and applying its direct-browser versus deployed-Vercel fallback decision.

## 2. Communication

Use simple Russian and put the practical result first.

- Avoid unnecessary English terms and abbreviations.
- Explain unavoidable technical terms once.
- Use clickable links.
- Show useful screenshots directly when available.
- Put hashes, IDs and raw diagnostics after the useful result.
- Do not make the user operate Git or a terminal when the agent can do it.

## 3. Minimal reading route

Read:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. active `STATUS.md`;
5. relevant skill from `docs/ai/SKILLS_INDEX.md`.

For runtime work also read:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
docs/architecture/ENGINE_MIGRATION_READINESS.md
```

For any work that designs, changes or reviews AI architecture, Graph v2, Utility AI, GOAP, HTN, perception, memory, tactical queries, group or commander AI, or AI training, always read before implementation:

```text
docs/ai/AI_DEVELOPMENT_APPROACH.md
```

Treat it as the target architectural source. Current code and the active `STATUS.md` describe only the implemented subset; never claim that every method described there is already implemented.

For deployment always read:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
```

For orchestration work (Codex prepares, hands off, reviews or tests a Web Chat task) always read:

```text
docs/orchestration/ORCHESTRATION_PROTOCOL.md
.agents/skills/real-wargame-orchestration/SKILL.md
```

## 4. Canonical feature route

```text
user task
→ resolve exact current real-wargame-preview HEAD
→ create one feature branch from that commit
→ implement and verify without an early PR
→ consolidate the candidate into meaningful commits
→ push the ready candidate
→ run PR Risk CI only as a readiness gate when relevant
→ report code readiness without inventing a Preview
→ explicit user deployment request
→ manually deploy exact current HEAD
→ report game and AI Node Editor links
→ user live test
→ fix defects on the same feature branch
→ explicit user GO for accepted commit
→ transfer into real-wargame-preview
→ deploy preview only when separately requested or when transfer+deploy were explicitly requested together
```

A push never deploys. Transfer permission and deployment permission are separate.

## Codex orchestration mode

Codex is the orchestrator and an independent reviewer/tester/operator. The Web Chat remains the normal owner of product-code implementation.

- GitHub is the persistent shared state; the exact commit SHA is mandatory for handoff and review.
- A task runs in simple mode (user works directly with one Web Chat) or orchestrated mode (Codex prepares a handoff, receives the exact pushed SHA, reviews/tests independently and returns actionable fixes).
- Feature work uses separate worktrees; a worktree is not shared memory.
- Do not impose an Issue for every small task; use it only for a long-lived unit, a public decision record or cross-branch tracking.
- Three explicit user gates: no changes to `main`, no transfer into `real-wargame-preview`, no external deployment, each without an explicit user request.

Canonical protocol:

```text
docs/orchestration/ORCHESTRATION_PROTOCOL.md
.agents/skills/real-wargame-orchestration/SKILL.md
```

## 5. Required pages

Every production build and deployment must contain:

```text
/                     → index.html
/ai-node-editor.html  → ai-node-editor.html
```

`npm run build` must fail if either page is missing.

## 6. Vercel policy

Git-triggered deployments are disabled by `vercel.json`.

Mandatory rules:

- commits and pushes do not create deployments;
- deploy only after explicit user intent such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`;
- use `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`;
- resolve exact branch and remote HEAD before deployment;
- use only an authenticated route that can prove exact source identity;
- inspect build logs and status;
- report success only after `READY`;
- report both required URLs;
- do not create a dummy commit to trigger Vercel;
- do not re-enable automatic deployment;
- do not create a separate Vercel project per branch;
- never delete the permanent Git-connected Vercel project;
- never commit tokens, Deploy Hook URLs or protected share URLs.

One explicit deployment request covers the exact current HEAD and necessary retries after build-failure fixes for that same task. Later product changes need a new request.

## 7. Branch policy

```text
base: real-wargame-preview
head: feature/YYYYMMDD-short-kebab-slug
```

- Do not implement directly on `real-wargame-preview`.
- Keep product fixes on the same feature branch.
- Do not transfer before explicit user GO.
- Do not touch or deploy `main` without separate explicit approval.
- Do not merge or enable auto-merge without explicit approval.
- PR is not the default feature route.
- Do not open a PR merely to obtain an interactive remote test loop.
- Before PR review, live testing or acceptance of an exact SHA, the owner may rewrite only its own unpublished feature branch into one to three meaningful commits.
- Do not rewrite history after shared review starts, after a live test starts, or after an exact commit is accepted.

## 8. Focused verification

Before reporting readiness, run the smallest sufficient matrix:

```text
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

Run documentation checks when documentation changes.

Focused local checks do not require separate approval. One primary run of an existing focused GitHub Actions workflow and one rerun after an aggregated correction are allowed without separate approval when they are relevant to the task. Separate approval is required to create or modify workflows, create temporary CI branches, run Chromium or Playwright, run broad or unjustified performance matrices, or start a third diagnostic CI attempt.

### Remote-only mode

Use remote-only mode only when the executor cannot obtain a checkout capable of running the required commands.

- Work on one feature branch without an early PR.
- Batch related file changes instead of committing each file or each hypothesis separately.
- Review the full base-to-head diff, imports, exports, package scripts, test assumptions and prohibited dependencies before the first CI run.
- Consolidate the unpublished branch into one to three meaningful commits when the available Git route supports safe history rewriting.
- Open or mark a PR ready only when the candidate is intended to pass.
- Treat CI as an independent readiness gate, never as an interactive debugger.

### CI correction budget

The normal budget is one primary run plus one rerun after corrections.

After any failed run:

1. collect every relevant failure from the run;
2. identify the shared root cause where possible;
3. prepare one correction package;
4. push once;
5. rerun once explicitly.

After the second failed attempt, stop trial commits. Record the failures, compare suspect checks with the exact base SHA and request approval before a third diagnostic run.

### Base comparison for suspicious failures

When a failure may be unrelated to the current diff, run the same command against the exact task base SHA.

```text
feature FAIL + base PASS                     → current-task regression
feature FAIL + base FAIL + same signature    → inherited known-base failure
feature FAIL + base FAIL + different result  → separate investigation required
```

Do not silently repair an inherited repository-wide failure inside an unrelated product task. Record it honestly unless it blocks the requested result.

### Simulation test design

Lifecycle tests must advance to an observable event or state when practical. Do not use an arbitrary fixed simulation timestamp as a substitute for proving states such as committed, active projectile, impact or completed action.

## 9. Readiness without deployment

When deployment was not requested, report:

```text
Статус: код готов, не задеплоен
Ветка:
Коммит:
Проверки:
Деплой: не запускался
```

Do not wait for automatic Vercel and do not invent URLs.

## 10. Visual verification

Visual permission is separate from deployment permission.

Always start with:

```text
.agents/skills/real-wargame-screenshots/SKILL.md
```

The router selects the execution skill:

```text
direct browser available
→ .agents/skills/real-wargame-local-preview/SKILL.md

direct browser unavailable
→ .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

The Playwright skill tests an existing deployment and must not deploy the application.

## 11. Architecture and performance boundaries

### Mandatory performance contract

The performance document is a mandatory repository contract, not optional advice.

- core simulation and pure AI do not import PixiJS or DOM;
- renderers display state and are not gameplay truth;
- subjective knowledge does not reveal hidden objective state;
- UI layers do not own gameplay computation;
- full-map scans, queues and recurring work are bounded;
- asynchronous results use exact identity and stale-result rejection.

## 12. Current-status documentation

Edit current state in canonical JSON and run `npm run docs:sync` when the environment supports it. When generation cannot run, reproduce the exact intended generated output and report the limitation honestly.

## 13. Prohibited legacy routes

Do not reintroduce:

- automatic Vercel deployment on every push;
- dummy deployment commits;
- direct product implementation in preview;
- PR-first feature development;
- opening a PR only to use CI as an interactive debugger;
- one commit and one CI run per isolated error message;
- repeated diagnostic pushes after the CI budget is exhausted;
- mandatory Codex deployment;
- a separate Vercel project per feature branch;
- deletion of the permanent Vercel project;
- product fixes on temporary CI branches;
- committed Vercel secrets;
- transfer or main operations without explicit approval.

## 14. Final report

Always distinguish:

```text
feature_branch:
current_commit:
checks_run:
performance_impact: completed / not applicable with reason
deployment_requested:
deployment_status:
deployed_commit:
game_preview:
ai_node_editor_preview:
live_test_status:
visual_qa_status:
preview_touched:
main_touched:
```

Never claim code readiness, Vercel deployment, human live testing and browser evidence are the same thing.
