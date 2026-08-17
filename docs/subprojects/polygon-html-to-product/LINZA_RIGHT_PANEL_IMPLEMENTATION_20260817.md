# ЛИНЗА — реализация LIVE правой панели `Инфо / Внимание / Память`

Дата: 2026-08-17  
REQUEST_ID: `XROUTE-20260817-POLYGON-LINZA-RIGHT-PANEL-001`

> Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память.

## 1. Что сделано

В этой волне исследовательский контракт ЛИНЗЫ переведён в реальную product-реализацию LIVE-представлений правой панели Полигона.

Реализованы три вкладки:

- `Инфо` — данные о конкретной точке карты через существующих владельцев карты, рельефа, материалов и объектов;
- `Внимание` — чтение текущего состояния внимания выбранного бойца и штатное изменение профиля/режима/сектора через существующие product-функции;
- `Память` — субъективные знания выбранного бойца из его настоящего `perceptionKnowledge`, без чтения объективного списка врагов.

Реализация не создаёт второй runtime, второй selection store, собственную историю, собственный LOS, новый Intel-store или вычислитель предполагаемого фронта.

## 2. Точная база и результат

Репозиторий:

`AndrewVerhoturov1/Real-wargame`

База реализации:

```text
branch: real-wargame-preview
base SHA: 8292bf25bf241712901090fcb565dded939e7a08
```

Рабочая ветка ЛИНЗЫ:

```text
feature/20260817-polygon-linza-right-panel-x
```

Product implementation commit:

```text
5b1a82a5fd991f051d12ae00fa0043c94961550e
```

Pull request:

```text
#287 — feat: add LIVE Polygon Info Attention Memory panels
```

Важно: SHA `5b1a82a...` фиксирует именно product-код ЛИНЗЫ до последующего документационного дополнения. Документационный commit не меняет поведение продукта.

## 3. Изменённые product-файлы

### `src/combat-lab/right-panel/PolygonRightPanelLive.ts`

Это тонкий adapter между UI и уже существующими product owners.

Он:

- читает настоящие данные для `Инфо`;
- читает настоящие attention settings/runtime;
- вызывает существующие attention write-функции;
- читает субъективную память выбранного бойца;
- возвращает явное `unavailable`, если нужной product capability ещё нет.

Он не является новым gameplay owner и не хранит собственное состояние мира.

### `src/combat-lab/right-panel/PolygonRightPanelLiveView.ts`

Это представление трёх вкладок.

Оно получает готовые DOM-hosts извне и предоставляет явные методы:

```text
renderInfo(...)
renderAttention(...)
renderMemory(...)
invalidate()
destroy()
```

Выбор юнита не хранится внутри ЛИНЗЫ. Контекст выбранного юнита должен прийти от общего seam, которым владеет ПУЛЬС.

В представлении нет:

- второго `CombatLabSelectionController`;
- `setInterval`;
- собственного `requestAnimationFrame`-цикла;
- собственного simulation loop.

### `src/combat-lab/right-panel/polygon-right-panel-live.css`

Добавлено scoped-оформление правой панели:

- карточки и метрики `Инфо`;
- controls `Внимание`;
- summary/legend/list для `Память`;
- empty/unavailable states;
- адаптация под более узкую ширину.

Стиль собирался по фактическому принятому HTML-прототипу, включая размеры, плотность карточек, рамки, радиусы и структуру memory entries.

### `scripts/linza_right_panel_product_smoke.ts`

Существующий LINZA smoke обновлён под фактическую реализацию. Новый параллельный test framework не создавался.

## 4. `Инфо` — что реально работает

`Инфо` получает точку карты извне и читает данные через существующие product owners.

Реализовано:

- клетка и её label;
- высота;
- уклон и направление склона;
- материал поверхности;
- материал растительности;
- сопротивление поверхности движению;
- сопротивление растительности;
- passability;
- physical movement cost;
- локальный concealment;
- ближайшие объекты карты;
- cover/protection свойства этих объектов.

Используются существующие owners:

- `MapModel`;
- `SmoothTerrain`;
- `DirectionalTerrainStaticGrid`;
- `EnvironmentProfileRuntime`;
- `EnvironmentMaterialProfile`;
- `MapObjectSpatialIndex`;
- `resolveObjectCoverProperties`.

### Важная performance-граница

`DirectionalTerrainStaticGrid` и `MapObjectSpatialIndex` подготавливаются отдельным шагом через:

```text
preparePolygonInfoLiveOwners(state)
```

Этот prepare не должен выполняться на каждом `pointermove`.

По объектам используется локальный bounded spatial query, а не полный scan карты.

### Что в `Инфо` сознательно не подделано

