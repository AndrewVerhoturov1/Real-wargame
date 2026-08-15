# ПУЛЬС — отчёт реализации полного LIVE Unit scope

Дата: 2026-08-16.

## Идентичность работы

```text
executor_name: ПУЛЬС
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260816-polygon-live-unit-complete
arka_source_commit: 59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc
pulse_contract_commit: aa7965ca06df12453466a5f03efc723318b94e44
implementation_code_commit: 6eeaa85f7da0f10106865215cef25c62b40554aa
```

Эта ветка создана от точного `real-wargame-preview` и не изменяет `real-wargame-preview`, `main` или deployment.

## Что реализовано

### 1. Новый Right Panel `Юнит` читает настоящий live unit

Подключение идёт через существующий `SimulationState`:

```text
штатная карта
→ SimulationState.selectedUnitId
→ getSelectedUnit(state)
→ CombatLabLiveUnitPresentation
→ CombatLabLiveUnitInspector
```

Новый UI не хранит `UnitModel` как собственную gameplay-истину и не создаёт второй selected-unit store. На каждом refresh выбранный объект заново разрешается через `getSelectedUnit(state)`.

### 2. Полный принятый LIVE read-scope вкладки `Юнит`

`CombatLabLiveUnitPresentation.ts` сводит для показа только настоящие данные владельцев продукта:

- identity: `unitId`, имя, сторона, тип;
- participant role текущего experiment draft отдельно от архетипа;
- боеспособность;
- здоровье;
- мораль;
- подавление;
- усталость;
- стресс как вторичное поле;
- текущая поза;
- приказ игрока отдельным блоком;
- действие сейчас отдельным блоком;
- оружие;
- патроны в оружии и резерв;
- готовность оружия с причиной;
- ранения по зонам, тяжесть и кровотечение;
- потеря крови;
- средства первой помощи;
- authoritative profile links.

При отсутствии `infantryCombatRuntime.primaryWeapon` новый инспектор показывает `Нет оружия`. Legacy `getWeaponRuntime()` здесь не вызывается, поэтому synthetic/default Mosin не создаётся ради UI.

### 3. `Действие сейчас` доведено из `частично` до реализованного presentation contract

Добавлен единый read-only resolver с приоритетом:

```text
погиб / без сознания
→ смена позы
→ первая помощь
→ перезарядка
→ передача боеприпасов
→ deploy / undeploy
→ огневая задача
→ движение
→ behaviorRuntime.currentAction fallback
```

Это только presentation priority. Он не становится gameplay arbitration и ничего не пишет в runtime.

### 4. `Готовность оружия` доведена из `частично` до реализованного presentation contract

Новый resolver различает:

- `ready`;
- `no_weapon`;
- `empty`;
- `reloading`;
- `deploying`;
- `undeploying`;
- `engaged`;
- `action_locked`;
- `incapable`.

Результат строится из `primaryWeapon`, ammo inventory, deployment/action state, physical-action channel и effective combat capabilities. Второго weapon state нет.

### 5. Штатная смена позы и readback

Кнопки `Стоя / Пригнувшись / Лёжа` используют только:

```text
CombatLabVisualSession.executeInteractive({
  kind: 'posture',
  unitId: selectedUnitId,
  targetPosture
})
```

После запроса UI показывает `CombatLabCommandResultV1.reasonRu`, но активная поза остаётся значением из повторно прочитанного `UnitModel.behaviorRuntime.posture`.

Прямого `behaviorRuntime.posture = ...` в новом инспекторе нет.

### 6. Связанные профили

Переиспользован существующий authoritative путь:

```text
resolveCombatLabSelectedUnitProfileLinks(unit)
→ requestCombatLabGameEditorOpen(...)
→ CombatLabGameEditors
→ GameEditorRegistry / настоящий editor
```

Ссылка несёт настоящий `editorId/profileId` и `selectedUnitId`. Сам переход в редактор не вызывает `selectUnit` и поэтому не создаёт отдельную selection identity.

### 7. Роль и архетип не смешиваются

- роль участника берётся из текущего `services.draft.get().roles` по `unitId`;
- архетип берётся из `unit.soldier.archetypeId` / behavior profile;
- они показываются как разные понятия;
- LIVE-инспектор не меняет стартовую роль или archetype прямой runtime-записью.

### 8. Lifecycle и reset/new run

Инспектор подключён к уже существующим:

- `GameApplicationContext.addTickerListener`;
- `CombatLabSelectionController.subscribe`;
- `CombatLabWorkspaceDraftPortV1.subscribe`.

Он не создаёт новый timer/event bus. На каждом refresh используется текущий `SimulationState`, поэтому старая ссылка на `UnitModel` после reset/new run не является источником истины.

При destroy все три подписки снимаются до уничтожения основного `CombatLabExtension`.

## Проверка полного planned scope после реализации

Статусы ниже относятся к зоне ПУЛЬСА и новой LIVE-вкладке, а не к соседним вкладкам ЛИНЗЫ или инфраструктуре ХРОНИСТА.

