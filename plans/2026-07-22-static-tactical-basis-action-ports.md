# Static tactical basis artifact and local action ports — implementation plan

## Scope

Implement two isolated physical-data layers on top of the existing static tactical basis:

1. a persistent, versioned artifact for a completed `StaticTacticalPositionBasisSnapshot`;
2. a pure bounded solver for transient observation and firing action ports around a protected anchor.

No Graph v2, runtime action, unit command, deployment or preview transfer is part of this plan.

## Confirmed existing contracts

- `StaticTacticalPositionService` remains the only owner of the static basis and already rejects stale worker results by exact runtime identity.
- Runtime identity remains revision-based and is not used as a cross-session file identity.
- Scene import replaces and normalizes the map to runtime resolution before post-load integration.
- `MapObjectGeometry`, `MapObjectSpatialIndex`, `GridNavigation`, visibility kernels and `BallisticLineProbe` remain canonical and are reused.
- Map edits already increment narrow terrain, height, vegetation or object revisions; rebuild remains lazy/coalesced by the existing service lifecycle.

## Persistent artifact design

- Add a streaming deterministic fingerprint writer; do not serialize the whole map into one temporary JSON string.
- Hash the runtime-normalized map, physically relevant environment-profile domains, normalized static settings and explicit format/algorithm/snapshot/geometry versions.
- Sort object physical records independently of source array order.
- Pack all basis and candidate-index typed arrays into one aligned binary payload, encode it once as base64 in an optional scene block, and validate a payload checksum plus every declared array shape on decode.
- Keep the codec independent from scene UI so it can later back a sidecar file.
- Hydrate through `StaticTacticalPositionService`; accepted data receives the current runtime identity. A hit must not enqueue a worker.
- Export only a ready snapshot whose runtime identity is current and whose stored persistent fingerprint matches the current static content. Otherwise omit the block without waiting.

## Local action-port design

- Generate a fixed deterministic local candidate set around the anchor.
- Query nearby objects once through `MapObjectSpatialIndex`, then use exact rotated-object circle intersection.
- Build one bounded local route field for the whole request from `GridNavigation`; never run A* per candidate.
- Probe observation through the existing visibility ray kernel and firing through `BallisticLineProbe` with dynamic units excluded from persistent geometry assessment.
- Return physical metrics, rejection reasons, budgets and stable tie-breaking; do not move units or alter combat/runtime state.

## Verification plan

Add focused smoke checks for artifact round-trip, cache hit/miss/rejection, fingerprint invalidation/order independence/stale handling and action-port determinism, geometry, posture, line and work budgets. Then run the user-specified focused regression matrix, TypeScript and production build when the local environment permits it.
