# Combat Foundation v1

Updated: 2026-07-14  
Branch: `tmp/combat-perception-fire-feedback-20260714`  
Base implementation commit: `429c47e6cef2e466e7d3ec6a59968209f5c9ff1d`  
Base branch for review: `real-wargame-preview`  
Draft PR: `#96`

## Purpose

This temporary branch extends the smallest complete rifle firefight loop without bypassing subjective perception or changing AI nodes. It connects combat detection to the established visibility system, adds explicit permission to fire, supports repeated stateful single shots, and presents real shots to the player.

## Implemented foundation

- explicit blue and red sides with friendly/hostile relations and legacy `player` migration to blue;
- real hostile units as perception stimuli linked to observer-specific contacts;
- personal subjective perception for every combat-capable unit while the full coloured visibility field remains selected-only;
- one minimal Mosin rifle definition with loaded and reserve ammunition, cadence, readiness, recoil and reload compatibility;
- posture-aware head, torso and limb hit shapes, including an oriented prone silhouette;
- ballistic raycast separate from visual line of sight, with nearest terrain, object or unit intersection;
- deterministic combat-event queue and minimal wound, incapacitation and death outcomes;
- stateful fire phases: acquire, turn, ready, aim, safety check, fire and recover;
- AI `fire` actions routed into the stateful combat action rather than directly removing ammunition;
- manual «Огонь по контакту» control available only for a personally identified hostile contact;
- rifle shot sound fed back into subjective perception;
- friendly-fire corridor check before a shot;
- high-contrast blue/red and incapacitated/dead unit presentation;
- one fighter-side selector inside the visible editor draft, used by the active placement path;
- compact selected-unit diagnostics for side, weapon ammunition, capability and fire phase;
- weapon and wound/capability state exported and restored with the scene;
- identified contacts remain stable between scheduled perception checks, so timed aiming is not cancelled by perception cadence.

## Detection integration added on 2026-07-14

Combat does not own a second detection system. Hostile soldiers now pass through the same established chain used by the coloured visibility field:

1. broad-phase range rejection;
2. existing attention direction and mode profile;
3. existing focus/direct/peripheral visibility zone quality;
4. existing line of sight, terrain, objects and vegetation transmission;
5. existing observer-condition visibility factor;
6. target posture, movement, action, size, concealment and lateral motion;
7. evidence accumulation, detection variance and personal contact memory.

A focused point-visibility helper now supplies the same distance, attention, line-transmission and observer-condition quality factors used by the coloured field. `VisualSignal` no longer creates a parallel geometry/attention calculation.

The existing `rearCheckIntervalSeconds` setting is now active. Targets in the back 90-degree sector are rejected before line-of-sight work until the scheduled rear check is due. The rear remains weak indirect attention; no new colour zone or new perception layer was added.

## Fire permission and continued fire

- Fire is globally prohibited by default for each simulation state.
- The simulation controls contain one Russian-default button:
  - `Стрельба: запрещена`;
  - `Стрельба: разрешена`.
- Manual and automatic fire requests are denied while permission is off.
- Turning, readying or aiming is cancelled if permission is disabled before the shot.
- A shot that already happened may complete its short recovery phase.
- While permission is enabled, a combat-capable unit with ammunition and a currently identified personal hostile contact may start one stateful shot.
- After recovery, the next simulation tick rechecks the contact, target capability, ammunition, cadence and friendly-fire corridor before another shot.
- This repeated engagement is outside the AI node graph. No nodes or subgraphs were modified.

## Player-facing shot feedback

Real combat-event history drives presentation only:

- short muzzle flash at the recorded muzzle origin;
- thin fading tracer from the real origin to the real calculated impact point;
- impact ring/mark with different emphasis for unit, object or terrain impact;
- stronger hit pulse for a unit impact;
- short synthetic rifle crack through Web Audio after the player enables fire, which also unlocks browser audio.

The renderer does not calculate hits or damage and cannot alter simulation results.

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
- fire permission disabled by default;
- manual fire denied while permission is disabled;
- more than one complete single-shot cycle while permission is enabled and the target remains combat-capable;
- no additional shot after permission is disabled;
- matching shot-origin and impact events for presentation;
- the complete stateful fire action progressing through the real `SimulationTick`.

The perception smoke additionally verifies:

- a rear target is not checked before the existing rear interval is due;
- rear rejection happens before an expensive line-of-sight calculation;
- a due rear check enters the ordinary visual contact pipeline;
- contact diagnostics expose the existing coloured-zone visibility quality.

The unified editor smoke still requires the active placement code to use `draft.side` and rejects the former hard-coded `player` side. The workspace smoke requires the global fire control, audio module, PixiJS 7 effects renderer and main installation path.

## Visual QA state

The original Combat Foundation commit `429c47e6cef2e466e7d3ec6a59968209f5c9ff1d` had an explicitly approved Chromium visual run with six inspected screenshots.

The current extension changes detection cadence and adds new visible/audio behavior. A new Playwright scenario is prepared to capture:

- two hostile sides in the editor;
- a target behind the observer not becoming an identified direct-fire contact immediately;
- an identified contact while global fire remains prohibited and ammunition stays unchanged;
- the enabled-fire aiming phase;
- tracer and impact feedback from a real shot;
- the final target combat state;
- browser and HTTP error checks.

This new browser run has not been executed because visual QA requires separate explicit user approval.

## Deliberate v1 limits

- the rifle performs stateful single shots; repeated fire is a sequence of freshly evaluated single-shot actions, not a hidden burst;
- automatic weapons and suppressive bursts are not implemented yet;
- empty-magazine automatic reload is not part of this slice;
- forest affects visibility but does not stop the v1 rifle ray;
- all map objects stop the v1 bullet; penetration and ricochet are future work;
- wounds are minimal combat-capability states, not a medical simulation;
- contacts are personal; radio reports and group sharing are not part of this slice;
- an active aiming/fire action itself is not resumed after saving and loading, although weapon and wound state are persisted;
- no real-unit contribution to the danger layer is included in this task;
- suppression from real near-miss and impact events is a later combat layer; legacy pressure zones remain the current suppression source.

## Transfer boundary

Do not merge or transfer this work to `real-wargame-preview` without a separate explicit user command. Do not modify `main`.

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
- `Combat Foundation Visual QA` only after explicit approval, followed by manual screenshot inspection
