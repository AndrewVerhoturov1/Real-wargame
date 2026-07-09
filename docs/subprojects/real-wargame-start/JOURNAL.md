# Subproject Journal

## Rules

- Record important and medium-importance steps only, not every micro-step.
- Keep entries short: what changed, why, and the result.
- Do not paste raw logs, telemetry, or full reports.
- One entry per significant event or decision.

## Entries

- **2026-07-06**: Created `real-wargame-start` subproject as a minimal durable workstream scaffold. Initial structure from `_template/`: SUBPROJECT.md, subproject.json, JOURNAL.md. Goal and current focus set to tech-stack selection and minimal build setup. No key decisions yet.
- **2026-07-06**: Updated subproject definition from `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md`. Clarified the initial Map Workshop direction and recorded the PixiJS/TypeScript/Vite/JSON, core/rendering separation, and data-first decisions.
- **2026-07-06**: Shifted the practical first visible milestone to Tactical Board Prototype v0.1: map, zoom/pan, counters, selection, right-click move orders, order lines, direct movement and debug HUD. Map Workshop remains a later step.
- **2026-07-06**: Added the Tactical Board Prototype v0.1 implementation package on `codex/tactical-board-prototype-v0-1`, preserving core/rendering separation and excluding combat, AI, pathfinding and the editor.
- **2026-07-07**: Prepared a minimal integration from published branches onto current `main`: retained the prototype runtime and project source context, preserved the GitHub governance layer, restored `.env` ignore rules while adding frontend build ignores, and aligned subproject memory with the tactical-board milestone. Local build and browser verification remain required.
- **2026-07-08**: Added Behavior Foundation v0.1 preview work on `real-wargame-preview`: behavior profiles, unit state/posture/stress fields, pressure-zone data, pressure-zone overlay, posture/stress rendering markers, and a manual test program. Dynamic per-frame behavior and full inspector remain follow-up work.
- **2026-07-08**: Added Behavior Tick v0.2 preview work: per-frame pressure/stress updates, posture/state changes during movement, stress recovery outside pressure zones, low-posture speed multipliers, and a HUD behavior inspector for AI-behavior testing.
- **2026-07-08**: Adjusted Behavior Tick v0.2 to metrics-only mode after user review: pressure zones now calculate danger/stress for inspector use, but do not stop, slow, crouch or otherwise control the unit. Grid and view cone rendering are hidden for a cleaner default test view.
- **2026-07-09**: RTS foundation reached a usable baseline on `real-wargame-preview`: large map, tabbed game/editor UI, height/forest brushes, JSON scene import/export, physical-map height rendering, cached real-relief overlay, Alt line-of-sight in meters, unit knowledge layers, cover lists, object physical heights, performance report and Playwright screenshot smoke. Future work should build soldier behavior on top of this foundation instead of restarting the map/editor/UI layer.