**Юниты рядом** пока возвращаются как `unavailable`.

Причина: на исследованной базе не найден принятый bounded spatial-query owner для юнитов. Делать `pointer move × state.units` полным scan было бы неверным performance-контрактом.

**Danger** также возвращается как `unavailable`.

Причина: для этой панели не найден canonical product owner опасности. ЛИНЗА не вычисляет новый «уровень опасности» в UI.

## 5. `Внимание` — что реально работает

Для выбранного `unitId` вкладка читает настоящий `UnitModel`.

Показываются:

- текущий attention mode;
- источник режима;
- выбранный профиль;
- focus direction;
- search center;
- search arc;
- параметры direct/peripheral/rear sectors;
- vision limits/ranges;
- субъективные perception contacts этого бойца.

### Реальные write-paths

UI не пишет поля `UnitModel` напрямую.

Для изменений используются уже существующие product-функции:

```text
applyAttentionProfileToUnit(...)
setAttentionMode(...)
setSearchSector(...)
clearAttentionOverride(...)
```

ЛИНЗА добавила только тонкие adapter-функции:

```text
applyPolygonAttentionProfile(...)
setPolygonAttentionMode(...)
setPolygonSearchSector(...)
clearPolygonAttentionOverride(...)
```

После команды выполняется readback из того же настоящего `UnitModel`.

То есть новая панель не становится владельцем состояния внимания.

## 6. `Память` — что реально работает

Источник памяти только один:

```text
selected UnitModel.perceptionKnowledge
```

Объективный список всех противников для построения памяти не используется.

Контакты переводятся в presentation-классы без создания нового knowledge store:

- `reported` → `intel`;
- `sound`, `fire_pressure`, `cue`, `suspicion` → `assumption`;
- `visibleNow` / `observedNow` → `current`;
- остальные сохранённые контакты → `past`.

Для контактов используются реальные поля perception:

- stage;
- source/provenance;
- confidence;
- uncertainty;
- last known position;
- visible/observed state;
- last updated time;
- explanation.

### Почему `reported` не копируется в отдельный Intel-store

`reported` уже является штатным provenance в perception subsystem. Поэтому отдельный LINZA-owned Intel-store не создавался.

### Estimated Front

`Estimated Front` остаётся `unavailable`.

На текущей product-базе нет принятого владельца и семантического контракта, который определял бы:

- какие сведения образуют фронт;
- confidence threshold;
- uncertainty;
- геометрию линии/полосы;
- lifecycle/invalidation;
- HISTORY semantics.

Поэтому UI не строит «примерный фронт» своей формулой и не использует скрытые objective positions.

## 7. Связь с ПУЛЬСОМ

ЛИНЗА намеренно не меняла общий shell/selection seam, потому что параллельная задача ПУЛЬСА владеет этой границей.

`PolygonRightPanelLiveView` ожидает внешний:

```text
selected unit context
+ DOM hosts для info / attention / memory
```

После принятия ПУЛЬСА интеграция должна быть маленькой:

```text
общий selectedUnitId
→ передать unitId в LINZA view
→ renderAttention / renderMemory

точка карты / pin
→ передать point в LINZA view
→ renderInfo
```

Второй selection store для этого не нужен и не должен появляться.

## 8. Что не менялось

В рамках этой реализации ЛИНЗА не меняла:

- `SimulationTick`;
- perception scheduler;
- AI runtime;
- renderer/PixiJS;
- карту как gameplay owner;
- `UnitModel` schema;
- selection controller;
- History/viewTime;
- replay/persistence;
- Metrics/Series;
- Save/Open;
- deployment.

Также не добавлены:

- новый runtime;
- новый history cache;
- `WeakMap` со snapshots;
- новый Estimated Front estimator;
- frontend LOS;
- frontend visibility calculation;
- fake/demo data.

## 9. Performance-свойства реализации

Главное правило: правой панели не разрешено превращать отображение данных в дополнительную simulation workload.

Фактически:

```text
per-tick LINZA work: 0
LINZA history allocations: 0
LINZA recurring timer: 0
LINZA render loop: 0
full-map scan on pointer move: 0
full-unit scan on pointer move: 0
```

`Инфо` использует подготовленные owners и bounded object query.

`Внимание` и `Память` работают с конкретным выбранным `unitId`, а не перебирают все юниты мира.

Перерисовка view использует snapshot/invalidation подход, а не свой постоянный цикл.

## 10. Визуальное соответствие HTML-прототипу

При реализации был повторно изучен исходный HTML-прототип правой панели.

Из него перенесены структура и визуальные принципы:

- компактные panel cards;
- metric grid;
- attention toolbar и controls;
- memory summary;
- legend;
- memory entry layout;
- плотность отступов;
- границы и радиусы;
- small-text hierarchy.

