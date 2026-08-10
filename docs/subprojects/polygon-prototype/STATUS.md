<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-11
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Собрать единый прототип подготовки и анализа тактического эксперимента Real Wargame: карта, участники, программа, настраиваемый сбор данных, метрики, серия прогонов и журнал.

## Current focus

Следующим этапом выбрана вкладка «Метрики». Она проектируется не как фиксированная панель текущих чисел, а как конструктор измерений эксперимента: каталог доступных данных, сырые измерения, вычисляемые метрики, группировки, сравнения, пресеты, импорт/экспорт JSON и отображение только выбранных результатов. До реализации интерфейс обязательно согласуется с пользователем текстом.

## Next step

Сначала исследовать реальный код и составить полный реестр измеряемых данных со статусами «доступно сейчас / вычисляется / нужна будущая телеметрия», затем текстом согласовать структуру вкладки «Метрики». HTML можно изменять только после явного одобрения; передавать HTML пользователю только внутри ZIP-архива.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/METRICS_CONSTRUCTOR_PLAN.md`
- `docs/subprojects/polygon-prototype/POLYGON_NEXT_TAB_ORCHESTRATOR_PROMPT.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`
- `ideas/SIMULATION_LAB_AND_EXPERIMENT_STANDS.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/polygon-prototype/METRICS_CONSTRUCTOR_PLAN.md`
- `docs/subprojects/polygon-prototype/POLYGON_NEXT_TAB_ORCHESTRATOR_PROMPT.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- v44 является принятым прототипом интерфейса и авторинга, но не источником истины игровой симуляции.
- Не считать видимые заглушки «Серия», «Метрики» и «Журнал» готовыми функциями; следующей реализуется только «Метрики».
- Не ломать и не перепроектировать принятые редакторы «Редактор юнита», «Редактор карты» и «Программа» без отдельной задачи.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- В текущей итерации не размещать элементы Метрик в верхнем меню, верхней панели, правой панели или других готовых вкладках.
- До явного пользовательского одобрения текстовой концепции интерфейса не создавать и не изменять HTML реализации Метрик.
- Передаваемый пользователю HTML Полигона упаковывать только в ZIP-архив и не выводить большой HTML прямо в чат.
- Не выдавать будущую телеметрию за реально доступные данные движка.
- Не переносить изменения в main или real-wargame-preview без отдельного явного разрешения пользователя.
- Deployment не выполнять без отдельного запроса.
