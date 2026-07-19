# Simulation-Owned Tactical Position Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести запуск поиска тактических позиций из renderer/global-provider в единый runtime конкретной симуляции с явными запросами игрока и Graph v2.

**Architecture:** `TacticalPositionSearchService` владеет сериализуемыми request snapshots, bounded-очередью, публикацией immutable result snapshots и точной stale-проверкой. Он использует один `AwarenessWorldRuntime`: Worker подготавливает общее поле, а локальный поиск выполняется на main thread только после явного запроса и в фиксированных бюджетах. Renderer получает сервис через `PixiTacticalBoardApp`, читает только готовые snapshots и не создаёт вычислительных запросов.

**Tech Stack:** TypeScript, PixiJS 8, Vite SSR smoke runners, existing Awareness Worker, Graph v2 runtime sessions.

## Global Constraints

- Работать только в `feature/20260719-tactical-position-system`.
- Не изменять `main` и `real-wargame-preview`, не открывать PR.
- Не запускать GitHub Actions, Playwright, Chromium или тяжёлые browser performance tests.
- Карта 320×200, минимум 6 графовых бойцов.
- Никакого full-map прохода из DOM callback, renderer или SimulationTick.
- Никакого `кандидаты × A*`; один bounded reachability calculation на запрос.
- UI только ставит запрос; renderer только показывает snapshot.
- Очереди, caches и listeners ограничены и очищаются destroy.

---

### Task 1: Renderer Ownership Regression

**Files:**
- Create: `scripts/tactical_position_request_service_smoke.ts`
- Create: `scripts/tactical_position_request_service_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: contract assertions that `PixiAwarenessHeatmapRenderer.ts` contains no `requestWorldField`, `requestTacticalPositions`, `getTacticalPositionProvider`, `provider.generate` or provider installation.

- [ ] Write source-contract checks that fail against current HEAD.
- [ ] Connect the runner to `tactical-position:smoke`.
- [ ] Confirm Vercel build fails for the renderer-ownership reason before production changes.

### Task 2: Persistent Per-Unit Settings

**Files:**
- Modify: `src/core/tactical/TacticalPositionSettings.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/ui/SceneExport.ts`
- Modify: `scripts/tactical_position_tuning_smoke.ts`

**Interfaces:**
- Produces: `TacticalPositionSettingsDataV1`, `unit.tacticalPositionSettings`, `unit.tacticalPositionSettingsRevision`.
- Removes: `WeakMap<UnitModel, SettingsEntry>` and cache-key number nudge.

- [ ] Add failing round-trip/revision assertions.
- [ ] Store normalized versioned settings directly on `UnitModel`.
- [ ] Normalize old flat settings blocks and old scenes without settings.
- [ ] Export version + revision + values.
- [ ] Confirm settings revision changes independently and survives scene normalization/export.

### Task 3: Simulation-Owned Request Service

**Files:**
- Create: `src/core/tactical/TacticalPositionSearchService.ts`
- Modify: `src/runtime/AwarenessWorldRuntime.ts`
- Modify: `src/core/tactical/TacticalPositionSearch.ts`
- Modify: `scripts/tactical_position_request_service_smoke.ts`

**Interfaces:**
- Produces:
  - `TacticalPositionSearchKind`
  - `TacticalPositionSearchStatus`
  - `TacticalPositionSearchRequestSnapshotV1`
  - `TacticalPositionSearchResultSnapshotV1`
  - `TacticalPositionSearchService.enqueue(...)`
  - `readRequest(requestId)`
  - `readLatestForUnit(unitId)`
  - `cancel(requestId)`
  - `clearUnit(unitId)`
  - `subscribe(listener)`
  - `destroy()`
- Consumes: `AwarenessWorldRuntime.requestWorldField` and bounded prepared-field search.

- [ ] Add failing tests for dedupe, replacement, stale rejection, two independent units, limits, deterministic result and destroy cleanup.
- [ ] Separate prepared-field search from field preparation in `AwarenessWorldRuntime`.
- [ ] Include `settingsRevision` as a semantic search-key component.
- [ ] Implement one latest request per owner, bounded request/result maps and immutable snapshots.
- [ ] Schedule processing outside DOM callbacks and repump on Awareness Worker completion.
- [ ] Reject results if owner/input/field identity changed.

### Task 4: Renderer Becomes a Pure Snapshot Consumer

**Files:**
- Modify: `src/rendering/PixiAwarenessHeatmapRenderer.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/main.ts`
- Modify: `scripts/tactical_position_request_service_smoke.ts`

**Interfaces:**
- Consumes: exact `TacticalPositionSearchService` instance created during bootstrap.
- Produces: renderer diagnostics and existing one-Graphics/one-Text marker UI.

- [ ] Add failing tests that repeated render and layer switching do not enqueue or calculate.
- [ ] Construct one service in `main.ts` and inject it into `PixiTacticalBoardApp` and renderer.
- [ ] Make raster rendering use `readReadyWorldField` only.
- [ ] Draw markers from `readLatestForUnit` only.
- [ ] Hide graphics when layer closes without deleting the service result.
- [ ] Keep max 12 markers, one `Graphics`, one reusable `Text`, bounded hit-test.
- [ ] Renderer destroy removes only presentation/input resources; bootstrap destroys service.

### Task 5: Player Command “Найти позиции”

**Files:**
- Modify: `src/ui/TacticalWorkspaceBase.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/main.ts`
- Modify: `scripts/tactical_workspace_smoke.mjs`
- Modify: `scripts/tactical_position_request_service_smoke.ts`

**Interfaces:**
- Consumes: `TacticalPositionSearchService.enqueue` and `subscribe`.
- Produces: button/status UI; no movement order.

- [ ] Add failing UI source/behavior contract.
- [ ] Add `Найти позиции` button and status text to the normal workspace owner.
- [ ] Button captures selected unit and enqueues one cover request only.
- [ ] Render statuses: queued, field preparing/calculating, ready, empty, stale, cancelled, failed.
- [ ] Keep LKM selection and PKM/explicit send separate from search.
- [ ] Unsubscribe on workspace teardown.

### Task 6: Graph v2 Uses the Same Stateful Request

**Files:**
- Modify: `src/core/ai/tactical/TacticalQuery.ts`
- Modify: `src/core/ai/AiGraphRunnerLegacy.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Simplify: `src/core/ai/AiGraphRuntime.ts`
- Remove or stop using: `src/core/tactical/TacticalPositionProvider.ts`
- Remove or stop using: `src/runtime/AwarenessTacticalPositionAdapter.ts`
- Modify: `scripts/tactical_position_graph_runtime_smoke.ts`
- Modify: `package.json`

