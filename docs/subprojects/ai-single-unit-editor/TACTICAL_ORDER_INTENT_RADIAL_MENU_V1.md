# Tactical Order Intent and Radial Menu v1

## Status

This document describes draft PR #129 on branch `agent/tactical-order-radial-menu-v1`, targeting `real-wargame-preview`. The implementation remains isolated until orchestrator acceptance.

The accepted command architecture is unchanged:

```text
PlayerCommand = player order plus immutable TacticalOrderIntent
AiPlan        = current high-level pursuit of that command
Graph/runtime = low-level decisions and resumable actions
MoveOrder     = concrete route produced by the shared planner
```

The radial menu is input and presentation only. Authoritative target, command, intent and route data belong to core state.

## Presets

```text
move    → normal   / automatic / continue_if_possible / self_defense
recon   → cautious / search    / pause_and_observe    / self_defense
assault → attack   / engage    / press_attack         / fire_at_will
```

No dedicated `DoRecon` or `DoAssault` node is introduced. Existing universal Blackboard operations read the per-unit intent keys.

## Compact visual contract

The ring uses a 208 px visible diameter inside a 224 px interaction container:

```text
menu container: 224 × 224 px
visual outer radius: 104 px
center visual diameter: 50 px
selection inner radius: 34 px
inactive dark ring fill: rgba(..., 0.14)
active sector fill: rgba(..., 0.72)
```

Inactive sectors contain only an icon, short Russian name and small numeric shortcut. They have no opaque rectangular card. Only the active sector gains a denser olive fill and yellow outline. One compact hint and the normalized target are shown below the ring.

The map remains visible through the ring and inactive sectors.

## Input and geometry

```text
short RMB
  → ordinary quick routed movement

hold RMB for 240 ms
  → open compact radial menu

release inside center / inner gap
  → cancel

release inside selectable annulus
  → issue visible sector preset

release beyond outer radius
  → cancel without a new command
```

Two screen points are intentionally separate:

```text
anchorScreen
  = original RMB press marker

menuCenterScreen
  = clamped visual and interactive ring center
```

`targetGrid` is a separate world-space value. It is clamped to the map before the gesture begins, displayed by the menu and passed unchanged to the command issuer. Viewport clamping moves only `menuCenterScreen`.

All pointer hit testing uses `menuCenterScreen`. Therefore a visible sector near a screen edge selects the same preset that the player sees.

## Keyboard behavior

While the ring is open:

```text
1 → immediately issue move
2 → immediately issue recon
3 → immediately issue assault
```

The menu closes immediately, but the captured RMB pointer remains consumed until physical release. That release cannot leak into the legacy quick-move handler and cannot replace the keyboard command.

## Cancellation and teardown

The menu closes safely on:

- center or outside-ring release;
- Escape;
- pointer cancellation;
- pointer-capture loss;
- pointer leaving the canvas;
- application destruction.

All registered canvas/window listeners, the status interval, visual QA harness, status card and menu DOM are removed by the returned destroy function. Destruction is idempotent.

## Routed movement and AI visibility

Every confirmed preset continues through the existing canonical route path:

```text
TacticalOrderIntent
  → PlayerCommand
  → resolveUnitNavigationProfile
  → buildUnitTacticalRouteContext
  → planMoveOrder
  → MoveOrder linked by playerCommandId
  → ordinary SimulationTick and per-unit scheduler
```

Intent is published from `UnitModel.playerCommand` to:

```text
player_order_preset
player_order_navigation_profile
player_order_attention_policy
player_order_contact_policy
player_order_fire_policy
player_order_resume_after_interruption
```

UI selection identifies recipients only at issue time. It is not a scheduling input.

## Serialization

The optional `playerCommand` field remains compatible with the existing scene export version. It stores target, status, revision, final facing and immutable intent. Old scenes without the field still load. Commands without intent normalize to ordinary movement.

The displayed target is already map-clamped and matches the target written to the single selected unit's `PlayerCommand`.

## CI and visual QA

`Tactical Order Core Verification` is permanent:

- runs for relevant pull requests targeting `real-wargame-preview`;
- runs after relevant pushes to `real-wargame-preview`;
- contains no temporary branch-name condition.

`Tactical Order Visual QA` follows an approval gate:

- manual `workflow_dispatch` is always allowed;
- a PR run is allowed only when its body contains `VISUAL_QA_APPROVED_BY_USER: yes`;
- the exact PR head SHA is checked out and written into the artifact.

The reusable Playwright scenario verifies:

- compact dimensions and transparent inactive sector backgrounds;
- no preliminary quick move while the menu is open;
- edge-clamped visual-sector parity for recon and assault;
- cancellation beyond the outer radius;
- keyboard confirmation through key `2`;
- displayed target equals issued target;
- listener and DOM teardown;
- fresh screenshots from the exact tested SHA.

## Current limitations

- Contact and fire policies are durable command/Blackboard data, but the default graph does not yet implement a complete doctrine for every policy.
- Group commands keep existing relative target offsets; the displayed target is the command-center target.
- Formations, command delay, radio, queues, smoke orders and dedicated preset action nodes remain out of scope.
- Tactical sectors do not set final facing; short-RMB drag keeps the existing final-facing behavior.
