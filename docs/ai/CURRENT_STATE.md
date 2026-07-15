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
- **Updated:** 2026-07-15
- **Current focus:** Slice 1 кампании Stage 1–2 завершён и перенесён в real-wargame-preview через PR #106: потенциальная опасность отделена от evidence-derived suppression, а память неизвестного огня получила устойчивое объединение, разделение разных направлений и reconciliation с unit:<id>. Stage 1 остаётся открытым до live route replan, усиленных safe-position/reverse-slope доказательств, постоянного CI и отдельной визуальной приёмки.
- **Next step:** Продолжить Stage 1 со следующего вертикального среза: доказать живое перестроение активного маршрута через обычный SimulationTick с сохранением ownerToken, цели, профиля и final facing; затем усилить safe-position и reverse-slope проверки, закрепить combat-tactical-integration:smoke в постоянном CI и только после отдельного разрешения запустить подготовленные девять visual QA сцен.
- **Last verified commit:** `3f01f4ba9b96daa1b8951bdd08f4005a482fee8c`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
