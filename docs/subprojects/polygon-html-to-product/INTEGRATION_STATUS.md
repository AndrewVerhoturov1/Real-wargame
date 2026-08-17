# Перенос Полигона — текущий статус после интеграции

Дата: 2026-08-17

## CHECKPOINT 2026-08-17 — перенос в preview перед сменой подхода

Пользователь решил сохранить текущий результат в `real-wargame-preview` как **технический checkpoint**, а дальнейшую реализацию продолжать уже по другому подходу.

Ключевой статус:

```text
product snapshot before checkpoint docs:
feature/20260817-polygon-editor-inner-parity
@ 0792cae6ba353c781847d3e2f7f588cdf7047329

target before transfer:
real-wargame-preview
@ 8292bf25bf241712901090fcb565dded939e7a08

user visual verdict:
NOT ACCEPTED AS FINAL DESIGN
```

Перенос в preview означает только сохранение уже сделанной инженерной работы и рабочих product contracts. Он **не означает**:

- визуальную приёмку текущей карты;
- визуальную приёмку Map Editor / Unit Editor / Global Editors;
- подтверждение pixel-perfect соответствия HTML-прототипу;
- утверждение текущих presentation adapters как окончательной архитектуры;
- требование следующему исполнителю продолжать ту же стратегию полировки.

Пользователь прямо указал, что текущий результат его пока не устраивает и подход будет изменён.

Каноническая запись checkpoint и правила следующего старта:

`docs/subprojects/polygon-html-to-product/CHECKPOINT_20260817_APPROACH_RESET.md`

Все секции ниже сохраняются как **история предыдущих решений и волн**. Если старая формулировка ниже выглядит более оптимистичной по визуальной готовности, верхний checkpoint имеет приоритет для текущего состояния.

## Текущая продуктовая база до checkpoint-transfer

```text
repository: AndrewVerhoturov1/Real-wargame
branch: real-wargame-preview
current pre-transfer HEAD: 8292bf25bf241712901090fcb565dded939e7a08
previous accepted baseline inside its history: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
```

SHA `26e5f7f...` уже содержит объединённые принятые результаты АРКИ, ПУЛЬСА, исправленной ЛИНЗЫ и ХРОНИСТА. Позднее preview был продвинут документирующей волной до `8292bf25...`. Текущий checkpoint будет перенесён поверх этой линии отдельным пользовательским GO.

## Принятые результаты предыдущего этапа

| Направление | Принятый exact SHA | Статус | Что принято |
|---|---|---|---|
| АРКА | `0309b34d71d4bf4987c58a343576fbf79c185b44` | ACCEPT по пользовательской визуальной приёмке предыдущего этапа | Продуктовый shell Полигона, панели, вкладки, topbar и новый UI-каркас |
| ПУЛЬС | `aa7965ca06df12453466a5f03efc723318b94e44` | ACCEPT | Контракт `map selection → unitId → UnitModel → LIVE Unit → штатная команда → readback` |
| ЛИНЗА | `8040f5282b81d6465c02cc41b02ec024819ac575` | ACCEPT после ревизии | Контракт реальных owners `Инфо / Внимание / Память`; без LINZA-owned runtime/history/front |
| ХРОНИСТ | `9e2a7d819440ae82572134ff3caa690724f007d1` | ACCEPT | Контракт experiment identity, Program↔Journal, History, Metrics, Laboratory, Series, replay/persistence и Save/Open boundaries |

Общий integration PR #281 объединён в `real-wargame-preview` merge-коммитом:

`26e5f7f3681a4cf03e58ae7137cfe67387a1e015`

Перед transfer прошли `Preview Policy` и `Agent Docs Integrity`, включая проверку generated files/repository context.

## Решение пользователя по АРКЕ предыдущего этапа

Пользователь лично проверил финальный внешний результат АРКИ и подтвердил, что он его устраивает на том этапе. Прежний Route X-блокер о недостаточной независимой pixel-perfect доказательности был снят пользовательской приёмкой.

