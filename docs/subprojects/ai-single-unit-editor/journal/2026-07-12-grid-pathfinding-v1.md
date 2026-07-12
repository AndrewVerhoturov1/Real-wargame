# Journal — Grid Pathfinding v1

Date: 2026-07-12

## Implemented

- Added pure navigation-grid generation from real terrain and rotated map-object footprints.
- Added deterministic eight-direction A* with no corner cutting and stable tie breaking.
- Added shared routed `MoveOrder` planning for player and AI movement.
- Added waypoint following, final-only completion, six-cell invalidation lookahead and route rebuilding.
- Preserved legacy direct orders and player destination pressure preview.
- Added exact-goal policy for AI and nearest-passable goal adjustment for player commands.
- Added path memory and Russian AI trace rows.

## Important corrections during review

- Updated object geometry to the canonical map convention: center is `object.x + 0.5 / object.y + 0.5`.
- Prevented AI actions from treating a neighbouring adjusted cell as success for an exact target.
- Kept the frequent reactive route poll free of A* and tactical-awareness rebuilds.
- Synchronized work on top of the newer preview documentation baseline before implementation continued.

## Verification contract

- pure pathfinding smoke;
- routed movement smoke;
- AI movement bridge smoke;
- reactive route/runtime smoke;
- production build;
- browser scenarios for following, blocked and unreachable paths;
- exact-SHA screenshot inspection before integration.

## Integration rule

Only a fully verified fast-forward to `real-wargame-preview` is allowed. `main` remains untouched.
