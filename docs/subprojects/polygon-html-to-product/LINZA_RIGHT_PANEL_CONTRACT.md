# LINZA — контракт реальных данных правой панели

## 0. Роль, база и результат

Роль: **ЛИНЗА** — реальные product-данные для вкладок `Инфо`, `Внимание`, `Память` нового Полигона.

Рабочая ветка:

`feature/20260815-polygon-linza-right-panel-contract`

Точная продуктовая база, от которой начато исследование и реализация:

`real-wargame-preview@1246e1d612e648e7d7378db1c02be3bbf3d2a16a`

Главное требование подпроекта трактуется буквально: переносится не только внешний интерфейс принятого HTML, но и весь его плановый функциональный объём. Поэтому прежние статусы `частично` и `отсутствует` в зоне ЛИНЗЫ были превращены в задачи реализации, а не оставлены как причины урезать новый Полигон.

После реализации в этой ветке product-основа для planned scope ЛИНЗЫ закрыта:

- `Инфо` имеет единый read-contract над настоящей картой, рельефом, материалами, объектами и юнитами;
- `Внимание` имеет единый read-contract и штатную command-boundary для профиля, режима, auto и search sector;
- `Память` имеет единую субъективную read-проекцию пяти принятых типов знаний;
- `Intel / полученные сведения` представлены настоящими `reported`-контактами существующей perception-системы, без второго Intel-store;
- `Front` теперь является отдельной субъективной производной только от знаний бойца и никогда не строится по скрытому объективному списку противника;
- время получения сведений отделено от технического времени decay/update;
- HISTORY знаний записывается на simulation boundary и читается строго на момент `<= viewTime`, без утечки будущего.

UI-каркас, оформление, фильтры, pin-взаимодействие, слои Pixi и визуальное поведение оверлеев остаются ответственностью оболочки/renderer и не являются владельцами игровой истины.

### Входной handoff

Указанный в первоначальной задаче файл

`docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`

не был найден на проверенной продуктовой базе, в координаторской ветке подпроекта и поиском по репозиторию в ходе первоначального исследования. Поэтому его содержание не восстанавливалось по догадке.

Для полного planned scope использованы:

- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_VISION.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- исследовательский `PRODUCT_OWNER_MAP.md`;
- исходники продукта на точной базе `1246e1d...`.

---

## 1. Неподвижные архитектурные правила

1. Правая панель не является simulation SSOT.
2. UI может владеть только состоянием представления: активной вкладкой, pin точки, фильтрами, переключателями отображения, выбранной записью для подсветки и подобными чисто интерфейсными значениями.
3. Карта, юниты, attention, perception и tactical knowledge остаются у существующих product owners.
4. Новый UI не рассчитывает LOS, visibility, обнаружение, decay памяти или тактические угрозы.
5. `Память` не может читать объективный список противника и выдавать его за знания бойца.
6. `Front` строится только из субъективных сведений конкретного бойца.
7. Изменение `Внимания` проходит через product-owned функции attention subsystem, а не через присваивание внутренних полей из UI.
8. HISTORY не читает текущую LIVE-память при просмотре прошлого.
9. Нет отдельного параллельного `Intel store`: полученные сведения остаются частью perception/knowledge pipeline с явным provenance `reported`.
10. Если субъективных сведений недостаточно для Front, корректный результат — `null`, а не выдуманная линия.

---

## 2. Что реализовано в product code

### 2.1. `src/core/map/MapInfoReadModel.ts`

Новый read-only product contract для `Инфо`:

`buildMapInfoReadModel(state, point, options)`.

Он возвращает:

- исходную мировую/grid-точку;
- cell X/Y и человекочитаемую координату;
- smooth height;
- физический уклон как grade и degrees;
- направление вниз по склону;
- surface material;
- passability;
- physical cost;
- surface resistance;
- vegetation material;
- movement resistance растительности;
- tactical concealment;
- target/local concealment;
- fire protection per meter и maximum fire protection;
- итоговое сопротивление движению как существующее произведение surface × vegetation resistance;
- реальные map objects рядом;
- реальные cover/concealment properties этих объектов;
- реальные юниты рядом с расстоянием.

Уклон не вычисляется новой UI-формулой: используется существующий подготовленный terrain owner `DirectionalTerrainStaticGrid.slopeMagnitude/downhillX/downhillY`, который сам построен на физической высоте рельефа.

Объекты ищутся через существующую геометрию `circleIntersectsMapObject()`, включая повёрнутые объекты.

