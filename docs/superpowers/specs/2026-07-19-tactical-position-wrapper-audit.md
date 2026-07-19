# Tactical Position Legacy/Base Wrapper Audit

Date: 2026-07-19  
Branch: `feature/20260719-tactical-position-system`

## Scope

This audit covers wrapper/base modules touched or relied on by the tactical-position migration. It intentionally avoids a broad refactor of unrelated renderer, simulation, or Graph v2 code.

## Wrappers retained

### `AiGraphRunner.ts` → `AiGraphRunnerLegacy.ts`

**Why it remains:** `AiGraphRunnerLegacy.ts` is still the full graph interpreter and contains many unrelated node contracts. The small public wrapper adds only the stateful tactical request ID and publishes the selected candidate posture. Folding this into the large interpreter in this task would create a high-risk unrelated refactor.

**Current tactical responsibility:** persist `${queryKey}_request_id`, poll the same request, and copy the selected posture to blackboard memory.

**Removal path:** move tactical query execution behind a first-class stateful node/action contract in the main interpreter, then rename the legacy implementation back to the canonical module.

### `AiGraphRuntime.ts` → `AiGraphRuntimeLegacy.ts`

**Why it remains:** `AiGraphRuntimeLegacy.ts` owns the complete runtime/session/lifecycle engine. The wrapper binds execution to the exact simulation/unit context and supplies the simulation-owned tactical search host. It also rejects a conflicting posture effect while a serialized occupied-position command owns posture.

**Removal path:** pass the exact simulation tactical host explicitly through the canonical runtime input/session and add command-ownership arbitration to the normal effect application pipeline.

### `SimulationTick.ts` → `SimulationTickLegacy.ts`

**Why it remains:** `SimulationTickLegacy.ts` still owns movement completion, perception, combat, and scheduling. The wrapper now performs only command-owned tactical arrival finalization and approach-posture reconciliation. It no longer perpetually repairs an occupied posture from hidden state.

**Removal path:** add a normal movement-completion hook in the canonical movement/order pipeline and invoke tactical arrival finalization there.

### `TacticalWorkspace.ts` → `TacticalWorkspaceBase.ts`

**Why it remains:** the base workspace still renders the old danger/sidebar structure. The wrapper installs the explicit search button and tactical settings controls, hides deprecated cover-list UI, and updates help text.

**Removal path:** replace the danger panel in `TacticalWorkspaceBase.ts` directly with the tactical-position panel, then remove the mutation-observer compatibility cleanup.

### `PixiOverlayRenderer.ts` → `PixiOverlayRendererBase.ts`

**Why it remains:** the base renderer contains unrelated pressure, relief, threat, probe, interaction, and grid rendering. The wrapper removes only the deprecated object/forest cover-marker pass so the tactical-position renderer is the sole marker presenter.

**Removal path:** delete the old cover-marker pass from the base renderer and restore one canonical renderer class.

## Wrapper retired

### `PixiAwarenessHeatmapRendererLegacy.ts`

The previous renderer-owned search implementation is retired. The active renderer reads only immutable prepared-field and search-result snapshots. This legacy file should remain empty/deprecated only while old imports or source-contract tests are being removed; it can then be deleted in a focused cleanup.

## Remaining tactical WeakMaps

- `TacticalPositionSearchService`: state → service registry. This is a lifecycle lookup, not gameplay data; the service owns bounded serializable request snapshots and is explicitly destroyed.
- `TacticalPositionSettings`: state → editor draft. This is transient editor form state only. Persisted soldier settings live on `UnitModel` with a serialized version and revision.
- `SimulationTacticalPositionSelection`: state → hover/selection/presentation state. This is transient UI state and never owns search computation.

The former `WeakMap<UnitModel, TacticalPositionOccupationState>` has been removed. Occupation ownership now lives in serialized `PlayerCommand` fields.

## Position kinds not implemented

The request contract is extensible to observation, firing, fallback, machine-gun, and group positions. Only `cover` has working scoring semantics in this stage. The other kinds return an explicit unsupported-kind failure and are not presented as completed tactical capabilities.

## Safety boundary

No wrapper retained above may start a tactical search from rendering, layer visibility, camera changes, hover, or selected-tab changes. Only an explicit player action or a stateful Graph v2 node may enqueue a request in the simulation-owned service.
