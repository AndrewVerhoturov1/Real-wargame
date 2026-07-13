# Combat Foundation v1

Updated: 2026-07-14  
Status: integrated into `real-wargame-preview`  
Source branch: `tmp/combat-foundation-v1-20260713`  
Merged PR: `#93`  
Integration commit: `16013c69fc16f655c16fff3c9081d3bfc5c81f09`

## Purpose

Combat Foundation v1 provides the smallest complete rifle-fire loop without bypassing subjective perception or the stateful AI runtime.

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
- high-contrast blue/red and incapacitated/dead unit presentation;
- one fighter-side selector inside the visible editor draft, used by the active placement path;
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

The unified editor smoke also requires the active placement code to use `draft.side` and rejects the former hard-coded `player` side.

## Approved visual QA

The user explicitly approved browser verification. The dedicated Chromium workflow and Playwright scenario:

- create one friendly and one hostile fighter through the visible editor form;
- verify the resulting selected-unit metadata reports `Свои` and `Противник`;
- confirm distinct blue and red map markers;
- wait for an observer-specific identified contact;
- confirm «Огонь по контакту» becomes available;
- record the stateful aiming phase;
- verify one real cartridge is consumed;
- select the target and verify the resulting combat-capability state;
- reject page exceptions and non-benign HTTP resource failures;
- save six inspected PNG screenshots from the exact tested commit.

Visual QA found and fixed two real integration defects:

1. the visible side selector was disconnected from the active placement path, which hard-coded every new fighter as `player`/blue;
2. friendly and hostile unit markers were too similar at the normal map scale.

PR `#93` and its `Combat Foundation Visual QA` artifacts preserve the exact pre-merge verification evidence.

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

## Integration boundary

Combat Foundation v1 is part of `real-wargame-preview`. Further combat development must branch from the current preview branch. `main` remains untouched unless the user gives a separate explicit command.

## Required verification

- `npm run combat-foundation:smoke`
- `npm run game-editor:smoke`
- `npm run perception:smoke`
- `npm run runtime:smoke`
- `npm run reload:smoke`
- `npm run movement-facing:smoke`
- `npm run workspace:smoke`
- `npm run build`
- `npm run docs:check`
- `Combat Foundation Visual QA` GitHub Actions check with inspected screenshots
