# Tactical Route Cost v1

Status: implemented on the isolated navigation-profile branch.

## Route cost model

A passable step uses the average evaluated cost of its two cells and cardinal/diagonal step length. The diagnostic components are:

```text
terrainCost
slopeCost
dangerCost
exposureCost
coverAdjustment
enemyDistanceCost
territoryCost
```

The total cell value is clamped to a small positive minimum so a preferred cell cannot create zero-cost cycles.

## Static cost

Static cost depends on:

- terrain type;
- sparse/dense forest;
- bridge and ditch footprints;
- height and local slope;
- blocking objects and water passability;
- active profile terrain/slope/cover weights.

The static field is stored in typed arrays and cached by:

```text
map object identity
map dimensions
terrain / height / forest / object revisions
profile id / revision
```

Different map objects cannot share one field merely because their numeric revisions match.

## Dynamic cost

Version 1 honestly implements known danger from `UnitTacticalKnowledge.threats`:

- position and shape;
- threat mode (`area` or `directional_fire`);
- confidence;
- uncertainty;
- strength/suppression;
- soldier knowledge revision.

It does not read hidden global enemy truth. A threat unknown to the soldier contributes nothing.

The dynamic field is cached by the static key plus:

```text
unit id
knowledge revision
future exposure revision
future territory revision
```

## Implemented versus prepared factors

| Factor | State |
|---|---|
| terrain and forest | implemented |
| bridge / ditch | implemented |
| slope | implemented |
| hard passability | implemented |
| known danger | implemented from soldier memory |
| forest/ditch concealment adjustment | implemented as map-known cover preference |
| exposure to known enemy observation | contract prepared, currently unavailable/zero |
| exact soldier-known enemy distance | contract prepared, currently unavailable/zero |
| friendly/neutral/enemy territory | contract prepared, currently unavailable/zero |

The overlay explicitly displays unavailable factors rather than inventing values.

## A* result

Successful `findGridPath` results preserve legacy `cost` and add:

```text
totalCost
distanceMeters
baselineDistanceMeters
detourRatio
detourLimited
visitedCells
profileId
profileRevision
costBreakdown
routeReason / routeReasonRu
```

`MoveOrder` stores only route-level summaries and revisions. Full per-cell values remain in the route-cost field cache and are requested by the overlay.

## Maximum detour

A tactical route is compared with a cached shortest passable baseline using the `direct` profile. The baseline retains geometry and passability but ignores tactical preferences.

```text
maximumDetourRatio = 1.0 → no longer than shortest passable route
maximumDetourRatio = 1.3 → up to 30% longer
maximumDetourRatio = 1.6 → up to 60% longer
```

The baseline is calculated only during route creation/replanning and cached by map passability revisions and endpoints. It is never calculated by the renderer.

Version 1 uses a deterministic safe fallback: when the preferred route exceeds the limit, it selects the shortest passable baseline and reports why. A future multi-objective compromise search can replace this policy without changing profile or result contracts.

## Replanning

Rules:

```text
replanOnBlocked
replanOnProfileChange
replanOnDangerChange
minimumCostImprovement
minimumDangerRevisionInterval
replanCooldownSeconds
```

Blocked lookahead remains immediate. Danger changes require a sufficient knowledge-revision difference and cooldown. A candidate caused only by danger replaces the route only when it meets the minimum improvement threshold. Profile changes are applied directly because costs from different profile revisions are not safely comparable.

Every search attempt updates the processed profile/knowledge revisions and cooldown timestamp. This prevents the same rejected change from starting A* every simulation tick.

The original player command id and AI owner token are copied into a replacement route. Replanning never fabricates a new player intent.

## Performance constraints

- A* is called on order creation or an allowed replan only.
- No renderer imports `GridPathfinder`.
- Static/dynamic arrays are reused by revision keys.
- Baseline routes use a bounded per-map endpoint cache.
- `visitedCells` reports the tactical search; the internal cached baseline is not falsely added to the public search-limit counter.
