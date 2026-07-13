# Directional Terrain Analysis Core Design

## Status

Approved for implementation by the user on 2026-07-13. Work stays on `tmp/directional-terrain-analysis-20260713`; `real-wargame-preview` and `main` are not modified.

## Goal

Add a performant directional terrain-analysis core that evaluates terrain relative to the selected soldier's subjective threat directions and feeds the existing navigation cost system without creating a second pathfinder or omniscient knowledge path.

## Scope of this vertical slice

1. Precompute and cache terrain derivatives from the existing smooth visibility height grid:
   - slope magnitude;
   - downhill aspect vector;
   - curvature;
   - crest strength;
   - valley strength;
   - geometric silhouette potential.
2. Build an eight-sector threat-direction field from `TacticalRouteContext.knownThreats`.
3. Calculate directional terrain route cost:
   - forward-slope exposure;
   - reverse-slope preference;
   - crest and silhouette penalties;
   - valley/dead-ground preference;
   - protection against a critical single sector being hidden by averaging.
4. Add editable directional-terrain weights to navigation profiles with backward-compatible migration.
5. Expose directional values through route-cost diagnostics and use them in the existing A* total cost.
6. Keep all expensive work revision-keyed and typed-array based.

## Architecture

```text
VisibilityStaticGrid (existing cached terrain/object heights)
        ↓
DirectionalTerrainStaticGrid (map-revision cache, typed arrays)
        ↓
ThreatDirectionField (8 subjective sectors from known threats)
        ↓
RouteCostField dynamic directional cost
        ↓
Existing GridPathfinder and route-cost overlay
```

`DirectionalTerrainStaticGrid` is objective map geometry. `ThreatDirectionField` is subjective soldier knowledge. Only their combination produces tactical directional cost.

## Performance rules

- No per-frame full-map rebuilds.
- Static terrain derivatives rebuild only when the map visual revision changes.
- Dynamic directional fields reuse the existing route-cost cache key based on unit, knowledge revision, profile revision, and map revision.
- Arrays use `Float32Array`/`Uint8Array` and are shared by cached fields.
- Hover/UI reads consume ready data and never trigger a rebuild.
- A* remains the only pathfinder; the feature only supplies additional costs.

## Knowledge boundary

- Threat sectors are built only from `TacticalRouteContext.knownThreats`.
- Hidden world-state enemy positions are forbidden.
- Confidence, uncertainty, strength and suppression attenuate sector weight.
- Multiple sectors remain separate; the field stores both weighted total and strongest single-sector contribution.

## Direction convention

For a cell, the terrain downhill vector is compared with the vector from the cell toward a threat sector:

- `+1`: downhill points toward the threat — forward slope;
- `0`: side slope or flat terrain;
- `-1`: downhill points away from the threat — reverse slope.

## Profile contract

```ts
interface NavigationDirectionalTerrainWeights {
  forwardSlopePenalty: number;
  reverseSlopePreference: number;
  crestPenalty: number;
  silhouettePenalty: number;
  valleyPreference: number;
  criticalSectorMultiplier: number;
}
```

The `direct` profile sets all weights to zero. Old profile JSON receives the built-in fallback values during normalization.

## Diagnostics

`RouteCostCellBreakdown` and `RouteCostFields` expose:

- `directionalTerrainCost`;
- `directionalSlope` relative to the primary threat;
- `crestStrength`;
- `valleyStrength`;
- `silhouettePotential`;
- `primaryThreatSector` and sector weights through the dynamic field contract.

The existing `exposureCost` remains available for later exact visibility integration; directional terrain gets its own cost channel so geometric exposure is not confused with verified LOS exposure.

## Verification

A focused smoke test must prove:

- flat terrain produces zero directional slope;
- changing threat direction flips forward/reverse classification;
- several threat sectors remain represented;
- uncertainty weakens a threat sector;
- static cache is reused;
- direct profile ignores directional terrain;
- stealth/retreat profiles penalize a forward slope more than a reverse slope;
- changing only knowledge revision rebuilds dynamic fields, not static geometry;
- production TypeScript build remains green.

## Explicitly deferred

- exact reverse LOS from hypothetical enemy observers;
- posture-specific cover depth;
- a standalone `Направленный рельеф` renderer and controls;
- tactical-position queries and new Blackboard keys;
- group behavior.

These later layers consume the core contracts above rather than replacing them.
