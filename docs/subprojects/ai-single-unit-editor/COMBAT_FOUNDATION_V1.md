# Combat Foundation v1

Updated: 2026-07-13  
Branch: `tmp/combat-foundation-v1-20260713`  
Base: `real-wargame-preview`  
Draft PR: `#93`

## Purpose

This temporary branch builds the smallest complete rifle firefight loop without bypassing subjective perception or the stateful AI runtime.

## Implemented foundation

- explicit blue and red sides with friendly/hostile relations and legacy `player` migration to blue;
- real hostile units as perception stimuli linked to observer-specific contacts;
- lightweight subjective perception for every combat-capable unit while the full heatmap remains selected-only;
- one minimal Mosin rifle definition with loaded and reserve ammunition, cadence, readiness, recoil and reload compatibility;
- posture-aware head, torso and limb hit shapes, including an oriented prone silhouette;
- ballistic raycast separate from visual line of sight, with nearest terrain, object or unit intersection;
- deterministic combat-event queue and minimal wound, incapacitation and death outcomes;
- stateful fire phases: acquire, turn, ready, aim, safety check, fire and recover;
- AI `fire` actions routed into the stateful combat action rather than directly removing ammunition;
- manual «Огонь по контакту» control available only for a personally identified hostile contact;
- rifle shot sound fed back into subjective perception;
- friendly-fire corridor check before an AI shot;
- blue/red and incapacitated/dead unit presentation;
- editor selector for placing friendly or hostile units;
- compact selected-unit diagnostics for side, weapon ammunition, capability and fire phase;
- weapon and wound/capability state exported and restored with the scene;
- identified contacts remain stable between scheduled perception checks, so timed aiming is not cancelled by perception cadence.

## Automated coverage

The combat smoke verifies:

- blue/red side relations;
- independent perception without selecting an observer;
- weapon ammunition conservation and reload transfer;
- standing and prone hit shapes;
- direct unit intersection;
- an object stopping the bullet before the target;
- a friendly soldier blocking the fire corridor;
- deterministic hit consequences;
- weapon and wound state surviving scene export/import;
- the complete stateful fire action progressing through the real `SimulationTick`.

## Deliberate v1 limits

- only single rifle shots are supported;
- suppressive automatic fire is not implemented yet;
- forest affects visibility but does not stop the v1 rifle ray;
- all map objects stop the v1 bullet; penetration and ricochet are future work;
- wounds are minimal combat-capability states, not a medical simulation;
- contacts are personal; radio reports and group sharing are not part of this slice;
- an active aiming/fire action itself is not resumed after saving and loading, although weapon and wound state are persisted;
- the general AI graph runtime is still the selected-soldier laboratory; every unit perceives independently and can execute a requested fire action, but autonomous group combat planning is future work;
- suppression from real near-miss and impact events is the next combat layer; legacy pressure zones remain the current suppression source.

## Transfer boundary

Do not merge or transfer this work to `real-wargame-preview` without a separate explicit user command. Do not modify `main`.

## Required verification

- `npm run combat-foundation:smoke`
- `npm run perception:smoke`
- `npm run runtime:smoke`
- `npm run reload:smoke`
- `npm run movement-facing:smoke`
- `npm run workspace:smoke`
- `npm run build`
- `npm run docs:check`

Visual QA has not been claimed. It requires a real browser run, matching commit SHA and inspected screenshots after explicit user permission.
