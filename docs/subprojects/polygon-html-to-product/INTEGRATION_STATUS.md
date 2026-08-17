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

## ПЕШКА — текущий handoff новой волны

ПЕШКА выполнила реализацию нового unit token в отдельной ветке, но результат **не интегрирован и не принят пользователем**.

```text
branch: feature/20260817-polygon-unit-map-token-x
implementation_head: bdae5ea0a5e3d282370b1401429d194ec2787da7
PR: #286
status: PAUSED BY USER / NOT INTEGRATED
```

Основной результат: существующий `PixiUnitRenderer` развит без создания второго renderer. В него перенесены круг / скруглённый треугольник / вытянутый прямоугольник, три LOD и реальные presentation-сигналы aim/fire/wound/suppression/movement там, где их даёт текущий `UnitModel`.

Подробный отчёт:

`docs/subprojects/polygon-html-to-product/PESHKA_IMPLEMENTATION_HANDOFF.md`

На предыдущем exact HEAD `9678ca624140c7e7caf3ceddaea8b8b77ce7b161` `PR Risk CI` run #593 был зелёным, включая TypeScript, focused UI/editor contracts, новый `unit_map_token_smoke` и production build.

По отдельной команде пользователя была предпринята одна попытка Vercel Preview через repository exact-source fallback. Deployment `dpl_7gqX1zzGSGjuxmBAfWF3okrEikb5` не дошёл до `READY` и завершился `ERROR` внутри обязательного `verify:preview` из-за устаревшего Combat Lab smoke, ожидавшего скорость `4` при уже каноническом значении `5`. Stale test contract исправлен в feature-ветке; product behavior этим не менялся.

После исправления автоматически запущенный `PR Risk CI` run #594 прошёл TypeScript, но остановился в legacy `infantry-combat-stage8:verify`: широкий `git diff --check` нашёл исторические trailing whitespace в посторонних документах/прототипах, которых ПЕШКА не меняла. Эта проблема сейчас не исправляется.

Пользователь затем явно приказал остановить деплой. Активного Vercel deployment к этому моменту уже не было, второй deploy не создавался, готового Preview ПЕШКИ нет. До новой команды не выполнять deploy, transfer, merge, auto-merge или дополнительные исправления по этой ветке.
