# Soldier AI Dictionary audit

Date: 2026-07-11  
Branch: `real-wargame-preview`  
Scope: selected single-soldier AI, GraphRunner, awareness and node editor

## Finding

The project previously had four overlapping dictionaries:

1. the small formal schema in `AiBlackboard.ts`;
2. defaults in `soldier_default_survival_graph.json`;
3. the real runtime snapshot assembled by `AiGameBridge`;
4. manually written numeric and flag lists in the human node interface.

They did not expose the same fields and used mixed naming styles. The new canonical human-facing catalog is:

```text
src/core/ai/AiConceptCatalog.ts
```

## Readiness meanings

| Status | Meaning |
|---|---|
| `ready` | The value or behavior is connected to the real runtime for its current scope. |
| `simplified` | It works, but the underlying simulation is deliberately incomplete. |
| `hidden` | Runtime data already worked but was not available in the human node controls. |
| `planned` | The UI or contract exists, but the underlying mechanic is a placeholder. |
| `deprecated` | Kept only for compatibility. |
| `debug` | Developer diagnostics, not a gameplay concept. |

## Important simplified concepts

- `underFire` means danger above zero or suppression above zero; it is not a per-projectile sensor.
- `enemyVisible` and `enemyKnown` currently use threat-zone knowledge, not full enemy-unit perception.
- `isInCover` becomes true for any protection above zero; use numeric protection for quality decisions.
- `line_of_fire` currently follows `enemyVisible`.
- `fire`, `suppress` and `reload` have deliberately simplified weapon effects.
- `retreat_position` is a short point away from the threat, not a route planner.

## Planned concepts that must not be presented as complete

- `path_exists` currently always succeeds.
- full enemy, ally, commander and squad object searches are not implemented.
- target-selection rule labels do not yet perform a complete multi-target tactical ranking.
- movement-mode labels do not yet implement complete multi-step bounding or formation executors.

## Newly exposed working values

The following runtime values already existed and are now visible in the shared dictionary and generated node selectors:

- `currentPositionDanger`;
- `currentExpectedProtection`;
- `bestSafePositionScore`;
- `distanceToBestSafePosition`;
- `routeDanger`;
- `threatConfidence`;
- `directionToThreat`;
- `threatDistance`;
- `threatAngle`;
- `coverProtection`;
- `bestCoverQuality`.

## Newly exposed soldier characteristics

The dictionary now also provides the real selected soldier characteristics to thresholds and Utility AI score nodes:

- `resilience`, `caution`, `decisiveness`, `discipline`, `initiative`, `tactics`, `weaponSkill`;
- `confusion`, `attention`, `view`, `intuition`, `speed`, `stealth`;
- `posture` and `behaviorProfile` as readable live context.

These fields are exposed without pretending that every downstream perception, accuracy or movement mechanic is already complete. Their cards state the current limitation.

## Naming compatibility

The runtime still uses several established snake-case keys:

- `current_action`;
- `self_position`;
- `order_target_position`;
- `retreat_position`;
- `best_cover_position`;
- `current_target`;
- `remembered_enemy_position`.

The dictionary documents camel-case aliases but does not silently break existing saved graphs. A later migration may choose a single serialization style after explicit compatibility tests.
