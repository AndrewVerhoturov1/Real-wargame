# Real-Wargame Performance

Use this project skill for tasks that can affect runtime cost, not for documentation or repository-process changes that cannot alter the program or measured scenario.

## Mandatory sources

Read first:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
docs/workflow/CI_RISK_BASED_ACCEPTANCE.md
```

The performance principles define runtime quality. The CI policy defines when and how that quality must be re-measured.

## Trigger

Use this skill when changing:

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

Before implementation, record:

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

## Validation selection

Classify the actual change before running checks.

1. Run focused smoke/contract checks for the affected subsystem.
2. Run TypeScript and one production build when executable code changed.
3. Do not run browser performance merely because a new commit SHA exists.
4. Run a heavy performance scenario only when the change can affect that scenario, the scenario/contract changed, or the user/integrator explicitly requests it.
5. State the concrete `PERFORMANCE_REASON`: the regression the run can detect after this change.
6. Freeze the implementation before the justified heavy run.
7. Record `TESTED_IMPLEMENTATION_HEAD` in the PR body.
8. A later documentation-only tail remains valid only when `PR Risk CI` confirms every tail path is non-invalidating.

Not sufficient reasons:

- documentation or PR-description changes;
- temporary-file cleanup;
- an unrelated test change;
- “for reliability”, “just in case” or a desire for another confirmation;
- exact SHA mismatch with no change to program, dependencies, harness, workflow or contract.

For runtime-affecting work, add or update focused checks for the risks that actually apply, such as unchanged-snapshot reuse, one-entity invalidation, multi-unit fairness, stale async rejection, selection/layer independence, teardown, or bounded long-run cache/latency.

The baseline contract for the 320×200 six-unit scenario is defined in `docs/performance/PERFORMANCE_PRINCIPLES.md` and must not be weakened inside a feature PR.

## Required report

Use the `Performance impact` and `Verification selection` sections from `docs/orchestration/RESULT_TEMPLATE.md`. Separate checks actually run from heavy checks deliberately not run. A justified focused matrix is a complete result; an unrelated full matrix is not stronger evidence.
