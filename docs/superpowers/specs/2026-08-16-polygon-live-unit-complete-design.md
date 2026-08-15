# Polygon LIVE Unit — Complete Slice Design

Дата: 2026-08-16

## Цель

Довести зону ПУЛЬСА от доказанного контракта до законченной LIVE-вкладки `Юнит` нового Полигона на настоящем `SimulationState` / `UnitModel`, без второго gameplay store, без optimistic runtime и без прямого изменения модели из UI.

База продукта: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a` (`real-wargame-preview`).

Интеграционный UI-источник: АРКА `59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc`, построенный от той же базы.

Контракт ПУЛЬСА: `aa7965ca06df12453466a5f03efc723318b94e44`.

## Рассмотренные подходы

### A. Переиспользовать `ProductionUnitEditor` в режиме `live`

Отклонено. Текущий live-adapter содержит прямой posture write и смешивает authoring с runtime. Это нарушает штатный `PostureTransition` и отказоустойчивость команды.

### B. Расширить старую нижнюю `simulation-unit-bar` и использовать её как новый Right Panel

Отклонено как основная архитектура. `UnitBarPresentation` полезен как доказанный источник части read-логики, но привязан к legacy DOM нижней панели и не покрывает принятую структуру `Приказ игрока / Действие сейчас / ранения / профили / posture command`.

### C. Отдельный read-only presentation adapter + тонкий Right Panel view

Принято.

- чистая функция преобразует настоящий `UnitModel` в presentation snapshot;
- DOM-view не хранит gameplay truth;
- selection берётся из `SimulationState`/`CombatLabSelectionController`;
- posture write идёт только через `CombatLabVisualSession.executeInteractive`;
- profile navigation идёт через существующий `CombatLabGameEditorLinks` / `GameEditorRegistry`;
- обновление вызывается из уже существующего frame/ticker lifecycle и дедуплицируется presentation key;
- HISTORY не подменяется LIVE-данными: до появления history provider режим остаётся отдельной зависимостью ХРОНИСТА.

## Архитектура

### 1. ARKA shell

Интеграционная ветка получает готовый shell АРКИ. `CombatLabWorkspaceTabs` расширяется только настолько, чтобы предоставить typed hosts правой панели (`unit/info/attention/memory`). Сам shell не становится владельцем данных.

### 2. `CombatLabLiveUnitPresentation`

Новый чистый модуль чтения.

Вход: `UnitModel`.

Выход: immutable `CombatLabLiveUnitSnapshotV1`:

- identity: unitId, label, side, type;
- capability/status;
- health, morale, suppression, fatigue;
- posture;
- player-order summary;
- current-action summary;
- weapon name, loaded/reserve ammo;
- weapon readiness: `ready | no_weapon | empty | reloading | deploying | undeploying | action_locked | incapable` с русской причиной;
- wounds/body summary;
- profile links;
- stable presentation key.

Модуль не мутирует `UnitModel` и не создаёт нового runtime.

### 3. Resolver `Действие сейчас`

Приоритет отображения задаётся явно, чтобы UI не показывал случайное поле из одной подсистемы:

1. погиб / без сознания;
2. смена позы;
3. первая помощь;
4. перезарядка;
5. передача боеприпасов;
6. развёртывание/сворачивание оружия;
7. активная огневая задача;
8. движение;
9. `behaviorRuntime.currentAction` как fallback.

Это presentation priority, а не gameplay arbitration.

### 4. Resolver `Готовность оружия`

Порядок:

1. нет `primaryWeapon` -> `no_weapon`;
2. боец не может пользоваться оружием -> `incapable`;
3. active reload -> `reloading`;
4. deployment action/mode -> `deploying` / `undeploying` / понятный deployed status;
5. нет патронов в оружии -> `empty`;
6. weapon-channel занят несовместимым physical action -> `action_locked`;
7. иначе `ready`.

UI выводит результат владельцев, но сам не решает допустимость будущей команды.

### 5. `CombatLabLiveUnitInspector`

Новый view-компонент монтируется в right-panel host `unit`.

Состояние UI:

- последняя presentation key только для дедупликации DOM-render;
- последняя `CombatLabCommandResultV1` только как результат пользовательского запроса;
- локальное раскрытие вторичных сведений принадлежит DOM/UI.

Gameplay state не копируется.

Поза:

- три кнопки `Стоя / Пригнувшись / Лёжа`;
- команда получает текущий `selectedUnitId`;
- вызывается `session.executeInteractive({kind:'posture', unitId, targetPosture})`;
- после вызова выполняется немедленный refresh;
- фактическая поза всегда читается из `UnitModel.behaviorRuntime.posture`;
- `accepted` никогда не рисует целевую позу оптимистично.

### 6. Связанные профили

`resolveCombatLabSelectedUnitProfileLinks(unit)` остаётся единственным адаптером unit -> authoritative profiles.

Ссылка dispatch-ит существующий `combat-lab:open-game-editor` с реальными `editorId/profileId`, `selectedUnitId` и `returnTo`. Selection не меняется при открытии overlay; после закрытия view снова читает тот же `SimulationState`.

### 7. Роль и архетип

LIVE-card не смешивает эти понятия:

- тактическая роль берётся из participant role текущего эксперимента, если выбранный `unitId` ей соответствует;
- архетип/профиль бойца берётся из `unit.soldier`/profile link;
- изменение роли или стартового архетипа не добавляется в LIVE card.

Authoring остаётся существующей experiment-draft областью; LIVE меняется только штатными runtime-командами.

### 8. HISTORY

В этой реализации не создаётся history provider. Контракт будущего режима:

`LIVE UnitModel read != historical unit snapshot at viewTime`.

Пока ХРОНИСТ не предоставит read-at-time owner, LIVE inspector не показывает текущий UnitModel как прошлое состояние.

## Ошибки и edge cases

- Нет selection: честное пустое состояние, controls disabled.
- `selectedUnitId` больше не разрешается: stale card очищается.
- Выбран unit вне experiment roles: LIVE identity/runtime можно читать из `SimulationState`; role label отсутствует, фальшивая participant role не создаётся.
- Posture rejected: показывается `reasonRu`, поза остаётся фактической.
- Пауза: accepted posture может оставаться в transition до продвижения simulation time.
- Reset/new run: inspector re-resolve-ит unit по текущему state; старый object reference не считается truth.
- Нет primary infantry weapon: не подставлять демонстрационное оружие в новом Right Panel.

## Проверки

Обязательные focused checks:

- pure presentation smoke: action priority, weapon readiness, wounds, identity;
- UI contract smoke: right-panel host, posture controls, no direct `behaviorRuntime.posture =`;
- integration smoke: selected unit read -> posture command -> accepted/rejected -> readback;
- profile-link continuity contract;
- существующие ARKA shell smokes;
- `npx tsc --noEmit`;
- `npm run build`.

## Границы

Не делать в этой задаче:

- fake HISTORY;
- новый selected-unit store;
- новый runtime/event bus;
- изменение health/morale/ammo прямым LIVE patch;
- новые игровые действия только потому, что соответствующая внутренняя команда существует;
- `Инфо / Внимание / Память` — это поток ЛИНЗЫ;
- перенос в `real-wargame-preview`, `main` или deployment без отдельного разрешения.
