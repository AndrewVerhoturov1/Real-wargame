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
- **Current focus:** Reactive Route Status v1 и Grid Pathfinding v1 реализованы и проверены: выбранный боец измеряет прогресс и причины отмены, игрок и ИИ используют общий детерминированный A*, MoveOrder следует waypoint-точкам, перестраивает путь при изменении проходимости и честно сообщает blocked/unreachable без фиктивного успеха.
- **Next step:** Следующий отдельный вертикальный срез — либо тактическая стоимость пути по субъективно известной угрозе и скрытности, либо резервирование клеток/укрытий между бойцами; не объединять оба направления в одну задачу.
- **Last verified commit:** `0a4d418130e68e91ee82a2e53f1fe6e02959a6b2`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
