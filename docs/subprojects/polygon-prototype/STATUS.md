<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-17
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `2549055956adff3e29c0b1f5ef9adb71d3146b66`

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, лабораторные изменения, запуск, серия прогонов, метрики и журнал.

## Current focus

Пользователем принята Interface Linkage v1 поверх актуальной Right Panel v1 / memory-tab-v3. Итерация сохраняет новую правую панель Юнит, Инфо, Внимание и Память и добавляет сквозную связность существующих разделов: Роль отдельно от Архетипа, linked-entity переходы и Используется, provenance Laboratory, двустороннюю связь Программа↔Журнал, единые Метрики для Серии, контекст исторического прогона и полный UX-контракт Сохранить эксперимент. Канонический внешний артефакт для ручной загрузки — polygon-interface-linkage-v1.html, 2 292 772 байта, SHA-256 4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd; ACCEPTED_INTERFACE_LINKAGE_V1.md фиксирует контракт.

## Next step

Пользователь вручную загружает polygon-interface-linkage-v1.html в docs/subprojects/polygon-prototype/prototypes/ и сверяет размер/SHA-256. После этого все следующие UI-итерации Полигона начинать только от Interface Linkage v1. Следующие вкладки правого инспектора и production wiring проектировать отдельно, не откатывая принятую связность интерфейса и Right Panel v1.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`
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

- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_LABORATORY_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Interface Linkage v1 является единственной текущей канонической базой следующей UI-итерации Полигона; не начинать новый UI от чистого Right Panel v1, Series v1.1, Laboratory v1, Global Editors v1, Journal v4, Metrics v18 или v44.
- До ручной загрузки polygon-interface-linkage-v1.html использовать SHA-256 4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd как идентичность принятой внешней базы.
- Не откатывать изменения memory-tab-v3 и принятую Right Panel v1 при переносе или развитии Interface Linkage v1.
- Сохранять общий linked-entity UX: акцентный текст со штриховым/пунктирным подчёркиванием и переходом к источнику; не заменять его тяжёлыми карточками без отдельной задачи.
- Роль и Архетип бойца являются разными сущностями и не должны снова смешиваться терминологически.
- Laboratory не подставляет выдуманный baseline при доступном authoritative UI-источнике параметра.
- Программа↔Журнал и Метрики↔Серия являются обязательными сквозными связями интерфейса.
- Сохранить эксперимент концептуально включает карту, юниты, Программу, Лабораторию и Метрики; map-only операции называются отдельно.
- Внимание и Память являются субъективными представлениями конкретного бойца; UI/renderer не становится владельцем gameplay truth и не должен раскрывать скрытые объективные данные.
- В Journal на историческом viewTime запрещено показывать контакты или знания, полученные позже выбранного времени.
- Оверлеи Внимания и Памяти должны оставаться world-bound при zoom/pan и не должны строиться как display object на каждую клетку или запускать full-map gameplay computation из UI.
- Series v1 и предыдущие принятые HTML являются UX/reference-контрактами и не являются simulation SSOT.
- Не считать standalone Series v1 доказательством наличия production background runner, telemetry aggregation, result storage или deterministic replay.
- Для production-воспроизведения конкретного прогона сохранять не только seed, но и замороженный experiment definition и версию/идентичность simulation runtime.
- Не создавать параллельный каталог Метрик внутри Серии; агрегировать выбранные measurement definitions и их production telemetry.
- Не создавать параллельный вручную скопированный production-каталог параметров Laboratory; использовать adapter/descriptor слой над authoritative владельцами.
- Перед следующим крупным UI-изменением сначала согласовать текстовую концепцию; до явного одобрения HTML не изменять.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
