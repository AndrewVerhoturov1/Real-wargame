# Journal — Reactive Route Status v1

Date: 2026-07-12

- Added a pure serializable route-progress tracker for the selected soldier.
- Added `moving`, `stalled`, `blocked`, `arrived`, player override, target loss and missing-order outcomes.
- Preserved token-owned cleanup; route tracking never deletes orders directly.
- Excluded real pause time from no-progress detection.
- Added Russian node controls and live route diagnostics.
- Removed a performance regression: the 60 ms route poll does not rebuild tactical Blackboard or awareness.
- Verified normal progress, blocking, player replacement, lost target, missing order, pause/resume, build and browser diagnostics.
