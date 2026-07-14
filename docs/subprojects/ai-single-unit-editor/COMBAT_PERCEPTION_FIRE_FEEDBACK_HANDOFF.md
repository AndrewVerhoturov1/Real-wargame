# HANDOFF — Combat perception integration and fire feedback

Updated: 2026-07-14
Repository: `AndrewVerhoturov1/Real-wargame`
Temporary branch: `tmp/combat-perception-fire-feedback-20260714`
Review base: `real-wargame-preview`
Draft PR: `#96`
Foundation base commit: `429c47e6cef2e466e7d3ec6a59968209f5c9ff1d`

## Transfer boundary

- Work remains isolated in the temporary branch.
- Do not merge or transfer to `real-wargame-preview` without a separate explicit user command.
- Do not modify `main`.
- Use the current PR head as the source of truth for the final implementation SHA.

## User-approved scope

1. Connect hostile-unit detection to the existing visibility, attention, noticeability, concealment and contact-memory system.
2. Add visible and audible rifle-shot feedback.
3. Add a global `Стрельба: запрещена / разрешена` control.
4. Allow continued fire without changing AI nodes.

Explicitly outside scope:

- AI nodes and subgraphs;
- the danger/threat layer contribution from real enemy units;
- automatic weapons and suppressive bursts;
- penetration, ricochet and a medical simulation.

## Root cause and fix

The established attention profiles already contained `rearCheckIntervalSeconds` and runtime `nextRearCheckSeconds`, but `PerceptionSystem` did not consume them. A target behind the observer was therefore checked at ordinary peripheral cadence.

`VisualSignal` also repeated distance, attention, line-transmission and observer-condition calculations instead of consuming the same visibility quality used by the coloured visibility field.

The implementation now:

- evaluates point visibility through existing line of sight and `evaluateCellVisibilityQuality`;
- passes those existing quality components into `VisualSignal`;
- keeps target-specific noticeability factors such as posture, motion, action, size and concealment;
- treats the back 90-degree sector as a scheduled rear check using the existing profile value;
- rejects a not-yet-due rear target before expensive LOS work;
- creates no new perception layer or colour zone.

## Fire permission and continued fire

- Fire permission is state-scoped and defaults to off.
- `requestFireAction` rejects manual and automatic requests while disabled.
- Pre-shot actions are cancelled when permission is disabled; completed shots may finish recovery.
- `CombatEngagement` runs after perception and before fire-action progression.
- Each eligible unit starts one stateful single shot only from a currently identified personal hostile contact.
- After recovery, contact, target capability, ammunition, cadence and safety are checked again before another shot.
- Empty-magazine automatic reload is not included.
- No AI node files were changed.

## Player-facing presentation

- Global Russian-default fire-permission button in simulation controls.
- The existing manual `Огонь по контакту` button is visibly disabled while global fire is prohibited.
- Web Audio rifle crack is unlocked by the player's permission-button gesture.
- A PixiJS 7 presentation renderer consumes real combat-event history and shows:
  - muzzle flash;
  - fading tracer from real origin to calculated impact;
  - terrain/object impact mark;
  - stronger unit-hit pulse.
- Presentation code never changes hits, damage or simulation state.

## Automated verification

Focused tests cover:

- rear cadence and early rejection before LOS;
- shared coloured-zone visibility quality in contact diagnostics;
- default fire denial;
- repeated stateful single-shot cycles while enabled;
- stopping new shots when disabled;
- matching shot-origin and impact events;
- existing perception, runtime, reload, workspace and production-build regressions.

The exact final results must be read from the PR head checks.

## Visual QA

A manual-only Playwright scenario and workflow are prepared. The scenario covers:

- rear target not immediately becoming a direct-fire contact;
- confirmed contact while fire remains prohibited and ammunition stays unchanged;
- permission enablement and aiming;
- tracer/impact screenshot;
- target outcome and browser errors.

The workflow has no push trigger. Do not run it until the user explicitly approves visual verification for the exact PR-head SHA. After running, download and manually inspect every key PNG before claiming visual success.

## Main files

- `src/core/visibility/PointVisibility.ts`
- `src/core/perception/PerceptionSystem.ts`
- `src/core/perception/VisualSignal.ts`
- `src/core/combat/CombatRules.ts`
- `src/core/combat/CombatEngagement.ts`
- `src/core/combat/FireAction.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/CombatControls.ts`
- `src/ui/CombatAudio.ts`
- `src/rendering/PixiCombatEffectsRenderer.ts`
- `src/rendering/CombatEffectsInstaller.ts`
- `src/main.ts`
- `scripts/perception_system_smoke.ts`
- `scripts/combat_foundation_smoke.ts`
- `scripts/tactical_workspace_smoke.mjs`
- `tests/combat-foundation-visual.spec.ts`

## Required checks before transfer

- `Combat Foundation Core`
- `Preview Core Checks` real smoke/build steps
- `Agent Docs Integrity`
- `Preview Policy`
- other repository-required checks for the exact PR head
- manual `Combat Foundation Visual QA` only after explicit approval
