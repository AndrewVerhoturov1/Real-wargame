<!-- GENERATED FILE. Edit docs/ai/repo-context.json or subproject.json, then run npm run docs:generate. -->
# Current Repository State

Generated from canonical repository and subproject metadata.

## Repository

- **Project:** Real-Wargame
- **Repository:** `AndrewVerhoturov1/Real-wargame`
- **Working branch:** `real-wargame-preview`
- **Stable branch:** `main`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **PixiJS major:** 7
- **Updated:** 2026-07-12

## Delivery policy

- Preferred: `direct-push-to-preview` to `real-wargame-preview`.
- Fallback: `pull-request-to-preview`.
- Changing `main` requires explicit human GO: **yes**.
- Auto-merge allowed: **no**.

## Active subproject: AI Single-Unit Editor — Stateful Tactical Awareness Lab

- **ID:** `ai-single-unit-editor`
- **Updated:** 2026-07-12
- **Current focus:** Reactive Route Status v1 и Grid Pathfinding v1 реализованы в feature/ai-grid-pathfinding-v1: выбранный боец измеряет прогресс, реагирует на отмену и потерю цели, игрок и ИИ используют общий детерминированный A*, MoveOrder следует waypoint-точкам и перестраивает путь при изменении проходимости.
- **Next step:** Завершить exact-SHA browser/PNG и docs-integrity проверку, затем fast-forward перенести проверенный head в real-wargame-preview; после интеграции следующий отдельный срез — резервирование пути/укрытий или тактическая стоимость маршрута.
- **Last verified commit:** `5743263ad8df466181517358b532b011658da6f5`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
