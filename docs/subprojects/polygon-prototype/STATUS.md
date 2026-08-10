<!-- GENERATED FILE. Edit docs/subprojects/polygon-prototype/subproject.json, then run npm run docs:generate. -->
# Полигон — редактор эксперимента — Current Status

- **ID:** `polygon-prototype`
- **Status:** `active`
- **Updated:** 2026-08-10
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Собрать единый прототип подготовки тактического эксперимента Real Wargame: карта, участники, программа, запуск, серия прогонов, метрики и журнал.

## Current focus

Версия v44 с интегрированным отображением пехоты тактическими знаками принята как текущая базовая версия Полигона. Готовыми считаются «Редактор юнита», «Редактор карты» и «Программа». Остальная оболочка Полигона ещё не разработана как законченная рабочая часть.

## Next step

Спроектировать и реализовать оставшуюся оболочку Полигона: «Серия», «Метрики», «Журнал», правую контекстную панель и верхние общие элементы управления, сохранив три принятых редактора и интегрированное отображение пехоты без перепроектирования.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-prototype/STATUS.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`
- `docs/subprojects/infantry-combat-prototype-v1/POLYGON_MAP_EDITOR_RESEARCH.md`
- `docs/subprojects/infantry-combat-prototype-v1/prototypes/polygon-program-logic-editor/README.md`
- `docs/prototypes/polygon-interface-v1/README.md`

## Main files

- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- v44 является принятым прототипом интерфейса и авторинга, но не источником истины игровой симуляции.
- Не считать видимые заглушки «Серия», «Метрики» и «Журнал» готовыми функциями.
- Не ломать и не перепроектировать принятые редакторы «Редактор юнита», «Редактор карты» и «Программа» без отдельной задачи.
- Не заменять интегрированное отображение пехоты реалистичными фигурами без отдельного решения пользователя.
- Не переносить изменения в main без отдельного явного разрешения пользователя.
