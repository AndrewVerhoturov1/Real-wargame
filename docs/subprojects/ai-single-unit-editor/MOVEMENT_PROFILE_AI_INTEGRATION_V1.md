# Movement Profile AI Integration v1

## Scope

This slice connects a string `movementProfileId` to immutable tactical intent, `PlayerCommand`, `MoveOrder`, route replanning, AI graph memory, stateful movement, scene/runtime snapshots and selected-unit diagnostics.

Physical locomotion parameters and profile editing remain owned by the movement-profile registry/runtime result. This integration consumes registry IDs and revisions without duplicating profile definitions.

## Canonical separation

```text
navigationProfileId
→ route selection and route cost

movementProfileId
→ requested physical execution profile

active_movement_gait
→ actual physical runtime state
```

`NavigationMovementMode` is not renamed or reused as a physical gait.

## Canonical registry IDs

The built-in IDs are shared with PR #133:

```text
normal_walk
stealth_move
crouched_move
run
sprint
crawl
```

Tactical preset defaults:

| Tactical preset | Navigation profile | Physical movement profile |
| --- | --- | --- |
| `move` | `normal` | `normal_walk` |
| `recon` | `cautious` | `stealth_move` |
| `assault` | `attack` | `run` |

`Sprint` is a short acceleration profile and is not the persistent assault default.

A version 1 intent receives the canonical physical default of its preset. A non-empty custom string ID remains unchanged while no registry view is available.

## Source priority

The runtime resolver applies this strict priority:

1. hard runtime safety restriction;
2. temporary AI override intent;
3. immutable player-order profile;
4. unit-role profile;
5. default profile.

AI graph nodes write only override intent:

```text
movement_profile_override_id
movement_profile_override_owner_token
movement_profile_override_reason
```

The runtime resolver alone publishes derived `active_*` and `forced_*` fields. Therefore a graph node cannot bypass hard safety by directly writing an active profile.

Override cleanup uses owner tokens. A stale cleanup may not clear a newer override.

## AI graph contracts

Typed nodes:

- `SetMovementProfile`;
- `ClearMovementProfileOverride`.

The serialized legacy `SetMovementMode` remains readable and maps:

```text
fast    → run
careful → stealth_move
crawl   → crawl
other   → normal_walk
```

It no longer writes a decorative `movement_mode:*` string to `currentAction`.

`SetMovementProfile.profileId` and `MoveToBlackboardPosition.movementProfileId` are serialized as plain string IDs. Their visual fields use `movement_profile_registry` selector metadata rather than a hard-coded enum.

The editor adapter reads the same registry storage contract as PR #133 and displays built-in, custom and missing IDs honestly.

`MoveToBlackboardPosition` source semantics:

```text
from_order
→ snapshot the immutable order profile

current_active
→ snapshot the current effective profile without claiming ownership

specific
→ create a temporary AI override owned by the action token

automatic
→ let the runtime resolver choose the effective source
```

Older stateful snapshots without the source field migrate as `automatic`.

## Revision contract

Two independent revisions are preserved:

```text
movementProfileDefinitionRevision
→ revision of the selected profile definition from the registry

movementProfileSelectionRevision
→ revision of the order/override/effective selection
```

The old `movementProfileRevision` is accepted only as a migration alias for `movementProfileSelectionRevision`. It is not used as a definition revision.

The AI scheduler accepts an optional pure registry snapshot and passes its profile revisions to runtime reconciliation. Browser storage remains outside the core resolver.

## Blackboard contract

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

Internal intent/safety keys:

```text
movement_profile_override_id
movement_profile_override_owner_token
movement_profile_override_reason
movement_hard_safety_profile_id
movement_hard_safety_reason
```

Unknown physical runtime values remain `null` or `unknown`. UI diagnostics are read-only and never become gameplay state.

## MoveOrder and runtime snapshot

The active order carries:

```text
movementProfileId
movementProfileSource
movementProfileOwnerToken
movementProfileDefinitionRevision
movementProfileSelectionRevision
```

Route replanning preserves all five fields.

Runtime serialization writes the two revisions separately. Legacy snapshots containing only `movementProfileRevision` restore it as `movementProfileSelectionRevision`.

Scene export remains on the additive compatible envelope:

```text
scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid
```

The new movement-profile fields do not require a v10 envelope and old v9 consumers remain valid.

## Adapter required from physical runtime

The physical runtime consumes the active `MoveOrder` snapshot and publishes:

```text
active_movement_gait
movement_speed
movement_stamina
movement_noise
movement_visual_signature
movement_can_fire
```

Hard safety publishes:

```text
movement_hard_safety_profile_id
movement_hard_safety_reason
```

It must not mutate `TacticalOrderIntent` or create a second route system.

## Adapter required from registry/editor

The registry adapter provides:

1. known profile IDs for validation and honest fallback;
2. Russian display names;
3. custom selector options;
4. profile definition revisions;
5. numeric physical parameters used only by the physical runtime.

The AI integration owns string IDs, selection priority and adapters only.

## Focused non-browser check

```text
npm run movement-intent-ai:smoke
```

The smoke verifies:

- canonical six-profile IDs and preset mapping;
- v1 intent migration and custom IDs;
- registry fallback;
- intent-only override writes and owner-token cleanup;
- hard-safety priority over AI override;
- `current_active` snapshot without ownership;
- registry-backed string node parameters;
- split revisions and legacy snapshot migration.

It is also included in:

```text
npm run tactical-order:smoke
```

## Prepared visual QA

Browser execution still requires explicit user approval. The prepared checks are:

1. Russian source selector options;
2. registry-backed built-in and custom profile selector;
3. honest missing-ID display;
4. `move → normal_walk`;
5. `recon → stealth_move`;
6. `assault → run`;
7. selected-unit diagnostics with unpublished physical values shown as unavailable;
8. compact radial-menu geometry unchanged.
