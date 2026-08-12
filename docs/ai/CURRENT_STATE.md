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
- **Updated:** 2026-08-12

## Delivery policy

- Preferred: `feature-branch-with-explicit-manual-vercel-preview` to `real-wargame-preview`.
- Fallback: `pull-request-to-preview-when-technically-required`.
- Changing `main` requires explicit human GO: **yes**.
- Auto-merge allowed: **no**.

## Active subproject: Первый прототип пехотного боя

- **ID:** `infantry-combat-prototype-v1`
- **Updated:** 2026-07-22
- **Current focus:** Этап 1: сохраняемый статический предрасчёт и чистый решатель локальных рабочих точек проверены и перенесены в real-wargame-preview. Текущая работа — физическое выполнение временного действия от защищённого якоря.
- **Next step:** Реализовать общий runtime anchor → action port → требуемая поза → observation/fire → return с отменой, сохранением и диагностикой.
- **Last verified commit:** `86071bb3d0c4ebd95adf4e87ee4d575fa7108da3`
- **Status:** [generated status](../subprojects/infantry-combat-prototype-v1/STATUS.md)

## Active subproject: Полигон — редактор эксперимента

- **ID:** `polygon-prototype`
- **Updated:** 2026-08-13
- **Current focus:** Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа», «Метрики v18», «Журнал v4» и «Общие редакторы v1». Global Editors v1 на базе Journal v4 является единственной текущей канонической базой для следующих UI-итераций Полигона. Общий popup содержит 11 редакторов; все gameplay tuning-настройки в standalone Polygon authoring mode разблокированы, включая встроенные профили и опубликованные записи вооружения. Следующая незавершённая крупная продуктовая вкладка — «Серия»; production-подключение telemetry/replay и standalone authoring UX остаётся отдельной runtime-задачей.
- **Next step:** Проектировать вкладку «Серия» по обязательному text-first процессу, начиная только от принятой Global Editors v1; отдельно позже подключить принятые UX Метрик, Журнала и общих редакторов к production telemetry/replay/registries, сохраняя simulation единственным источником игровой истины.
- **Last verified commit:** `2ff387e668864243aad3c4af380b5869e530b482`
- **Status:** [generated status](../subprojects/polygon-prototype/STATUS.md)

## Active subproject: Отображение солдат видом сверху

- **ID:** `soldier-topdown-appearance`
- **Updated:** 2026-08-10
- **Current focus:** Принята система условных знаков: круг для стоящего, скруглённый треугольник для присевшего, вытянутый прямоугольник для лежащего, оружие закреплено внутри знака справа у условного плеча; определены состояния и три уровня детализации.
- **Next step:** Использовать UNIT_SYMBOL_SYSTEM.md как канонический визуальный контракт при переносе принятого HTML-прототипа в штатный рендер карты и редактора юнитов без отдельной демонстрационной сцены.
- **Last verified commit:** not recorded
- **Status:** [generated status](../subprojects/soldier-topdown-appearance/STATUS.md)
