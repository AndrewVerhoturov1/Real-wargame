# PULSE — контракт LIVE-юнита

## Статус и границы

Исполнитель: **ПУЛЬС** — связь нового интерфейса с живым юнитом симуляции.

Продуктовая база исследования:

- `base_branch`: `real-wargame-preview`;
- `base_commit`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- `feature_branch`: `feature/20260815-polygon-pulse-live-unit-contract`.

Цель ПУЛЬСА — зафиксировать настоящий сквозной путь:

```text
карта
→ настоящий unitId
→ SimulationState / UnitModel
→ правый «Юнит» LIVE
→ штатная команда смены позы
→ тот же UnitModel
→ readback
```

Новая реализация в этой ветке не создаётся. Документ фиксирует owners, read/write boundaries, planned scope, пробелы и следующую точку интеграции.

### Важное уточнение источника Right Panel

В `Q_HANDOFFS.md` обязательный документ указан по пути:

`docs/subprojects/polygon-html-to-product/ACCEPTED_RIGHT_PANEL_V1.md`.

Такого файла по этому пути нет. Однако канонический принятый документ существует на той же product base по правильному пути:

`docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`.

Он прочитан и использован при обязательной проверке полного planned scope. Это **ошибка пути в handoff, а не отсутствие принятого UX-контракта**.

Дополнительно учтён:

`docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`.

---

## 1. Короткий итог

На exact base уже есть правильная основа первого LIVE Unit vertical slice:

```text
BoardInputController.handlePointerUp
→ findUnitAtGridPosition(state.units, grid)
→ selectUnit(state, unit.id)
→ state.selectedUnitId
→ CombatLabSelectionController.syncFromState()
→ getSelectedUnit(state)
→ живой UnitModel
→ CombatLabVisualSession.executeInteractive({ kind: 'posture', ... })
→ executeCombatLabCommand(...)
→ requestPlayerPostureTransition(...)
→ simulation ticks
→ повторное чтение того же UnitModel
```

Главное правило: новый UI не хранит копию игрового состояния и не считает принятую команду уже завершившимся физическим действием.

Первоначальный контракт был корректен по этому сквозному пути, но **недостаточно полно охватывал planned scope вкладки `Юнит`**. После самопроверки полный принятый объём вкладки внесён ниже отдельной матрицей.

---

## 2. Владелец выбранного юнита

### Карта

`src/input/BoardInputController.ts` при клике по карте получает настоящий объект из `state.units` через `findUnitAtGridPosition(...)` и передаёт в `selectUnit(...)` его настоящий `unit.id`.

### Каноническая selection identity

`SimulationState` хранит:

- `selectedUnitId`;
- `selectedUnitIds`.

`getSelectedUnit(state)` разрешает выбранный ID обратно в объект из `state.units`.

Следовательно:

**владелец выбранного live-юнита — `SimulationState`, а не новый интерфейс Полигона.**

### Combat Lab selection bridge

`CombatLabSelectionController` уже синхронизирует выбор Combat Lab с `SimulationState`. Для participant текущего эксперимента связь разрешается через настоящий `unitId` роли.

Мост не является вторым gameplay-selection store.

Ограничение остаётся честным: если выбран настоящий юнит, которого нет среди `experiment.roles`, Combat Lab не должен создавать поддельную роль ради интерфейса.

---

## 3. Read-contract вкладки «Юнит» LIVE

Основной путь чтения:

```text
SimulationState
→ selectedUnitId
→ getSelectedUnit(state)
→ UnitModel
```

Вкладка должна при смене selection, после команды, на штатном цикле обновления и после reset/new run снова читать текущего владельца, а не считать ранее сохранённую JS-ссылку самостоятельной истиной.

### Основные владельцы данных