**Interfaces:**
- Generation request includes `queryKey` and an optional existing request id.
- Generation result includes request id + service status.
- Graph blackboard persists `${queryKey}_request_id`.

- [ ] Rewrite the graph smoke to use an exact simulation service instead of global `unitId` provider lookup.
- [ ] First Graph pass creates one request and persists request id.
- [ ] Pending passes poll the same request without enqueueing a duplicate.
- [ ] Ready pass converts the same snapshot into the existing `TacticalQuery`, then existing Filter/Score/Select nodes run unchanged.
- [ ] Clear stale/cancelled request id before creating a replacement.
- [ ] Connect `tactical_position_graph_runtime_smoke.ts` to `tactical-position:smoke`.

### Task 7: Command-Owned Tactical Occupation

**Files:**
- Modify: `src/core/orders/PlayerCommand.ts`
- Modify: `src/core/tactical/TacticalPositionOrders.ts`
- Modify: `src/core/simulation/SimulationTickLegacy.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/ai/AiStatefulMoveGameBridge.ts`
- Simplify: `src/core/simulation/SimulationTick.ts`
- Delete or stop using: `src/core/tactical/TacticalPositionOccupation.ts`
- Delete or stop using: `src/core/tactical/TacticalPositionArrival.ts`
- Modify: `scripts/tactical_position_tuning_smoke.ts`
- Modify: `scripts/tactical_position_interaction_smoke.ts`

**Interfaces:**
- `PlayerCommand` serializes final facing, approach posture and occupation state linked to exact command id.
- Movement completion applies posture/facing once and marks occupied.
- Posture arbitration ignores ordinary conflicting AI posture while an occupied command owns the stance.

- [ ] Add failing tests for command serialization, arrival application, ordinary AI posture conflict and release by new route/command.
- [ ] Compute `finalFacingRadians` before `createPlayerMoveCommand`.
- [ ] Store approach/final posture and facing in the command itself.
- [ ] Apply arrival state in movement completion, not a post-tick correcting WeakMap.
- [ ] Release occupation when a new route/command takes ownership.
- [ ] Remove `unit.behaviorRuntime.danger = 0` from tactical order preview.

### Task 8: Wrapper Audit and Teardown

**Files:**
- Modify: `src/rendering/PixiAwarenessHeatmapRendererLegacy.ts` only if still imported.
- Modify: `src/core/ai/AiGraphRuntime.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `docs/superpowers/specs/2026-07-19-tactical-position-tuning-arrival-design.md`
- Modify: `scripts/tactical_position_request_service_smoke.ts`

**Interfaces:**
- Produces explicit teardown assertions and a documented list of wrappers intentionally retained.

- [ ] Remove feature-created wrapper behavior where the true owner now has a small extension point.
- [ ] Keep broad legacy aliases only where collapsing them would require unrelated high-risk file moves.
- [ ] Ensure service destroy clears requests, caches, listeners and owned Awareness Worker.
- [ ] Document remaining `Legacy`/`Base` files and next consolidation step.

### Task 9: Focused Verification and Delivery

**Files:**
- Modify only files required by failures.

- [ ] Run `npx tsc --noEmit` through the Vercel build environment.
- [ ] Run `npm run tactical-position:smoke`.
- [ ] Run `npm run tactical-query:smoke`.
- [ ] Run `npm run ai-scheduler:smoke`.
- [ ] Run `npm run workspace:smoke`.
- [ ] Run `npm run build`.
- [ ] Inspect Vercel build logs and final READY deployment.
- [ ] Verify branch HEAD remains only `feature/20260719-tactical-position-system`.
- [ ] Do not create PR or update another branch.
