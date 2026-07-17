# Real-Wargame Performance

Use this project skill for every task that can affect runtime cost, not only tasks explicitly called “performance work”.

## Mandatory source

Read first:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
```

This document is a repository contract. It is not optional guidance.

## Trigger

This skill is mandatory when changing any of the following:

- `SimulationTick`, AI scheduling or per-unit runtime;
- perception, attention, LOS or tactical knowledge;
- navigation, pathfinding, route cost or route diagnostics;
- danger, cover, relief, visibility or other tactical fields;
- terrain, vegetation, map materials, chunks or spatial indices;
- PixiJS renderers, textures, overlays, camera or lifecycle;
- `TacticalWorkspace`, editor panels or recurring UI updates;
- workers, queues, caches, revisions, serialization or teardown;
- browser harnesses, performance reports or CI thresholds.

## Required design review

Before implementation, write down:

```text
hot path
worst-case complexity
main-thread work
full-map work
shared prepared result
invalidation identity
worker/queue budget
cache memory bound
teardown
measurement plan
```

Reject a design that adds unbounded interactive work, duplicates a canonical calculation, depends on renderer/UI state, or invalidates the whole world for one changed entity.

## Required implementation properties

- heavy work is bounded, shared, cached, chunked or worker-owned;
- point/local/route queries replace full fields where a full field is unnecessary;
- every asynchronous result has exact identity and stale-result rejection;
- queues, caches and per-step work have explicit limits;
- UI is revision-driven and does not own gameplay computation;
- renderers consume machine-owned data and do not become gameplay truth;
- lifecycle and teardown are symmetric;
- subjective knowledge and deterministic gameplay semantics are preserved.

## Required validation

For runtime-affecting work, add or update focused checks for:

- unchanged-snapshot reuse;
- one-entity invalidation;
- multi-unit fairness;
- stale async rejection;
- selection/layer independence;
- teardown without accumulation;
- bounded long-run cache and latency.

Run the relevant smoke checks and the exact-head enforced browser performance workflow when the task touches an interactive hot path.

The baseline contract for the 320×200 six-unit scenario is defined in `docs/performance/PERFORMANCE_PRINCIPLES.md` and must not be weakened inside a feature PR.

## Required report

Use the `Performance impact` section from `docs/orchestration/RESULT_TEMPLATE.md`. A runtime-affecting result without that section is incomplete.
