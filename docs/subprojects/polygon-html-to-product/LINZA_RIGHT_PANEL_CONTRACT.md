# ЛИНЗА — контракт реальных данных правой панели

Дата ревизии: 2026-08-16  
REQUEST_ID: `XROUTE-20260816-LINZA-REVISION-001`

> Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память.

## 0. Основание ревизии

Продуктовая база исследования остаётся неизменной:

- `base_branch`: `real-wargame-preview`;
- `base_commit`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- `feature_branch`: `feature/20260815-polygon-linza-right-panel-contract`;
- предыдущий проверенный SHA ЛИНЗЫ: `7ee1bd62fbebbbd10461f718e484014f1d6efd8b`;
- внешний review: `POLYGON_Q_RESULTS_REVIEW.md` @ `b10d827a093eaa56e8f52aec8a00860104041e47`;
- вердикт review: `NEEDS REVISION`.

Исходный Q ЛИНЗЫ был исследовательским. Он разрешал установить настоящих владельцев данных, read/write boundaries и пробелы, но не создавать новые product/runtime capabilities. Предыдущий SHA вышел за эту границу: в нём появились собственная история знаний, новый estimator предполагаемого фронта, новые read-models и изменение `SimulationTick`.

Эта ревизия возвращает результат к безопасной границе:

- в итоговом diff относительно `base_commit` **нет изменений `src/**`**;
- `SimulationTick` совпадает с продуктовой базой;
- `UnitKnowledgeHistory` удалён;
- `EstimatedFront` удалён;
- преждевременные LINZA product read/command modules удалены;
- остаются только контракт и сфокусированная проверка существующих product owners.

Наличие прежнего кода в истории ветки не считается реализованной или принятой capability. Принимать можно только новый exact SHA этой ревизии.

---

## 1. Неподвижные архитектурные правила

1. UI и renderer не владеют gameplay truth.
2. `Инфо` читает настоящую карту, рельеф, материалы, объекты и юниты; интерфейс не создаёт параллельную карту.
3. `Внимание` читает `UnitModel.attentionSettings`, `attentionRuntime` и perception; LOS/visibility остаются simulation-owned.
4. `Память` показывает только субъективные знания выбранного бойца. Objective hostile-unit list не является допустимым источником.
5. `reported`-контакт уже является настоящим product-механизмом полученных сведений; отдельный Intel-store ради панели не нужен.
6. Предполагаемый фронт **не считается существующей product capability** только потому, что он есть в принятом HTML.
7. ЛИНЗА не владеет History/viewTime и не хранит snapshots.
8. Исторический режим будет читать только snapshot/projection, который выдаст общий canonical HistoryProvider будущего Полигона.
9. В `SimulationTick` не добавляется работа ради отображения правой панели до отдельного принятого runtime-контракта.
10. Любое будущее подключение должно иметь bounded/revision-driven policy и не запускать полный или растущий со временем пересчёт из UI.

---

## 2. `Инфо`: owner/API/readiness

`Инфо` относится к точке карты под курсором или к UI-owned закреплённой точке. Pin сам по себе является presentation state и не меняет карту.

| Данные принятого UI | Настоящий owner / существующий путь | Готовность на base | Граница следующей задачи |
|---|---|---|---|
| координата / клетка | `TacticalMap`, `worldToGrid`, `getCell`, `gridToCellLabel` | **есть** | UI передаёт точку и только отображает результат |
| высота | `SmoothTerrain.sampleSmoothHeightLevel` | **есть** | читать штатное значение; не считать свою высоту |
| уклон и направление склона | `DirectionalTerrainStaticGrid` | **есть как prepared product data** | использовать подготовленный terrain owner, не новую формулу в UI |
| поверхность | `EnvironmentMaterialProfile` / `getSurfaceMaterial` | **есть** | показывать реальные material properties |
| проходимость / physical cost / resistance | material movement properties | **есть** | не сворачивать в выдуманный универсальный рейтинг |
| растительность | `getVegetationMaterial` | **есть** | читать реальную material identity |
| concealment | material visibility + object cover properties | **есть частями** | presentation должен явно показывать, что именно измеряется |
| cover / protection | `resolveObjectCoverProperties` и геометрия объектов | **есть** | не подменять одной новой «защитой» |
| объекты рядом | `MapObjectSpatialIndex` + `MapObjectGeometry` | **есть** | будущий read-adapter должен использовать локальный spatial query, а не полный scan на hover |
| юниты рядом | `SimulationState.units` является owner identity/state | **owner есть, query boundary требует отдельной интеграционной проверки** | нельзя вводить recurring полный scan большого списка из UI без bounded policy |
| фиксация точки | чистый UI state | **можно** | не писать ничего в simulation |

