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
- **Current focus:** Слой «Обзор и память» полностью реализован и проверен во временной ветке feat/view-memory-heatmap-temp. Физическое вращение фокуса заменено стабильным вероятностным распределением внимания; текущий обзор показывается поклеточной тепловой картой с рельефом, предметами, лесом и падением качества по расстоянию; старые знания остаются метками; обнаружение накапливается во времени с небольшой стабильной случайностью. Поле кешируется, хранится в Uint8Array и выводится одним PixiJS-спрайтом. В real-wargame-preview изменения не переносились.
- **Next step:** Показать пользователю временную ветку feat/view-memory-heatmap-temp для ручной проверки. Переносить её в real-wargame-preview только по отдельной явной команде; main не менять без отдельного явного GO пользователя.
- **Last verified commit:** `923fdde44d15d447b01178ce1430e2c68f11a215`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
