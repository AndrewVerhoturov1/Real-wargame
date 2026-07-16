# Runtime and Events Baseline

Date: 2026-07-12  
Branch: `planning/complete-stateful-runtime-events-2026-07-12`  
Purpose: regression contract before general lifecycle, composite and event-system work.

## Stable behavior that must not regress

- legacy instant graphs still execute through `AiGraphRunner`;
- `Wait` starts once, updates without restart, completes and cancels;
- `MoveToBlackboardPosition` starts once, freezes its target and remains running across ticks;
- owned movement cleanup removes only the matching AI order;
- a replacement player order survives stale AI cleanup;
- route status distinguishes moving, stalled, blocked, arrived, player override, target loss and missing order;
- exact unreachable AI targets fail without fake adjacent success;
- the paused outer Pixi loop makes no automatic simulation call, while an explicit `tickSimulation` step advances wait, route and no-progress timers coherently;
- preview evaluation does not advance simulation time, replace the live session or install an order;
- each soldier owns an independent runtime session, memory, cooldown map and execution state;
- changing the selected soldier does not copy the first soldier's action token or active state;
- `SimulationTick` remains the only coordinate mutator;
- 60 ms Blackboard observer polling uses simulation time and does not depend on renderer FPS; route lifecycle remains simulation-step-owned and neither path rebuilds awareness or runs A*;
- A* runs only when a route is created or invalidated.

## Current timing boundaries

```text
first graph decision: first explicit simulation step
normal AI graph cadence: 600 ms of AI simulation time
Blackboard observer polling: 60 ms of simulation time
route lifecycle: evaluated by explicit simulation steps, never by an independent browser timer
pause: outer Pixi ticker does not call tickSimulation; an explicit call advances all simulation systems
preview evaluate/tick/cancel: detached read-only diagnostic state
```

## Required automated commands

```text
npm run runtime-session:smoke
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run pathfinding:smoke
npm run routed-move:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

`runtime-session:smoke` proves:

- independent sessions do not share mutable state;
- an unsupported version resets safely with a Russian reason;
- old scattered runtime fields migrate into a versioned envelope;
- active and terminal transitions preserve simulation time and cooldowns.

## Visual verification

No browser run is required for the baseline or the session envelope. Any later user-visible runtime/debug change must prepare a Playwright scenario, then ask the user before launching visual QA.

## Source-of-truth boundaries

```text
AiGraphRunner
  immediate Utility evaluation and ordinary effects

AiGraphRuntime
  resumable execution contract

AiRuntimeSession
  per-soldier serializable envelope

AiGameBridge / AiStatefulMoveGameBridge
  live-game adaptation and ownership-safe effects

SimulationTick
  canonical simulation phase order, per-unit scheduler call and physical coordinate changes
```

## Completion state

This baseline is complete when Preview Core Checks includes `runtime-session:smoke` and all listed existing checks remain green on the temporary branch. It must not be merged into `real-wargame-preview` without explicit user approval.
