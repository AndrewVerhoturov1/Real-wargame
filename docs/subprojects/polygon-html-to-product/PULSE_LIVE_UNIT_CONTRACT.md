# PULSE — контракт LIVE-юнита

## Статус и границы

Исполнитель: **ПУЛЬС** — связь нового интерфейса с живым юнитом симуляции.

Этот документ фиксирует только первый настоящий вертикальный путь Полигона:

```text
карта
→ настоящий unitId
→ SimulationState / UnitModel
→ вкладка «Юнит» LIVE
→ штатная команда смены позы
→ повторное чтение того же UnitModel
```

Контракт исследован по продуктовой базе:

- `base_branch`: `real-wargame-preview`;
- `base_commit`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- рабочая ветка: `feature/20260815-polygon-pulse-live-unit-contract`.

Документационный handoff прочитан из `feature/20260815-polygon-execution-map` (`078423776a890547533c0519b60417c39a9eda69`), потому что `Q_HANDOFFS.md` ещё не находится в указанном выше product base.

### Не входит в этот контракт

- полный Unit Editor;
- редактирование стартового описания участника эксперимента;
- новый runtime;
- новый selection store;
- локальная копия `UnitModel` в UI;
- прямое изменение `UnitModel` из новой вкладки;
- HISTORY;
- универсальный resolver всех связанных сущностей.

---

## 1. Короткий итог

На точной базе уже существует достаточный продуктовый путь для первого LIVE-среза.

```text
BoardInputController.handlePointerUp
→ findUnitAtGridPosition(state.units, grid)
→ selectUnit(state, unit.id)
→ state.selectedUnitId
→ CombatLabSelectionController.syncFromState()
→ participant { roleId, unitId }
→ getSelectedUnit(state)
→ тот же UnitModel из state.units
→ session.executeInteractive({ kind: 'posture', unitId, targetPosture })
→ executeCombatLabCommand(...)
→ requestPlayerPostureTransition(...)
→ simulation ticks
→ повторное getSelectedUnit(state)
→ behaviorRuntime.posture / physicalAction
```

Главное правило: **UI никогда не считает успешно принятую команду уже совершившимся изменением позы**. Смена позы в продукте временная. После команды панель обязана заново прочитать живой `UnitModel` и показывать фактическое состояние владельца.

---

## 2. Владелец selection и настоящий `unitId`

### 2.1. Выбор на карте

Файл:

`src/input/BoardInputController.ts`

В обычном режиме карты `handlePointerUp`:

1. переводит координату указателя в координату сетки;
2. вызывает `findUnitAtGridPosition(this.state.units, grid)`;
3. при попадании в бойца вызывает `selectUnit(this.state, unit.id)`;
4. при снятии выбора вызывает `selectUnit(this.state, null)`.

То есть карта уже получает **настоящий `UnitModel` из `SimulationState.units`**, а идентичность выбора — это его настоящий `unit.id`.

Никакого преобразования через название, роль UI или demo-ID здесь нет.

### 2.2. Каноническая запись selection

Файлы:

- `src/core/simulation/SimulationState.ts`;
- `src/core/simulation/SimulationStateLegacy.ts`.

Публичный фасад `SimulationState.ts` экспортирует штатные `getSelectedUnit`, `getSelectedUnits` и прочие функции selection из существующей реализации.

`selectUnit(state, unitId)` устанавливает:

```text
state.selectedUnitId = unitId
state.selectedUnitIds = unitId ? [unitId] : []
```

`getSelectedUnit(state)` возвращает:

```text
state.units.find(unit => unit.id === state.selectedUnitId)
```

**Владелец выбранного live-юнита — `SimulationState`, а не новый интерфейс.**

### 2.3. Мост Combat Lab

Файлы:

- `src/combat-lab/selection/CombatLabSelectionController.ts`;
- `src/combat-lab/CombatLabWorkspaceServices.ts`;
- `src/combat-lab/CombatLabExtension.ts`.

`CombatLabExtension` уже синхронизирует мост на существующем тикере:

```text
context.addTickerListener(
  () => workspaceServices.selection.syncFromState()
)
```

`CombatLabSelectionController.syncFromState()` читает `state.selectedUnitId`. Для участника `CombatLabWorkspaceServices` разрешает `unitId` обратно в роль текущего эксперимента через:

```text
draft.getExperiment().roles.find(role => role.unitId === unitId)
```

и публикует:

```text
{ kind: 'participant', roleId, unitId }
```

