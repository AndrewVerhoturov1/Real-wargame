# Danger Layer Performance Contract

## Scope

The soldier danger overlay may rescore subjective tactical knowledge frequently, but it must not repeat threat-relative object/forest geometry or directional terrain geometry when their geometric content is unchanged.

## Root cause addressed

The Stage 1 directional-fire integration added threat-relative object and forest protection to every awareness cell. A dynamic awareness cache miss scanned the full map and called `evaluateCoverBetween(..., { includeRelief: false })` for every relevant threat/cell pair. Forest cover then sampled the complete threat-to-cell segment. Confidence, suppression, strength, uncertainty and visibility changes were part of cache keys, so decay and evidence updates could repeat this work.

## Geometry cache

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

The directional terrain arrays are geometric data. Their cache key includes:

- map visual revision;
- unit id;
- unit origin in the established one-cell origin bucket;
- each subjective threat id and estimated position.

The key intentionally excludes raw strength, suppression, confidence, uncertainty, evidence revision and visibility. Those values continue to drive the dynamic awareness danger/suppression/safety formulas. A map geometry change, origin-bucket transition or subjective estimated threat movement rebuilds the directional terrain field; dynamic-only decay and evidence changes do not.

## Semantic boundaries

- The field reads only `UnitTacticalKnowledge` coordinates supplied by the caller; it never reads an objective hidden enemy position.
- Relief is excluded from `ThreatRelativeCoverField`. `DirectionalTacticalField` remains the sole directional relief contribution in awareness, preventing double counting.
- Default `evaluateCoverBetween` behavior is unchanged. The geometry fast path applies only to the established `{ includeRelief: false }` object+forest request.
- `protectedAgainstThreatId` remains selected by dynamic awareness scoring from the concrete subjective threat being evaluated.
- East/west threat reversal, protected wall-side selection, reverse-slope behavior and route danger continue through the same public awareness interfaces.

## Diagnostics

Performance report v3 adds a `computation` section containing:

- threat-relative geometry builds, cache hits, full-map scans, object checks, forest map reads, cold build duration, cache size and evictions;
- directional tactical builds, cache hits, full-map scans and build duration;
- selected-posture static awareness diagnostics.

## Deterministic regression

Run:

```bash
npm run danger-layer-performance:smoke
```

The 320 × 200 contract verifies cold construction, unchanged hits, dynamic-only rescoring, evidence-only revision, sequential decay, hidden objective movement, estimated-position invalidation, object/forest invalidation, relief exclusion, wall-side winner semantics and bounded cache behavior. It also asserts that strength/confidence/suppression and sequential decay do not increment either threat-relative or directional full-map build counters. Structural counters make a return to `64,000 × full threat ray` work fail deterministically.

## Browser regression

`Danger Layer Browser Performance` checks out the exact PR base and head SHAs, injects the same paused benchmark harness into both, and performs 30 dynamic-only danger updates with fixed geometry in Chromium. It records performance-report JSON and `PerformanceObserver` long tasks without PNG generation, then enforces cold-build and steady-state acceptance thresholds.
