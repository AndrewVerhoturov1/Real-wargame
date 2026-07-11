# HANDOFF — AI Single-Unit Runtime

Updated: 2026-07-12  
Repository: `AndrewVerhoturov1/Real-wargame`  
Working branch: `real-wargame-preview`

## Purpose

This file contains only the immediate continuation context. Canonical current status is generated from:

```text
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/STATUS.md
```

## Verified baseline

Stateful AI Movement v1 is implemented in `real-wargame-preview`.

Implemented behavior:

- `AiGraphRunner` remains the pure immediate Utility evaluator;
- runtime-specific movement effects are handled at the `AiStatefulMoveGameBridge` boundary rather than added to the immediate Runner;
- `AiGraphRuntime` stores serializable execution state across ticks;
- lifecycle supports `start / update / complete / cancel`;
- `SequenceWithMemory` resumes the active child and movement cleanup does not hide its following effect;
- `Wait` uses `waiting`;
- `MoveToBlackboardPosition` is the first real `running` action;
- the target position is frozen when movement starts;
- `begin_move` is emitted once rather than every tick;
- `SimulationTick` remains the only layer that changes unit coordinates;
- AI movement creates a token-owned `MoveOrder`;
- a right-click order without ownership fields is treated as a player order;
- cleanup removes only the order with the matching owner token;
- a newer player order survives stale AI cancellation;
- a newly added movement node immediately persists `targetKey`, `acceptanceRadiusCells` and `timeoutSeconds`;
- Russian authoring controls and live movement diagnostics are available.

Last verified application commit:

```text
e5b5e6f0f964ebc7d25e023a92c4e0d9c01b6735
```

Recorded verification:

```text
Preview Core Checks: success
Preview Policy: success
Preview screenshots: success
Playwright: 15/15
PNG: 21
inspected: 27-ai-running-move-node.png
```

Detailed completed-stage record:

```text
docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md
docs/subprojects/ai-single-unit-editor/journal/2026-07-12-stateful-movement-v1.md
```

## Active next slice

The next bounded vertical slice is:

```text
Reactive Abort + Route Status v1
```

It should add:

- explicit route state such as active, arrived, blocked and invalid;
- reactive cancellation or rebuild after a new player/commander order;
- reaction when the target cover disappears or becomes unusable;
- reaction when movement is blocked;
- reaction to a critical change in known threat;
- clear cancellation reasons in runtime trace and Russian diagnostics;
- tests proving cleanup still preserves replacement orders and following sequence effects.

After that, introduce a real grid pathfinder. Do not call straight-line movement pathfinding.

## Read now

1. `docs/subprojects/ai-single-unit-editor/STATUS.md`
2. `.agents/skills/real-wargame-ai-runtime/SKILL.md`
3. `docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md`
4. `src/core/ai/AiGraphRuntime.ts`
5. `src/core/ai/AiStatefulMoveGameBridge.ts`
6. `src/core/orders/MoveOrder.ts`
7. `scripts/ai_graph_runtime_smoke.ts`
8. `scripts/ai_stateful_move_bridge_smoke.ts`
9. `tests/ai-running-move.spec.ts`
10. `.agents/skills/real-wargame-local-preview/SKILL.md` before browser verification

## Stable boundaries

- `AiGraphRunner.ts` does not import PixiJS, DOM, localStorage or `SimulationState`.
- `AiGraphRuntime.ts` owns resumable lifecycle, not rendering or input.
- `AiGameBridge.ts` and `AiStatefulMoveGameBridge.ts` adapt pure AI to the live game.
- Execution state is separate from Blackboard.
- Movement cleanup requires matching ownership token.
- Soldier knowledge remains subjective.
- Territory safety is context, not enemy detection or current danger.
- Automatic AI execution remains limited to the selected soldier.

## Required checks for the next slice

```text
npm run runtime:smoke
npm run move-bridge:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

User-visible runtime changes also require a fresh real-browser scenario, matching commit SHA and inspected PNG.

## Do not do

- do not change or merge to `main` without explicit human GO;
- do not move lifecycle logic into rendering or UI;
- do not clear movement by action type alone;
- do not treat straight-line movement as completed pathfinding;
- do not add squad AI, cover reservation and full pathfinding in one slice;
- do not declare visual success from code or workflow status alone.
