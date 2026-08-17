# Приоритетная волна реализации Полигона — 2026-08-17

## 1. Назначение

Этот документ фиксирует следующую продуктовую волну подпроекта «Перенос Полигона из HTML-прототипа в продукт» после объединения принятых результатов АРКИ, ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА.

Плановая база на момент фиксации:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
```

Перед фактическим запуском каждого исполнителя оркестратор обязан повторно получить текущий exact HEAD `real-wargame-preview`. Если все шесть задач стартуют одновременно и HEAD не изменился, они могут использовать один общий base commit. Если preview уже сдвинулся, нельзя молча использовать SHA из этого документа.

## 2. Решение пользователя о приоритетах

Пользователь поставил в первый приоритет не Metrics/Series/replay, а превращение нового shell Полигона в цельную игровую поверхность. Текущая волна состоит из шести направлений:

1. **КАРТА** — вернуть в новый shell настоящую поверхность карты и привести её визуальную подачу к принятому прототипу.
2. **ПУЛЬС** — завершить настоящий `LIVE Unit`: карта → unitId → UnitModel → правый `Юнит` → штатная команда → readback.
3. **РЕДАКТОРЫ** — встроить уже существующие продуктовые редакторы в новый дизайн Полигона, не переписывая их доменную логику.
4. **ЛИНЗА** — реализовать `Инфо / Внимание / Память` LIVE на реальных product owners.
5. **КОНТЕКСТ** — сделать единое контекстное меню сущностей карты в новом дизайне, не ломая существующие тактические команды правой кнопкой.
6. **ПЕШКА** — заменить текущее отображение бойца на принятую систему тактических знаков и уровней детализации.

ХРОНИСТ, Metrics, Series, replay и Save/Open остаются важными, но не являются первым визуально-игровым приоритетом этой волны.

## 3. Что уже есть в продукте и нельзя дублировать

### Настоящая карта уже существует

`GameApplication` создаёт один `PixiTacticalBoardApp`, а `PixiTacticalBoardApp` уже использует `PixiMapRenderer`, `CameraController`, `BoardInputController`, overlays и `PixiUnitRenderer`.

Текущий ARKA exact-shell намеренно скрывает реальный canvas через `polygon-shell-exact.css` и показывает статическую placeholder-поверхность. Задача КАРТЫ — вернуть существующий renderer в новый viewport и изменить presentation там, где это требуется, а не создавать второй Pixi Application или новую самостоятельную карту.

### Редакторы уже существуют

Combat Lab уже создаёт `CombatLabGameEditors` поверх `createDefaultGameEditorRegistry()`. Registry содержит существующие редакторы поведения, маршрутов, тактических позиций, данных бойца, архетипов, внимания, восприятия, движения, вооружения, ранений/подавления, профилей местности и направленного рельефа.

Старую ветку `feature/20260812-polygon-global-editors` не нужно вливать: её работа уже является частью истории текущего продукта. Новая задача — shell integration и новый presentation.

### Правый клик уже занят игровым вводом

`TacticalOrderRadialInput` использует secondary-button hold/gesture для быстрых перемещений и радиального меню тактических приказов; `BoardInputController` также имеет quick right-click/right-drag path. КОНТЕКСТ не имеет права просто перехватить всю правую кнопку. Нужна детерминированная маршрутизация ввода по target/gesture с сохранением существующих боевых сценариев.

### Пешка уже имеет одного renderer owner

`PixiUnitRenderer` уже отображает настоящие `UnitModel` и поддерживает постоянные view-объекты по `unit.id`. ПЕШКА должна развивать этот штатный renderer, а не добавлять параллельный слой fake soldiers или отдельную демонстрационную сцену.

## 4. Общие правила для всех шести исполнителей

1. Работать только в отдельной feature-ветке от exact current `real-wargame-preview`.
2. Не писать в `main` и не переносить результат в `real-wargame-preview` без отдельного GO пользователя.
3. Deployment не входит в задачи этой волны без отдельной команды пользователя.
4. Перед работой прочитать `AGENTS.md`, `.agents/skills/real-wargame-orchestration/SKILL.md`, этот документ и собственный prompt.
5. Для runtime/render/UI изменений прочитать `.agents/skills/real-wargame-performance/SKILL.md` и обязательные performance/CI источники из него.
6. Для визуальных задач использовать `.agents/skills/real-wargame-screenshots/SKILL.md`; свежие скриншоты должны относиться к exact product SHA.
7. Не создавать второй gameplay truth, второй selection store, второй map state, UI-owned LOS/perception/history, demo entities или synthetic production data.
8. Не переписывать соседнюю подсистему только ради удобства своей задачи.
9. Любой общий seam должен быть минимальным и нейтральным, а не кодом одного исполнителя, который присваивает себе ownership соседней области.
10. Возвращать результат по `docs/orchestration/RESULT_TEMPLATE.md` с exact SHA, изменёнными файлами, реально выполненными проверками и честным списком того, что не проверено.

## 5. Границы владения и параллельность

| Исполнитель | Основная зона | Не владеет |
|---|---|---|
| КАРТА | map canvas/viewport, `PixiMapRenderer` presentation, camera-fit | unit selection, unit panel, unit symbol geometry, editors, context menu |
| ПУЛЬС | selection → UnitModel → `Юнит` LIVE → posture command/readback | Info/Attention/Memory contents, map appearance, unit drawing, editors |
| РЕДАКТОРЫ | existing editor registry/catalogue/overlay → new shell/design | gameplay model, unit inspector, map renderer, context-menu routing |
| ЛИНЗА | Info/Attention/Memory LIVE adapters/views | selection ownership, HistoryProvider, Estimated Front semantics, map rendering |
| КОНТЕКСТ | entity target resolution + context menu presentation/routing | domain mutation, tactical-order implementation, editor internals |
| ПЕШКА | `PixiUnitRenderer` visual language/LOD | selection truth, input, right panel, map terrain, editor logic |

Все шесть направлений можно исследовать и реализовывать параллельно. Интеграция выполняется по зависимостям ниже.

## 6. Точки схождения

### КАРТА + ПЕШКА + ПУЛЬС

Должны дать первую целую игровую сцену:

```text
настоящая карта
→ настоящий бойцовый знак
→ выбор бойца
→ тот же unitId/UnitModel
→ правый Юнит LIVE
```

КАРТА и ПЕШКА не должны менять selection semantics. ПУЛЬС не должен рисовать новую пешку или менять terrain renderer.

### ПУЛЬС + ЛИНЗА

ПУЛЬС является владельцем общего минимального seam для правой панели и выбранного `unitId`. ЛИНЗА должна строить свои LIVE views как installer/adapters, принимающие предоставленные host/state/selection inputs, и не создавать второй selection mechanism.

Чтобы сохранять параллельность, ЛИНЗА может подготовить полностью работающие адаптеры и представления без изменения shell ownership. Финальный hook в общий right-panel seam допускается отдельным маленьким integration commit после принятия ПУЛЬСА.

### РЕДАКТОРЫ + КОНТЕКСТ

КОНТЕКСТ не открывает редакторы через случайные DOM-селекторы. Он должен маршрутизировать действия через существующий `GameEditorRegistry`/Combat Lab open request или другой утверждённый общий editor API. РЕДАКТОРЫ сохраняют этот API стабильным.

### КОНТЕКСТ + существующие tactical orders

Первый контракт ввода:

- secondary interaction **по сущности** может открыть entity context menu;
- secondary interaction **по пустой земле** сохраняет существующий quick move / radial tactical order сценарий;
- right-drag/facing и hold/radial order не должны исчезнуть;
- исполнитель обязан доказать arbitration тестами, а не полагаться только на порядок DOM listeners.

Если точная жестовая семантика требует уточнения, исполнитель выбирает минимальный вариант, который не ломает существующие команды, и явно описывает его в handoff.

## 7. Рекомендуемый порядок интеграции результатов

Параллельный старт:

```text
КАРТА
ПУЛЬС
РЕДАКТОРЫ
ЛИНЗА
КОНТЕКСТ
ПЕШКА
```

Рекомендуемый transfer order после независимого review:

```text
1. КАРТА
2. ПЕШКА
3. ПУЛЬС
4. ЛИНЗА (после seam ПУЛЬСА)
5. РЕДАКТОРЫ
6. КОНТЕКСТ (после проверки editor/open routes и input arbitration)
```

Это не жёсткая последовательность разработки; это порядок, уменьшающий число merge-конфликтов и позволяющий раньше получить цельную map→unit сцену.

## 8. Критерий завершения волны

Волна считается завершённой, когда пользователь может в новом shell:

1. видеть настоящую игровую карту вместо placeholder;
2. видеть настоящих бойцов в принятой системе знаков;
3. выбрать бойца и увидеть его реальные LIVE-данные;
4. изменить как минимум позу через штатный command path и увидеть readback;
5. открыть `Инфо`, `Внимание`, `Память` с честными реальными данными поддерживаемого объёма;
6. открыть существующие редакторы в новом дизайне и сохранить их реальные функции;
7. вызвать контекстное меню по сущности и перейти к связанным действиям/редакторам, не потеряв существующее управление правой кнопкой;
8. пройти TypeScript/build/focused smoke, а визуальные задачи — свежую browser/screenshot проверку exact SHA.

## 9. Prompt-файлы

- `prompts/01_MAP_SURFACE.md`
- `prompts/02_PULSE_LIVE_UNIT.md`
- `prompts/03_EDITORS_NEW_DESIGN.md`
- `prompts/04_LINZA_RIGHT_PANEL_LIVE.md`
- `prompts/05_ENTITY_CONTEXT_MENU.md`
- `prompts/06_UNIT_MAP_TOKEN.md`

Короткий запусковой handoff для оркестратора: `ORCHESTRATOR_HANDOFF_20260817.md`.