| Принятое поле / смысл | Product owner / read path | Готовность контракта |
|---|---|---|
| идентичность | `UnitModel.id`, `labels`, `side`, `type` | готово |
| главное состояние | `UnitModel.behaviorRuntime.state`, боевые capabilities из combat/infantry runtime | готово для чтения; UI-агрегация должна быть тонкой |
| здоровье | `UnitModel.soldier.condition.health` + combat/physiology runtime | готово |
| ранения | `UnitModel.infantryCombatRuntime.wounds` | готово |
| мораль | `UnitModel.soldier.condition.morale` | готово |
| подавление | `UnitModel.behaviorRuntime.suppression` и/или соответствующий infantry suppression runtime для подробностей | готово |
| усталость | `UnitModel.soldier.condition.fatigue`; расширенный physiology/fatigue runtime — только если нужен принятый уровень детализации | готово |
| поза | `UnitModel.behaviorRuntime.posture` | готово |
| текущий физический переход | `UnitModel.behaviorRuntime.physicalAction` | готово |
| приказ игрока | `UnitModel.playerCommand`; `UnitModel.order` не смешивать с ним без явной семантики | готово для базового чтения |
| действие сейчас | `behaviorRuntime.currentAction` + active physical/movement/infantry-combat runtime | **частично**: нужен единый presentation resolver/priority, если одновременно активны несколько runtime-подсистем |
| оружие | `UnitModel.infantryCombatRuntime.primaryWeapon` и его resolved definition; legacy `WeaponModel` не должен становиться вторым UI-owner | готово для основного combat runtime |
| боезапас | `primaryWeapon.roundsInWeapon` + `ammoInventory`; legacy fields использовать только как совместимость, не как новый SSOT | готово |
| готовность оружия | infantry combat weapon/action/deployment state и effective capabilities; упрощённый legacy `behaviorRuntime.weaponReady` недостаточен для полной карточки | **частично**: нужен единый presentation resolver готовности |
| тело/раны кратко | `infantryCombatRuntime.wounds.slots`, capabilities, physiology/medical runtime | готово для чтения |
| вторичные сведения | только подтверждённые поля `UnitModel`/runtime; сворачивание — UI-owned state | готово как принцип; точный набор определяется интеграционной задачей |
| связанные профили | `resolveCombatLabSelectedUnitProfileLinks(unit)` → `GameEditorRegistry` | готово |

### Что нельзя делать

Нельзя создавать:

```text
uiState.selectedUnit = copy(UnitModel)
```

и затем редактировать эту копию.

Допустимо хранить только чистое UI-state: активную вкладку, раскрытие вторичного блока, локальный hover/focus и подобное.

---

## 4. Разделение «Приказ игрока» и «Действие сейчас»

Принятый Right Panel требует показывать эти понятия отдельно.

### Приказ игрока

Главный кандидат владельца намерения игрока:

`UnitModel.playerCommand`.

`UnitModel.order` является более узким текущим order/runtime-механизмом и не должен автоматически подменять собой весь блок `Приказ игрока`.

### Действие сейчас

Фактическое действие может находиться в нескольких runtime-подсистемах:

- `behaviorRuntime.currentAction`;
- `behaviorRuntime.physicalAction`;
- `movementRuntime`;
- `infantryCombatRuntime.activeFireTask`;
- reload/deployment/transfer/first-aid action state внутри infantry combat runtime.

Поэтому для production UI нужен **тонкий read-only presentation resolver**, если одного `currentAction` недостаточно для понятного пользователю описания. Он не должен становиться новым gameplay owner и не должен менять runtime.

Статус этого пункта: **частично**.

---

## 5. Штатная смена позы

### Публичная граница для текущей visual session

Использовать:

`CombatLabVisualSession.executeInteractive(command)`.

Команда:

```text
{
  kind: 'posture',
  unitId: selectedUnitId,
  targetPosture: 'standing' | 'crouched' | 'prone'
}
```

Дальше существующий путь идёт через:

`executeCombatLabCommand(...) → requestPlayerPostureTransition(...)`.

Production сам проверяет ограничения, включая боеспособность, возможность встать и конфликт с физическими/оружейными действиями.

### Accepted не означает completed

`CombatLabCommandResultV1.accepted === true` означает, что запрос принят, а не что тело уже оказалось в новой позе.

Поза меняется во времени через simulation ticks.

Следовательно UI обязан:

1. отправить штатную команду;
2. показать `accepted/reasonRu` как результат запроса;
3. заново прочитать настоящий `UnitModel`;
4. продолжать показывать фактическую `behaviorRuntime.posture` и action state;
5. не ставить целевую позу локально оптимистично.

---

## 6. Старый live Unit Editor нельзя использовать как shortcut

`ProductionUnitEditor` имеет режим `live`, но существующий путь `GameEditorWorkbench` для `patch.posture` напрямую пишет в runtime-поля позы.

