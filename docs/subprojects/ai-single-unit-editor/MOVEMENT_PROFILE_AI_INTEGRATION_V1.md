# Movement Profile AI Integration v1

## Scope

This slice connects a string `movementProfileId` to immutable tactical intent, `PlayerCommand`, `MoveOrder`, route replanning, AI graph memory, stateful movement, scene/runtime snapshots and selected-unit diagnostics.

It deliberately does **not** implement physical locomotion parameters or the editable profile registry. Those remain separate parallel results.

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

## Intent migration

`TacticalOrderIntent` format version 2 adds immutable `movementProfileId`.

Built-in preset defaults:

| Tactical preset | Navigation profile | Physical movement profile |
| --- | --- | --- |
| `move` | `normal` | `normal` |
| `recon` | `cautious` | `stealth` |
| `assault` | `attack` | `fast` |

A version 1 intent receives the physical default of its preset. A non-empty custom string ID remains unchanged while no registry view is available.

## Source priority

The resolver applies this strict priority:

1. hard runtime safety restriction;
2. temporary AI override;
3. immutable player-order profile;
4. unit-role profile;
5. default profile.

AI override and cleanup use owner tokens. A stale cleanup may not clear a newer override or replace a newer player order.

## AI graph contracts

New typed nodes:

- `SetMovementProfile`;
- `ClearMovementProfileOverride`.

The serialized legacy `SetMovementMode` node remains readable and maps:

- `fast` → `fast`;
- `careful` / `crawl` → `stealth`;
- other legacy values → `normal`.

It no longer writes a decorative `movement_mode:*` string to `currentAction`.

`MoveToBlackboardPosition` exposes two visual enum fields:

- profile source: from order, current active, automatic, specific;
- specific profile: normal, stealth, fast.

The source selection is stored in the stateful action snapshot. Older snapshots without this field migrate as `automatic`.

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
```

Additional internal ownership/safety keys:

```text
movement_profile_override_id
movement_profile_override_owner_token
movement_hard_safety_profile_id
movement_hard_safety_reason
```

Unknown physical runtime values remain `null` or `unknown`. UI diagnostics are read-only and never become gameplay state.

## Adapter required from physical-runtime worker

The physical runtime should consume the snapshot on the active `MoveOrder`:

```text
movementProfileId
movementProfileSource
movementProfileOwnerToken
movementProfileRevision
```

It should publish actual runtime values to the canonical Blackboard keys:

```text
active_movement_gait
movement_speed
movement_stamina
movement_noise
movement_visual_signature
movement_can_fire
```

Hard safety may publish:

```text
movement_hard_safety_profile_id
movement_hard_safety_reason
```

It must not mutate `TacticalOrderIntent` or create a second route system.

## Adapter required from registry/editor worker

The registry integration should provide:

1. known profile IDs for validation and honest fallback;
2. Russian display names for profile IDs;
3. dropdown options for custom profiles;
4. numeric physical parameters used only by the physical runtime.

The current AI integration owns string IDs and source priority only. It must not duplicate registry records inside each graph node.

## Prepared Playwright visual scenario

Do not run this scenario until the user explicitly approves browser execution.

### Preconditions

1. Start the normal local preview according to `.agents/skills/real-wargame-local-preview/SKILL.md`.
2. Open the AI node editor and a tactical scene containing at least one selected soldier.
3. Keep the accepted compact radial-menu dimensions unchanged.

### Steps and evidence

1. Add `MoveToBlackboardPosition`.
   - Open its parameter panel.
   - Verify the Russian label `Источник профиля движения`.
   - Verify options `Из приказа`, `Текущий активный`, `Автоматически`, `Конкретный профиль`.
   - Capture `movement-profile-node-dropdown-ru.png`.

2. Select `Из приказа`.
   - Save and reopen the graph.
   - Verify the value survives serialization.
   - Capture `movement-profile-source-from-order.png`.

3. Select `Конкретный профиль` and `Скрытное движение`.
   - Save and reopen the graph.
   - Verify no technical ID or JSON edit is required.
   - Capture `movement-profile-source-specific.png`.

4. Select a soldier with a `recon` order.
   - Verify diagnostics show ordered profile, AI override, active profile, actual gait, source, speed, stamina, noise, visibility, fire permission and restriction reason.
   - Unknown physical values must say that they are not published rather than display fabricated numbers.
   - Capture `movement-profile-selected-unit-diagnostics.png`.

5. Open the tactical radial menu near a map edge.
   - Verify it remains compact and hit testing follows the clamped visual centre.
   - Capture `movement-profile-compact-radial-menu.png`.

6. Issue `move`, `recon` and `assault` in turn.
   - Verify physical defaults `normal`, `stealth`, `fast` in diagnostics/Blackboard.
   - Capture `movement-profile-preset-defaults.png`.

### Expected PNG list

```text
movement-profile-node-dropdown-ru.png
movement-profile-source-from-order.png
movement-profile-source-specific.png
movement-profile-selected-unit-diagnostics.png
movement-profile-compact-radial-menu.png
movement-profile-preset-defaults.png
```

## Focused non-browser check

```text
npm run movement-intent-ai:smoke
```

The smoke verifies intent migration and immutability, command/order snapshot preservation, serialization, source priority, custom-ID behavior, owned override cleanup, typed and legacy graph-node behavior, old stateful action snapshots, dropdown contracts and the Russian Blackboard dictionary.
