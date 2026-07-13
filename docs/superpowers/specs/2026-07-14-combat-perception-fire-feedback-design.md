# Combat Perception and Fire Feedback Design

Updated: 2026-07-14

## Goal

Connect hostile-unit detection to the existing visibility, attention, concealment and contact pipeline; add a global fire-permission switch; and make every real shot visible and audible while allowing continued fire without changing AI nodes.

## Scope

1. Existing perception integration is the highest priority.
2. Add visible and audible rifle-shot feedback.
3. Add a global Russian-default `Стрельба разрешена` switch.
4. Allow combat-capable units to continue taking single shots while permission is enabled and a valid personal contact remains.

## Non-goals

- no new perception layer;
- no AI-node or subgraph changes;
- no threat/danger layer integration;
- no automatic weapons, suppression redesign, penetration or ricochet;
- no merge into `real-wargame-preview` without a separate user command.

## Root cause

The combat branch already sends real hostile units through `PerceptionSystem`, but two integration defects remain:

1. `rearCheckIntervalSeconds` and `nextRearCheckSeconds` exist in the established attention profiles but are not consumed by `PerceptionSystem`; targets behind an observer are checked at the ordinary peripheral cadence.
2. `VisualSignal` independently recomputes distance, attention, line-of-sight transmission and observer-condition multipliers instead of consuming the same visibility-quality result used by the coloured view field.

The fix must use the existing attention profile, line-of-sight, visibility-quality, concealment, evidence accumulation and contact-memory systems. No parallel combat detection path is permitted.

## Detection architecture

- Keep `buildPerceptionStimuli`, `computeLineOfSight`, `sampleAttentionWeight`, `evaluateCellVisibilityQuality`, `evaluateVisualSignal` and `advanceVisualContact` as the canonical pipeline.
- Add a focused point-visibility evaluator that returns the existing visibility-quality components for one target position.
- `PerceptionSystem` checks angle before expensive line-of-sight work, then obtains point visibility quality and passes it to `VisualSignal`.
- `VisualSignal` multiplies target-specific noticeability factors (posture, movement, action, size, concealment and lateral motion) by the supplied existing visibility-quality components. It does not calculate a second geometry/attention visibility model.
- A rear target uses the profile's existing rear check interval. Rear means the back 90-degree sector, where the absolute signed angle from focus is at least 135 degrees. It remains visually represented as weak indirect attention; no fourth coloured zone is added.

## Fire permission and continued fire

- Add state-scoped combat rules with fire disabled by default.
- `requestFireAction` rejects requests while fire is disabled.
- Disabling permission cancels any not-yet-fired action; recovery after an already completed shot may finish normally.
- Add a small core engagement coordinator, called from `SimulationTick` after perception and before fire-action progression.
- When permission is enabled, each combat-capable unit with no active fire action may request one single shot against its best currently identified hostile personal contact.
- After recovery, the next simulation tick performs a fresh contact, capability, ammunition and line-of-fire decision. This creates continued fire without changing nodes and without hiding a magazine-long burst inside one action.

## User interface

- Add one global button to the existing simulation controls.
- Russian text is primary:
  - `Стрельба: запрещена`
  - `Стрельба: разрешена`
- The button exposes `aria-pressed` and a clear title.
- Enabling fire also unlocks the browser audio context through the required user gesture.

## Shot presentation

The renderer consumes completed real combat events; it never creates simulation outcomes.

For each rifle shot:

- short muzzle flash at the recorded origin;
- thin tracer from recorded origin to the recorded impact point;
- short rifle crack through Web Audio;
- terrain/object impact spark or dust mark;
- unit-hit pulse at the hit position.

Effects are lightweight, short-lived and rendered in one long-lived PixiJS container compatible with PixiJS 7.

## Testing

Automated smoke coverage must prove:

- rear targets are not checked before the existing rear interval is due;
- detection evidence consumes existing visibility-quality components;
- fire is disabled by default;
- manual fire is denied while disabled;
- enabling permission starts fire only from valid personal contacts;
- a surviving target permits more than one shot cycle;
- disabling permission prevents another shot;
- shot and impact history contains enough data for tracer and impact presentation;
- existing perception, runtime, reload, workspace and production-build checks still pass.

Visible work must prepare a Chromium scenario and expected screenshots, but browser visual QA is not run until explicitly approved.
