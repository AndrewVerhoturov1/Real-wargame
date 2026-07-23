# Projectile Runtime Stage 4 — bounded capacities

This note records the production limits selected by the Stage 4 benchmark. It does not store machine-specific timing as a normative value.

## Active projectile pool

```text
production capacity: 4096 active projectiles
fixed step: 1 / 30 second
catch-up limit: 8 fixed substeps per outer tick
```

The deterministic capacity sweep covers `512`, `1024`, `2048`, and `4096` slots with a target request of `2000` simultaneous projectiles:

| Capacity | Target result | Saturation | Decision |
|---:|---:|---:|---|
| 512 | rejects 1488 | 100% | insufficient |
| 1024 | rejects 976 | 100% | insufficient |
| 2048 | no rejection | 97.66% | insufficient headroom |
| 4096 | no rejection | 48.83% | selected |

`4096` is the smallest tested power-of-two capacity that accepts the target fixture and retains at least 25% free headroom. Its numeric typed-array storage is approximately `413696` bytes before string and immutable ammo metadata.

## Event buffers

Impact and termination buffers each contain one slot per active projectile slot:

```text
impact buffer capacity: 4096
termination buffer capacity: 4096
```

A projectile can create at most one impact and one termination during one fixed substep. Therefore a buffer sized to the pool capacity cannot overflow for a valid pool. Overflow remains a deterministic fail-closed diagnostic for corrupted state; it never silently drops a gameplay event.

## Serializable ledgers

```text
commit records: 8192
impacts: 8192
terminations: 8192
applied impact IDs: 8192
```

The active pool can contain at most `4096` shots. A ledger capacity of `8192` keeps all active-shot commitments plus one full pool turnover of terminal records before deterministic eviction. The commitment ledger always removes the oldest terminal record before an active record.

## Required benchmark gates

The selected capacities are accepted only when the benchmark reports all of the following:

- target peak near `2000` active projectiles;
- target cap rejection count `0`;
- saturation at or below `75%`;
- pool resize count `0`;
- event overflow count `0`;
- full-scan fallback count `0`;
- exact save/load continuation;
- no per-projectile clone or survivors array in the production fixed-step loop;
- Stage 4 throughput not worse than the Stage 3 reference on the same direct-comparison fixture.
