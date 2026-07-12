# Grid Pathfinding v1

Date: 2026-07-12

## Result

Player right-click movement and `MoveToBlackboardPosition` use one shared deterministic grid pathfinder. Units follow waypoint routes, do not finish on intermediate points, and rebuild a route when the next route section becomes blocked.

## Navigation grid

### Terrain

- field: passable, cost `1.0`;
- road: passable, cost `0.8`;
- forest: passable, cost `1.25` or `1.45`;
- rough: passable, cost `1.3`;
- swamp: passable, cost `1.8`;
- water: blocked unless covered by a bridge footprint.

Elevation difference adds route cost but does not create cliffs in v1.

### Objects

Blocking:

- structure;
- tree;
- rock;
- cover;
- crates;
- fence;
- post;
- logs;
- well.

Passable:

- ditch;
- bridge.

Object placement follows the canonical map contract: `object.x/object.y` identify the cell and the geometric center is `x + 0.5 / y + 0.5`. Rotation, width, height and an infantry body-radius sample participate in occupancy.

## A*

- eight directions;
- diagonal cost `sqrt(2)`;
- no diagonal corner cutting;
- binary heap open set;
- deterministic tie breaking;
- terrain and small slope costs;
- bounded search;
- collinear cells simplified to waypoint points.

## Goal policy

Player commands may move a blocked click target to the nearest passable cell and expose both requested and resolved targets.

AI actions require their exact target cell. If it is blocked, no fake adjacent success is created: the path status becomes `unreachable`, no move order is installed, and the runtime finishes through its existing failure path.

## MoveOrder route data

- `requestedTarget`;
- `target` — final resolved destination;
- `waypoints` / `waypointIndex`;
- `routeCells` / `routeCellIndex`;
- `routeStatus` — `planned`, `following`, `replanned`;
- `routeRevision`;
- path cost, visited-cell count and human reasons.

Legacy direct orders without route data remain supported.

## Simulation

`SimulationTick` remains the only coordinate mutator.

It checks only the next six route cells. A* runs on initial order creation or when this lookahead becomes invalid, never every frame.

When rebuilding succeeds, source and `ownerToken` are preserved. When it fails, the order is cleared and the unit receives `move_route_unavailable` with a Russian reason.

## Player compatibility

Right-click movement is routed through `issueRoutedMoveOrderToSelectedUnits`. Formation offsets are planned independently per selected unit. The previous destination pressure preview (`danger` and reason) is preserved.

## AI memory and trace

Blackboard/runtime memory:

- `active_move_path_status`;
- `active_move_path_waypoint_count`;
- `active_move_path_waypoint_index`;
- `active_move_path_requested_target`;
- `active_move_path_resolved_target`;
- `active_move_path_reason`.

Russian trace rows:

- `Путь`;
- `Точек маршрута`;
- `Текущая точка`;
- `Запрошенная цель`;
- `Доступная цель`;
- `Причина пути`.

## Verification

- `npm run pathfinding:smoke`;
- `npm run routed-move:smoke`;
- `npm run move-bridge:smoke`;
- `npm run route-status:smoke`;
- `npm run runtime:smoke`;
- `npm run build`;
- `tests/ai-running-move.spec.ts`.

Pure tests cover rotated footprints, bridges, water, corner cutting, cost selection, exact and adjusted goals, unreachable areas, determinism and a synthetic 128×128 map. Simulation tests cover waypoint progression, completion, legacy orders, replanning and failed replanning.

## Limits

- no flow fields;
- no unit-to-unit route reservation;
- no formation-level corridor planning;
- no moving-obstacle prediction;
- no tactical exposure scoring beyond terrain movement costs;
- navigation grids are rebuilt per plan/replan;
- only the selected soldier runs the automatic AI graph.