### Что не считается сделанным

В этой ветке **нет принятого `MapInfoReadModel`**. Удалённый прототипный модуль не считается готовой capability. Следующий implementation-Q должен собрать тонкий read-adapter поверх перечисленных owners и отдельно доказать стоимость локальных запросов.

---

## 3. `Внимание`: owner/API/readiness/write boundary

### Настоящие owners

- `UnitModel.attentionSettings` — настройки;
- `UnitModel.attentionRuntime` — фактический runtime mode/focus/search state;
- perception subsystem — обнаруженные/подозреваемые контакты;
- `AttentionProfileRegistry` — настоящие профили.

### Существующие продуктовые функции

На base уже существуют:

- `applyAttentionProfileToUnit(...)`;
- `setAttentionMode(...)`;
- `setSearchSector(...)`;
- `clearAttentionOverride(...)`.

Они подтверждают, что product-owned write-path существует. Но эта ревизия **не объявляет новый публичный Polygon command API** и не добавляет обёртку, пока отдельный integration-Q не установит окончательную UI boundary и failure/readback semantics.

### Readiness

| Возможность | Статус | Комментарий |
|---|---|---|
| текущий attention mode | **есть** | читать из `attentionRuntime` |
| source режима | **есть** | не скрывать различие automatic/player/AI там, где оно важно |
| выбранный профиль | **есть** | registry + unit profile identity |
| focus direction / target | **есть** | runtime-owned |
| search center / arc | **есть** | runtime-owned |
| параметры focus/direct/peripheral/rear | **есть** | `attentionSettings` |
| max range / falloff | **есть** | `attentionSettings.vision` |
| реальные perception contacts | **есть** | субъективные контакты конкретного бойца |
| изменение profile/mode/search | **product функции есть; UI integration отдельно** | не писать поля напрямую |
| LOS / visibility geometry | **simulation-owned** | интерфейс не пересчитывает |
| HISTORY Attention | **не готово у ЛИНЗЫ** | ждёт общий HistoryProvider |

### Запрещено

- прямое присваивание внутренних attention fields из DOM/UI;
- собственный LOS/visibility calculation;
- использование objective enemy position для невидимого контакта;
- объявление LIVE read-model готовой продуктовой возможностью без интеграционного теста.

---

## 4. `Память`: честный supported scope

Accepted HTML требует пять классов знания. На product base они распределяются так:

| Принятый класс | Статус на base | Настоящий источник / решение |
|---|---|---|
| текущий подтверждённый контакт | **есть** | `UnitPerceptionKnowledge.contacts`, stage/visible/observed |
| прошлый контакт / последнее известное | **есть** | сохранённый perception contact + `lastKnownPosition`, uncertainty, time |
| предположение | **есть частично** | `sound`, `fire_pressure`, cue/suspicion и tactical threat knowledge |
| разведданные / полученные сведения | **есть как provenance** | `PerceptionContactSource = 'reported'`; отдельный Intel-store не нужен |
| предполагаемый фронт | **отсутствует как принятая product capability** | нужен отдельный продуктовый контракт; ЛИНЗА его не вычисляет |

### Важное решение по `EstimatedFront`

`EstimatedFront.ts` из предыдущего SHA удалён.

Причина: функция вводила новую интерпретацию субъективных сведений — правила минимального числа evidence, confidence threshold, геометрию линии/полосы и агрегирование uncertainty. На base нет принятого owner/semantic contract для такой производной.

Если предполагаемый фронт нужен в первой product-версии, отдельный Q должен определить:

1. кто владеет этим выводом — perception/tactical knowledge или иной simulation-owned resolver;
2. какие типы evidence допустимы;
3. правила confidence/uncertainty;
4. lifecycle/invalidation;
5. сериализацию и HISTORY semantics;
6. headless reference fixture.

До этого UI должен честно показывать supported knowledge без фронта, а не рисовать его из скрытых данных или новой UI-формулы.

---

## 5. History / viewTime

### Решение после review

ЛИНЗА **не создаёт HistoryProvider и не хранит локальную историю**.

Удалены:

- `UnitKnowledgeHistory.ts`;
- вызовы history recording из `SimulationTick`;
- любой `WeakMap<SimulationState, snapshots...>` ЛИНЗЫ;
- накопление deep-copy snapshots до/после каждого simulation tick.

Следовательно эта ветка добавляет:

```text
per-tick history work: 0
history snapshot allocations: 0
history cache growth: 0
history teardown obligations: 0
```

### Будущая точка подключения

ХРОНИСТ установил необходимость общего canonical `HistoryProvider/viewTime`. Когда он появится, ЛИНЗА должна получить от него **read-only историческую проекцию** для конкретных:

```text
run identity
+ unitId
+ viewTime
+ coverage/provenance
```

и только преобразовать уже выданные исторические subjective data в presentation. ЛИНЗА не должна:

- записывать parallel snapshots;
- читать current LIVE knowledge в HISTORY;
- самостоятельно выбирать persistence policy;
- создавать replay artifact;
- определять глобальный `viewTime`.

Если HistoryProvider не покрывает нужный домен/момент, правильный результат — `unavailable`, а не fallback к LIVE.

---

## 6. Bounded/performance policy

### Hot path

После этой ревизии ЛИНЗА не добавляет никакой работы в `SimulationTick`, AI/perception scheduler или другой recurring gameplay path.

### Worst-case complexity текущей ревизии

Новые recurring runtime операции: **нет**.

Smoke использует уже существующие owners только в тестовой среде. Будущий UI integration не получает права на recurring full scan из факта, что owner-массив доступен.

### Правила для будущих implementation-Q

1. Info object queries — через существующий spatial index/local query.
2. Unit-near-point query — перед реализацией определить bounded query/reuse policy; не начинать с `every pointer move × all units` как неявного контракта.
3. Attention/Memory — читать только выбранный unit и опубликованные revision keys/snapshots.
4. Не создавать display object на каждую клетку.
5. Не запускать LOS/perception из renderer.
6. Любая history cache обязана принадлежать общему HistoryProvider и иметь явные coverage, bounds, eviction/persistence/teardown.
7. Heavy performance run требуется только после реального runtime/UI integration, а не для этой contract-only ревизии.

`PERFORMANCE_REASON` для текущей ревизии: heavy performance run не нужен, потому что итоговый product diff не содержит runtime-кода и удаляет ранее добавленную recurring history работу.

---

## 7. Сфокусированный smoke после ревизии

`scripts/linza_right_panel_product_smoke.mjs` теперь является launcher-ом Vite SSR для `scripts/linza_right_panel_product_smoke.ts`.

В отличие от прежнего token-only smoke, TypeScript smoke выполняет реальный код существующих owners:

- создаёт настоящий `SimulationState` через `createInitialState`;
- читает клетку/материалы/terrain slope через штатные map/terrain owners;
- выполняет локальный `MapObjectSpatialIndex.queryCircle` и проверяет query diagnostics;
- применяет существующий attention profile;
- меняет attention mode и search sector существующими product functions и проверяет readback из `UnitModel.attentionRuntime`;
- возвращает attention в automatic через `clearAttentionOverride`;
- записывает `reported` contact через `upsertPerceptionContact` и проверяет, что provenance остаётся `reported` без второго Intel-store;
- проверяет отсутствие speculative LINZA runtime-файлов;
- проверяет, что `SimulationTick` больше не содержит history recording ЛИНЗЫ.

Smoke **не доказывает**:

- готовый UI Right Panel;
- общий History/viewTime;
- Estimated Front;
- визуальную корректность оверлеев;
- production performance будущего UI;
- сохранение/открытие исторических прогонов.

Воспроизводимые команды на полном checkout:

