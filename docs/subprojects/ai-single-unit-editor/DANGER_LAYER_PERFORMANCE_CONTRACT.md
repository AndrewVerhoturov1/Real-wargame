# Danger Layer Performance Contract

## Scope

The soldier danger overlay may rescore subjective tactical knowledge frequently, but it must not repeat threat-relative object/forest geometry, directional terrain geometry, allocate a new 320 × 200 awareness object graph, or rebuild its raster resources when geometric content is unchanged.

## Root cause addressed

The Stage 1 directional-fire integration added threat-relative object and forest protection to every awareness cell. A dynamic awareness cache miss scanned the full map and called `evaluateCoverBetween(..., { includeRelief: false })` for every relevant threat/cell pair. Forest cover then sampled the complete threat-to-cell segment. Confidence, suppression, strength, uncertainty and visibility changes were part of cache keys, so decay and evidence updates could repeat this work and recreate 64,000 awareness cell objects.

After geometry reuse was restored, two secondary hot paths remained: every update allocated and sorted thousands of safe-position candidates to retain eight winners, and the overlay copied all 64,000 values through a fresh canvas/ImageData path before uploading the one raster sprite.

## Threat-relative geometry cache

`ThreatRelativeCoverField` owns object/forest-only protection for one subjective threat origin and posture.

Its content key includes:

- map dimensions and metres per cell;
- subjective estimated threat position, quantized to 0.1 cell;
- posture;
- map object revision;
- map forest revision.

It intentionally excludes:

- strength and suppression;
- confidence and uncertainty;
- evidence count or knowledge revision;
- `visibleNow`;
- objective hidden unit position;
- height/relief revision.

The cache is per-map, LRU ordered and bounded to 16 fields. Object or forest edits, posture changes and changes to the subjective estimated threat position invalidate the relevant field.

Awareness resolves one geometry field per directional subjective threat before scanning the map. The cell loop reads the prepared `Uint8Array` directly, rather than rebuilding a content key or touching LRU state for every threat/cell pair.

## Forest and object contract

A cold geometry build uses deterministic radial DDA propagation. Every non-origin map cell reads one predecessor cell and accumulates the established light/dense forest weights using the legacy three-samples-per-cell density scale. This makes forest work O(map cells), replacing one full sampled ray per target cell.

This is a documented approximation contract: the radial predecessor follows the target bearing from the subjective threat origin, preserves cumulative forest transmittance and avoids coarse angular buckets. Wall/object geometry keeps the established segment-distance, posture, reliability, penetration and multiplicative-combination formulas. Object properties are normalized once into numeric descriptors before the map scan, so the inner loop does not allocate result objects or repeatedly resolve static properties.

## Directional terrain contract

The expensive directional terrain arrays are keyed by their actual geometric output inputs:

- map visual revision;
- primary threat sector;
- normalized eight-sector threat distribution, quantized by `DIRECTION_WEIGHT_BUCKET`.

The cache does not use knowledge revision or raw amplitude values directly. Strength, suppression and confidence changes that leave the normalized directional distribution unchanged reuse the same field object and arrays while its current threat metadata is refreshed. A real change in relative directional distribution, subjective bearings or map geometry rebuilds the field because its aggregate terrain output has changed.

## Dynamic awareness rescore

A cold awareness build still creates the canonical `SoldierAwarenessCell[]`. `AwarenessDynamicRescore` then remembers a geometry signature containing static field identity, directional field identity and subjective threat shape/position data.

For dynamic-only changes it lazily prepares compact typed arrays for threat factor, protection and exposure, then mutates the existing cells in place. Strength, suppression, confidence and visibility therefore update danger, suppression, uncertainty, safety and protected-threat metadata without repeating trigonometry, cover lookup, static-cell assembly or 64,000 object allocations.

A posture change, map/static revision, changed directional distribution, changed subjective threat position/shape/range/arc/falloff, or changed uncertainty invalidates this rescore geometry and returns to the full cold path.

## Safe-position selection

Safe-position scoring still examines the same radius, threshold and score formula. Instead of allocating one object for every qualifying cell, sorting the complete set and slicing eight items, the implementation maintains a stable score-ordered top-eight list during the scan. Candidate allocation is therefore bounded, equal-score row-major ordering is preserved, and the winning positions remain semantically identical.

## Raster contract

The overlay remains exactly one cached PixiJS sprite. Its texture is backed by one reusable RGBA `Uint8Array`; a `Uint32Array` view and precomputed 0–100 colour lookup tables write one packed pixel per cell before `baseTexture.update()`. Dynamic updates no longer allocate `ImageData`, create a temporary canvas texture or perform a second CPU-side raster copy. Public canvas helpers remain for tests and compatibility, but are not used by the live renderer.

## Semantic boundaries

- The field reads only `UnitTacticalKnowledge` coordinates supplied by the caller; it never reads an objective hidden enemy position.
- Relief is excluded from `ThreatRelativeCoverField`. `DirectionalTacticalField` remains the sole directional relief contribution in awareness, preventing double counting.
- Default `evaluateCoverBetween` behavior is unchanged. The geometry fast path applies only to the established `{ includeRelief: false }` object+forest request.
- `protectedAgainstThreatId` remains selected from the concrete subjective threats whose geometric factor reaches each cell.
- East/west threat reversal, protected wall-side selection, reverse-slope behavior and route danger continue through the same public awareness interfaces.

## Diagnostics

Performance report v3 adds a `computation` section containing:

- threat-relative geometry builds, cache hits, full-map scans, object checks, forest map reads, cold build duration, cache size and evictions;
- directional tactical builds, cache hits, full-map scans and build duration;
- selected-posture static awareness diagnostics;
- dynamic awareness geometry builds, rescore count, rescored cell count and last/maximum rescore duration.

## Deterministic regression

Run:

```bash
npm run danger-layer-performance:smoke
```

The 320 × 200 contract verifies cold construction, unchanged hits, dynamic-only rescoring, evidence-only revision, sequential decay, hidden objective movement, estimated-position invalidation, object/forest invalidation, relief exclusion, wall-side winner semantics and bounded cache behavior. It also asserts that strength/confidence/suppression and sequential decay do not increment either threat-relative or directional full-map build counters. Structural counters make a return to `64,000 × full threat ray` work fail deterministically.

## Browser regression

`Danger Layer Browser Performance` checks out the exact PR base and head SHAs, injects the same paused benchmark harness into both, and performs 30 dynamic-only danger updates with fixed geometry in Chromium. The mutation is consumed by the normal paused application ticker, matching the production render path instead of calling the UI-only synchronous `forceRender` helper and contaminating the sample with a static-map invalidation.

The workflow records performance-report JSON, direct mutation durations, live-ticker `sceneUpdateMs`, continuous browser `requestAnimationFrame` intervals and `PerformanceObserver` long tasks without PNG generation. Cold-build and steady-state CPU thresholds are evaluated separately. Baseline sample requirements tolerate monitor starvation so a severely regressed base cannot prevent candidate measurement.

GitHub-hosted headless Chromium has no representative hardware WebGL path. Therefore RAF/FPS/long-task values remain visible A/B telemetry but do not gate the CPU danger-layer contract. The 50–60 FPS hardware target must be confirmed from the exported report on the same local machine and scene as the original user report; it is not claimed from the software-rendered CI runner.