`nearbyRadiusCells` явно является display-query параметром и не меняет gameplay.

Важно: `MapInfoReadModel` **не сворачивает** маскировку и защиту в один придуманный рейтинг. Он публикует настоящие физические составляющие, чтобы UI мог честно показать разные свойства, как требует accepted Right Panel.

### 2.2. `src/core/perception/AttentionReadModel.ts`

Новый read-only contract полного `Внимания`:

`buildAttentionReadModel(state, unit)`.

Он публикует:

- реальный `unitId` и world position;
- текущий mode и mode source;
- applied profile и список настоящих профилей;
- фактическое focus direction;
- focus target;
- search center/arc;
- maximum visual range;
- начало и степень falloff;
- зоны `focus / direct / peripheral / rear`;
- угол каждой зоны;
- weight каждой зоны;
- check interval;
- sample duration;
- maximum range зоны;
- реальные perception contacts;
- stage/source/confidence/uncertainty;
- explanation;
- revision key для узкого обновления renderer.

Для текущего видимого контакта, который действительно связан с реальным юнитом, `displayPosition` может использовать фактический центр этого юнита. Для невидимого/старого контакта остаётся `lastKnownPosition`; скрытая объективная позиция не протекает в UI.

Read-model не импортирует и не вызывает LOS/visibility calculation.

### 2.3. `src/core/perception/AttentionCommands.ts`

Добавлена отдельная product-owned command-boundary для новой панели:

- `applyUnitAttentionProfile()`;
- `applyUnitAttentionMode()`;
- `applyUnitAttentionSearchSector()`.

Она делегирует в уже существующие владельцы:

- `applyAttentionProfileToUnit()`;
- `setAttentionMode()`;
- `setSearchSector()`;
- `clearAttentionOverride()`;
- `AttentionProfileRegistry`.

Таким образом новый UI больше не должен копировать legacy-путь прямой мутации `attentionSettings/attentionRuntime`.

### 2.4. `src/core/knowledge/UnitMemoryReadModel.ts`

Добавлена единая субъективная проекция памяти:

`buildUnitMemoryReadModel(state, unitId, options)`.

Она нормализует настоящие perception/tactical knowledge в пять типов, принятых HTML-прототипом:

1. `confirmed_contact` — известный/подтверждённый текущий контакт;
2. `last_known` — прошлый контакт / последнее известное положение;
3. `supposition` — слабый признак, подозрение, звук, fire-pressure/неизвестный источник;
4. `intelligence` — полученные/доложенные сведения с provenance `reported`;
5. `estimated_front` — субъективная линия/полоса фронта.

Общая запись содержит:

- стабильный id знания;
- тип;
- label;
- geometry;
- confidence;
- uncertainty;
- source;
- sourceUnitId, если он действительно известен модели;
- момент получения информации;
- момент последнего подтверждения, если применимо;
- age;
- current/stale;
- explanation;
- evidence IDs.

Поддержанные geometry:

- точка;
- точка + uncertainty circle;
- area;
- directional area;
- front band.

`perceptionKnowledge` и `tacticalKnowledge` не копируются в новый игровой store. Read-model только сводит их для интерфейса и сохраняет различия происхождения.

### 2.5. Intel / полученные сведения

Первоначальная самопроверка ошибочно трактовала Intel как обязательный отдельный отсутствующий store.

Точная проверка runtime показала, что perception subsystem уже имеет настоящий доменный тип:

`PerceptionContactSource = 'reported'`.

`PerceptionSystem` уже создаёт такие контакты для `knownSource` и прямо описывает их как положение, известное по сценарию или докладу, но не подтверждённое визуально.

Поэтому правильная архитектура — **не создавать второй Intel-owner**, а дать существующим `reported`-контактам явное представление `intelligence` в `UnitMemoryReadModel`.

Любой будущий product-механизм передачи доклада должен писать в тот же perception/knowledge contract, а правая панель автоматически увидит его как `intelligence`.

### 2.6. `src/core/knowledge/EstimatedFront.ts`

Добавлен субъективный estimator Front.

Вход функции — только:

`SubjectiveFrontEvidence[]`.

В нём нет `SimulationState`, нет `state.units` и нет API объективных вражеских юнитов.

Алгоритм:

- принимает только знания с достаточной confidence;
- требует минимум два независимых пространственных свидетельства;
- строит confidence-weighted центр;
- оценивает основную ось распределения субъективных сведений;
- возвращает segment front;
- строит half-width полосы из uncertainty и поперечного разброса;
- публикует confidence;
- сохраняет IDs сведений, на которых основан вывод.

