# Combat Tactical Integration Stage 1 — Design

## Goal

Connect real hostile contacts and real ballistic shots to the existing subjective threat memory, suppression, tactical awareness, directional terrain, safe-position and route systems without adding a second perception or danger pipeline.

## Architectural boundary

The data flow remains:

```text
real unit / ballistic shot
→ existing perception contacts and bounded combat evidence
→ SoldierThreatMemory
→ UnitTacticalKnowledge.threats
→ SoldierAwarenessGrid / DirectionalTacticalField / RouteCostField
```

No tactical consumer may read a hidden enemy's current objective position. A real-unit threat is built only from the observer's `PerceptionContactMemory.lastKnownPosition`, confidence, uncertainty, stage, source and timestamps. Ballistic evidence may retain an internal shooter id only for deduplication; an unknown shooter is represented by an approximate direction and area rather than the real muzzle position.

## Components

### Real contact adapter

`syncSoldierThreatMemory` accepts both scenario contacts (`threat:<id>`) and real-unit contacts (`unit:<id>`). Real contacts become `KnownThreatMemory` entries with kind `unit`, directional fire geometry and the contact's last-known position. Lost contacts decay in confidence, grow in uncertainty and never refresh from `state.units[*].position`.

### Combat suppression

A focused combat service evaluates a completed ballistic segment only against soldiers in a bounded expanded segment area. It derives deterministic near-miss, near-impact and direct-hit effects from distance to trajectory, impact distance, weapon power, posture, cover, condition and recent shot accumulation. Transient suppression is bounded and decays independently from long-term threat memory.

### Combat threat evidence

Near misses, impacts and wounds create bounded, mergeable evidence. The evidence contains an approximate source area and firing direction computed from the incoming trajectory with deterministic distance/jitter, not the real shooter coordinates. Similar unknown evidence is merged by direction, time and approximate area. When a visual/sound contact for that shooter exists, evidence enriches that contact instead of producing duplicates.

### Existing tactical consumers

No new tactical grid is introduced. Unified `KnownThreatMemory` entries are consumed by the existing awareness grid, directional terrain field, safe-position scoring, route cost field and route replan policy. Existing pressure zones retain their serialized ids and behavior.

## Performance

- One bounded spatial candidate query per shot; no full-map danger rebuild per shot.
- No LOS per trajectory sample or per map cell.
- Shot evidence and recent-shot history have hard limits and TTLs.
- Tactical knowledge revisions use coarse fingerprints so confidence decay does not invalidate maps every frame.
- Existing route cooldown, revision interval and minimum-improvement hysteresis remain authoritative.

## Persistence

Long-term tactical memory uses the existing scene export path. New fields are backward-compatible and normalized on load. Transient shot suppression/evidence is intentionally runtime-only and is not persisted.

## Verification

A dedicated smoke scenario covers: real contact conversion, hidden movement privacy, near-miss suppression, distant trajectory rejection, cover attenuation, safe-position change, route-cost/replan response, memory decay, evidence deduplication and scene save/load. Existing perception, combat, awareness, terrain, navigation, A*, replan, persistence, build and documentation checks remain required.

## Visual QA

Prepare a browser scenario with a shooter, target, visible trajectory, suppression increase, approximate threat direction, danger layer, safe positions, route change and wall/reverse-slope comparison. Do not execute it without explicit user approval and never commit generated screenshots.

## Stage 2 exclusions

Utility AI fire decisions, burst fire, armour/penetration, radio contact sharing, medical logic, universal node-graph execution and new threat nodes remain outside this stage.