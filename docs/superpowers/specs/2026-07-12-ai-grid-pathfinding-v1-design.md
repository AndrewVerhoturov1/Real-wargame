# Grid Pathfinding v1 — Design

Date: 2026-07-12

## Goal

Provide one obstacle-aware grid route system for player right-click orders and `MoveToBlackboardPosition`, without changing the ownership/lifecycle contracts of the stateful AI runtime.

## Architecture

### Pure map navigation

`GridNavigation.ts` converts `TacticalMap` into deterministic passability and cost cells. It uses terrain, forest density, bridge footprints and canonical rotated map-object geometry. It does not import DOM, PixiJS, localStorage, AI runtime or `SimulationState`.

### Pure search

`GridPathfinder.ts` implements deterministic eight-direction A* with a binary heap, no diagonal corner cutting, bounded search and waypoint simplification.

### Shared planning

`MoveOrderPlanning.ts` converts a successful path into a routed `MoveOrder`. Player and AI commands call the same planner. Player commands may resolve a blocked click to a nearby passable cell; AI actions require an exact target.

### Execution

`SimulationTick.ts` remains the only coordinate mutator. It follows current waypoints, completes only at the final point, checks a short route-cell lookahead and replans only when that lookahead becomes invalid.

### Reactive AI

`AiStatefulMoveGameBridge.ts` preserves `ownerToken`, publishes route/path memory and never creates a direct fallback for an unreachable AI target. Existing route progress, cancellation and player-override rules stay authoritative.

## Terrain costs

- road 0.8;
- field 1.0;
- forest 1.25/1.45;
- rough 1.3;
- swamp 1.8;
- water blocked except under bridge footprint;
- small elevation-change cost.

## Object rules

Blocked: structures, trees, rocks, cover objects, crates, fences, posts, logs and wells.

Passable: ditches and bridges.

The center of a normalized map object is `x + 0.5 / y + 0.5`.

## Performance

- no A* per frame;
- only six upcoming route cells validated per simulation tick;
- A* on creation or invalidation;
- 128×128 synthetic performance smoke;
- reactive 60 ms tracker performs no pathfinding and no awareness rebuild.

## Compatibility

- graph version 1;
- localStorage graph v6;
- legacy direct `MoveOrder` remains valid;
- player pressure preview retained;
- selected-soldier automatic AI only;
- `main` untouched.

## Out of scope

Flow fields, formation corridor planning, unit reservations, moving-obstacle prediction, cover reservation and tactical exposure-aware routing.
