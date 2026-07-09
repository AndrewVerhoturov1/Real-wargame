# Subproject Journal

## Rules

- Record important and medium-importance steps only, not every micro-step.
- Keep entries short: what changed, why, and the result.
- Do not paste raw logs, telemetry, or full reports.
- One entry per significant event or decision.

## Entries

- **2026-07-09**: Created `ai-single-unit-editor` subproject as a draft scaffold from `_template/`. Goal: node-based AI constructor for single-unit behavior, tied to existing RTS wrapper (Real-wargame). Key decisions: not a generic framework, single-unit only first, works through existing BehaviorModel/UnitModel/SimulationState. Boundaries recorded against rewriting the full RTS simulation, premature squad AI, and detached node framework. SUBPROJECT.md, subproject.json, JOURNAL.md created and verified via `subproject_context.py` --list, --brief, --opencode, --files.
- **2026-07-09**: Added `LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`. Clarified that AI Node Editor must open in a new browser tab/entrypoint, while heavy AI calculations run in a local engine process rather than the browser tab. Recorded phased implementation: JSON graph data contract, headless local engine, engine-backed validation/evaluate-once, Soldier Survival Brain v0.1, tactical queries, recipes, worker_threads, and optional Rust/Tauri sidecar only after profiling. Updated `subproject.json` with the new plan, planned files, local-engine safety rules, and verification notes.
