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
- pause time is excluded from wait and no-progress timers;
- preview evaluation does not advance simulation time, replace the live session or install an order;
- each soldier owns an independent runtime session, memory, cooldown map and execution state;
- changing the selected soldier does not copy the first soldier's action token or active state;
- `SimulationTick` remains the only coordinate mutator;
- the 60 ms route tracker does not rebuild awareness and does not run A*;
- A* runs only when a route is created or invalidated.

## Current timing boundaries

```text
normal AI graph cadence: 600 ms of AI simulation time
route status polling: 60 ms wall-clock polling
pause: simulation time does not advance
preview evaluate: no live state mutation
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
  physical coordinate changes only
```

## Completion state

This baseline is complete when Preview Core Checks includes `runtime-session:smoke` and all listed existing checks remain green on the temporary branch. It must not be merged into `real-wargame-preview` without explicit user approval.