Если доказательств недостаточно или геометрия вырожденная, возвращается `null`.

Следовательно Front теперь является **оценкой знаний бойца**, а не скрытой объективной картой боя.

### 2.7. `src/core/knowledge/UnitKnowledgeHistory.ts`

Добавлен product history provider именно субъективных знаний.

Он хранится в runtime через `WeakMap<SimulationState, ...>` и:

- делает snapshot `perceptionKnowledge`;
- делает snapshot `tacticalKnowledge`;
- хранит отдельный information clock для контактов;
- делает deep copy записей, чтобы будущие LIVE-изменения не меняли прошлое;
- записывает snapshot только при изменении знаний/времени получения информации;
- предоставляет `readUnitKnowledgeAt(state, unitId, viewTimeSeconds)`;
- выбирает только snapshot, где `recordedAtSeconds <= viewTime`;
- сбрасывает runtime history при откате simulation time назад;
- имеет явный clear API.

Это является LINZA-границей для `Память HISTORY`.

### 2.8. Семантика возраста знания

Существующий `PerceptionContact.lastUpdatedSeconds` нельзя использовать как «возраст сведений»: decay обновляет это поле даже когда боец не получил никакой новой информации.

Чтобы не ломать фундаментальный `PerceptionContactMemory`, отдельный information clock ведётся в `UnitKnowledgeHistory`.

Для visual contact момент новой информации определяется реальным `lastObservedSeconds`.

Для non-visual информации clock обновляется только если действительно произошло новое получение сведений, например:

- появился новый report/sound/fire-pressure contact;
- изменился источник/stimulus;
- изменилась сообщённая позиция;
- выросли evidence/confidence;
- уменьшилась uncertainty.

Обычный decay confidence или рост uncertainty **не омолаживает сведения**.

Именно этот clock используется `UnitMemoryReadModel.ageSeconds`.

### 2.9. `src/core/simulation/SimulationTick.ts`

History подключён к настоящей simulation boundary.

Каждый tick теперь фиксирует subjective knowledge:

1. **до** legacy simulation tick — чтобы существовала точная t=0/pre-step картина, включая scenario knowledge;
2. **после** legacy tick — после того как perception и SoldierThreatMemory обновили знания для нового simulation time.

Это не UI history и не повторный расчёт восприятия.

---

## 3. Полная карта planned scope после реализации

