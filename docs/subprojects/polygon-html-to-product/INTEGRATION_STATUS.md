# Перенос Полигона — текущий статус после интеграции

Дата: 2026-08-17

## Текущая продуктовая база

```text
repository: AndrewVerhoturov1/Real-wargame
branch: real-wargame-preview
current accepted baseline: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
```

Этот SHA уже содержит объединённые принятые результаты АРКИ, ПУЛЬСА, исправленной ЛИНЗЫ и ХРОНИСТА.

## Принятые результаты

| Направление | Принятый exact SHA | Статус | Что принято |
|---|---|---|---|
| АРКА | `0309b34d71d4bf4987c58a343576fbf79c185b44` | ACCEPT по пользовательской визуальной приёмке | Продуктовый shell Полигона, панели, вкладки, topbar и новый UI-каркас |
| ПУЛЬС | `aa7965ca06df12453466a5f03efc723318b94e44` | ACCEPT | Контракт `map selection → unitId → UnitModel → LIVE Unit → штатная команда → readback` |
| ЛИНЗА | `8040f5282b81d6465c02cc41b02ec024819ac575` | ACCEPT после ревизии | Контракт реальных owners `Инфо / Внимание / Память`; без LINZA-owned runtime/history/front |
| ХРОНИСТ | `9e2a7d819440ae82572134ff3caa690724f007d1` | ACCEPT | Контракт experiment identity, Program↔Journal, History, Metrics, Laboratory, Series, replay/persistence и Save/Open boundaries |

Общий integration PR #281 объединён в `real-wargame-preview` merge-коммитом:

`26e5f7f3681a4cf03e58ae7137cfe67387a1e015`

Перед transfer прошли `Preview Policy` и `Agent Docs Integrity`, включая проверку generated files/repository context.

## Решение пользователя по АРКЕ

Пользователь лично проверил финальный внешний результат АРКИ и подтвердил, что он его устраивает. Прежний Route X-блокер о недостаточной независимой pixel-perfect доказательности снят пользовательской приёмкой.

Это решение не означает, что центральная поверхность карты уже закончена: ARKA exact-shell намеренно скрывает живой canvas и показывает placeholder до отдельной задачи интеграции карты.

## Что реально уже реализовано

АРКА — реальная продуктовая оболочка нового Полигона.

В продукте также уже существуют настоящие механизмы, которые следующая волна обязана переиспользовать:

- `GameApplication` / `PixiTacticalBoardApp` / `PixiMapRenderer` — настоящая карта;
- `PixiUnitRenderer` — один текущий product owner отображения юнитов;
- `BoardInputController` + `TacticalOrderRadialInput` — map selection/input/tactical right-button gestures;
- `CombatLabGameEditors` + `GameEditorRegistry` — существующие общие редакторы;
- product owners/write paths, зафиксированные контрактами ПУЛЬСА и ЛИНЗЫ.

ПУЛЬС, ЛИНЗА и ХРОНИСТ, интегрированные ранее, в основном зафиксировали правильные контракты; полный UI/runtime объём их областей ещё не следует считать завершённым.

## Новый ближайший приоритет пользователя

Первый приоритет теперь — не Metrics/Series/replay, а сделать новый Полигон цельной игровой поверхностью.

Запускается параллельная волна из шести направлений:

1. **КАРТА** — настоящая поверхность map renderer внутри нового shell вместо placeholder; presentation ближе к принятому прототипу.
2. **ПУЛЬС** — настоящий `LIVE Unit`: selection → UnitModel → правый `Юнит` → posture command → readback.
3. **РЕДАКТОРЫ** — существующие продуктовые редакторы в новом shell/design без переписывания domain logic.
4. **ЛИНЗА** — `Инфо / Внимание / Память` LIVE по реальным owners.
5. **КОНТЕКСТ** — единое entity context menu в новом дизайне с сохранением существующих tactical right-button controls.
6. **ПЕШКА** — новая product-визуализация бойца по принятому `UNIT_SYMBOL_SYSTEM.md`, включая near/medium/far LOD.

Канонический coordination document:

`docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`

Подробные prompt-файлы:

```text
docs/subprojects/polygon-html-to-product/prompts/01_MAP_SURFACE.md
docs/subprojects/polygon-html-to-product/prompts/02_PULSE_LIVE_UNIT.md
docs/subprojects/polygon-html-to-product/prompts/03_EDITORS_NEW_DESIGN.md
docs/subprojects/polygon-html-to-product/prompts/04_LINZA_RIGHT_PANEL_LIVE.md
docs/subprojects/polygon-html-to-product/prompts/05_ENTITY_CONTEXT_MENU.md
docs/subprojects/polygon-html-to-product/prompts/06_UNIT_MAP_TOKEN.md
```

Handoff оркестратору:

`docs/subprojects/polygon-html-to-product/ORCHESTRATOR_HANDOFF_20260817.md`

## РЕДАКТОРЫ — результат текущей волны

Route X `XROUTE-20260817-POLYGON-EDITORS-NEW-DESIGN-001` реализовал shell integration существующей продуктовой системы редакторов.

```text
branch: feature/20260817-polygon-editors-new-design-x
implementation commit: 5739a5aedd31cb1bbe75e54fefb4216f80cc4afb
PR: #284
status: BLOCKED FOR ACCEPT — требуется browser/screenshot QA
```

Что уже сделано в коде:

- верхняя кнопка **«РЕДАКТОРЫ»** открывает реальный существующий каталог общих редакторов;
- используется прежний `GameEditorRegistry`, второй registry не создан;
- существующие `scene` (Редактор карты) и `parameters` (Unit/Parameters) hosts показываются внутри нового shell без копирования владельцев и состояния;
- embedded editors продолжают использовать существующий `CombatLabGameEditorOverlay` / `GameEditorWorkspace`;
- route editors сохраняют существующую навигацию;
- возврат `?tab=settings` снова открывает каталог редакторов;
- сохранён общий API открытия связанного редактора для будущей интеграции КОНТЕКСТА;
- добавлен presentation-слой редакторов под новый Polygon shell.

TypeScript и production build в CI прошли. Общий `PR Risk CI` красный из-за исторического `git diff --check` по pre-existing файлам вне diff РЕДАКТОРОВ; эти чужие файлы в Route X не исправлялись.

Не выполнена обязательная browser/screenshot проверка exact implementation SHA, поэтому visual ACCEPT не заявляется.

Подробный отчёт, список функций, проверки, ограничения и чек-лист последующей приёмки:

`docs/subprojects/polygon-html-to-product/EDITORS_IMPLEMENTATION_REPORT.md`

## Основные зависимости новой волны

```text
КАРТА + ПЕШКА + ПУЛЬС
→ настоящая карта + настоящий знак бойца + selection + Юнит LIVE

ПУЛЬС + ЛИНЗА
→ единая выбранная сущность + Юнит/Инфо/Внимание/Память

РЕДАКТОРЫ + КОНТЕКСТ
→ entity → authoritative editor/open route

КОНТЕКСТ + tactical input
→ entity menu без потери quick move/right-drag/radial orders
```

ПУЛЬС владеет минимальным generic right-panel/selection seam. ЛИНЗА не создаёт второй selection и может параллельно подготовить свои installer/views, подключив их к общему seam отдельным маленьким integration commit после принятия ПУЛЬСА.

## Что отложено, но не отменено

После этой волны остаются:

- Program↔Journal LIVE foundation;
- общий canonical HistoryProvider;
- Metrics/telemetry;
- Laboratory runtime;
- Series/run records;
- replay;
- Save/Open experiment envelope;
- полный Unit Editor authoring/LIVE decision, если он не будет полностью закрыт текущей редакторской волной.

Существующие старые feature-ветки по этим направлениям нужно сначала ревьюить, а не автоматически переписывать с нуля.

## Общие ограничения

- каждая новая кодовая задача стартует только после повторного получения exact current `real-wargame-preview` HEAD;
- отдельная feature-ветка на каждого исполнителя;
- не писать напрямую в `main`;
- transfer в preview — только после независимого review и отдельного GO пользователя;
- deployment — отдельное разрешение;
- не вводить второй gameplay truth/selection/map/runtime;
- не переносить mock/demo/localStorage architecture HTML в product;
- visual tasks проверять свежими screenshots exact SHA через repository screenshot skill;
- runtime/render/UI changes проверять по performance skill и `CI_RISK_BASED_ACCEPTANCE.md`.