При выборе участника со стороны Combat Lab обратный путь также штатный: `CombatLabSelectionController.select(...)` вызывает `selectUnit(state, selection.unitId)`.

Таким образом, мост двунаправленный и не является вторым gameplay-selection store.

### Ограничение моста

Если в `state.selectedUnitId` находится настоящий юнит, которого нет среди `experiment.roles`, `resolveParticipantByUnitId` возвращает `null`, и selection Combat Lab становится `none`.

Для первого среза это допустимо: вкладка `Юнит` относится к участнику текущего эксперимента. Реализация не должна создавать локальную роль или поддельную связь. Если UX должен инспектировать произвольные юниты вне `experiment.roles`, это отдельное расширение product contract.

---

## 3. Контракт чтения вкладки «Юнит» LIVE

### 3.1. Источник

Источник истины:

```text
SimulationState
→ state.selectedUnitId
→ getSelectedUnit(state)
→ UnitModel
```

Файл модели:

`src/core/units/UnitModel.ts`

Для узкого первого среза достаточно подтвердить минимум:

| UI | Источник |
|---|---|
| `unitId` | `UnitModel.id` |
| имя | `UnitModel.labels.ru` |
| сторона | `UnitModel.side` |
| тип | `UnitModel.type` |
| текущая поза | `UnitModel.behaviorRuntime.posture` |
| текущий физический переход | `UnitModel.behaviorRuntime.physicalAction` |
| подавление | `UnitModel.behaviorRuntime.suppression` |
| стресс | `UnitModel.behaviorRuntime.stress` |
| состояние бойца | `UnitModel.soldier.condition` |
| текущий приказ | `UnitModel.order` / `UnitModel.playerCommand` — показывать раздельно только если UI действительно различает эти понятия |
| боевой runtime | `UnitModel.infantryCombatRuntime` |

Этот документ **не утверждает полный набор полей принятого Right Panel**, потому что обязательный источник `docs/subprojects/polygon-html-to-product/ACCEPTED_RIGHT_PANEL_V1.md`, названный в `Q_HANDOFFS.md`, не найден ни в точной product base, ни в доступной документационной ветке `0784237...`. Нельзя восстанавливать отсутствующие поля по памяти или по HTML.

### 3.2. Запрещённая схема

Нельзя делать:

```text
map click
→ copy UnitModel into new uiState.selectedUnit
→ UI edits copy
→ later sync back
```

Допустимо хранить только UI-owned состояние — например, активную вкладку или раскрытие секции. Доменные значения читаются заново из настоящего `UnitModel`.

### 3.3. Механизм обновления

На точной базе нет отдельного общего события вида `UnitModelChanged` с полной ревизией каждого runtime-поля.

Уже есть подходящий жизненный цикл:

- selection синхронизируется через `context.addTickerListener(...)`;
- Combat Lab получает кадры через существующий visual/session цикл;
- `UnitModel` мутируется симуляцией in-place;
- после reset/new run `CombatLabVisualSession` сохраняет объект `SimulationState` стабильным, но заменяет его содержимое и увеличивает `stateRevision`.

Поэтому первый LIVE Unit должен:

1. на смене selection заново получить выбранный юнит;
2. при отрисовке/штатном тике читать поля из текущего `UnitModel`;
3. после команды немедленно выполнить readback;
4. на последующих simulation ticks продолжать readback до фактического состояния;
5. после reset/new run снова разрешить выбранный `unitId`, а не держать старую ссылку как самостоятельный источник истины.

Это **не** означает создание нового store. Это только повторное чтение владельца.

---

## 4. Штатная команда смены позы

### 4.1. Публичный для Combat Lab путь

Файл:

`src/combat-lab/runtime/CombatLabVisualSession.ts`

Для интерактивного действия уже существует:

`CombatLabVisualSession.executeInteractive(command)`.

Он:

1. помечает текущий прогон как interactive;
2. увеличивает штатную последовательность команд;
3. вызывает `executeCombatLabCommand(this.state, command, context)`;
4. сохраняет `lastCommandResult`;
5. пишет результат в существующий журнал сессии.

Поэтому вкладка `Юнит` первого среза должна использовать существующую session-boundary:

```text
session.executeInteractive({
  kind: 'posture',
  unitId: selectedUnitId,
  targetPosture
})
```

где `targetPosture` — существующий `UnitPosture`:

- `standing`;
- `crouched`;
- `prone`.

Новая вкладка не должна сама придумывать `ownerId`, `commandSequence` или обходить `CombatLabVisualSession`, если работает внутри текущей visual session.

### 4.2. Внутренний product path

Файлы:

- `src/core/testing/combat-lab/CombatLabContracts.ts`;
- `src/core/testing/combat-lab/CombatLabCommands.ts`;
- `src/core/actions/PostureTransition.ts`.

Команда уже типизирована:

```text
{ kind: 'posture'; unitId: string; targetPosture: UnitPosture }
```

`executeCombatLabCommand(...)`:

1. находит юнит по `unitId` в `state.units`;
2. при отсутствии возвращает `combat_lab_unit_missing`;
3. вызывает `requestPlayerPostureTransition(unit, targetPosture, now, context.ownerId)`;
4. нормализует production result в `CombatLabCommandResultV1`.

`requestPlayerPostureTransition(...)` проверяет реальные ограничения продукта, включая:

- блокировку позы развёрнутым оружием;
- жив/в сознании ли боец;
- может ли боец встать.

То есть UI не должен повторять эти правила и не должен решать сам, допустима ли поза.

### 4.3. Результат команды — не результат физического перехода

`CombatLabCommandResultV1` содержит:

```text
accepted
reasonCode
reasonRu
ownerToken
```

`accepted: true` означает, что production-система **приняла запрос**, а не что `behaviorRuntime.posture` уже равен `targetPosture`.

Это подтверждается `scripts/posture_transition_smoke.ts`: например, после запроса `standing → crouched` текущая поза остаётся `standing` до завершения временного перехода; лишь после simulation tick на нужную длительность она становится `crouched`.

Следовательно, optimistic UI вида «нажал Лёжа → немедленно локально показать `prone`» запрещён.

---

## 5. Readback: как доказать, что изменился тот же живой юнит

### Обязательная последовательность

```text
1. selectedUnitId = state.selectedUnitId
2. before = getSelectedUnit(state)
3. проверить before?.id === selectedUnitId
4. result = session.executeInteractive({ kind:'posture', unitId:selectedUnitId, targetPosture })
5. не менять UI-модель позы вручную
6. afterRequest = getSelectedUnit(state)
7. показать result.accepted/reasonRu как результат запроса
8. показать afterRequest.behaviorRuntime.posture как фактическую текущую позу
9. если physicalAction.status === 'running', показать состояние перехода только из runtime, без собственного таймера истины
10. после штатных simulation ticks снова получить getSelectedUnit(state)
11. завершение подтверждено только когда живой UnitModel отражает фактическую позу/terminal action state
```

### Инварианты

- `before` и readback разрешаются через один `SimulationState`;
- идентичность подтверждается `UnitModel.id === selectedUnitId`;
- кнопка не меняет `behaviorRuntime.posture`;
- `accepted` не подменяет фактическое runtime-состояние;
- отказ команды оставляет панель на данных владельца и показывает `reasonRu`;
- после reset/new run старый объект не считается живым только потому, что UI ещё держит ссылку;
- уничтоженный или отсутствующий `unitId` должен привести вкладку к состоянию «нет выбранного живого юнита», а не к stale-карточке.

---

## 6. Почему нельзя переиспользовать live-write старого ProductionUnitEditor для позы

Файлы:

- `src/ui/ProductionUnitEditor.ts`;
- `src/ui/GameEditorWorkbench.ts`.

`ProductionUnitEditorAdapterV1` действительно имеет режим `live`, а `GameEditorWorkbench` умеет читать `snapshotFromLiveUnit(selected)`.

Но существующий `applyProductionPatchToLiveUnit(...)` для `patch.posture` делает прямую запись:

```text
unit.behaviorRuntime.posture = patch.posture
unit.behaviorRuntime.previousPosture = patch.posture
```

Это несовместимо с новым контрактом Полигона, потому что обходит временный `PostureTransition`, ownership физического действия и production rejection semantics.

**Решение для первого среза:**

- чтение полезных полей из `UnitModel` можно повторно использовать как ориентир;
- live-write позы из `GameEditorWorkbench` / `ProductionUnitEditor` **не использовать**;
- изменение позы — только через `CombatLabVisualSession.executeInteractive(...)` и штатную posture command.

Полное исправление/переосмысление старого live Unit Editor не является задачей ПУЛЬС и не должно попасть в первый vertical slice.

---

## 7. `GameEditorRegistry`: его роль и граница

Файл:

`src/game-editors/GameEditorRegistry.ts`.

`GameEditorRegistry` является каталогом зарегистрированных общих редакторов и их activation policy по surfaces. Он **не владеет live-состоянием выбранного бойца** и не должен становиться промежуточным хранилищем UnitModel.