| Planned функция HTML | Product owner / контракт после реализации | Статус ЛИНЗЫ |
|---|---|---|
| `Инфо`: координата/ячейка | `MapInfoReadModel` + `MapModel` | **готово** |
| `Инфо`: высота | `MapInfoReadModel` + `SmoothTerrain` | **готово** |
| `Инфо`: уклон | `MapInfoReadModel` + `DirectionalTerrainStaticGrid` | **готово** |
| `Инфо`: поверхность/растительность | environment profile | **готово** |
| `Инфо`: проходимость/движение | surface + vegetation movement properties | **готово** |
| `Инфо`: маскировка отдельно | реальные vegetation/object concealment properties | **готово** |
| `Инфо`: защита отдельно | реальные vegetation fire + object cover properties | **готово** |
| `Инфо`: объекты рядом | `MapInfoReadModel` + `MapObjectGeometry` | **готово** |
| `Инфо`: юниты рядом | `MapInfoReadModel` + `SimulationState.units` | **готово** |
| `Инфо`: клик юнита → настоящий selection | существующий `CombatLabSelectionController` / `SimulationState.selectUnit` | **готово** |
| Pin точки через context menu | чистое UI-state + существующий map context-menu shell | **не зона ЛИНЗЫ; product data dependency отсутствует** |
| `Внимание`: текущий profile/mode/source | `AttentionReadModel` | **готово** |
| `Внимание`: профиль можно выбрать | `AttentionCommands` + registry | **готово** |
| `Внимание`: Марш/Наблюдение/Поиск/Бой | `AttentionCommands` → `AttentionController` | **готово** |
| `Внимание`: вернуть Auto | `clearAttentionOverride` через command-boundary | **готово** |
| `Внимание`: search sector | `applyUnitAttentionSearchSector` | **готово** |
| `Внимание`: focus/direct/peripheral/rear infographic data | `AttentionReadModel` | **готово** |
| `Внимание`: angles/weights/check intervals/sample duration | `AttentionReadModel` | **готово** |
| `Внимание`: max range/falloff/rear max range | `AttentionReadModel` | **готово** |
| `Внимание`: реальные perception contacts | `AttentionReadModel` | **готово** |
| `Внимание`: видимый реальный unit marker в фактическом центре | `displayPosition/linkedUnitId`, только для реально видимого contact | **готово** |
| `Внимание`: last/suspicion/sound | perception contacts | **готово** |
| `Внимание`: confidence/context/uncertainty | perception contacts | **готово** |
| Prepared visibility/LOS | существующая visibility subsystem | **готово; UI только рисует** |
| World-bound overlay, smooth geometry, fixed screen-size markers, layer order | renderer/АРКА | **не зона ЛИНЗЫ** |
| `Память`: confirmed/current | `UnitMemoryReadModel` | **готово** |
| `Память`: last-known | `UnitMemoryReadModel` | **готово** |
| `Память`: supposition | `UnitMemoryReadModel` поверх cue/suspicion/sound/fire-pressure | **готово** |
| `Память`: intelligence/received | `reported` perception → `intelligence` | **готово** |
| `Память`: estimated Front | `EstimatedFront` поверх subjective knowledge | **готово** |
| `Память`: point geometry | `UnitMemoryReadModel` | **готово** |
| `Память`: uncertainty circle | `UnitMemoryReadModel` | **готово** |
| `Память`: area/directional area | tactical knowledge projection | **готово** |
| `Память`: front line/band | `EstimatedFront` → front-band | **готово** |
| `Память`: time of information | `UnitKnowledgeHistory` information clock | **готово** |
| `Память`: age | `UnitMemoryReadModel.ageSeconds` | **готово** |
| `Память`: confidence/source | read-model preserves product provenance | **готово** |
| `Память`: HISTORY на `viewTime` | `UnitKnowledgeHistory.readUnitKnowledgeAt` | **готово для runtime history** |
| HISTORY без будущих знаний | snapshot `<= viewTime`, deep copy | **готово** |
| Фильтр `Тип` | чистое UI-state над `knowledgeType` | **не зона ЛИНЗЫ; данные готовы** |
| Фильтр `Актуальность / Бессрочно` | чистое UI-state над `ageSeconds` | **не зона ЛИНЗЫ; данные готовы** |
| `Метки / Время / Названия / Источники` | чистое UI-state над read-model | **не зона ЛИНЗЫ; данные готовы** |
| Клик записи → подсветка geometry | UI selection над `entry.id/geometry` | **не зона ЛИНЗЫ; данные готовы** |
| Приглушение карты | renderer/АРКА | **не зона ЛИНЗЫ** |
| World-bound memory markers | renderer/АРКА получает geometry | **не зона ЛИНЗЫ; contract готов** |
| LOS/visibility calculation в UI | perception/visibility owner | **запрещено и не требуется** |
| Запись/редактирование памяти из UI | simulation/perception owner | **запрещено и не требуется** |

Итог: в planned scope `Инфо / Внимание / Память` больше нет product capability со статусом `частично` или `отсутствует` внутри зоны ЛИНЗЫ. Оставшиеся пункты являются либо чистым UI/render поведением АРКИ, либо межподсистемной зависимостью, указанной ниже.

---

## 4. Точные владельцы и границы

### `Инфо`

Data owner:

- `TacticalMap`;
- terrain subsystem;
- environment material profile;
- `MapObject` geometry/properties;
- `SimulationState.units`.

Read boundary:

`MapInfoReadModel`.

Write boundary:

нет; `Инфо` read-only. Pin — UI-state.

### `Внимание`

Data owner:

- `UnitModel.attentionSettings`;
- `UnitModel.attentionRuntime`;
- perception subsystem;
- attention profile registry.

Read boundary:

`AttentionReadModel`.

Write boundary:

`AttentionCommands` → существующие attention subsystem functions.

Запрещено:

- прямое UI-присваивание `attentionSettings`;
- прямое UI-пересоздание `attentionRuntime`;
- UI LOS.

### `Память`

Data owner:

- `UnitPerceptionKnowledge`;
- `UnitTacticalKnowledge`;
- `SoldierThreatMemory`/perception pipeline.

Read boundary:

`UnitMemoryReadModel`.

History owner для этого read contract:

`UnitKnowledgeHistory`.

Derived subjective Front owner:

`EstimatedFront`.

Запрещено:

- брать objective hostile unit list и превращать в память;
- создавать записи памяти из UI;
- называть pressure zone линией фронта без knowledge derivation;
- при HISTORY читать текущую LIVE-память вместо snapshot.

---

## 5. Runtime flow

### LIVE `Инфо`

```text
map point
  ↓
MapInfoReadModel
  ├─ MapModel
  ├─ SmoothTerrain / DirectionalTerrainStaticGrid
  ├─ EnvironmentMaterialProfile
  ├─ MapObjectGeometry / cover properties
  └─ SimulationState.units
  ↓
right panel / renderer
```

### LIVE `Внимание`

```text
real selected unitId
  ↓
UnitModel
  ↓
AttentionReadModel
  ├─ attention settings/runtime
  └─ perception contacts
  ↓
right panel / renderer
```

Команда пользователя:

```text
right panel
  ↓
AttentionCommands
  ↓
AttentionController / AttentionProfiles
  ↓
real UnitModel runtime
  ↓
readback через AttentionReadModel
```

### LIVE `Память`

```text
simulation
  ├─ perceptionKnowledge
  └─ tacticalKnowledge
       ↓
UnitMemoryReadModel
  ├─ confirmed
  ├─ last-known
  ├─ supposition
  ├─ intelligence(reported)
  └─ EstimatedFront(subjective evidence only)
       ↓
right panel / map overlay
```

### HISTORY `Память`

```text
simulation tick
  ↓
UnitKnowledgeHistory snapshots
  ↓
viewTime
  ↓
readUnitKnowledgeAt(snapshot <= viewTime)
  ↓
UnitMemoryReadModel(mode=history)
  ↓
read-only right panel / map overlay
```

---

## 6. Проверка безопасности знания

### Нет objective-enemy leakage

`EstimatedFront` принимает только `SubjectiveFrontEvidence[]` и принципиально не получает `SimulationState`.

`UnitMemoryReadModel` не вызывает `areUnitsHostile()` и не сканирует объективных противников для построения памяти.

Единственное использование `state.units` в `AttentionReadModel` относится к текущему **реально видимому** contact и нужно для принятого требования привязать marker к фактическому центру уже видимого знака. Для невидимого/старого контакта используется только `lastKnownPosition`.

### Нет UI LOS

Новые LINZA read/command contracts не импортируют `evaluatePointVisibility` и не строят `VisibilityGeometryField`.

Prepared visibility остаётся у существующей simulation/visibility subsystem.

### Нет второго SSOT

`MapInfoReadModel`, `AttentionReadModel` и `UnitMemoryReadModel` — проекции на чтение, а не новые игровые хранилища.

`UnitKnowledgeHistory` хранит исторические immutable snapshots, а не альтернативное LIVE-состояние.

---

## 7. HISTORY и зависимость от ХРОНИСТА

LINZA теперь предоставляет корректное историческое чтение субъективных знаний **внутри runtime, для которого накоплены knowledge snapshots**.

Для общего Полигона остаётся межподсистемная зависимость от ХРОНИСТА:

- кто устанавливает глобальный `viewTime`;
- как Журнал переключает LIVE/HISTORY;
- как исторический unitId сопоставляется с тем же experiment/run;
- как долговременно сохраняется/восстанавливается история при открытии ранее сохранённого прогона;
- как replay/persistence связывает эту историю с canonical run identity.

Это не недостающая LINZA-модель Памяти: её read/history contract уже существует. Это общий lifecycle/persistence/replay owner Полигона.

До подключения ХРОНИСТА новый UI может использовать LIVE и HISTORY текущего накопленного runtime, но не должен придумывать persisted replay самостоятельно.

---

## 8. Зависимости для интеграции

### ПУЛЬС

Нужен один и тот же настоящий selected `unitId`/`UnitModel` для:

- `Внимание`;
- `Память`;
- перехода `Инфо → Юнит`.

LINZA не создаёт второй selection store.

### АРКА

Должна подключить read/command contracts и реализовать только presentation/UI-owned функции:

- вкладки;
- pin точки через context menu;
- фильтры;
- toggles;
- списки;
- selection/highlight записей;
- world-bound geometry;
- map dimming для Памяти;
- smooth attention overlay;
- fixed screen-size markers;
- правильный layer order;
- переход из найденного юнита в `Юнит`.

АРКА не должна повторять расчёты ЛИНЗЫ или simulation.

### ХРОНИСТ

Подключает глобальный `viewTime`, run identity, replay/persistence и выбор исторического состояния.

