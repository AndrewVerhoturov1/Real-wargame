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
- **Current focus:** Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Текущий обзор строится как кешируемая поклеточная тепловая карта выбранного бойца с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками, а обнаружение накапливается во времени со стабильной небольшой случайностью. После синхронизации навигации нестабильная браузерная проверка была разделена на точный headless-контракт ключа растрового поля и визуальную проверку движения. В real-wargame-preview уже появились совпадающие файлы реализации из внешней работы; эта рабочая ветка туда не объединялась данным процессом.
- **Next step:** Показать пользователю проверенную временную ветку feat/view-memory-heatmap-temp. Перед любым дальнейшим переносом или удалением ветки сначала сравнить её с актуальной real-wargame-preview: preview уже содержит совпадающую реализацию, поэтому нельзя слепо выполнять повторный merge. main не менять без отдельного явного GO пользователя.
- **Last verified commit:** `d254e471ed789790123302e466ac8fd3dd5c3e11`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
