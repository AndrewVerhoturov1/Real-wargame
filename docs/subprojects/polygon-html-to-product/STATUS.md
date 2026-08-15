<!-- GENERATED FILE. Edit docs/subprojects/polygon-html-to-product/subproject.json, then run npm run docs:generate. -->
# Перенос Полигона из HTML-прототипа в продукт — Current Status

- **ID:** `polygon-html-to-product`
- **Status:** `active`
- **Updated:** 2026-08-15
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Перенести принятый пользовательский интерфейс режима «Полигон» из HTML-прототипа в штатную реализацию Real Wargame, сохранив видимое поведение, сценарии, связи разделов и смысл действий пользователя, но используя существующую архитектуру и настоящих владельцев данных.

## Current focus

Аналитическая фаза завершена; четыре независимых Q-handoff для АРКИ, ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА подготовлены, а рабочая карта проекта создана. Q пока не запущены.

## Next step

После отдельного разрешения пользователя заново получить exact current HEAD real-wargame-preview и запустить четыре Q параллельно на назначенных feature-ветках. Первая точка интеграции после принятия результатов: АРКА + ПУЛЬС → первый настоящий LIVE Unit.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
- `docs/subprojects/polygon-html-to-product/STATUS.md`
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`
- `docs/subprojects/polygon-html-to-product/PROJECT_MAP_TEMPLATE.md`
- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`
- `docs/subprojects/polygon-html-to-product/Q_PROMPTS.md`
- `docs/subprojects/polygon-html-to-product/PROJECT_MAP.drawio`
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_V44.md`

## Main files

- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`
- `docs/subprojects/polygon-html-to-product/PROJECT_MAP_TEMPLATE.md`
- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`
- `docs/subprojects/polygon-html-to-product/PROJECT_MAP.drawio`
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`

## Suggested verification

- `npm run docs:sync`
- `npm run docs:check`
- `Проверить JSON-файлы и diff: изменены только документы подпроекта и сгенерированные индексы.`

## Safety rules

- Каждая продуктовая кодовая задача начинается только после повторного получения exact current real-wargame-preview HEAD и выполняется на отдельной feature-ветке.
- Не копировать в продукт временную модель данных, mock-данные, synthetic RNG, demo events, localStorage или standalone window/global API HTML.
- Сохранять принятые UX-связи Interface Linkage v1, включая Программа↔Журнал, Метрики↔Серия и linked-entity переходы.
- Внимание и Память остаются субъективными представлениями бойца; UI не становится владельцем gameplay truth.
- UI может владеть только чистым UI-state; игровое/экспериментальное состояние читается у product owners и меняется через утверждённые write-boundaries.
- До отдельного решения пользователя не менять принятый интерфейсный контракт, main или real-wargame-preview и не выполнять deployment.
- Исходный HTML не добавлять в репозиторий; использовать его имя, версию, размер и SHA-256 как идентичность принятой базы.