Для нового Полигона это недопустимо: такой shortcut обходит `PostureTransition`, временную длительность, ownership физического действия и штатные причины отказа.

Разрешение:

- читать полезные значения из настоящих владельцев;
- не переиспользовать direct-live write позы;
- позу менять только штатной командой.

Полная переделка старого Unit Editor не входит в текущую задачу ПУЛЬСА.

---

## 7. Связанные профили и GameEditorRegistry

`GameEditorRegistry` — каталог общих редакторов, а не хранилище UnitModel.

На exact base уже существует `resolveCombatLabSelectedUnitProfileLinks(unit)`, который может вернуть ссылки на реальные product profiles, в том числе:

- профиль маршрута;
- профиль движения;
- профиль внимания;
- архетип бойца;
- профиль восприятия;
- профиль состояния/ранений — когда соответствующие IDs присутствуют у юнита.

Открытие должно идти через существующий механизм общего редактора с настоящим `editorId/profileId`.

Interface Linkage v1 требует, чтобы это было ссылкой на authoritative source, а не копией профиля внутри правой панели.

После возврата к `Юнит` данные снова читаются из `SimulationState` / `UnitModel`; selection owner не меняется.

---

## 8. LIVE и authoring — разные режимы

Accepted HTML содержит более широкий замысел редактирования юнита, но продукт различает как минимум:

- стартовое описание участника эксперимента;
- живой runtime после запуска.

ПУЛЬС фиксирует только границу:

- Right Panel `Юнит` в LIVE читает runtime;
- единственное прямо принятое live-изменение в этой карточке, для которого сейчас доказан штатный путь, — смена позы;
- стартовые параметры нельзя менять через live runtime shortcut;
- полный Unit Editor остаётся отдельной product-задачей после решения `authoring / LIVE / два режима`.

---

## 9. Reset, удаление и stale references

После reset/new run интерфейс обязан заново разрешать selection и UnitModel из актуального `SimulationState`.

Если:

- `selectedUnitId === null`;
- выбранный ID больше не существует в `state.units`;
- текущий участник эксперимента больше не разрешается;

вкладка переходит в честное пустое/unsupported состояние. Последний показанный объект не остаётся LIVE-истиной только потому, что UI ещё держит ссылку.

---

## 10. HISTORY

Right Panel v1 требует, чтобы в историческом режиме Журнала карточка `Юнит` была read-only и показывала состояние на выбранный `viewTime`.

Это **часть общего planned scope прототипа**, но реализация history provider относится к зоне ХРОНИСТА.

ПУЛЬС должен сохранить семантическую границу для будущей интеграции:

```text
LIVE Unit read
!=
HISTORY Unit read-at-viewTime
```

Нельзя использовать текущий live `UnitModel` как будто это состояние прошлого момента.

Статус: **не твоя зона для foundation; зависимость ПУЛЬСА при подключении исторической карточки**.

---

# 11. Проверка полного planned scope

Эта проверка добавлена по обязательному требованию подпроекта: переносится не только минимальный первый срез, но и весь запланированный функциональный объём принятого HTML-прототипа, относящийся к зоне ПУЛЬСА.

Статусы ниже означают **готовность контракта/продуктовой основы**, а не наличие уже реализованного нового UI. В этой ветке product code не создаётся.

