# Movement Profile AI Integration v1

## Scope

This slice carries a string `movementProfileId` through immutable tactical intent, `PlayerCommand`, `MoveOrder`, route replanning, AI memory, stateful movement, scene/runtime snapshots and selected-unit diagnostics.

Profile definitions and physical locomotion remain owned by the movement-profile registry/runtime result. This integration consumes registry IDs and revisions without duplicating profile definitions.

## Canonical IDs and presets

Built-in IDs shared with PR #133:

```text
normal_walk
stealth_move
crouched_move
run
sprint
crawl
```

| Tactical preset | Navigation profile | Physical movement profile |
| --- | --- | --- |
| `move` | `normal` | `normal_walk` |
| `recon` | `cautious` | `stealth_move` |
| `assault` | `attack` | `run` |

`Sprint` remains a short acceleration profile rather than the persistent assault default.

Legacy `SetMovementMode` migration:

```text
fast    → run
careful → stealth_move
crawl   → crawl
other   → normal_walk
```

## Requested baseline and effective selection

The finalizer separates two concepts.

Requested baseline:

```text
active player order
→ unit role
→ default
```

Effective selection:

```text
hard safety
→ AI override
→ requested baseline
```

Completed or cancelled player commands are not movement-profile sources.

`requested_movement_profile_id` always reports the baseline intent. A hard-safety replacement does not overwrite it.

Hard safety is reported as a forced fallback:

```text
movement_forced_fallback = true
movement_forced_reason = movement_hard_safety_reason
```

A valid AI override is not a forced fallback. A selected ID missing from the supplied registry is a forced fallback and keeps the missing requested ID in diagnostics.

## Single finalizer ownership

`reconcileMovementProfileRuntime()` is the only owner of:

```text
requested_movement_profile_id
active_movement_profile_id
active_movement_profile_source
movement_forced_fallback
movement_forced_reason
movement_profile_definition_revision
movement_profile_selection_revision
effective MoveOrder movement snapshot
```

AI nodes and move actions publish only source intent or an initial explicit snapshot. They do not implement priority, registry fallback or revision rules.

`AiStatefulMoveGameBridge.syncMoveOrderMemoryForUnit()` publishes only route/order facts:

```text
active_move_source
active_move_owner_token
active_move_target
active_move_path_*
```

The bridge contains no second movement-profile resolver. It delegates effective state before graph evaluation, after graph effects and immediately after creating an AI move order to `reconcileMovementProfileRuntime()`.

## AI override intent

`SetMovementProfile` writes only:

```text
movement_profile_override_id
movement_profile_override_owner_token
movement_profile_override_reason
```

`ClearMovementProfileOverride` clears only those intent fields and respects owner-token cleanup. It never writes `active_*` or `forced_*` fields.

## Stateful move source semantics

`MoveToBlackboardPosition` supports:

```text
from_order
current_active
automatic
specific
```

### `from_order`

Uses only an active `player_order_movement_profile` snapshot.

When an active player order exists:

```text
profile ID = player_order_movement_profile
source = player_order
profile owner = none on the AI action snapshot
```

When no active player order exists, the action emits no explicit movement profile/source/owner. The canonical finalizer then selects unit role or default. It does not manufacture `player_order` source or ownership. The stateful action records an honest diagnostic reason for this automatic fallback.

Custom player-order IDs are preserved as plain strings.

### `current_active`

Snapshots the current finalizer-published effective ID and source. It does not claim the existing profile owner.

### `specific`

Writes a temporary AI override owned by the action token. Cleanup clears only that owned override.

### `automatic`

Emits no explicit movement snapshot. The finalizer resolves the source when the order is created.

Older stateful snapshots without source fields migrate as `automatic`.

## Revision contract

```text
movementProfileDefinitionRevision
→ selected profile-definition revision supplied by the registry

movementProfileSelectionRevision
→ order/override/effective-selection revision
```

New runtime objects and new snapshots write only these explicit fields.

The old `movementProfileRevision` is accepted only while reading or normalizing a legacy runtime snapshot. It migrates to `movementProfileSelectionRevision`; it is not a field of new `MoveOrder` options or runtime objects.

## Blackboard and diagnostics

Canonical per-unit keys:

```text
requested_movement_profile_id
active_movement_profile_id
active_movement_profile_source
active_movement_gait
movement_speed
movement_stamina
movement_noise
movement_visual_signature
movement_can_fire
movement_forced_fallback
movement_forced_reason
movement_profile_definition_revision
movement_profile_selection_revision
```

Physical values remain `null` or `unknown` until the physical runtime publishes them. UI diagnostics are read-only and never become gameplay state.

## Selector provider boundary

Generic `node-contract-ui.ts` does not parse movement-profile JSON or access browser storage.

It consumes the UI-only interface:

```ts
interface MovementProfileSelectorProvider {
  listProfiles(): readonly {
    id: string;
    nameRu: string;
    revision?: number;
  }[];
}
```

Until the registry PR is integrated, the provider falls back to the six canonical built-ins.

The real integration provider must be backed by PR #133 `MovementProfileBrowserStorage` and the canonical movement-profile selector/registry. Storage parsing and registry subscription belong in that adapter, not in generic contract rendering or movement core.

Unknown selected IDs remain visible as unavailable rather than being silently replaced in the graph JSON.

See `MOVEMENT_PROFILE_SELECTOR_PROVIDER_INTEGRATION.md` for the adapter boundary.

## MoveOrder and serialization

The effective order carries:

```text
movementProfileId
movementProfileSource
movementProfileOwnerToken
movementProfileDefinitionRevision
movementProfileSelectionRevision
```

Route replanning preserves those fields.

Scene export remains additive-compatible:

```text
scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid
```

Runtime serialization writes the two explicit revisions separately and reads the old single revision only for migration.

## Physical-runtime adapter

The physical runtime consumes the effective `MoveOrder` snapshot and publishes:

```text
active_movement_gait
movement_speed
movement_stamina
movement_noise
movement_visual_signature
movement_can_fire
```

Hard safety publishes intent through:

```text
movement_hard_safety_profile_id
movement_hard_safety_reason
```

It must not mutate `TacticalOrderIntent`, directly write resolved movement diagnostics or create a second route system.

## Focused non-browser verification

```text
npm run movement-intent-ai:smoke
```

The smoke proves:

- six canonical IDs and tactical preset mapping;
- v1 intent migration and custom IDs;
- intent-only AI override and owner-token cleanup;
- registry-aware fallback;
- route/order-memory synchronization does not change finalizer output;
- `current_active` snapshots the same finalizer result;
- `from_order` behavior with active order, unit-role fallback, default fallback and custom IDs;
- player order + hard safety;
- AI override + hard safety;
- player order + AI override;
- missing player profile;
- hard safety always wins and sets forced diagnostics;
- AI override alone is not a forced fallback;
- selector-provider built-in and custom entries;
- split revisions and snapshot-read-only legacy migration;
- bridge source contains no duplicate priority/fallback implementation.

It is included at the start of:

```text
npm run tactical-order:smoke
```

## Visual QA

Browser visual QA is intentionally deferred until the common integration branch. No visual evidence is claimed by this PR follow-up.
