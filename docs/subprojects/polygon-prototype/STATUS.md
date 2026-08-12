<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, запуск, серия прогонов, метрики и журнал.

## Current focus

Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа», «Метрики v18» и «Журнал v4». Журнал v4 утверждён пользователем как read-only слой разбора эксперимента с глобальной хронологией, фильтрацией, связью с выбранными Метриками и историческим просмотром. Следующая незавершённая крупная продуктовая вкладка — «Серия»; production-подключение telemetry и replay/history остаётся отдельной runtime-задачей.

## Next step

Проектировать следующую незавершённую вкладку «Серия» по обязательному text-first процессу; отдельно позже подключить принятые UX Метрик и Журнала к реальному telemetry/replay runtime, сохраняя simulation единственным источником игровой истины.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/prototypes/metrics-v18/README.md`
- `docs/subprojects/polygon-prototype/prototypes/metrics-v18/rebuild_metrics_v18.py`
- `docs/subprojects/polygon-prototype/prototypes/journal-v4/README.md`
- `docs/subprojects/polygon-prototype/prototypes/journal-v4/rebuild_journal_v4.py`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- v44, Metrics v18 и Journal v4 являются принятыми UX-прототипами/контрактами и не являются источниками истины игровой симуляции.
- Не считать «Серию» готовой функцией только потому, что её место видно в оболочке.
- Не считать demo-data Метрик или demo-history Журнала доказательством production telemetry/replay; runtime-подключение выполняется отдельно.
- Не ломать и не перепроектировать принятые «Редактор юнита», «Редактор карты», «Программа», Metrics v18 и Journal v4 без отдельной задачи.
- Перед любым следующим крупным изменением UI Полигона сначала представить пользователю текстовую концепцию и получить явное одобрение; до этого HTML не создавать и не изменять.
- Передаваемый пользователю большой HTML Полигона упаковывать только в ZIP-архив; не выводить его прямо в чат и не отдавать отдельным сырым .html-файлом.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
