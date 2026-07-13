# Combat Foundation v1

Updated: 2026-07-13  
Branch: `tmp/combat-foundation-v1-20260713`  
Base: `real-wargame-preview`  
Draft PR: `#93`

## Purpose

This temporary branch builds the smallest complete rifle firefight loop without bypassing subjective perception or the stateful AI runtime.

## Implemented foundation

- explicit blue and red sides with friendly/hostile relations;
- real hostile units as perception stimuli;
- lightweight subjective perception for every combat-capable unit;
- one minimal Mosin rifle definition with loaded and reserve ammunition;
- posture-aware head, torso, and limb hit shapes;
- ballistic raycast separate from visual line of sight;
- deterministic combat-event queue and minimal wound/incapacitation outcomes;
- stateful fire phases: acquire, turn, ready, aim, safety check, fire, recover;
- AI `fire` actions routed into the stateful combat action rather than directly removing ammunition;
- rifle shot sound fed back into subjective perception;
- friendly-fire corridor check before an AI shot.

## Deliberate v1 limits

- only single rifle shots are supported;
- suppressive automatic fire is not implemented yet;
- forest affects visibility but does not stop the v1 rifle ray;
- all map objects stop the v1 bullet; penetration and ricochet are future work;
- wounds are minimal combat-capability states, not a medical simulation;
- contacts are personal; radio reports and group sharing are not part of this slice;
- weapon and combat-action runtime persistence still requires final scene export/import integration;
- editor controls and player-facing combat diagnostics require final integration after the core checks are green.

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

Visual QA is prepared only after the core implementation is stable and is not claimed without a real browser run and inspected screenshots.
