# Subproject Journal

## Rules

- Record important and medium-importance steps only, not every micro-step.
- Keep entries short: what changed, why, and the result.
- Do not paste raw logs, telemetry, or full reports.
- One entry per significant event or decision.

## Entries

- **2026-07-06**: Created `real-wargame-start` subproject as a minimal durable workstream scaffold. Initial structure from `_template/`: SUBPROJECT.md, subproject.json, JOURNAL.md. Goal and current focus set to tech-stack selection and minimal build setup. No key decisions yet.
- **2026-07-06**: Updated subproject definition from `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md`. Clarified goal: Tactical Map Workshop v0.1 (grid editor, terrain brushes, height, JSON import/export, debug overlay, test scene). Recorded key GDD decisions (PixiJS/TS/Vite/JSON stack, core/rendering separation, data-first, no combat in v0.1).
- **2026-07-06**: Added Tactical Board Prototype v0.1 implementation package: Vite/TS/PixiJS shell, 20×20 board, camera zoom/pan, test counters, selection, right-click move orders, order lines, simple movement tick, debug HUD. Kept combat/AI/pathfinding/editor out of scope and preserved core/rendering separation.
