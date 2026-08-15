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

Подготовлена организационная база подпроекта. Продуктовая реализация ещё не начата; следующим шагом является матрица соответствия пользовательского контракта HTML штатным владельцам данных и существующим точкам интеграции.

## Next step

После отдельного разрешения на Q подготовить матрицу: UI-контракт → штатный владелец данных → существующий код/документ → пробел или риск.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
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

- Не начинать продуктовую реализацию в рамках подготовки подпроекта.
- Не копировать в продукт временную модель данных, mock-данные, synthetic RNG, demo events, localStorage или standalone window/global API HTML.
- Сохранять принятые UX-связи Interface Linkage v1, включая Программа↔Журнал, Метрики↔Серия и linked-entity переходы.
- Внимание и Память остаются субъективными представлениями бойца; UI не становится владельцем gameplay truth.
- До отдельного решения пользователя не менять принятый интерфейсный контракт, main, real-wargame-preview и не выполнять деплой.
- Исходный HTML не добавлять в репозиторий; использовать его имя, версию, размер и SHA-256 как идентичность принятой базы.
