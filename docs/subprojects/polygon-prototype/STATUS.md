<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-13
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `2ff387e668864243aad3c4af380b5869e530b482`

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, запуск, серия прогонов, метрики и журнал.

## Current focus

Приняты рабочие UX-прототипы `Редактор юнита`, `Редактор карты`, `Программа`, `Метрики v18`, `Журнал v4` и `Общие редакторы v1`. Global Editors v1 на базе Journal v4 является единственной текущей канонической базой следующих UI-итераций. Общий popup содержит 11 редакторов; все gameplay tuning-настройки standalone Polygon authoring mode разблокированы, включая built-in профили и published записи вооружения. Следующая незавершённая крупная вкладка — `Серия`; production telemetry/replay/registry wiring остаётся отдельной runtime-задачей.

## Next step

Проектировать `Серию` по обязательному text-first процессу, начиная только от принятой Global Editors v1. Production wiring Метрик, Журнала и общих редакторов выполнять отдельно, сохраняя simulation единственным источником игровой истины.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/prototypes/global-editors-v1/README.md`
- `docs/subprojects/polygon-prototype/prototypes/global-editors-v1/rebuild_global_editors_v1.py`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Global Editors v1 является единственной текущей канонической базой следующей UI-итерации; не начинать новый UI от Journal v4, Metrics v18 или v44.
- v44, Metrics v18, Journal v4 и Global Editors v1 являются UX/reference-контрактами и не являются simulation SSOT.
- Не считать `Серию` готовой только потому, что её место видно в оболочке.
- Не считать demo-data, demo-history или standalone tuning доказательством production telemetry/replay/registry wiring.
- Не ломать принятые `Редактор юнита`, `Редактор карты`, `Программа`, Metrics v18, Journal v4 и Global Editors v1 без отдельной задачи.
- Перед следующим крупным UI-изменением сначала согласовать текстовую концепцию; до явного одобрения HTML не изменять.
- Передаваемый пользователю большой HTML упаковывать только в ZIP с `answer.md` в корне.
- Не заменять интегрированные тактические знаки пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в `main` без отдельного явного разрешения пользователя.
