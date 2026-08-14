<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-14
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `2549055956adff3e29c0b1f5ef9adb71d3146b66`

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, лабораторные изменения, запуск, серия прогонов, метрики и журнал.

## Current focus

Пользователем принята Series v1 — вкладка фонового многократного прогона одного замороженного эксперимента с отдельным seed для каждого запуска, агрегированным анализом выбранных Метрик, поиском необычных прогонов и переходом к воспроизведению конкретного запуска. Канонический принятый артефакт — `polygon-series-v1.1.html`; он построен непосредственно на Laboratory v1 и является текущей базой следующих UI-итераций автономного Полигона. Production background runner, хранилище результатов, telemetry aggregation и deterministic replay остаются отдельными runtime-задачами.

## Next step

Следующую крупную UI-итерацию начинать только от принятого Series v1 и только после отдельного текстового согласования. Для production Серии отдельно проектировать background runner, сохранение замороженного experiment definition, seed/runtime fingerprint, агрегирование выбранных Метрик и deterministic replay, сохраняя simulation и существующие registry/config sources authoritative источниками игровых данных.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_LABORATORY_V1.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_LABORATORY_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Series v1 является единственной текущей канонической базой следующей UI-итерации Полигона; не начинать новый UI от Laboratory v1, Global Editors v1, Journal v4, Metrics v18 или v44.
- Series v1 и предыдущие принятые HTML являются UX/reference-контрактами и не являются simulation SSOT.
- Не считать standalone Series v1 доказательством наличия production background runner, telemetry aggregation, result storage или deterministic replay.
- Для production-воспроизведения конкретного прогона сохранять не только seed, но и замороженный experiment definition и версию/идентичность simulation runtime.
- Не создавать параллельный каталог Метрик внутри Серии; агрегировать выбранные measurement definitions и их production telemetry.
- Не ломать принятые Редактор юнита, Редактор карты, Программа, Metrics v18, Journal v4, Global Editors v1, Laboratory v1 и Series v1 без отдельной задачи.
- Не создавать параллельный вручную скопированный production-каталог параметров Laboratory; использовать adapter/descriptor слой над authoritative владельцами.
- Перед следующим крупным UI-изменением сначала согласовать текстовую концепцию; до явного одобрения HTML не изменять.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