| Плановая функция прототипа в зоне ПУЛЬСА | Статус | Учтено теперь | Owner / зависимость / следующий шаг |
|---|---|---|---|
| выбор настоящего бойца на карте | **готово** | да | `BoardInputController` + `SimulationState` |
| единая identity выбранного бойца между картой и правой панелью | **готово** | да | `SimulationState.selectedUnitId`, `CombatLabSelectionController` |
| отсутствие второго `selectedUnit` store | **готово** | да | архитектурный инвариант первого среза |
| имя/ID/сторона/тип выбранного бойца | **готово** | да | `UnitModel` |
| боеспособность и главное состояние | **готово** | да | behavior + combat/infantry capabilities; UI только агрегирует для показа |
| здоровье | **готово** | да | `soldier.condition.health`, physiology/combat runtime |
| ранения | **готово** | да | `infantryCombatRuntime.wounds` |
| мораль | **готово** | да, в первой версии было недостаточно явно | `soldier.condition.morale` |
| подавление | **готово** | да | behavior/infantry suppression runtime |
| усталость | **готово** | да, в первой версии было недостаточно явно | `soldier.condition.fatigue` + physiology при необходимости |
| текущая поза | **готово** | да | `behaviorRuntime.posture` |
| переключение `стоя / пригнувшись / лёжа` | **готово** | да | `CombatLabVisualSession.executeInteractive` → posture command |
| readback после смены позы | **готово** | да | повторное чтение того же `UnitModel` после команды и simulation ticks |
| показать штатную причину отказа команды | **готово** | да | `CombatLabCommandResultV1.reasonRu/reasonCode` |
| `Приказ игрока` отдельным блоком | **готово** | да, теперь явно | `UnitModel.playerCommand`; не смешивать с текущим действием |
| `Действие сейчас` отдельным блоком | **частично** | да, ранее было слишком общо | runtime источники есть, но нужен единый read-only presentation resolver/priority |
| вооружение | **готово** | да, ранее было недостаточно явно | `infantryCombatRuntime.primaryWeapon.resolved` |
| боекомплект | **готово** | да, ранее было недостаточно явно | `roundsInWeapon` + `ammoInventory` |
| готовность оружия | **частично** | да, ранее не выделено | данные есть в weapon/action/deployment/capability runtime; нужен единый UI read resolver |
| краткая информация о теле/ранениях | **готово** | да, ранее не раскрыто | wound slots + capabilities + physiology/medical runtime |
| вторичные сведения в сворачиваемом блоке | **готово как UI/read boundary** | да | ARKA владеет collapse UI-state; ПУЛЬС допускает только подтверждённые runtime-поля |
| переход к связанным профилям | **готово** | да; исправлена прежняя чрезмерная осторожность | `resolveCombatLabSelectedUnitProfileLinks` + `GameEditorRegistry` |
| сохранить того же выбранного бойца при переходе к профилю и обратно | **частично** | да | существующие request/return links есть; интеграционный сценарий должен доказать continuity selection |
| роль бойца и архетип — независимые сущности | **частично / не полностью зона ПУЛЬСА** | зафиксировано | authoring-модель/Unit Editor; ПУЛЬС не должен смешивать их при read/link navigation |
| полный Unit Editor | **не твоя зона в этой задаче** | да | нужен отдельный product decision `authoring / LIVE / два режима` |
| изменение здоровья, морали, боезапаса, traits и loadout прямо из LIVE Right Panel | **не твоя зона / не принято как обязательный live-control Right Panel v1** | да | не выдумывать write-path; если станет требованием — отдельный owner/write-contract |
| fire/move/reload/deploy/transfer/first aid как существующие Combat Lab commands | **не твоя зона текущего Right Panel v1** | да | команды существуют, но не превращать наличие API в неутверждённые кнопки вкладки `Юнит` |
| read-only `Юнит` на историческом `viewTime` | **не твоя зона foundation / зависимость** | да | ХРОНИСТ должен дать history provider; ПУЛЬС затем маппит Unit presentation на historical snapshot |
| универсальная linked-entity система для всех сущностей Полигона | **не твоя зона** | да | общий navigation/resolver contract вне узкого Unit path |
| `Инфо / Внимание / Память` | **не твоя зона** | да | ЛИНЗА |

### Вывод самопроверки

Первая версия контракта **не была полной по planned scope**. Она хорошо закрывала доказательный путь selection → posture command → readback, но недостаточно явно учитывала полный принятый состав `Юнит`: мораль, усталость, вооружение, боезапас, готовность оружия, тело/раны, отдельные `Приказ игрока` и `Действие сейчас`, а также реальный linked-profile flow.

Эти пункты теперь зафиксированы без начала новой реализации.

---

## 12. Оставшиеся product gaps и зависимости

### G1 — единый read-only resolver «Действие сейчас»

Runtime-данные существуют, но фактическое действие может одновременно отражаться в behavior, physical action, movement и infantry-combat подсистемах.

Следующий кодовый исполнитель не должен собирать случайный набор `if` прямо в DOM. Нужен тонкий presentation adapter/resolver с явным приоритетом состояний.

Он не становится gameplay owner.

### G2 — единый read-only resolver «Готовность оружия»

