# Real-Wargame Agent Contract

This file is the canonical short contract for GitHub-aware Web Chat work, ordinary ChatGPT collaboration, the bounded Codex deployment step and visual verification.

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

Machine-readable state:

```text
docs/ai/repo-context.json
```

Canonical delivery route:

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

For runtime-affecting work also read before design or implementation:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

Use `docs/ai/TASK_ROUTER.md` for task-to-file routing. Do not read every skill, journal, plan or historical handoff by default.

## 3. Canonical feature route

Every implementation task follows:

```text
user task
→ Web Chat resolves the exact current real-wargame-preview head
→ Web Chat creates one feature branch from that exact commit
→ Web Chat implements, tests, commits and pushes that branch
→ Web Chat reports focused non-browser checks and a live-test checklist
→ user gives the already-pushed branch to Codex once
→ Codex exposes a branch-linked Vercel Preview and returns the URL
→ user performs live testing
→ Web Chat fixes reported defects on the same feature branch
→ optional visual verification after explicit user request
→ explicit user GO for the exact accepted commit
→ Web Chat transfers the result into real-wargame-preview
```

The same feature branch remains the product source of truth until accepted transfer.

## 4. Role ownership

### Web Chat

Web Chat owns:

- feature-branch creation from the current preview head;
- implementation, focused tests, commits and pushes;
- readiness and manual live-test reports;
- all product fixes on the same feature branch;
- visual-verification preparation and execution after approval;
- final transfer after explicit user GO.

### Codex

Codex only:

- receives the already-pushed feature branch and exact commit;
- exposes it as a branch-linked Vercel Preview;
- returns branch/commit Preview URLs and deployment status.

Codex must not implement, modify code, create replacement commits, fix defects, merge, transfer branches or remain in the iteration loop.

### Human user

The user:

- tests the Vercel Preview in real time;
- reports defects to the same Web Chat;
- decides whether visual verification is needed;
- approves transfer into `real-wargame-preview` for an exact commit;
- separately approves any `main` operation.

## 5. Branch policy

```text
base: real-wargame-preview
head: feature/YYYYMMDD-short-kebab-slug
```

Mandatory rules:

- do not implement directly on `real-wargame-preview`;
- do not push unaccepted product work to preview;
- keep product fixes on the same feature branch;
- do not create a new feature branch for each reported defect;
- do not transfer before explicit user GO;
- do not write to `main` without separate explicit human GO;
- do not open or retarget a PR to `main` without `MAIN_GO_APPROVED_BY_USER: yes`;
- do not merge without explicit human GO;
- do not enable auto-merge.

A PR is not the default development route. It may be used only for explicitly requested review/transfer or when repository protection makes it technically necessary.

Temporary visual-QA CI branches and PRs are a separate test harness. They are never product-delivery branches and are never merged.

## 6. Focused non-browser verification

Before reporting a branch ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

For documentation or generated state:

```bash
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

Do not run by default every smoke test, broad matrices, Chromium, Playwright, unjustified performance workflows, Vercel deployment or duplicate builds.

When Node commands are unavailable, report that honestly. A small non-browser Actions check is an optional fallback.

## 7. Visual verification: mandatory automatic skill routing

Visual execution requires explicit user approval. The user does **not** need to name a skill.

Any clear intent such as:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

counts as approval and triggers this decision:

```text
Can the current Web Chat directly control a real browser against the target Vercel URL?

YES
→ read and use .agents/skills/real-wargame-local-preview/SKILL.md
→ run the direct-browser route