```text
node scripts/linza_right_panel_product_smoke.mjs
npx tsc --noEmit
npm run attention-profiles:smoke
npm run perception:smoke
npm run build
npm run docs:check
```

Если исполнитель не имеет рабочего checkout, эти команды нельзя записывать как PASS только по наличию скрипта.

---

## 8. Полный planned scope и оставшиеся зависимости

| Planned функция | Статус после ревизии | Следующий owner/Q |
|---|---|---|
| `Инфо` LIVE data | owners установлены | отдельный thin read-adapter + ARKA integration Q |
| `Инфо` pin/context action | UI-owned | ARKA |
| `Внимание` LIVE read | owners установлены | отдельный integration Q |
| `Внимание` writes | product functions подтверждены, Polygon boundary ещё не принята | integration Q с readback/failure semantics |
| `Память` current/last/suspicion | owners установлены | Memory LIVE integration Q |
| `Память` intelligence | `reported` provenance подтверждён | Memory LIVE integration Q; не создавать второй store |
| `Память` estimated front | **blocked / отдельный product contract** | отдельный Q, только если входит в обязательный первый scope |
| `Память` HISTORY | **blocked common HistoryProvider** | ХРОНИСТ foundation → затем LINZA adapter |
| global `viewTime` | не зона ЛИНЗЫ | ХРОНИСТ |
| replay/persisted history | не зона ЛИНЗЫ | ХРОНИСТ/Replay owner |
| Metrics/Series linkage | не зона ЛИНЗЫ | ХРОНИСТ/Measurement/Series owners |
| Save/Open | не зона ЛИНЗЫ | ExperimentEnvelope owner |
| первый LIVE Unit | не затронут | ПУЛЬС + АРКА |

---

## 9. Совместимость

### С ПУЛЬСОМ

ЛИНЗА ожидает тот же настоящий `selectedUnitId`/`UnitModel`, который установил ПУЛЬС. Второй selection store не создаётся. Эта ревизия не меняет selection, команды позы или `UnitModel`.

### С АРКОЙ

АРКА остаётся владельцем только presentation state: вкладка, pin, filters/toggles, highlight и geometry UI. ЛИНЗА не передаёт ей demo gameplay data.

### С ХРОНИСТОМ

History/viewTime остаётся единым будущим cross-system owner ХРОНИСТА. ЛИНЗА не конкурирует с ним локальным snapshot-store. Для HISTORY требуется historical projection от canonical provider.

### С Metrics / Series / replay / Save/Open

Эта ревизия не создаёт новых ID, stores или persistence. Поэтому будущие Run/Series identity, replay artifacts и ExperimentEnvelope могут развиваться без миграции LINZA-owned history state.

---

## 10. Что считать результатом ЛИНЗЫ

После этой ревизии результат ЛИНЗЫ — **аудит/контракт**, а не новая product capability.

Доказано:

- какие настоящие owners уже существуют для Info/Attention/Memory;
- какие write functions Attention уже есть;
- что `reported` покрывает provenance полученных сведений;
- что Estimated Front на base не имеет принятого product contract;
- что History/viewTime должен принадлежать общему owner;
- какие части можно отдавать в следующие implementation-Q;
- какие performance границы обязаны соблюдаться.

Не доказано и не считается реализованным:

- готовый Right Panel product UI;
- единый Polygon read-model API;
- HISTORY;
- Estimated Front;
- replay/persistence;
- визуальные overlay layers.

Следующая точка после принятия этой ревизии:

```text
АРКА + ЛИНЗА
→ Info LIVE thin adapter
→ Attention LIVE read/write/readback
→ supported Memory LIVE
```

HISTORY подключается только после общего HistoryProvider ХРОНИСТА. Estimated Front — только после отдельного принятого product contract.

---

## 11. Источники

Обязательные правила и документы:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/index.json`;
- `docs/subprojects/polygon-prototype/STATUS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `docs/performance/PERFORMANCE_PRINCIPLES.md`;
- `docs/workflow/CI_RISK_BASED_ACCEPTANCE.md`;
- `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`;
- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`.

`real-wargame-documentation` не доступен файлом по указанному URL; его обязательное содержимое передано пользователем в текущем Route X контексте и считается прочитанным по явному условию задачи.
