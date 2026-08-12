<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `3a1d3ffb4efa2228dce4009460c726984df85216` (принятая Metrics v18; документационные правки позже)

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, запуск, серия прогонов, метрики и журнал.

## Current focus

Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа» и «Метрики». Метрики v18 утверждены пользователем и перенесены в `real-wargame-preview`; принятый Отчёт имеет верхние режимы только `Обзор / Измерения / Хронология`. Следующие незавершённые продуктовые разделы — `Серия` и `Журнал`.

## Next step

Отдельно выбрать и текстом спроектировать следующий незавершённый раздел Полигона — `Серия` или `Журнал` — сохраняя принятую v18 Метрик без перепроектирования. Позже закончить общую правую и верхнюю панели и связать UX Метрик с реальным runtime-сбором telemetry без переноса игровой истины в UI.

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
- `docs/subprojects/polygon-prototype/prototypes/metrics-v18/README.md`
- `docs/subprojects/polygon-prototype/prototypes/metrics-v18/rebuild_metrics_v18.py`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- v44 и Metrics v18 являются принятыми UX-прототипами и контрактами авторинга/анализа, но не источниками истины игровой симуляции.
- Не считать `Серия` и `Журнал` готовыми функциями только потому, что их места видны в оболочке.
- Не считать demo-data Отчёта доказательством production-сбора telemetry; подключение к runtime выполняется отдельно.
- Не ломать и не перепроектировать принятые редакторы `Редактор юнита`, `Редактор карты`, `Программа` и принятый UX `Метрик` без отдельной задачи.
- Перед любым следующим изменением UI Полигона сначала представить пользователю текстовую концепцию и получить явное одобрение; до этого HTML не создавать и не изменять.
- Передаваемый пользователю большой HTML Полигона упаковывать только в ZIP-архив; не выводить его прямо в чат и не отдавать отдельным сырым `.html`-файлом.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в `main` без отдельного явного разрешения пользователя.
