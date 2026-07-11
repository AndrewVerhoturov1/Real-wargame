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
- **Current focus:** Stateful AI Movement v1 внедрён: MoveToBlackboardPosition замораживает цель Blackboard, один раз создаёт token-owned MoveOrder, возвращает running между тиками, завершает последовательность по прибытии и безопасно отменяется без удаления нового приказа игрока. Следующий этап — реактивная отмена и настоящий статус маршрута/pathfinding.
- **Next step:** Реализовать Reactive Abort + Route Status v1: реактивно отменять или перестраивать движение при новом приказе, исчезновении укрытия, блокировке маршрута или критическом изменении угрозы; затем добавить настоящий grid pathfinder.
- **Last verified commit:** `7a8cea65fdc8c20201596dfb098e2671285e0ecc`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