При этом **pixel-perfect browser verification пока не заявляется**.

Причина: на момент выполнения ЛИНЗЫ общий PULSE seam ещё не был интегрирован, поэтому ветка ЛИНЗЫ не имела корректного product-маршрута для самостоятельного монтирования трёх вкладок в финальный shell без вмешательства в чужую зону.

После интеграции с ПУЛЬСОМ требуется выполнить свежую screenshot-проверку exact интеграционного SHA против принятого HTML.

## 11. Smoke-контракт

Обновлённый `linza_right_panel_product_smoke.ts` проверяет следующие свойства реализации:

### `Инфо`

- prepared owners создаются вне hover path;
- используется bounded object query;
- локальный объект находится через spatial index;
- отсутствует полный unit scan для nearby units;
- отсутствующая danger capability остаётся `unavailable`.

### `Внимание`

- profile write идёт через product function;
- mode write идёт через product function;
- search sector write идёт через product function;
- clear override идёт через product function;
- после команд читается настоящий runtime readback.

### `Память`

- `reported` сохраняет provenance и отображается как intel;
- sound contact отображается как assumption;
- Estimated Front остаётся unavailable.

### Архитектурные запреты

Smoke также фиксирует отсутствие:

- LINZA-owned history runtime;
- нового front estimator;
- нового selection owner;
- работы ЛИНЗЫ в `SimulationTick`;
- собственного recurring render/timer loop.

## 12. Что фактически проверено на implementation SHA

Для product implementation commit `5b1a82a5fd991f051d12ae00fa0043c94961550e` подтверждено:

- exact compare с base: один product commit, четыре изменённых файла;
- TypeScript syntax transpilation `PolygonRightPanelLive.ts`: PASS;
- TypeScript syntax transpilation `PolygonRightPanelLiveView.ts`: PASS;
- TypeScript syntax transpilation `linza_right_panel_product_smoke.ts`: PASS;
- GitHub `Preview Policy`: PASS;
- PR mergeability: PASS на момент проверки;
- `Directional Terrain Visual QA`: workflow был SKIPPED как нерелевантный.

Не запускались и поэтому не должны считаться PASS:

- полный `npm run typecheck`;
- полный `npm run build`;
- фактический запуск LINZA smoke;
- browser screenshot comparison;
- heavy performance scenario.

Причина отсутствия локальных полных проверок: в среде исполнителя не было рабочего checkout репозитория, пригодного для запуска project scripts/build.

## 13. Текущие ограничения и блокеры

### Зависимость от ПУЛЬСА

Финальное подключение в общий shell зависит от generic right-panel/selection seam ПУЛЬСА.

### Nearby units в `Инфо`

Нужен canonical bounded unit spatial query. До его появления поле должно быть unavailable, а не реализовано полным scan массива юнитов.

### Danger в `Инфо`

Нужен canonical product owner/semantic contract.

### Estimated Front в `Память`

Нужен отдельный product owner/contract. ЛИНЗА не должна вычислять его в UI.

### HISTORY

Нужен общий canonical `HistoryProvider/viewTime` из исторической линии подпроекта. ЛИНЗА не должна создавать собственную историю.

## 14. Следующая точка интеграции

После принятия параллельного ПУЛЬСА:

```text
PULSE generic right-panel/selection seam
        ↓
selected unitId / selected entity context
        ↓
LINZA PolygonRightPanelLiveView
        ↓
Инфо / Внимание / Память LIVE
```

Затем обязательно:

1. выполнить общий typecheck/build;
2. запустить LINZA product smoke;
3. открыть реальный Polygon route;
4. проверить переключение вкладок;
5. проверить реальные данные выбранного бойца;
6. проверить attention writes + readback в UI;
7. проверить memory provenance;
8. сделать screenshot comparison с принятым HTML;
9. исправить визуальные расхождения в интеграционном SHA, не создавая новые gameplay owners.

## 15. Итог

ЛИНЗА больше не является только исследовательским контрактом.

На ветке `feature/20260817-polygon-linza-right-panel-x` подготовлена реальная LIVE-реализация `Инфо / Внимание / Память`, которая:

- читает существующие product owners;
- пишет Attention только через штатные функции;
- показывает субъективную память конкретного бойца;
- сохраняет provenance `reported`;
- использует bounded map-object query;
- не создаёт второй selection/runtime/history;
- не подделывает отсутствующие Danger, nearby-unit query и Estimated Front;
- готова к подключению через общий seam ПУЛЬСА.

До интеграции ПУЛЬСА эта работа должна считаться **готовым LINZA adapter/view layer, но не полностью подключённой финальной правой панелью продукта**.