Для полной принятой карточки простого boolean недостаточно: на готовность влияют наличие оружия/патронов, физическая возможность пользоваться оружием, текущая перезарядка, deployment/action locks и другие штатные состояния.

Нужен небольшой presentation contract поверх настоящих owners, без второго weapon state.

### G3 — continuity при открытии общего профиля

Механизм ссылок на profile/editor существует. Интеграционная задача должна доказать пользовательский сценарий:

```text
выбран боец A
→ открыть его authoritative profile
→ вернуться
→ правый «Юнит» по-прежнему относится к A, если gameplay selection не менялся
```

### G4 — полный Unit Editor

Блокируется отдельным product decision о том, что именно редактируется:

- стартовое состояние;
- LIVE runtime;
- два явно разделённых режима.

ПУЛЬС не должен решать это скрыто внутри Right Panel.

### G5 — historical Unit

Нужен history/read-at-time provider от ХРОНИСТА. До него `viewTime` нельзя имитировать чтением текущего `UnitModel`.

### G6 — handoff path cleanup

`Q_HANDOFFS.md` указывает accepted Right Panel по неверному подпроекту. Для будущих исполнителей оркестратору следует исправить ссылку на:

`docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`.

ПУЛЬС не меняет `Q_HANDOFFS.md`, потому что текущая задача разрешает изменять только этот контракт.

---

## 13. Следующая точка интеграции

`АРКА + ПУЛЬС → первый настоящий LIVE Unit`.

Интеграционная задача должна строиться не как минимальная демо-карточка из двух полей, а как **первый production slice с дорогой к полному planned Unit scope**.

Минимальная доказательная приёмка остаётся:

```text
выбрать A на карте
→ справа настоящий A
→ изменить позу штатной командой
→ получить accepted/rejected
→ увидеть реальный переход и readback
→ выбрать B
→ справа B
→ reset/new run
→ stale A/B не остаётся источником данных
```

Но план реализации вкладки должен сразу учитывать полный read-scope из раздела 11 и не закладывать архитектуру, которая потом помешает добавить здоровье, мораль, усталость, ранения, оружие, боезапас, готовность, приказ/действие и linked profiles.

После первого среза рекомендуемая очередь внутри `Юнит`:

```text
1. identity + posture + command result/readback
2. health/morale/suppression/fatigue + combat capability
3. weapon/ammo + weapon readiness resolver
4. wounds/body summary
5. player order vs current action resolver
6. linked authoritative profiles + return continuity
7. HISTORY Unit после history-provider ХРОНИСТА
```

---

## 14. Проверенные источники

Документация:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`.

Код exact base `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`:

- `src/input/BoardInputController.ts`;
- `src/core/simulation/SimulationState.ts`;
- `src/core/simulation/SimulationStateLegacy.ts`;
- `src/core/units/UnitModel.ts`;
- `src/core/behavior/BehaviorModel.ts`;
- `src/core/combat/CombatDamage.ts`;
- `src/core/combat/WeaponModel.ts`;
- `src/core/infantry-combat/runtime/InfantryCombatRuntimeTypes.ts`;
- `src/core/infantry-combat/runtime/InfantryBodyTypes.ts`;
- `src/combat-lab/selection/CombatLabSelectionController.ts`;
- `src/combat-lab/CombatLabWorkspaceServices.ts`;
- `src/combat-lab/CombatLabExtension.ts`;
- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- `src/core/testing/combat-lab/CombatLabContracts.ts`;
- `src/core/testing/combat-lab/CombatLabCommands.ts`;
- `src/core/actions/PostureTransition.ts`;
- `src/combat-lab/game-editors/CombatLabGameEditorLinks.ts`;
- `src/game-editors/GameEditorRegistry.ts`;
- `src/ui/ProductionUnitEditor.ts`;
- `src/ui/GameEditorWorkbench.ts`;
- `scripts/posture_transition_smoke.ts`.

## Итог

ПУЛЬС подтверждает: первый LIVE Unit может быть подключён без нового runtime, без нового selection store и без прямого изменения `UnitModel` из UI.

После самопроверки контракт также фиксирует **полный planned scope вкладки `Юнит`**, а не только минимальную смену позы. Не закрытые части теперь обозначены как конкретные product gaps или зависимости, а не потеряны из плана.