При HISTORY ЛИНЗА ожидает конкретные `unitId + viewTime`, а возвращает snapshot знаний на этот момент.

---

## 9. Проверки реализации

Добавлен:

`scripts/linza_right_panel_product_smoke.mjs`.

Он проверяет контрактные запреты и обязательные связи:

- `Инфо` использует canonical terrain slope owner;
- nearby objects используют canonical object geometry;
- настоящие concealment/protection values публикуются;
- `Внимание` содержит четыре зоны и необходимые поля;
- attention read-model не считает LOS/visibility;
- attention command-boundary делегирует существующим subsystem functions;
- `Память` содержит все пять принятых типов;
- Memory не строится через objective hostile lookup;
- Front не имеет доступа к `SimulationState/state.units`;
- historical lookup выбирает только snapshot `<= viewTime`;
- history записывается до и после simulation tick;
- новые core contracts не зависят от `window` или `localStorage`.

В локальном изолированном TypeScript-check новых LINZA-модулей strict type-check завершён с exit code 0.

Focused smoke завершился строкой:

`LINZA_RIGHT_PANEL_PRODUCT_SMOKE_OK`

Отдельный runtime-check `EstimatedFront` подтвердил:

- несколько субъективных spatial evidence → front band строится;
- одного evidence недостаточно → результат `null`.

Полный repository build в этой исполнительской среде не запускался, поскольку приватный checkout репозитория локальному git недоступен. После записи в feature-ветку GitHub commit status не опубликовал автоматических checks; это не заменяется утверждением о полном CI-pass.

---

## 10. Проверка полного planned scope

### `Инфо`

Все данные принятой вкладки теперь имеют product read-path. Pin/context-menu и визуальная компоновка — UI-owned.

**Статус product scope ЛИНЗЫ: ГОТОВО.**

### `Внимание`

Все значения секторной инфографики, реальные контакты и штатные команды profile/mode/auto/search имеют product boundaries. LOS остаётся simulation-owned.

**Статус product scope ЛИНЗЫ: ГОТОВО.**

### `Память` LIVE

Пять типов знаний, provenance, age, confidence, uncertainty и geometry имеют единый read-contract. Intel не подделывается отдельным store; Front не читает скрытых врагов.

**Статус product scope ЛИНЗЫ: ГОТОВО.**

### `Память` HISTORY

Субъективные snapshots сохраняются на simulation boundary и читаются строго на/до `viewTime`.

**Статус LINZA history read-contract: ГОТОВО.**

Глобальная временная навигация и долговременный replay/persistence старых прогонов — зависимость ХРОНИСТА, не второй history mechanism ЛИНЗЫ.

### UI/render элементы accepted HTML

Не потеряны из planned scope, но принадлежат АРКЕ/renderer:

- pin actions;
- фильтры и toggles;
- dimming;
- labels/time/source visibility;
- highlight выбранной записи;
- world-bound overlays;
- smooth attention geometry;
- fixed marker screen size;
- renderer layering.

Для каждого из них необходимые данные теперь опубликованы product contracts ЛИНЗЫ.

---

## 11. Файлы реализации

Новые product files:

- `src/core/map/MapInfoReadModel.ts`;
- `src/core/perception/AttentionReadModel.ts`;
- `src/core/perception/AttentionCommands.ts`;
- `src/core/knowledge/UnitMemoryReadModel.ts`;
- `src/core/knowledge/EstimatedFront.ts`;
- `src/core/knowledge/UnitKnowledgeHistory.ts`.

Изменён существующий simulation boundary:

- `src/core/simulation/SimulationTick.ts`.

Добавлена focused verification:

- `scripts/linza_right_panel_product_smoke.mjs`.

Документ:

- `docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md`.

---

## 12. Следующая точка интеграции

1. ПУЛЬС публикует/подтверждает один настоящий selected `unitId` для новой оболочки.
2. АРКА подключает `MapInfoReadModel`, `AttentionReadModel`, `AttentionCommands`, `UnitMemoryReadModel` без локальных копий gameplay state.
3. Renderer использует existing prepared visibility и geometry из read-model; не пересчитывает LOS.
4. ХРОНИСТ передаёт глобальный `viewTime` и обеспечивает persistence/replay lifecycle для исторических прогонов.
5. После интеграции выполняется визуальная приёмка полного Right Panel v1 против канонического HTML/reference.

До этой интеграции нельзя заменять новые contracts mock-данными или прежней standalone HTML-логикой.
