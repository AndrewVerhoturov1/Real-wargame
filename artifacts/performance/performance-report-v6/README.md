# Performance Report v6 evidence

Exact base: `ad4f35535425aef11db6f27ca959bbd3696d36dc`.
Final exact head: `bd8a1f74d0fe14f8286a43d6ae6befa9870eee7d`.

The deterministic v6 smoke covers schema rejection, dynamic population `6 → 100`, deletion, route burst, causal operations, bounded truncation, semantic failure, checkpoint recovery and explicit v5 compatibility.

The exact-head browser capture passed all enforced thresholds. It recorded:

- initial/minimum population: 6 units;
- maximum/final population: 100 units;
- maximum route queue depth: 100;
- telemetry collection p95: 0.1 ms;
- telemetry collection max: 0.3 ms;
- dropped samples: 0;
- dropped events: 0;
- duplicate unit IDs: 0;
- semantic violations: 0;
- recovered checkpoint verdict: `incomplete`, with the possible missing tail reported explicitly.

The exact-head Danger Layer base/head and movement evidence also passed. Reusable A* scratch arrays preserve deterministic route output while reducing the observed wall-crossing `route.candidate-search` phase from 65.9 ms in the failing diagnostic run to 25.0 ms on the accepted head.

The optimized capture, monitor, compatibility readers and pathfinding scratch pool were compiled and smoke-tested before publication. Temporary transport, patch and diagnostic workflows are absent from the resulting branch.

The original large user report was not copied into the repository. The implementation is based on the reported v5 failure mode: a capture that began with six units, later added many editor units, stalled during mass route planning, and still exported a single misleading `unitCount: 6`.