NO
→ MUST read and use .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
→ run deployed Vercel E2E through temporary GitHub Actions CI branches and a non-merge PR
```

Do not ask the user to say “use this skill”. Intent is sufficient. Do not ask again when approval was already explicit.

The deployed-Vercel CI skill is mandatory when all are true:

- visual/browser/screenshot/Playwright verification was requested;
- a branch-linked Vercel Preview exists;
- the current Web Chat cannot directly control a browser against that URL.

The CI route must:

- create temporary base/head `ci/**` branches from the exact product SHA;
- keep workflow and Playwright harness files out of product branches;
- use a temporary PR that is never merged;
- test the real deployed URL;
- save `evidence.json`, milestone PNGs, trace, video and diagnostics;
- download and inspect artifacts;
- show key screenshots and, when useful, a contact sheet;
- classify failures before edits;
- fix test-harness defects only on the CI head branch;
- fix application defects only on the canonical feature branch;
- create fresh CI branches and evidence after every new product SHA;
- close the temporary PR without merge.

Never commit Vercel share tokens, bypass secrets or protected URLs containing secrets to any branch, including temporary CI branches.

Canonical visual policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## 8. Visual evidence standard

A visual check is complete only after:

- the real application ran in real Chrome/Chromium;
- the requested state-changing scenario executed;
- the tested product identity was proven or explicitly reported as unproven;
- fresh PNGs and `evidence.json` were created;
- workflow/run/artifact identity was checked;
- key screenshots were opened and inspected;
- failures were correctly classified;
- temporary PR cleanup was completed or honestly reported.

A green workflow alone is not proof of correct visuals.

Visual verification does not grant transfer permission. Transfer still requires separate explicit user GO for the exact accepted feature commit.

## 9. Parallel chats

Parallel chats are optional research or proposal helpers. One designated Web Chat owns the canonical feature branch. Workers return analysis, complete files or patches; they do not update preview or create independent Codex/CI delivery routes.

Read:

```text
docs/orchestration/CHAT_WORKFLOW.md
docs/orchestration/ORCHESTRATOR_PROMPT.md
docs/orchestration/WORKER_PROMPT.md
docs/orchestration/INTEGRATOR_PROMPT.md
```

## 10. Development language

Use English for file names, identifiers, serialized keys, technical comments, canonical labels, tests and commit messages.

Every human-facing feature must have a complete Russian version. Russian is the default UI language. The user must not need to edit code, JSON or technical keys for normal use.

Full rules:

```text
docs/ai/DEVELOPMENT_LANGUAGE_RULES.md
```

## 11. Skill routing

### Performance-sensitive work

```text
.agents/skills/real-wargame-performance/SKILL.md
docs/performance/PERFORMANCE_PRINCIPLES.md
```

Mandatory for simulation, AI, perception, navigation, tactical fields, map data, rendering, recurring UI, workers, queues, caches, revisions, lifecycle, diagnostics and browser-performance gates.

### Visual preparation or direct browser

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Deployed Vercel visual verification without a directly controlled browser

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

This skill is auto-selected from user intent; the user does not need to name it.

### PixiJS/canvas/rendering

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

### Soldier AI/runtime/editor

```text
.agents/skills/real-wargame-ai-runtime/SKILL.md
```

General index:

```text
docs/ai/SKILLS_INDEX.md
```

## 12. Architecture boundaries

- core simulation and pure AI do not import PixiJS or DOM;
- `AiGraphRunner` is a pure immediate evaluator;
- `AiGraphRuntime` owns resumable state;
- `AiGameBridge` adapts pure AI to the game;
- renderers display state and are not sources of gameplay truth;
- subjective knowledge does not reveal objective hidden state;
- UI and visible layers do not own gameplay computation;
- one changed entity does not invalidate unrelated world state;
- full-map scans, queues and per-step work are bounded;
- asynchronous results use exact identity and stale-result rejection.

## 13. Performance contract

For runtime-affecting work establish before implementation:

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

Preserve gameplay semantics, LOS, terrain, vegetation, route meaning, fairness and determinism. Use the `Performance impact` section from `docs/orchestration/RESULT_TEMPLATE.md`.

## 14. Current-status documentation

Edit current state only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run `npm run docs:sync`. Do not edit generated files manually.

## 15. Prohibited legacy routes

Do not reintroduce:

- direct product implementation in preview;
- PR-first feature development;
- Codex implementation or fixes;
- automatic browser checks on every push;
- product fixes on temporary CI branches;
- committed Vercel share tokens;
- reuse of visual evidence after product SHA changes;
- transfer before explicit user GO.

Historical Q/R/X/W and r-init documents are not normal entry points.

## 16. Required report

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
delivery_state:
changed_files:
checks_run:
visual_qa_prepared:
visual_qa_approval:
visual_qa_route: direct-browser / vercel-deployment-playwright-e2e / not run / not applicable
visual_qa_run:
vercel_preview:
live_test_status:
tested_product_sha:
observed_deployment_sha:
product_sha_match: yes / no / unproven
workflow_run:
artifact_id:
evidence_json_inspected:
screenshots_inspected:
key_frames:
failure_class: none / environment / test-harness / application
ci_pr_closed_without_merge:
ci_branch_cleanup:
not_checked:
manual_checks_needed:
performance_impact:
risks:
preview_transfer_approval:
preview_touched:
main_touched:
branch_cleanup_status:
```

Explain the result in simple Russian. Do not ask the user to manage Git or terminal commands when the agent can do it.