| Плановая функция | Статус после реализации | Реализация / owner |
|---|---|---|
| выбор настоящего бойца на карте | **готово** | существующий `BoardInputController` / `SimulationState` |
| одна identity карты и Right Panel | **готово** | `selectedUnitId` + `getSelectedUnit` |
| отсутствие второго selection store | **готово** | inspector хранит только presentation key и command result |
| identity / сторона / тип | **готово** | `UnitModel` |
| role отдельно от archetype | **готово** | experiment draft role + `soldier.archetypeId` |
| боеспособность | **готово** | effective combat capabilities + wounds |
| здоровье | **готово** | `soldier.condition.health` |
| ранения / тело | **готово** | `infantryCombatRuntime.wounds` |
| мораль | **готово** | `soldier.condition.morale` |
| подавление | **готово** | `behaviorRuntime.suppression` |
| усталость | **готово** | physiology fatigue runtime |
| текущая поза | **готово** | `behaviorRuntime.posture` |
| смена позы | **готово** | `CombatLabVisualSession.executeInteractive` |
| rejection reason | **готово** | `CombatLabCommandResultV1` |
| readback после команды | **готово по коду/контракту** | повторный `getSelectedUnit`; executable smoke подготовлен |
| `Приказ игрока` отдельно | **готово** | `UnitModel.playerCommand` |
| `Действие сейчас` отдельно | **готово** | новый read-only action resolver |
| вооружение | **готово** | `infantryCombatRuntime.primaryWeapon.resolved` |
| боекомплект | **готово** | `roundsInWeapon` + ammo inventory reserve |
| готовность оружия | **готово** | новый read-only readiness resolver |
| вторичные сведения / collapse | **готово** | `<details>` — UI-owned state |
| authoritative profile links | **готово** | existing GameEditorLinks + GameEditorRegistry path |
| continuity selection при открытии editor | **готово по контракту** | editor event path не мутирует selection; визуальная проверка ещё требуется |
| произвольное редактирование health/morale/ammo/loadout в LIVE | **не является принятым Right Panel write-scope** | не добавлялось |
| полный Unit Editor | **отдельная product-задача** | не смешивается с LIVE inspector |
| HISTORY `Юнит` на `viewTime` | **зависимость / не закрыто этой веткой** | нужен history provider ХРОНИСТА |
| `Инфо / Внимание / Память` | **не зона ПУЛЬСА** | ЛИНЗА |

## Добавленные проверки

Созданы:

- `scripts/combat_lab_live_unit_presentation_smoke.ts`;
- `scripts/combat_lab_live_unit_presentation_smoke.mjs`;
- `scripts/combat_lab_live_unit_ui_contract_smoke.mjs`;
- `scripts/combat_lab_live_unit_verify.mjs`.

`combat_lab_live_unit_verify.mjs` собирает intended verification chain:

```text
LIVE Unit presentation smoke
→ LIVE Unit UI contract smoke
→ ARKA Polygon shell contract smoke
→ production posture transition smoke
```

Presentation smoke использует настоящий `CombatLabVisualSession`, настоящий built-in rifle scenario и штатную posture command. Он отдельно проверяет, что accepted request не подменяет effective posture до simulation ticks.

## Что проверено в текущей remote-only среде

Проверено через GitHub connector:

- exact `real-wargame-preview` base;
- отдельная feature-ветка;
- ARKA source SHA;
- PULSE contract SHA;
- owners/types для UnitModel, wounds, physiology, ammo inventory, deployment, physical-action coordinator, player command и game-editor link path;
- base → implementation diff;
- новый inspector не содержит прямой записи `behaviorRuntime.posture = ...`;
- новый bootstrap использует существующий ticker/selection/draft lifecycle;
- GitHub combined status на implementation code commit: external statuses отсутствуют;
- GitHub Actions runs на implementation code commit: отсутствуют.

## Что не удалось исполнить здесь

В текущей среде нет локального checkout репозитория, а прямой `git`/HTTP доступ контейнера к GitHub блокируется DNS. GitHub connector даёт чтение/запись репозитория, но не исполняет Node/npm-команды.

Поэтому **не объявляются выполненными**:

```text
node scripts/combat_lab_live_unit_verify.mjs
npx tsc --noEmit
npm run build
browser / visual QA
```

Это обязательный verification gate перед переносом ветки в `real-wargame-preview`.

## Оставшийся внешний blocker

Единственный planned функциональный кусок карточки `Юнит`, который нельзя честно завершить внутри ПУЛЬСА без нового product foundation:

```text
HISTORY / read-only Unit at viewTime
```

Нужен ХРОНИСТ: history provider должен выдавать исторический snapshot бойца на выбранный `viewTime`. До него запрещено показывать текущий live `UnitModel` как прошлое состояние.

## Следующая точка

После успешного выполнения executable verification chain:

```text
АРКА + ПУЛЬС → LIVE Unit acceptance
```

Затем:

```text
ЛИНЗА → Инфо / Внимание / Память
ХРОНИСТ → HISTORY provider
ПУЛЬС + ХРОНИСТ → read-only historical Unit
```

`preview_touched: no`

`main_touched: no`

`deployment_touched: no`
