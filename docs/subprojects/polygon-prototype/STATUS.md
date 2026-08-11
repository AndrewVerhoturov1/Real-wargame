<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-11
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, запуск, серия прогонов, метрики и журнал.

## Current focus

Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа» и «Метрики». Последний принятый прототип Метрик — v18: специализированный конструктор потоков данных, Program Anchors, карточки измерений в левой панели и блочный Отчёт с верхними режимами «Обзор / Измерения / Хронология».

## Next step

Спроектировать и реализовать оставшиеся разделы Полигона: «Серия» и «Журнал», затем закончить общую правую и верхнюю панели и связать принятый UX Метрик с реальным runtime-сбором telemetry без переноса игровой истины в UI.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/prototypes/polygon-metrics-constructor-v18-report-streamlined.html.gz`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- v44 и Metrics v18 являются принятыми UX-прототипами и контрактами авторинга/анализа, но не источниками истины игровой симуляции.
- Не считать «Серия» и «Журнал» готовыми функциями только потому, что их места видны в оболочке.
- Не считать demo-data Отчёта доказательством production-сбора telemetry; подключение к runtime выполняется отдельно.
- Не ломать и не перепроектировать принятые редакторы «Редактор юнита», «Редактор карты», «Программа» и принятый UX «Метрик» без отдельной задачи.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
