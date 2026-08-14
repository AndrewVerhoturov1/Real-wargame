<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-15
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `2549055956adff3e29c0b1f5ef9adb71d3146b66`

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, лабораторные изменения, запуск, серия прогонов, метрики и журнал.

## Current focus

Пользователем принята Right Panel v1 поверх Series v1.1: правая панель теперь имеет принятые вкладки Юнит, Инфо, Внимание и Память с мировыми оверлеями внимания/памяти, субъективными контактами, фильтрацией и явными границами prototype/production. Канонический внешний артефакт — `polygon-right-panel-v1.html`, `2 271 249` байт, SHA-256 `ccd2c3b9c5cc8638b8a4f47ef1a35925a8979076066a6f0733ff388c214fa80f`. По явной инструкции пользователя HTML этой приёмкой в репозиторий не добавляется; `ACCEPTED_RIGHT_PANEL_V1.md` фиксирует контракт.

## Next step

Следующие вкладки правого инспектора — Опасность, Скрытность, Позиции и расширенное Оружие — проектировать отдельно, начиная только от Right Panel v1 и сначала согласуя текстовую концепцию. Production wiring Внимания и Памяти должен читать authoritative attention/perception/visibility/memory state, не пересчитывать gameplay из UI и соблюдать performance contract и исторические границы знания Journal.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
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

- Right Panel v1 является единственной текущей канонической базой следующей UI-итерации Полигона; не начинать новый UI от чистого Series v1.1, Laboratory v1, Global Editors v1, Journal v4, Metrics v18 или v44.
- До ручной загрузки `polygon-right-panel-v1.html` использовать SHA-256 `ccd2c3b9c5cc8638b8a4f47ef1a35925a8979076066a6f0733ff388c214fa80f` как идентичность принятой внешней базы.
- Внимание и Память являются субъективными представлениями конкретного бойца; UI/renderer не становится владельцем gameplay truth и не должен раскрывать скрытые объективные данные.
- В Journal на историческом `viewTime` запрещено показывать контакты или знания, полученные позже выбранного времени.
- Оверлеи Внимания и Памяти должны оставаться world-bound при zoom/pan и не должны строиться как display object на каждую клетку или запускать full-map gameplay computation из UI.
- Series v1 и предыдущие принятые HTML являются UX/reference-контрактами и не являются simulation SSOT.
- Не считать standalone Series v1 доказательством наличия production background runner, telemetry aggregation, result storage или deterministic replay.
- Для production-воспроизведения конкретного прогона сохранять не только seed, но и замороженный experiment definition и версию/идентичность simulation runtime.
- Не создавать параллельный каталог Метрик внутри Серии; агрегировать выбранные measurement definitions и их production telemetry.
- Не ломать принятые Редактор юнита, Редактор карты, Программа, Metrics v18, Journal v4, Global Editors v1, Laboratory v1, Series v1 и Right Panel v1 без отдельной задачи.
- Не создавать параллельный вручную скопированный production-каталог параметров Laboratory; использовать adapter/descriptor слой над authoritative владельцами.
- Перед следующим крупным UI-изменением сначала согласовать текстовую концепцию; до явного одобрения HTML не изменять.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
