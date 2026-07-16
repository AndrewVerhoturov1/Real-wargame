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

## Canonical internal danger field

`SoldierDangerField` is the renderer-independent source of per-cell danger semantics for machine consumers. It is built from the observing soldier's subjective `UnitTacticalKnowledge.threats` and reuses the existing static awareness, `ThreatRelativeCoverField`, and static `DirectionalTerrainSectorBasis` caches. Weighted `DirectionalTacticalField` output is not part of the danger geometry key.

The dependency direction is:

```text
subjective soldier knowledge
→ SoldierDangerField typed arrays
    ├── SoldierAwarenessGrid
    ├── RouteCostField / A*
    ├── safe-position and AI consumers
    └── graphical danger overlay as a read-only consumer
```

Core navigation never reads textures, pixels, colors, renderer state, overlay visibility, or PixiJS objects. Turning the graphical overlay off does not disable danger construction or A*.

The field contains bounded typed arrays for final danger, suppression, confidence, uncertainty, and threat-relative protection. Awareness and routing expose the same `dangerFieldKey`; equal keys mean equal danger content.

## Dynamic route cost

Known danger comes from the canonical field, not from a second route-only cone evaluator:

```text
canonical cell danger / 100
× navigation profile dangerWeight
= route dangerCost
```

The danger value and a profile's willingness to avoid danger remain separate contracts. Switching profile can rebuild profile-weighted route arrays, but it does not rebuild threat geometry or change the danger-field key.

The underlying subjective inputs include:

- remembered position and shape;
- threat mode (`area` or `directional_fire`);
- confidence and uncertainty;
- strength and suppression;
- remembered fire-threat class;
- soldier knowledge revision.

The calculation does not read hidden global enemy truth. A threat unknown to the soldier contributes nothing, and a hidden objective weapon change cannot rewrite existing memory.

## Fire-threat classes v1

Recognized unit-sourced fire uses two stable technical classes:

```text
rifle_fire       — ordinary non-machine-gun small arms
machine_gun_fire — machine-gun sources
```

For each cell, every source is first evaluated independently after range/falloff, sector, confidence, cover, terrain protection, reverse/forward slope, and exposure. Then:

- `rifle_fire` uses the maximum individual final danger among known rifle-class units;
- `machine_gun_fire` uses the maximum individual final danger among known machine-gun units;
- the maxima of different classes are combined with the existing bounded probabilistic formula;
- unknown fire, pressure zones, area threats, and unclassified non-unit sources remain independent and are not collapsed into one `unknown` maximum.

Legacy known unit memories without the field load as `rifle_fire`. Unknown sources remain unclassified. Suppression intentionally keeps its previous independent stacking semantics; anti-stacking applies only to danger.

## Cache contract

Danger computation has two bounded layers:

```text
per-threat geometry cache (maximum 24 entries)
  threat identity, position, shape, direction, range/falloff and uncertainty,
  posture, static map geometry and directional-sector-basis revision

scored field cache (maximum 12 entries)
  canonical threat order plus strength, suppression, confidence and fire class
```

Changing profile, strength, suppression, confidence, fire class, or array order does not rebuild threat geometry. Scored content changes create or reuse a scored field; a pure reorder reuses the same field key. Moving one threat rebuilds only that threat geometry. Diagnostics publish cached threat geometries, scored fields, map scans, cache hits, and retained typed-array bytes.

A profile with `dangerWeight = 0` and all directional-terrain weights equal to zero does not request `SoldierDangerField` or `DirectionalTacticalField`. Its route key ignores tactical-knowledge revisions that cannot affect cost.

The route dynamic field is cached by its static/profile key plus the canonical danger-field key and future exposure/territory revisions.

## Implemented versus prepared factors

| Factor | State |
|---|---|
| terrain and forest | implemented |
| bridge / ditch | implemented |
| slope | implemented |
| hard passability | implemented |
| known danger | implemented through `SoldierDangerField` |
| threat-relative wall/cover protection | implemented |
| direct/reverse slope and terrain exposure | implemented |
| same-class fire anti-stacking | implemented for rifle and machine-gun classes |
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

`MoveOrder` stores only route-level summaries and revisions. Full per-cell values remain in the route-cost and canonical danger caches and are requested by read-only consumers.

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

- A* obtains the ready/cached danger field once before neighbor expansion.
- A* is called on order creation or an allowed replan only, never every frame.
- No renderer or PixiJS import exists in core danger or navigation code.
- Threat-relative cover and the static directional sector basis are reused.
- Non-tactical profiles skip danger and weighted directional-field construction entirely.
- No objective unit lookup occurs during the full-map danger pass.
- Static/dynamic typed arrays and bounded caches are reused by content keys.
- Baseline routes use a bounded per-map endpoint cache.
- `visitedCells` reports the tactical search; the internal cached baseline is not falsely added to the public search-limit counter.
