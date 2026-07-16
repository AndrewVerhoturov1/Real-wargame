<!-- GENERATED FILE. Edit docs/ai/repo-context.json or subproject.json, then run npm run docs:generate. -->
# Current Repository State

Generated from canonical repository and subproject metadata.

## Repository

- **Project:** Real-Wargame
- **Repository:** `AndrewVerhoturov1/Real-wargame`
- **Working branch:** `real-wargame-preview`
- **Stable branch:** `main`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **PixiJS major:** 8
- **Updated:** 2026-07-15

## Delivery policy

- Preferred: `direct-push-to-preview` to `real-wargame-preview`.
- Fallback: `pull-request-to-preview`.
- Changing `main` requires explicit human GO: **yes**.
- Auto-merge allowed: **no**.

## Active subproject: AI Single-Unit Editor — Stateful Tactical Awareness, Hierarchical States and Plans

- **ID:** `ai-single-unit-editor`
- **Updated:** 2026-07-16
- **Current focus:** Draft PR #127 follow-up hardens the accepted simulation-owned per-unit scheduler: explicit paused steps advance all simulation systems, selected-unit diagnostics are read-only, observer polling and graph decisions use partition-invariant simulation-time cadence, the scheduler is one O(n) pass with one frozen graph snapshot, and ai-scheduler:smoke is blocking CI. It is not yet part of real-wargame-preview.
- **Next step:** Review the corrected exact head of draft PR #127 and its Combat Foundation Core scheduler-smoke evidence; if accepted, integrate it with PR #126 while preserving canonical world-threat semantics and the scheduler phase order.
- **Last verified commit:** `3f01f4ba9b96daa1b8951bdd08f4005a482fee8c`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