Это историческое решение **не распространяется автоматически** на последующую six-X интеграцию и текущие редакторские presentation-слои. Для них действует новый checkpoint-статус выше: технически сохраняем, визуально финальным не считаем.

## Что реально уже реализовано

АРКА — реальная продуктовая оболочка нового Полигона.

В продукте также существуют настоящие механизмы, которые следующие итерации должны по возможности переиспользовать:

- `GameApplication` / `PixiTacticalBoardApp` / `PixiMapRenderer` — настоящая карта;
- `PixiUnitRenderer` — текущий product owner отображения юнитов;
- `BoardInputController` + `TacticalOrderRadialInput` — map selection/input/tactical right-button gestures;
- `CombatLabGameEditors` + `GameEditorRegistry` — существующие общие редакторы;
- product owners/write paths, зафиксированные контрактами ПУЛЬСА и ЛИНЗЫ.

Six-X integration и последующая parity-попытка дополнительно собрали live map, unit token/LOD, LIVE Unit, LINZA views, editor routes и entity context menu в одной ветке. Эти технические связи сохраняются checkpoint'ом, даже если presentation будет переделан.

## Предыдущий ближайший приоритет пользователя

На предыдущей итерации первым приоритетом было не Metrics/Series/replay, а сделать новый Полигон цельной игровой поверхностью.

Была запущена параллельная волна из шести направлений:

1. **КАРТА** — настоящая поверхность map renderer внутри нового shell вместо placeholder; presentation ближе к принятому прототипу.
2. **ПУЛЬС** — настоящий `LIVE Unit`: selection → UnitModel → правый `Юнит` → posture command → readback.
3. **РЕДАКТОРЫ** — существующие продуктовые редакторы в новом shell/design без переписывания domain logic.
4. **ЛИНЗА** — `Инфо / Внимание / Память` LIVE по реальным owners.
5. **КОНТЕКСТ** — единое entity context menu в новом дизайне с сохранением существующих tactical right-button controls.
6. **ПЕШКА** — новая product-визуализация бойца по принятому `UNIT_SYMBOL_SYSTEM.md`, включая near/medium/far LOD.

Канонический historical coordination document:

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

Historical handoff оркестратору:

`docs/subprojects/polygon-html-to-product/ORCHESTRATOR_HANDOFF_20260817.md`

## Основные зависимости предыдущей волны

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

ПУЛЬС владеет минимальным generic right-panel/selection seam. ЛИНЗА не создаёт второй selection. Этот invariant остаётся полезным независимо от нового визуального подхода.

## Что отложено, но не отменено

Остаются отдельные задачи:

- Program↔Journal LIVE foundation;
- общий canonical HistoryProvider;
- Metrics/telemetry;
- Laboratory runtime;
- Series/run records;
- replay;
- Save/Open experiment envelope;
- полный Unit Editor authoring/LIVE decision.

Checkpoint-transfer не объявляет эти области завершёнными.

## Общие ограничения следующей итерации

- каждая новая кодовая задача стартует только после повторного получения exact current `real-wargame-preview` HEAD;
- отдельная feature-ветка на каждого исполнителя;
- не писать напрямую в `main`;
- новый подход пользователя сначала зафиксировать, а не предполагать продолжение старого;
- не вводить второй gameplay truth/selection/map/runtime без явной архитектурной причины;
- не переносить mock/demo/localStorage architecture HTML в product;
- visual tasks проверять свежими screenshots exact SHA через repository screenshot skill;
- runtime/render/UI changes проверять по performance skill и `CI_RISK_BASED_ACCEPTANCE.md`.

## ПЕШКА — исторический handoff новой волны

ПЕШКА первоначально выполнила реализацию unit token в отдельной ветке. Этот блок ниже описывает состояние до общей six-X интеграции и сохранён только как история выполнения.

```text
branch: feature/20260817-polygon-unit-map-token-x
implementation_head: bdae5ea0a5e3d282370b1401429d194ec2787da7
PR: #286
historical status at that moment: PAUSED BY USER / NOT INTEGRATED
```

Впоследствии работа ПЕШКИ была включена в six-X integration lineage, которая входит в текущий checkpoint source.