Для будущей ссылки из вкладки `Юнит` на authoritative profile/editor допустим путь через уже зарегистрированный shared editor, но:

- ссылка должна нести настоящий product entity/profile id;
- открытие редактора не меняет владельца selection;
- возвращение к вкладке снова читает `SimulationState` / `UnitModel`;
- профильный редактор не заменяет posture command и не превращает первый срез в полный Unit Editor.

Точный linked-profile UX должен сверяться с отсутствующим сейчас `ACCEPTED_RIGHT_PANEL_V1.md`; поэтому в этом документе он не объявляется частью обязательного минимального среза.

---

## 8. Read/write boundary первого среза

| Операция | Разрешённый путь | Запрещено |
|---|---|---|
| выбрать бойца на карте | `BoardInputController → findUnitAtGridPosition → selectUnit` | отдельный `selectedUnit` store |
| получить `unitId` | `SimulationState.selectedUnitId` / participant selection bridge | имя, индекс массива, demo role id вместо unitId |
| получить живой юнит | `getSelectedUnit(state)` / `state.units` по тому же id | копия UnitModel как источник истины |
| показать LIVE-поля | читать текущий `UnitModel` | вычислять/подменять значения в UI |
| запросить позу | `CombatLabVisualSession.executeInteractive({kind:'posture', ...})` | `unit.behaviorRuntime.posture = ...` |
| решить, разрешена ли поза | production `requestPlayerPostureTransition` | дублировать правила в UI |
| показать результат запроса | `CombatLabCommandResultV1` | считать `accepted` завершением перехода |
| подтвердить фактическую позу | повторное чтение `UnitModel.behaviorRuntime.posture` и action state | optimistic локальное значение |
| reset/new run | заново разрешить selection и UnitModel из текущего state | продолжать показывать старую ссылку |

---

## 9. Ошибки и крайние случаи

### Нет выбранного юнита

`state.selectedUnitId === null` или `getSelectedUnit(state) === undefined`:

- вкладка показывает пустое честное состояние;
- posture controls недоступны;
- никакой последний UnitModel не остаётся видимым как LIVE.

### Юнит выбран, но не является participant текущего эксперимента

- `SimulationState` всё ещё содержит настоящий `unitId`;
- Combat Lab selection bridge может дать `kind: 'none'`;
- не создавать фальшивую роль;
- для первого среза показывать/управлять только подтверждённым participant flow либо явно считать такой selection неподдержанным.

### Команда отклонена

- показать `reasonRu` из `CombatLabCommandResultV1`;
- не менять отображаемую позу вручную;
- заново прочитать UnitModel.

### Переход идёт

- `accepted` может быть `true`, а текущая поза ещё старая;
- состояние перехода брать из `behaviorRuntime.physicalAction`;
- продолжать читать runtime на simulation ticks.

### Прогон на паузе

Команда может быть принята, но физический переход не завершится без продвижения simulation time. UI не должен запускать собственный таймер, чтобы «доделать» позу.

### Reset/new run

`CombatLabVisualSession` заменяет содержимое стабильного `SimulationState` in-place и увеличивает свою ревизию. После reset необходимо reconciliate selection и заново получить live unit; старая JS-ссылка на UnitModel не является гарантией актуальности.

---

## 10. Что подтверждено и что пока не поддержано

### Подтверждено на exact base

- карта выбирает настоящий `UnitModel.id`;
- `SimulationState.selectedUnitId` — каноническая selection identity;
- `CombatLabSelectionController` синхронизируется с этой identity в обе стороны;
- `getSelectedUnit(state)` возвращает настоящий live `UnitModel`;
- posture command типизирована в `CombatLabScriptCommandV1`;
- `CombatLabVisualSession.executeInteractive(...)` — готовая интерактивная session-boundary;
- posture write идёт в production `requestPlayerPostureTransition`;
- transition имеет настоящие отказы и временную длительность;
- readback должен читать тот же UnitModel, а не UI-копию;
- старый `ProductionUnitEditor` direct-live posture write непригоден для нового пути.

### Не утверждается этим контрактом

- полный список полей Right Panel v1;
- редактирование здоровья, морали, suppression, traits, loadout и других полей из новой вкладки;
- единая семантика полного Unit Editor (`authoring / LIVE / два режима`);
- произвольный inspection unit вне `experiment.roles` через Combat Lab selection;
- HISTORY/read-at-time;
- общий typed linked-entity resolver;
- изменение shared profile через правую панель.

---

## 11. Блокеры и пробелы

### B1 — отсутствует обязательный accepted source

