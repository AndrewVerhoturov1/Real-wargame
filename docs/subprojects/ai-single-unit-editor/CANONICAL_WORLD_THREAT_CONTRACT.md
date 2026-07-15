# Canonical world threat contract

## Purpose

The asynchronous danger raster is keyed, transferred and computed from one immutable `CanonicalWorldThreatSetSnapshot`. A value may not influence raster bytes unless the same canonical value is represented in `canonicalThreatKey`.

The production chain is:

```text
subjective SoldierThreatMemory
→ buildCanonicalWorldThreatSet
→ canonicalThreatKey + CanonicalWorldThreatSnapshot[]
→ AwarenessWorkerBuildSnapshot
→ buildAwarenessWorldField
→ fieldIdentity + rasterDigest
→ renderer applied state
```

The renderer never transfers objective hostile coordinates. Only the selected unit's subjective tactical knowledge crosses the worker boundary.

## Unit contacts

A threat whose id starts with `unit:` is a subjective world-space point source at the remembered `x/y`.

Its observer-relative `directionDegrees` and `rangeCells` are memory descriptors used by other systems, not world-raster geometry. Canonicalization therefore replaces them with:

```text
directionDegrees = 0
arcDegrees = 360
minRangeCells = 0
rangeCells = 250 metres converted to runtime cells
```

Danger, suppression, confidence, uncertainty and terrain/cover relations remain subjective inputs. Moving the selected observer may change raw direction/range memory, but cannot change the canonical snapshot, worker payload or raster while remembered threat `x/y` and other canonical values remain unchanged.

A remembered unit's raw `strength` is derived from confidence and can decay by a fraction while its last-known position remains unchanged. Unit-contact strength is therefore quantized downward in five-point buckets. A minor confidence-driven change such as `88 → 87` remains canonical strength `85`; it does not schedule a 64,000-cell refresh. Crossing a meaningful bucket boundary still changes the canonical key and legitimately refreshes the field. Evidence-authored threats retain one-point strength precision.

## Evidence-authored directional fire

A non-`unit:` threat with `mode: directional_fire` is authored world evidence. Its source `x/y`, direction, arc, minimum range, maximum range and falloff remain in the canonical snapshot, key and computation.

This preserves unknown incoming fire, pressure sectors and other directional evidence. Unit contacts and authored fire sectors are deliberately different canonical semantics; they are not inferred from an arbitrary origin or map centre.

## Area evidence

Non-directional threats retain their circle or rectangle geometry, strength, suppression, confidence and uncertainty in world space.

## Identity and stale-result rule

Every worker request and response carries:

```text
rasterKey
canonicalThreatKey
jobId
finalExact
```

The worker recomputes the canonical key from its payload and rejects a mismatch. A response is applicable only when its map, world key and canonical threat key still equal the renderer's latest request. Applied results expose a worker-produced `fieldIdentity` and `rasterDigest`.

## Diagnostics

Production diagnostics cumulatively preserve worker computation deltas and scheduler state, including:

```text
workerThreatRelativeGeometryBuilds
workerDirectionalFieldBuilds
workerDirectionalBasisBuilds
workerAwarenessGeometryBuilds
workerAwarenessRescores
lastRequestedCanonicalThreatKey
lastAppliedCanonicalThreatKey
lastCompletedJobId
lastAppliedJobId
lastCompletedJobFinalExact
lastFinalRefreshLatencyMs
maxFinalRefreshLatencyMs
```

Browser acceptance reads renderer-local safe positions and applied worker identity. It does not call synchronous full-map awareness computation.
