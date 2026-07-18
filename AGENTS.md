# Real-Wargame Agent Contract

This file is the canonical short contract for GitHub-aware Web Chat work, ordinary ChatGPT collaboration and the bounded Codex deployment step.

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

Machine-readable repository state:

```text
docs/ai/repo-context.json
```

Detailed canonical delivery route:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## 2. Minimal start

Read in this order:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant skill from `docs/ai/SKILLS_INDEX.md`.

For every task that can affect runtime cost, also read before design or implementation:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

The performance document is a mandatory repository contract, not optional advice. Runtime-affecting work is incomplete without its design review, bounded-cost implementation and required evidence.

Task-to-file route:

```text
docs/ai/TASK_ROUTER.md
```

Do not read every skill, journal, plan, report or historical handoff by default.

## 3. Canonical feature-delivery route

Every bounded implementation task follows this route:

```text
user task
→ Web Chat reads the current real-wargame-preview head
→ Web Chat creates one temporary feature branch from that exact head
→ Web Chat implements the task on the feature branch
→ Web Chat runs focused non-browser checks
→ Web Chat commits and pushes the feature branch
→ Web Chat reports the exact commit and manual live-test checklist
→ user gives the branch to Codex once
→ Codex exposes that branch as a branch-linked Vercel Preview and returns the URL
→ user tests the live application
→ Web Chat fixes all reported issues on the same feature branch
→ optional visual GitHub Actions verification runs only after explicit user approval
→ Web Chat transfers the tested result to real-wargame-preview only after explicit user GO
```

The same feature branch remains the source of truth for implementation, regression fixes and visual-test preparation until the user approves transfer.

## 4. Role ownership

### Web Chat

Web Chat owns:

- creating the feature branch from the current `real-wargame-preview` head;
- implementation, tests, commits and pushes;
- focused non-browser verification;
- preparing the manual live-test checklist;
- receiving user bug reports and fixing them on the same branch;
- preparing and, after explicit approval, running visual GitHub Actions checks;
- transferring the accepted result into `real-wargame-preview` after explicit user GO;
- reporting exact branch and commit identity at every handoff.

### Codex

Codex has one bounded role only:

- receive the already-pushed feature branch;
- make it available as a branch-linked Vercel Preview;
- return the branch Preview URL, immutable commit Preview URL when available, tested commit and deployment status.

Codex must not:

- implement or modify the feature;
- create replacement commits or branches;
- fix regressions;
- merge or transfer the branch;
- change `real-wargame-preview` or `main`;
- remain in the later iteration loop.

A detached one-off deployment that does not follow later pushes to the same feature branch is not the canonical result. The Preview must stay associated with the branch so Web Chat updates become testable without calling Codex again.

### Human user

The user:

- performs live testing in the Vercel Preview;
- reports observed defects to the same Web Chat;
- decides whether GitHub Actions visual verification is needed;
- gives the explicit GO for transfer into `real-wargame-preview`;
- separately approves any work involving `main`.

## 5. Branch policy

For every implementation task, create a branch from the current remote preview head:

```text
base: real-wargame-preview
head: feature/YYYYMMDD-short-kebab-slug
```

Mandatory rules:

- do not implement directly on `real-wargame-preview`;
- do not push unfinished or unaccepted feature work to `real-wargame-preview`;
- keep all live-test fixes on the same feature branch;
- do not create a new branch for every reported bug;
- do not transfer the feature branch until the user explicitly approves it;
- do not write to `main` without separate explicit human GO;
- do not open or retarget a PR to `main` without documented `MAIN_GO_APPROVED_BY_USER: yes`;
- do not merge without explicit human GO;
- do not enable auto-merge.

A Pull Request is not the default development route. It may be used only when the user explicitly asks for review/transfer through a PR or repository protection makes it technically necessary. It is never a substitute for the feature-branch live-test cycle.

After accepted transfer, close or delete the temporary feature branch unless the user explicitly asks to keep it.

## 6. Focused non-browser verification

Before reporting a feature branch ready for live testing, Web Chat runs the smallest sufficient local or workspace matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ documentation checks when documentation or generated state changed
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

For documentation changes:

```bash
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

Do not run by default:

- every smoke test in the repository;
- the complete integration matrix;
- Chromium or Playwright;
- performance workflows without a concrete performance reason;
- Vercel deployment;
- duplicate builds.

`npm ci` or dependency installation is setup work, not a check to repeat before every command.

If the Web Chat environment cannot execute Node commands, report that limitation honestly. A small non-visual GitHub Actions check may be used only as a fallback; it does not replace the manual live test.

## 7. Visual QA approval gate

For user-visible changes, visual QA must be prepared but is not run automatically.

Before asking the user, Web Chat must:

- finish the implementation on the feature branch;
- prepare or update the relevant Playwright scenario;
- define the key PNG files and what each should prove;
- run focused non-browser checks and the production build;
- report remaining visual risks;
- provide the live manual checklist.

Then ask once:

```text
Визуальная проверка подготовлена. Запустить её через GitHub Actions?
```

An earlier explicit request such as `проверь визуально`, `сделай скриншоты`, `запусти браузерную проверку` or `проверь через Playwright` already counts as approval.

A visual check is complete only after:

- the exact feature-branch commit was tested;
- the real Vite application ran in a real browser;
- fresh PNG files were created after the change;
- workflow/artifact SHA matches the reported commit;
- changed and key PNG files were opened and inspected;
- failures are fixed on the same feature branch and the cycle is repeated.

Canonical detailed policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## 8. Parallel ordinary ChatGPT chats

Parallel chats are optional research or proposal helpers. They do not create independent delivery routes.

During a parallel campaign:

- one designated Web Chat owns the canonical feature branch;
- worker chats return analysis, complete files or patches;
- worker chats do not update `real-wargame-preview`;
- worker chats do not deploy through Codex;
- the designated Web Chat integrates selected results into the same feature branch;
- the canonical feature-delivery route remains unchanged.

Read:

```text
docs/orchestration/CHAT_WORKFLOW.md
docs/orchestration/ORCHESTRATOR_PROMPT.md
docs/orchestration/WORKER_PROMPT.md
docs/orchestration/INTEGRATOR_PROMPT.md
```

## 9. Development and language

Canonical development language is English for:

- file names;
- TypeScript identifiers, types, functions and interfaces;
- serialized data keys;
- technical comments;
- canonical labels and descriptions;
- test names and commit messages.

Every human-facing feature must have a complete Russian version. Russian is the default interface language. Use the established English base plus `*Ru` overlay contract where applicable.

The user must not need to edit code, JSON, technical keys or run terminal commands for normal use.

Full language rules:

```text
docs/ai/DEVELOPMENT_LANGUAGE_RULES.md
```

## 10. Skill routing

### Performance-sensitive work

```text
.agents/skills/real-wargame-performance/SKILL.md
docs/performance/PERFORMANCE_PRINCIPLES.md
```

This route is mandatory for any change to simulation, AI, perception, navigation, tactical fields, map data, rendering, recurring UI, workers, queues, caches, revisions, lifecycle, diagnostics or browser performance gates.

### Visual launch, screenshots or Playwright

```text
.agents/skills/real-wargame-local-preview/SKILL.md
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

### PixiJS, canvas, renderers, camera, pointer events or performance

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

Real-Wargame uses PixiJS 8. Follow the project skill and the narrow v8 skill that owns the API being changed.

### Soldier AI, Blackboard, Utility, stateful Runtime, Bridge or node editor

```text
.agents/skills/real-wargame-ai-runtime/SKILL.md
```

General index:

```text
docs/ai/SKILLS_INDEX.md
```

## 11. Architecture boundaries

Read:

```text
docs/architecture/OVERVIEW.md
docs/architecture/MODULE_MAP.md
```

Hard boundaries:

- core simulation and AI do not import PixiJS;
- `AiGraphRunner` is a pure immediate evaluator;
- `AiGraphRuntime` owns resumable execution state;
- `AiGameBridge` adapts pure AI to the live game;
- renderers display state and do not become the source of truth;
- subjective soldier knowledge must not reveal the objective world;
- heavy awareness, relief or overlay work must not be recomputed every frame without evidence and design;
- UI, renderer selection and visible layers never own gameplay computation;
- one changed entity must not invalidate unrelated world state;
- interactive full-map scans, unbounded queues and unbounded per-step work are forbidden;
- asynchronous results require exact identity, bounded ownership and stale-result rejection.

## 12. Mandatory performance contract

The canonical contract is:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
```

For runtime-affecting work, every agent establishes before implementation:

```text
hot path
worst-case complexity
main-thread work
full-map work
shared prepared result
revision identity
worker and queue budget
cache memory bound
teardown
measurement plan
```

The implementation must prefer shared prepared data, narrow revision-based invalidation, bounded deterministic work, local/point/route queries, dirty chunks, typed data and revision-driven UI.

A feature must not be made faster by weakening gameplay semantics, hidden-contact boundaries, LOS, terrain, vegetation, route meaning, fairness or determinism.

Runtime-affecting final reports include the `Performance impact` section from:

```text
docs/orchestration/RESULT_TEMPLATE.md
```

## 13. Current-status documentation

Edit current state only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run:

```text
npm run docs:sync
```

Files marked `GENERATED FILE` must not be edited manually.

## 14. Prohibited legacy routes

Do not reintroduce these as normal workflow:

- direct implementation push to `real-wargame-preview`;
- PR-first feature development;
- Codex implementation, commits, fixes, merge or branch transfer;
- automatic visual checks on every push;
- a fresh branch for every live-test defect;
- transfer to preview before explicit user GO.

Historical Q/R/X/W and r-init documents may be read only when the user explicitly asks about that legacy process. They are not entry points for normal feature work.

## 15. Required report

Every implementation report includes:

```text
feature_branch: ...
base_branch: real-wargame-preview
base_commit: ...
current_commit: ...
delivery_state: implementation / ready_for_live_test / live_test_revision / visual_qa / approved_for_preview / transferred
changed_files: ...
checks_run: ...
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_run: passed / failed / not run / not applicable
vercel_preview: URL / pending / not requested
live_test_status: pending / passed / failed / not run
not_checked: ...
manual_checks_needed: ...
performance_impact: completed / not applicable with reason
risks: ...
preview_transfer_approval: approved / not approved
preview_touched: no / explicit approved transfer
main_touched: no / explicit approved change
branch_cleanup_status: open / deleted / kept by user request
```

Explain the result to the user in simple Russian. Do not ask the user to manage Git or terminal commands when the agent can do it.