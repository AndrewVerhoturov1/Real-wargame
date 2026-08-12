# Chat Collaboration Workflow

This route covers collaboration between the user, one designated Web Chat and Codex as orchestrator. It does not replace the canonical feature-delivery workflow.

Canonical workflows:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/orchestration/ORCHESTRATION_PROTOCOL.md
```

## Core model

```text
user
→ one designated Web Chat owns one feature branch and the product code
→ optional research or proposal chats return findings, files or patches
→ the designated Web Chat integrates selected results into the same feature branch
→ Codex may orchestrate: prepare a handoff, verify the exact pushed SHA, review/test independently and return actionable fixes
→ the designated Web Chat runs focused non-browser checks and pushes
→ manual Vercel Preview only after explicit user request, via the deployment skill
→ user performs live testing
→ the designated Web Chat fixes issues on the same feature branch
→ optional visual GitHub Actions verification after explicit approval
→ explicit user GO
→ designated Web Chat transfers the tested result into real-wargame-preview
```

Parallel chats are helpers. They do not create independent delivery routes.

## Roles

### Designated Web Chat branch owner

The branch owner:

1. resolves the exact current `real-wargame-preview` head;
2. creates `feature/YYYYMMDD-short-kebab-slug` from that exact commit;
3. records `base_commit` and `current_commit`;
4. defines the observable task result;
5. may request research or competing proposals from other chats;
6. evaluates and integrates selected results into the same feature branch;
7. owns implementation, tests, commits and pushes;
8. runs focused non-browser checks;
9. prepares the live-test checklist;
10. receives user defects and fixes them on the same feature branch;
11. runs visual GitHub Actions verification only after explicit user approval;
12. transfers the accepted result into `real-wargame-preview` only after explicit user GO.

The branch owner is the only chat that writes the canonical feature branch. It does not delegate product implementation or regression fixing to Codex.

### Research or proposal worker

A worker may:

- inspect any relevant repository context;
- analyse the problem;
- propose architecture;
- prepare complete changed files or an applicable patch;
- identify tests, risks and performance constraints;
- challenge a weak initial design.

A worker must not:

- push directly to `real-wargame-preview`;
- create a competing delivery branch unless the branch owner explicitly requests an isolated experiment;
- deploy any branch;
- merge or transfer any branch;
- claim checks it did not run.

A worker result is advisory until the designated branch owner integrates it.

### Codex

Codex is the orchestrator and an independent reviewer/tester/operator, not a product-code implementer.

- GitHub is the persistent shared state; the exact commit SHA is mandatory for handoff and review.
- In orchestrated mode Codex prepares a Web Chat handoff, receives the exact pushed SHA, fetches and checks it, reviews or tests independently and returns concrete fixes or hands the result to the user.
- Codex does not write product code, merge or retarget branches. Codex may transfer the exact accepted commit only after explicit user GO; deployment stays separate.
- Manual Vercel Preview is executed through the deployment skill, not through a separate Codex deployment role.

### Human user

The user performs the live test, decides whether visual verification is needed and gives the explicit GO for transfer into preview.

## One working cycle

1. User gives the branch owner a feature task, possibly through Codex.
2. Branch owner creates one feature branch from the exact current preview head.
3. Branch owner optionally prepares 1–3 bounded research prompts.
4. Worker chats return analysis, files or patches.
5. Branch owner compares the results and integrates the selected solution into the same feature branch.
6. Branch owner runs focused non-browser checks, commits and pushes.
7. Branch owner reports the exact commit and live-test checklist.
8. Codex, when orchestrating, verifies the exact pushed SHA, reviews or tests and returns actionable fixes.
9. Branch owner fixes the reported issues on the same feature branch and pushes.
10. When the user requests it, the exact HEAD is deployed manually to a Vercel Preview via the deployment skill.
11. User tests the live application.
12. Branch owner fixes all reported defects on the same feature branch and pushes new commits.
13. If requested, branch owner runs visual GitHub Actions verification against the exact feature commit and inspects artifacts.
14. After explicit user GO, branch owner transfers the accepted commit into `real-wargame-preview`.

## Result formats from workers

Workers may return:

### Complete files

```text
worker-result/
├── RESULT.md
└── files/
    └── <repo-relative paths>
```

### Patch

```text
RESULT.md
changes.patch
```

### Research-only report

Use `docs/orchestration/RESULT_TEMPLATE.md` with `delivery_state: research_only`.

A worker-created PR or branch is not a normal result. It is allowed only when the designated branch owner explicitly requests an isolated experiment and must not target preview directly.

## Fundamental invariants

- `main` is not changed without separate explicit user GO;
- direct implementation on `real-wargame-preview` is forbidden;
- core simulation and pure AI do not import PixiJS or DOM;
- `SimulationTick` owns physical coordinate changes;
- `AiGraphRunner` remains a pure immediate evaluator;
- `AiGraphRuntime` owns resumable multi-step execution;
- `AiGameBridge` adapts pure AI to the live game;
- renderers display state and do not become the source of truth;
- subjective soldier knowledge does not reveal hidden objective state;
- UI, selected unit and visible layers do not own gameplay computation;
- runtime work, queues, caches and invalidation have bounded contracts;
- async results have exact identity and stale-result rejection;
- the project uses PixiJS 8;
- checks, performance evidence and visual QA are reported honestly;
- visual QA runs only after explicit user approval;
- GitHub is the persistent shared state and the exact commit SHA is required for every handoff and review;
- Codex does not write product code; the designated Web Chat remains its owner;
- transfer into preview and deployment remain separate explicit user GO gates.

## Prohibited old orchestration

Do not use the former route where independent workers or an integrator write directly into `real-wargame-preview`, create PR-first delivery or delegate product-code implementation to Codex.

Q/R/X/W, r-init and related historical modes are not part of this workflow unless the user explicitly asks to inspect the legacy process.
