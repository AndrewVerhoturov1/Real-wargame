# Shared Game Editors — Orchestration Runbook

## Target

```text
repository: AndrewVerhoturov1/Real-wargame
acceptance branch: feature/20260731-combat-lab-user-acceptance-fixes
stable preview branch: real-wargame-preview
stable branch: main
```

`real-wargame-preview` and `main` are never modified by workers or compiler.

## Roles

| Role | Branch | Wave | Depends on |
|---|---|---:|---|
| Executor 1 | `worker/20260731-app-shell-overlay-menu` | 1 | Wave 1 Foundation |
| Executor 2 | `worker/20260731-shared-game-editor-platform` | 1 | Wave 1 Foundation |
| Executor 3 | `worker/20260731-gameplay-tuning-editors` | 2 | Wave 2 Foundation |
| Executor 4 | `worker/20260731-combat-lab-game-editors` | 2 | Wave 2 Foundation |
| Compiler | `compiler/20260731-shared-game-editors-integration` | final | Wave 2 Foundation + exact Executor 3/4 heads |

## Foundation rules

### Wave 1 Foundation

The Wave 1 Foundation SHA is the exact remote HEAD of:

```text
feature/20260731-combat-lab-user-acceptance-fixes
```

after the approved design, implementation plan, four executor prompts, compiler prompt and this runbook are committed.

Executor 1 and Executor 2 must both branch from this exact SHA.

### Wave 2 Foundation

After Executor 1 and Executor 2 return `READY FOR ORCHESTRATOR`, the orchestrator:

1. verifies both exact branch heads and their base;
2. reviews each complete diff;
3. integrates Executor 1, then Executor 2 into the acceptance branch;
4. resolves only shell/platform composition conflicts;
5. runs the Wave 1 foundation check matrix;
6. publishes the resulting exact acceptance-branch HEAD as the Wave 2 Foundation SHA.

Executor 3 and Executor 4 branch from the Wave 2 Foundation SHA.

The compiler also branches from the same Wave 2 Foundation SHA.

## Launch order

### Phase 0 — already prepared

- approved design;
- implementation plan;
- worker prompts;
- compiler prompt;
- runbook.

### Phase 1 — launch in parallel

Launch together:

```text
Executor 1 — common menu and overlay
Executor 2 — shared game-editor platform
```

Do not launch Executor 3, Executor 4 or compiler yet.

### Phase 2 — orchestrator integration checkpoint

Wait until both Wave 1 executors are complete.

Required statuses:

```text
Executor 1: READY FOR ORCHESTRATOR
Executor 2: READY FOR ORCHESTRATOR
```

If one is `BLOCKED` or `FAIL`, do not integrate the other into the acceptance branch until the incompatibility is understood. A clean independent worker branch may remain available, but Wave 2 does not start.

Integrate in order:

```text
1. Executor 1
2. Executor 2
```

Reason: the editor platform must see the final common shell composition and remove its local duplicate application actions without creating another menu.

Run at least:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run editor:smoke
npm run combat-lab-ui-contract:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Also run both new focused contract commands.

Publish exact Wave 2 Foundation SHA only after green checks.

### Phase 3 — launch in parallel

Launch together from Wave 2 Foundation:

```text
Executor 3 — perception, soldier archetypes, condition profiles
Executor 4 — Combat Lab settings catalogue and shared editor access
```

These branches remain independent because Executor 4 discovers definitions dynamically through the registry and does not hardcode Executor 3 panels.

### Phase 4 — launch compiler

Wait for:

```text
Executor 3: READY FOR ORCHESTRATOR
Executor 4: READY FOR ORCHESTRATOR
```

Then launch compiler with:

- exact Wave 2 Foundation SHA;
- exact Executor 3 branch HEAD;
- exact Executor 4 branch HEAD.

Compiler integrates Executor 3, then Executor 4, runs focused and canonical gates, performance audit and browser/design audit.

### Phase 5 — orchestrator finalization

After compiler returns `READY FOR ORCHESTRATOR`:

1. inspect compiler report and branch diff;
2. verify canonical gate and performance evidence;
3. non-destructively transfer compiler HEAD to the acceptance branch;
4. verify exact remote acceptance HEAD;
5. run exact-source Vercel Preview deployment through permanent project `repo`;
6. verify deployment status `READY`;
7. verify `/`, `/ai-node-editor.html`, `/combat-lab.html`, `/deployment-source.json`;
8. verify deployment source ref/SHA;
9. run published browser QA;
10. return the acceptance update and Preview URL.

## Conflict ownership

| Conflict area | Primary decision owner |
|---|---|
| Shell menu, Escape and overlay API | Executor 1 contract |
| Editor definition/registry/workspace API | Executor 2 contract |
| Perception/archetype/condition profile semantics | Executor 3 contract |
| Combat Lab catalogue/mounting/profile links | Executor 4 contract |
| Cross-contract mismatch | Compiler, with design document as authority |

The compiler may adapt composition code but must not silently replace an accepted owner contract with a parallel path.

## Stop conditions

Return `BLOCKED` and stop the current phase when:

- Foundation SHA differs;
- worker branch history was rewritten after review began;
- required repository access is unavailable;
- one worker introduces a forbidden second authority source;
- Wave 1 combined build is not green;
- Wave 2 worker requires an interface absent from the published foundation;
- canonical gate or performance thresholds cannot be made green without changing accepted scope;
- exact-source deployment cannot prove branch and SHA.

## No-go operations

- no force-push;
- no worker PRs;
- no auto-merge;
- no direct work on `real-wargame-preview`;
- no direct work on `main`;
- no deployment from worker or compiler branch;
- no dummy deployment commit;
- no second Vercel project;
- no transfer to Preview before explicit later user command.
