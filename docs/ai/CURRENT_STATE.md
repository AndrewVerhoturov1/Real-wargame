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
- **Updated:** 2026-07-13
- **Current focus:** Слой «Обзор и память» перерабатывается во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания. Добавлены метрическая дальность зрения, поклеточная текущая видимость с тенью от рельефа и предметов, ослаблением лесом и расстоянием, память только метками, стабильная небольшая случайность обнаружения и однострайтовый PixiJS-рендер. В real-wargame-preview изменения пока не переносились.
- **Next step:** Завершить полный CI и реальную браузерную проверку временной ветки feat/view-memory-heatmap-temp. После пользовательской проверки переносить в real-wargame-preview только по отдельной команде; main не менять без отдельного явного GO пользователя.
- **Last verified commit:** `5deb899673c7b6e57b9089ecf890699f6d617a9a`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
