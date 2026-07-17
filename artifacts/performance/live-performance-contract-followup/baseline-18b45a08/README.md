# Live performance contract follow-up baseline

Exact preview base: `18b45a08ee39dda252e406060e2f8cac5c4114af`.

This compact baseline is derived from the user-provided Windows performance-report-v5 capture.
It preserves the 37.6 ms startup SimulationTick spike and the synchronous route-cost overlay work
(up to 213.4 ms) without copying the 65,000-line raw report into the repository.

The baseline is intentionally failing: enforcement was disabled, the simulation max exceeded 25 ms,
LongTask classification was incomplete, and routeDanger was not a route aggregate.
