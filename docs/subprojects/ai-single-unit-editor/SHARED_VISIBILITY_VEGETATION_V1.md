# Shared Visibility and Vegetation Fields v1

## Status

This document describes the contract implemented on draft PR #128. The branch is based on `real-wargame-preview` merge commit `4a9fd2292ee9ded682d34064a2b721feab21ec4a`, which contains the accepted PR #127 scheduler result. This work is not part of preview until PR #128 is reviewed and transferred.

## Problem

The project previously had several independent meanings of forest and visibility:

- current-view heatmap code traced terrain and vegetation only for the selected unit and only while its UI overlay was active;
- exact perception LOS carried separate sparse/dense attenuation constants;
- perception and awareness carried separate forest concealment values;
- base navigation, route cover preference and threat-relative cover carried separate forest values;
- directional danger used range, sector, local cover and relief heuristics without a hard source-relative line-of-fire mask;
- the renderer carried its own forest palette and opacity.

These independent contracts allowed a hill to reduce exposure heuristically without creating a true zero-danger shadow, and made machine behavior depend too closely on presentation-specific code.

## Stable dependency direction

```text
VegetationDefinition
        ↓
VisibilityStaticGrid
        ↓
VisibilityGeometryField
       ↙                    ↘
CurrentUnitVisibilityField   KnownThreatLineOfFire
        ↓                    ↓
subjective observation       SoldierDangerField
                             ↓
                    RouteCost / SafePosition / AI

VegetationDefinition
       ├─ GridNavigation base resistance
       ├─ RouteCostField tactical concealment
       ├─ ThreatRelativeCoverGeometry density weight
       └─ PixiMapRenderer presentation

Core fields → read-only overlays
```

The dependency direction must not be reversed. Rendering, selected-unit state and overlay visibility are never authoritative inputs to simulation.

## Vegetation model

`src/core/map/VegetationDefinition.ts` defines:

- `none`;
- `sparse_forest`;
- `dense_forest`.

Each definition keeps separate groups for:

- presentation color, opacity and detail density;
- visual transmission and target/local concealment;
- fire transmission, protection and density;
- base movement resistance and tactical concealment.

The existing serialized `forest: 0 | 1 | 2` layer remains valid. The explicit forest layer wins. For legacy maps, `terrain='forest'` with `forest=0` resolves as sparse forest inside every migrated core consumer.

Presentation values do not affect simulation values. Sparse and dense forest opacity is the old opacity multiplied by three and clamped to one. They remain distinguishable through different colors, detail counts and texture shapes.

The catalog defines physical vegetation properties. Navigation profiles remain tactical policy: they decide how strongly a unit values terrain cost, cover and danger, but they no longer redefine the physical sparse/dense concealment values.

## Visibility geometry field

`VisibilityGeometryField` is a renderer-independent typed-array field for an arbitrary origin. Its output contains:

- `hardBlocked`;
- `visualTransmission`;
- `fireTransmission`;
- `blockerKind`.

The key depends on:

- quantized origin;
- origin and target heights;
- requested range;
- map visual revision, including height, forest and object changes;
- vegetation-definition revision.

It does not depend on:

- selected unit;
- enabled overlays;
- observer attention mode;
- threat confidence;
- fire class;
- navigation profile.

The cache is bounded. Repeated identical requests return the same field. Moving the origin or changing relevant map revisions creates a new field.

## Current unit view and perception

`getSelectedUnitVisibilityField` remains the UI-facing facade and performs no work while the current-view overlay is hidden.

`getUnitVisibilityField(state, unit)` is the machine-facing API. It may be requested for any unit independently of user selection. It combines the shared geometry with:

- distance falloff;
- attention direction and mode;
- observer fatigue, confusion, health and suppression;
- vision settings.

Point perception reads the same cached geometry field instead of running a separate exact LOS ray for every candidate. Exact line probes remain available for diagnostics and focused tests.

The observer-dependent quality is suitable for deciding what that observer sees. It is not suitable as the fire mask of another unit.

## Danger integration

A precise directional-fire threat requests a shared geometry field with its subjective known position as origin. For each candidate cell:

- outside range or sector: contribution is zero;
- hard-blocked by terrain or an object: direct-fire contribution is zero;
- otherwise danger is multiplied by fire transmission and then by confidence, protection and exposure factors.

Therefore a hill produces a true direct-fire shadow. Route danger cost consumes the resulting canonical `SoldierDangerField`; A* does not trace LOS itself.

An area or insufficiently localized threat does not request a precise point-source field. It retains conservative area semantics rather than using hidden objective enemy state or inventing a false source position.

Protection diagnostics remain available behind a hard blocker even though direct danger is zero. This preserves reverse-slope and safe-position evidence without applying terrain relief twice to danger.

## Route and cover integration

`GridNavigation` reads `movement.baseResistance` from the shared definition. `RouteCostField` separately reads `movement.tacticalConcealment`, then applies the selected profile's `coverWeight`. This keeps physical terrain data separate from tactical intent.

`ThreatRelativeCoverGeometry` reads `fire.densityWeight` from the same definition. Its bounded radial propagation and generic protection/reliability shaping remain subsystem-owned, but sparse/dense meaning is no longer duplicated. Because legacy `terrain='forest'` is now authoritative there too, its cache key includes both forest and terrain revisions.

## Subjective memory and PR #127

The source position used for a known unit threat remains the observer's remembered world position. Hidden objective movement must not move the danger origin until perception or another legitimate information path updates memory.

The accepted PR #127 contract remains authoritative for simulation phase order and per-unit AI scheduling:

```text
perception → subjective threat-memory sync → AI scheduler → combat → movement
```

This visibility work does not introduce a second scheduler and does not use selected-unit state for AI eligibility.

## Performance contract

- no LOS calculation occurs inside an A* neighbor expansion;
- point perception and current-view quality reuse the shared geometry field;
- danger consumes cached source-relative geometry;
- confidence and fire-class changes rescore danger without rebuilding geometry;
- hidden overlays do not prevent machine field requests;
- caches are bounded and report retained typed-array bytes;
- the current-view adapter preserves movement throttling;
- renderer code only reads presentation values;
- threat-relative forest propagation remains one bounded map pass per cold geometry build.

## Verification

`npm run shared-visibility-vegetation:smoke` covers:

- a hill creating hard-blocked cells and zero direct-fire danger behind it;
- an open cell before the hill remaining dangerous;
- area threats retaining conservative non-point-source semantics;
- ordering `open > sparse forest > dense forest > hill shadow` for direct danger;
- visual and fire transmission ordering;
- hidden-overlay and selected-unit independence;
- legacy `terrain='forest'` compatibility;
- shared base movement resistance;
- legacy sparse-forest route terrain key and tactical cover adjustment;
- legacy threat-relative forest protection;
- geometry cache reuse;
- confidence-only danger rescoring;
- new geometry after moving an origin.

`shared_vegetation_source_contract_smoke.mjs` prevents renderer, LOS, perception, awareness, navigation, route-cost and threat-relative-cover consumers from reintroducing local sparse/dense constants.

The forest-presentation browser scenario is prepared in `tests/shared-visibility-vegetation-visual.spec.ts` under `test.skip`. It must not be executed until the user gives explicit visual-QA approval.
