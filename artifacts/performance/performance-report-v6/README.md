# Performance Report v6 evidence

Exact base: `ad4f35535425aef11db6f27ca959bbd3696d36dc`.

The deterministic v6 smoke covers schema rejection, dynamic population `6 → 100`, deletion, route burst, causal operations, bounded truncation, semantic failure, checkpoint recovery and explicit v5 compatibility.

Exact-head browser evidence is produced by the pull-request performance workflow and must be read from its artifact rather than committed before the final SHA exists.

The original large user report was not copied into the repository. The implementation is based on the reported v5 failure mode: a capture that began with six units, later added many editor units, stalled during mass route planning, and still exported a single misleading `unitCount: 6`.