`Q_HANDOFFS.md` требует `docs/subprojects/polygon-html-to-product/ACCEPTED_RIGHT_PANEL_V1.md`, но файл не найден:

- в product base `1246e1d...`;
- в документационной ветке/коммите handoff `0784237...`;
- через поиск доступного репозитория.

Это **не блокирует узкий** путь selection → UnitModel → posture command → readback, потому что он подтверждён кодом и `MIGRATION_SYNTHESIS`/`WORK_PLAN`/`EXECUTION_STREAMS`.

Это блокирует заявление, что здесь зафиксирован полный field contract вкладки `Юнит` и точный linked-profile UX.

### B2 — старый live Unit Editor имеет неподходящий write-path

`GameEditorWorkbench` напрямую меняет live posture. Это не блокирует новый срез, если новый Right Panel не переиспользует этот write-path. Исправление старого полного редактора — отдельная задача после продуктового решения о режимах Unit Editor.

### B3 — нет отдельного общего UnitModel change event

Для первого среза достаточно существующего tick/render цикла и повторного чтения владельца. Если позднее потребуется реактивная подписка без кадрового reread, её надо проектировать как тонкий product adapter, а не как новый store.

---

## 12. Точная точка интеграции с АРКА

Следующая задача:

`АРКА + ПУЛЬС → первый настоящий LIVE Unit`.

Минимальный интеграционный сценарий:

```text
1. АРКА предоставляет контейнер правой вкладки «Юнит» и только UI-owned состояние оболочки.
2. ПУЛЬС подключает существующий CombatLabWorkspaceServices.selection / SimulationState.
3. Клик по настоящему бойцу на штатной карте приводит к state.selectedUnitId = unit.id.
4. Вкладка разрешает тот же UnitModel через getSelectedUnit(state).
5. Вкладка показывает минимум identity + текущую posture из UnitModel.
6. Нажатие «Стоя / Пригнувшись / Лёжа» вызывает session.executeInteractive(posture command).
7. UI показывает command result, но позу берёт только из readback UnitModel.
8. После simulation ticks фактическое изменение posture появляется без локальной UI-мутации.
9. Выбор другого бойца, снятие selection и reset/new run не оставляют stale UnitModel.
```

### Acceptance первого интеграционного среза

```text
выбрать A на карте
→ справа unitId A и фактическая поза A
→ запросить другую позу
→ увидеть accepted/rejected от production command
→ если accepted, увидеть реальный переход, а не мгновенную подмену
→ после simulation ticks справа фактическая новая поза A
→ выбрать B
→ справа данные B
→ reset/new run
→ старая ссылка A/B не остаётся источником LIVE-данных
```

Если для реализации этого сценария потребуется новый gameplay store или прямой `UnitModel` write из UI, интеграцию надо остановить: это будет нарушение контракта, а не допустимое упрощение.

---

## 13. Источники, проверенные для контракта

Документация:

- `AGENTS.md`;
- `docs/orchestration/ORCHESTRATION_PROTOCOL.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md` — из `078423776a890547533c0519b60417c39a9eda69`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md` — из того же документационного контекста;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md` — из того же документационного контекста;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md` — из того же документационного контекста.

Код exact base `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`:

- `src/input/BoardInputController.ts`;
- `src/core/simulation/SimulationState.ts`;
- `src/core/simulation/SimulationStateLegacy.ts`;
- `src/core/units/UnitModel.ts`;
- `src/combat-lab/selection/CombatLabSelectionController.ts`;
- `src/combat-lab/CombatLabWorkspaceServices.ts`;
- `src/combat-lab/CombatLabExtension.ts`;
- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- `src/core/testing/combat-lab/CombatLabContracts.ts`;
- `src/core/testing/combat-lab/CombatLabCommands.ts`;
- `src/core/actions/PostureTransition.ts`;
- `scripts/posture_transition_smoke.ts`;
- `src/ui/ProductionUnitEditor.ts`;
- `src/ui/GameEditorWorkbench.ts`;
- `src/game-editors/GameEditorRegistry.ts`.

## Итог

Первый LIVE Unit **не требует нового runtime, нового selection store или прямого редактирования модели**. На exact base уже есть правильный сквозной каркас:

```text
штатная карта
→ SimulationState selection
→ настоящий UnitModel
→ read-only LIVE view
→ CombatLabVisualSession.executeInteractive(posture)
→ production PostureTransition
→ readback того же UnitModel
```

Главный интеграционный запрет: не использовать прямой live posture write старого `ProductionUnitEditor` как shortcut.