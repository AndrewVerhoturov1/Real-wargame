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

Пользователем принята Laboratory v1 — новая вкладка временных экспериментальных overrides, построенная непосредственно на Global Editors v1. Laboratory v1 является единственной текущей канонической базой следующих UI-итераций автономного Полигона. Приняты также Редактор юнита, Редактор карты, Программа, Metrics v18, Journal v4 и Global Editors v1. Следующая незавершённая крупная продуктовая вкладка — Серия; production telemetry/replay/registry/Laboratory wiring остаётся отдельной runtime-задачей.

## Next step

Следующую крупную UI-итерацию начинать только от Laboratory v1. Ближайшая продуктовая вкладка — Серия. Production descriptor/adapter layer и resolution chain Laboratory overrides проектировать отдельно, сохраняя simulation и существующие registry/config sources единственными authoritative источниками игровых данных.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
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

- `docs/subprojects/polygon-prototype/ACCEPTED_LABORATORY_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_GLOBAL_EDITORS_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Laboratory v1 является единственной текущей канонической базой следующей UI-итерации Полигона; не начинать новый UI от Global Editors v1, Journal v4, Metrics v18 или v44.
- Laboratory v1 и предыдущие принятые HTML являются UX/reference-контрактами и не являются simulation SSOT.
- Не изменять верхнюю шапку или правую панель ради Laboratory без отдельного решения пользователя.
- Рамка Laboratory является инструментом выбора юнитов, а не создания области.
- Не создавать параллельный вручную скопированный production-каталог параметров Laboratory; использовать adapter/descriptor слой над authoritative владельцами.
- Не считать standalone Laboratory overrides доказательством production resolution/wiring.
- Не считать Серию готовой функцией только потому, что её место видно в оболочке.
- Не ломать принятые Редактор юнита, Редактор карты, Программа, Metrics v18, Journal v4, Global Editors v1 и Laboratory v1 без отдельной задачи.
- Перед следующим крупным UI-изменением сначала согласовать текстовую концепцию; до явного одобрения HTML не изменять.
- Передаваемый пользователю большой HTML Полигона упаковывать только в ZIP-архив.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
