# LINZA — контракт реальных данных правой панели

## 0. Основание и границы

Роль: **ЛИНЗА** — контракт реальных данных вкладок `Инфо`, `Внимание`, `Память` нового Полигона.

Рабочая ветка:

`feature/20260815-polygon-linza-right-panel-contract`

Точная продуктовая база исследования:

`real-wargame-preview@1246e1d612e648e7d7378db1c02be3bbf3d2a16a`

Документ фиксирует владельцев данных, доступные read/write boundary, готовность runtime и зависимости для переноса **всего планового функционального объёма** этих частей принятого HTML-прототипа. UI-код, новые runtime-механизмы и демонстрационные данные в эту работу не входят.

### Важный пробел входного handoff

Указанный в задаче файл

`docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`

не найден ни на проверенном `real-wargame-preview`, ни в ветке `feature/20260815-polygon-html-to-product`, ни поиском по репозиторию на момент исследования и обязательной самопроверки. Поэтому документ не восстанавливает и не додумывает отсутствующий handoff.

Для проверки planned scope использованы:

- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_VISION.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `PRODUCT_OWNER_MAP.md` из исследовательского commit `7058ab74c0f22df65a913a61e6ce759bcd4ecedc`;
- реальные исходники продукта на точной базе `1246e1d...`.

## 1. Неподвижные архитектурные правила

1. Правая панель не является владельцем игровой истины.
2. UI может владеть только состоянием представления: активной вкладкой, раскрытием секций, фильтрами, зафиксированной точкой карты, выбранной для подсветки записью и параметрами показа оверлея.
3. `UnitModel`, карта, восприятие, внимание и память читаются из существующих владельцев; копия этих данных в новом store не создаётся.
4. UI **не вычисляет LOS, visibility, обнаружение или обновление памяти**. Он показывает уже подготовленное simulation-owned состояние.
5. Отсутствующие `Intel`/`Front` нельзя заменять объективным списком врагов, локальными массивами, эвристикой, pressure zones как «линией фронта» или данными standalone HTML.
6. Запись в внимание допускается только через существующие функции владельца attention subsystem. Новый UI не копирует прямые мутации полей из legacy-контролов.
7. Если реальных данных нет, допустимое состояние — честное `нет данных / возможность ещё не подключена`, а не синтетическое заполнение.
8. LIVE и HISTORY — разные контракты. Наличие LIVE-данных не означает наличие исторического состояния на `viewTime`.

## 2. Сводная карта готовности

| Вкладка / функция | Реальный владелец / механизм | Статус |
|---|---|---|
| `Инфо`: координата/ячейка | `TacticalMap`, `MapModel.ts` | **готово** |
| `Инфо`: поверхность, растительность, высота, базовая проходимость | `TacticalMap`, environment profile, `CellInspectorContent.ts`, `SmoothTerrain` | **готово** |
| `Инфо`: уклон в принятом смысле | terrain/map subsystem; единого inspector slope-contract не подтверждено | **частично** |
| `Инфо`: маскировка и защита как разные свойства | environment materials + `MapObject` cover/concealment | **частично** |
| `Инфо`: объекты и юниты рядом | `TacticalMap.objects` + `SimulationState.units` | **частично** |
| `Инфо`: клик по юниту → настоящий selection | `CombatLabSelectionController` → `SimulationState.selectUnit()` | **готово** |
| `Инфо`: pin точки | UI-owned `pinnedPoint`; готовый map context-menu shell существует | **готово по контракту, UI не реализуется ЛИНЗОЙ** |
| `Внимание`: режим, профиль, геометрия, частоты, дальности | `UnitModel.attentionSettings/attentionRuntime`, `AttentionModel.ts` | **готово** |
| `Внимание`: список профилей | `AttentionProfileRegistry` / `AttentionProfileStorage` | **готово** |
| `Внимание`: применить профиль | `applyAttentionProfileToUnit()` | **готово** |
| `Внимание`: выбрать режим | `setAttentionMode()` | **готово** |
| `Внимание`: поиск/сектор | `setSearchSector()` | **готово** |
| `Внимание`: вернуть автоматический режим | `clearAttentionOverride()` | **готово** |
| `Внимание`: реальные контакты | `UnitModel.perceptionKnowledge.contacts` | **готово** |
| `Внимание`: prepared visibility field | `SelectedUnitVisibilityField` | **готово** |
| `Внимание`: world-bound overlay нового принятого вида | данные/runtime есть; финальный renderer — зависимость UI/render | **частично** |
| `Внимание`: выбор/подсветка контакта | `RuntimeUiState.selectedContactId`, существующий runtime panel | **готово по данным/UI-state** |
| `Память`: текущие/прошлые контакты | `perceptionKnowledge` | **готово** |
| `Память`: тактические угрозы/неизвестный огонь | `tacticalKnowledge`, `SoldierThreatMemory` | **готово** |
| `Память`: подозрения | `PerceptionContactStage = cue/suspicion` и часть threat-memory | **готово для подтверждённых существующих типов** |
| `Память`: полученные сведения | `PerceptionContactSource = reported` | **частично** |
| `Память`: самостоятельный Intel owner / произвольная разведобласть | не найден | **отсутствует** |
| `Память`: предполагаемая линия/полоса фронта | owner/API не найден | **отсутствует** |
| `Память`: время/возраст/confidence/uncertainty/source | поля есть в perception/threat memory; нужна единая read-проекция времени | **частично** |
| `Память`: фильтры и переключатели отображения | чистое UI-state над реальными записями | **готово по контракту, UI не реализуется ЛИНЗОЙ** |
| `Память`: HISTORY на `viewTime` без утечки будущего | общий history provider отсутствует | **отсутствует** |
| LOS/visibility calculation в новом UI | владелец — simulation/perception/visibility | **запрещено в UI** |
| Запись в память из нового UI | владелец — simulation/perception/threat-memory | **запрещено** |

## 3. Вкладка `Инфо`

### 3.1. Что уже существует

`Инфо` должна читать реальную точку карты, а не состояние выбранного юнита. Зафиксированная точка — допустимое UI-owned state.

На точной базе подтверждены:

- `TacticalMap`, `MapCell`, `MapObject`;
- `worldToGrid()`, `getCell()`, `gridToCellLabel()` и другие штатные map helpers;
- `surfaceMaterialId`, `vegetationMaterialId`, дискретная высота и smooth-height sampling;
- свойства поверхности и растительности: passability, physical cost, resistance, visibility/concealment и fire/protection параметры;
- cover/concealment свойства map objects;
- реальные `SimulationState.units`;
- существующий `CellInspectorContent.buildInfoContent()`, который уже собирает поверхность, растительность, smooth height, проходимость, физическую цену, сопротивление и размер клетки.

`CellInspectorContent` не является новым владельцем данных, но это важный существующий read-adapter, который первоначальный контракт недооценил.

### 3.2. Что остаётся частичным

Принятый HTML требует полный набор: `высота + уклон + поверхность + проходимость + маскировка + защита + объекты/юниты рядом`.

Не всё это уже собрано одним штатным query:

- для `slope` не подтверждён единый канонический показатель именно для инспектора `Инфо`;
- маскировка и защита живут в нескольких физических свойствах и не должны сводиться новым UI к самодельной игровой формуле;
- семантика `рядом` для объектов/юнитов должна быть явно интерфейсной либо опираться на существующий spatial resolver, а не становиться новой gameplay-системой.

Нужен тонкий `InfoReadModel`/resolver, который только агрегирует существующие значения и явно маркирует их происхождение.

### 3.3. Выбор юнита из `Инфо`

Принятый сценарий `клик по строке юнита → выбрать этого бойца → перейти в Юнит` имеет реальный selection path:

`CombatLabSelectionController.select(...) → SimulationState.selectUnit(...)`.

ЛИНЗА подтверждает только data/action boundary. Переключение вкладки и визуальное оформление — зона оболочки.

### 3.4. Фиксация точки

Принятый UX требует pin **только через контекстное меню карты**:

- `Зафиксировать точку`;
- `Зафиксировать новую точку`;
- `Снять фиксацию точки`.

Для этого не нужен новый backend: `pinnedPoint` — чистое UI-state. В продукте уже существует универсальная оболочка `CombatLabMapContextMenu`, пригодная как технический кандидат для действия карты, но сами команды pin нового Полигона должны принадлежать новой оболочке/карте.

## 4. Вкладка `Внимание`

### 4.1. Реальный read-contract

`UnitModel` содержит:

- `attentionSettings: UnitAttentionSettings`;
- `attentionRuntime: AttentionRuntimeState`;
- `playerAttentionProfileId`;
- `perceptionKnowledge`.

`AttentionModeProfile` уже содержит всё необходимое для принятой секторной инфографики:

- `focusAngleDegrees`;
- `directAngleDegrees`;
- `peripheralAngleDegrees`;
- веса focus/direct/peripheral/rear;
- интервалы проверки всех зон;
- sample durations;
- `rearMaximumRangeMeters`;
- `defaultSearchArcDegrees`.

`UnitVisionSettings` содержит:

- `maximumVisualRangeMeters`;
- `distanceFalloffStartMeters`;
- `distanceFalloffExponent`;
- detection variance.

`AttentionRuntimeState` содержит фактический режим, источник режима, направление фокуса, target, центр и ширину search sector.

Следовательно, числовая секторная схема прототипа может отображаться из реальной модели без переноса HTML-формул.

### 4.2. Уточнённая write-boundary после обязательной самопроверки

Первоначальный вариант контракта помечал изменение профиля/режима как заблокированное. Это было слишком консервативно.

На точной базе подтверждены штатные функции attention subsystem:

- `setAttentionMode(unit, mode, source)`;
- `setSearchSector(unit, centerRadians, arcRadians, source)`;
- `clearAttentionOverride(unit)`;
- `applyAttentionProfileToUnit(unit, profile)`;
- `getAttentionProfileRegistry()`.

Более того, текущий продуктовый `TacticalWorkspaceBaseLegacy.ts` уже использует именно эти функции для выбора профиля, выбора режима и возврата `Автоматически`.

Поэтому допустимая граница для нового Полигона:

- **не** присваивать поля `attentionSettings/attentionRuntime` напрямую из UI;
- вызывать тонкий UI adapter, который делегирует в существующие `AttentionController`/`AttentionProfiles` функции;
- список профилей читать из существующего registry;
- редактирование содержимого профилей остаётся зоной authoritative profile editor, а не правой вкладки `Внимание`.

Legacy `AttentionProfileControls.ts`, где есть прямые присваивания полям юнита, не следует копировать: у продукта уже есть более узкие core-функции владельца.

### 4.3. Контакты

`PerceptionContactMemory` уже даёт:

- классы `cue / suspicion / contact / identified / confirmed`;
- источники `visual / sound / reported / fire_pressure`;
- confidence;
- uncertainty;
- last-known position;
- `sourceUnitId`;
- `visibleNow`, `observedNow`;
- время наблюдения/обновления;
- explanation.

Это покрывает принятые пользовательские классы `видит сейчас / последние сведения / подозрение / звук` без fake-данных.

Клик по контакту может хранить только UI-selection/highlight. На базе уже есть `RuntimeUiState.selectedContactId` и `setSelectedAttentionContact()`.

Если текущий видимый контакт связан с реальным `sourceUnitId`, renderer/read-adapter может привязать маркер к актуальному центру этого реального юнита **только пока контакт действительно текущий**. Для старого/неподтверждённого контакта используется только `lastKnownPosition`, чтобы не утекала объективная позиция врага.

### 4.4. Prepared visibility и производительность

На базе существует `SelectedUnitVisibilityField` с:

- `revision` и `calculationKey`;
- quality/zone/evaluated field;
- привязкой к выбранному `observerId`;
- map visual revision;
- кэшированием;
- ограничением частоты перестроения при движении.

Существующий `PixiVisibilityHeatmapRenderer` уже использует raster sprite, contact revision и marker key вместо display object на каждую клетку.

Это подтверждает правильного владельца prepared visibility и возможность переиспользования runtime-результата. Однако текущий renderer не считается автоматическим соответствием новому принятому UX: плавная секторная геометрия, постоянный экранный размер markers, точный layer ordering и новый visual style — отдельная задача renderer/АРКА.

Новый UI не должен:

- строить собственный LOS;
- выполнять полный map scan из панели;
- пересчитывать gameplay visibility от движения курсора;
- превращать объективные `state.units` в список «видимых».

## 5. Вкладка `Память`

### 5.1. Реальные владельцы

Есть два реальных источника субъективного знания бойца:

1. `UnitModel.perceptionKnowledge` — perception contacts;
2. `UnitModel.tacticalKnowledge` — threat memory, поддерживаемая `SoldierThreatMemory`.

Дополнительно существует `ThreatDisplayModel.buildThreatDisplayEntries()`, который уже умеет объединять контакты и threat-memory для отображения без создания нового owner. Для полного принятого списка он недостаточен, потому что его display entry не сохраняет весь временной и геометрический контекст, но как существующий projection-кандидат он важен.

### 5.2. Сопоставление пяти принятых классов памяти

| Плановый класс HTML | Что реально можно показать | Статус |
|---|---|---|
| 1. Известный/подтверждённый контакт | `identified/confirmed`, current perception/threat | **готово** |
| 2. Прошлый контакт / последнее положение | non-current contact + `lastKnownPosition`, uncertainty, timestamps | **готово** |
| 3. Предположение | `cue/suspicion` и неизвестные threat-memory от звука/обстрела в пределах их реальной семантики | **частично** |
| 4. Разведданные / полученные сведения | реальные `reported` contacts можно честно показывать как полученные сведения | **частично** |
| 5. Предполагаемый фронт | отдельного front-line knowledge owner нет | **отсутствует** |

Важно: `reported` contact не превращает продукт в полноценную систему Intel. Он покрывает только реально существующую полученную запись о контакте.

### 5.3. Геометрия

Подтверждены:

- точка контакта;
- точка + uncertainty radius;
- у tactical threats — x/y, radius/width/height/rotation, direction/arc/range и другие реальные параметры угрозы.

Не подтверждены как общие знания бойца:

- произвольная Intel area с отдельной product identity;
- линия/полоса фронта.

Поэтому новый renderer может показывать богатую реальную геометрию существующих записей, но не создаёт недостающие типы ради совпадения с картинкой HTML.

### 5.4. Время, старение и неопределённость

Perception contacts содержат `lastObservedSeconds` и `lastUpdatedSeconds`. Threat memory содержит `lastSeenSeconds`, `lastUpdatedSeconds` и для fire evidence — `lastEvidenceSeconds`.

Сама simulation уже:

- уменьшает confidence старых контактов/угроз;
- увеличивает uncertainty для забываемых сведений;
- удаляет слишком слабые записи.

Для правой панели нужен тонкий read-model, который **не меняет эти процессы**, а только выбирает корректный timestamp для отображаемого смысла записи и вычисляет пользовательский `age = currentViewTime - sourceTimestamp`.

Нельзя использовать `lastUpdatedSeconds` без разбора семантики для всех типов: некоторые memory-модели обновляют запись во время decay, и это не всегда означает «боец только что получил новые сведения».

### 5.5. Фильтры и переключатели accepted UX

Приняты:

- `Тип`;
- `Актуальность` с крайним значением `Бессрочно`;
- `Метки` — on по умолчанию;
- `Время` — on;
- `Названия` — on;
- `Источники` — off;
- клик по записи → усилить/подсветить её geometry на карте.

Все эти параметры — чистое UI-state и не требуют нового gameplay owner. Они должны фильтровать/оформлять только реально опубликованные записи.

Для contact selection уже есть аналог `selectedContactId`. Для общего memory entry нового интерфейса допустим собственный UI-only `selectedMemoryEntryId`, если он не превращается в новую копию memory data.

### 5.6. Memory overlay

Принятый overlay требует:

- приглушение карты;
- world-bound markers/areas/labels/time;
- сохранение читаемости юнитов;
- отдельные визуальные формы разных знаний;
- front band только когда настоящий front owner появится.

Существующий `PixiVisibilityHeatmapRenderer` и `RuntimeUiState` доказывают, что product уже умеет world-bound raster/markers, uncertainty и contact highlighting. Но финальный accepted Memory overlay — отдельная renderer-задача; ЛИНЗА фиксирует только источники и запрет на подмену данных.

### 5.7. HISTORY

Принятый HTML требует: на `viewTime` показывается только то, что боец знал к этому моменту.

Текущие `perceptionKnowledge` и `tacticalKnowledge` — LIVE state. Универсальный historical subjective-state provider на точной базе не подтверждён.

Следовательно:

- LIVE Memory можно подключать;
- HISTORY Memory — **отсутствующая product capability**;
- зависимость: контракт ХРОНИСТА / общий history provider, который возвращает состояние знаний на `viewTime` без утечки будущего.

## 6. Intel и Front

### Intel

Отдельный продуктовый Intel owner/API для произвольных разведывательных записей не подтверждён.

Разрешено:

- показывать существующий perception contact с `source = reported` как реально полученное сообщение/сведение.

Запрещено:

- создавать «разведданные» из объективных вражеских units;
- конвертировать любое подозрение в Intel;
- переносить demo-intel массивы HTML.

### Front

Owner/API предполагаемой линии фронта не найден.

Запрещено:

- считать front по среднему положению сторон;
- объявлять pressure zone линией фронта;
- рисовать front из объективного знания карты;
- переносить demo-front standalone HTML.

Для полного planned scope нужен отдельный product contract: кто формирует субъективную оценку фронта, какой у неё ID, geometry, confidence, source, timestamp и historical representation.

## 7. Минимальные адаптеры для будущей реализации

Эта задача их **не создаёт**, но фиксирует допустимую форму.

### `InfoReadModel`

Тонкая read-only проекция над:

- `TacticalMap`;
- environment profile;
- smooth terrain;
- map objects;
- `SimulationState.units`.

Можно переиспользовать идеи/части `CellInspectorContent`, но не превращать UI-adapter в owner gameplay-формул.

### `AttentionReadModel`

Тонкая проекция над:

- выбранным настоящим `UnitModel`;
- `attentionSettings`;
- `attentionRuntime`;
- `perceptionKnowledge`;
- prepared visibility field.

### `AttentionWriteAdapter`

Только делегирует в:

- `getAttentionProfileRegistry()`;
- `applyAttentionProfileToUnit()`;
- `setAttentionMode()`;
- `setSearchSector()`;
- `clearAttentionOverride()`.

Никаких прямых присваиваний полям `UnitModel` из компонента.

### `MemoryReadModel`

Объединяет только для представления:

- perception contacts;
- tactical threats;
- source-specific timestamps;
- реальную geometry/provenance.

Он не становится новым владельцем памяти и не записывает данные обратно.

## 8. Оставшиеся product gaps / blockers

1. `Q_HANDOFFS.md` по-прежнему отсутствует — процедурный пробел.
2. Для `Инфо` нужен подтверждённый slope/resolver contract и решение, какие именно реальные свойства показывать как `маскировка` и `защита`, без новой формулы UI.
3. Полная Intel entity/owner отсутствует.
4. Front-line knowledge owner/API отсутствует.
5. Общий historical read provider для Memory на `viewTime` отсутствует.
6. Для единого memory list нужно определить точную нормализацию display timestamp для разных source-моделей, не путая decay update с новым знанием.
7. Финальные smooth/world-bound overlays и accepted layer ordering — UI/render зависимость, не новая simulation capability.

Важно: после самопроверки **из списка блокеров снята запись управления Attention**. Режим, автоматический режим и profile application уже имеют существующие product functions.

## 9. Следующая точка интеграции

1. **АРКА:** подключает shell/right-panel и map renderer к read-models, не создавая второй game store.
2. **ПУЛЬС:** обеспечивает тот же настоящий selected `unitId/UnitModel`; ЛИНЗА не создаёт отдельный selected unit.
3. Первый безопасный вертикальный срез правой панели: `Внимание LIVE` с реальным read + существующими attention write functions.
4. Следом: `Память LIVE` для подтверждённых типов + UI filters/overlay без Intel/Front.
5. `Инфо` подключается к существующему cell/map read-path; disputed slope/cover semantics закрываются владельцем map/terrain.
6. **ХРОНИСТ:** после появления history contract даёт `viewTime`-снимок субъективных знаний для HISTORY.
7. Intel/Front получают отдельного product owner до их включения в production UI.

## 10. Проверенные product sources

На `real-wargame-preview@1246e1d612e648e7d7378db1c02be3bbf3d2a16a` проверены как минимум:

- `src/core/units/UnitModel.ts`;
- `src/core/perception/AttentionModel.ts`;
- `src/core/perception/AttentionController.ts`;
- `src/core/perception/AttentionProfiles.ts`;
- `src/core/perception/AttentionProfileStorage.ts`;
- `src/core/perception/PerceptionContact.ts`;
- `src/core/knowledge/SoldierThreatMemory.ts`;
- `src/core/knowledge/ThreatDisplayModel.ts`;
- `src/core/map/MapModel.ts`;
- `src/core/map/EnvironmentMaterialProfile.ts`;
- `src/core/simulation/SimulationState.ts`;
- `src/core/ui/RuntimeUiState.ts`;
- `src/core/visibility/SelectedUnitVisibilityField.ts`;
- `src/ui/CellInspectorContent.ts`;
- `src/ui/AttentionProfileControls.ts`;
- `src/ui/AttentionRuntimePanel.ts`;
- `src/ui/TacticalWorkspaceBaseLegacy.ts`;
- `src/rendering/PixiVisibilityHeatmapRenderer.ts`;
- `src/combat-lab/selection/CombatLabSelectionController.ts`;
- `src/combat-lab/scenario-editor/CombatLabMapContextMenu.ts`.

## 11. Проверка полного planned scope

### 11.1. Метод самопроверки

Главное требование подпроекта трактуется буквально: переносится не только принятый внешний вид, но и **весь плановый пользовательский функционал HTML-прототипа** в зоне ЛИНЗЫ.

Поэтому проверка выполнена не только по прежней таблице owners/API, но и по полному пользовательскому контракту `ACCEPTED_RIGHT_PANEL_V1.md` и обязательным связям `ACCEPTED_INTERFACE_LINKAGE_V1.md`.

Статусы ниже означают:

- **готово** — product owner/runtime contract уже есть и достаточен для переноса функции;
- **частично** — часть механизма есть, но полного принятого смысла/типа данных/адаптера ещё нет;
- **отсутствует** — product capability на проверенной базе не установлена;
- **не моя зона** — функция входит в общий planned scope Полигона, но не принадлежит ответственности ЛИНЗЫ; зависимость всё равно зафиксирована.

### 11.2. `Инфо` — полный плановый объём

| Плановая функция | Статус | Что нужно / владелец |
|---|---|---|
| Координаты и ячейка | **готово** | `TacticalMap` / `MapModel` |
| Высота | **готово** | map/terrain; есть smooth-height read |
| Уклон | **частично** | map/terrain owner должен подтвердить inspector slope semantics/read resolver |
| Тип местности/поверхности | **готово** | map + environment profile |
| Проходимость | **готово** | surface movement definition |
| Влияние на движение пехоты | **частично** | реальные movement costs есть; нужно решить, какие из них входят в пользовательскую карточку без новой формулы |
| Маскировка | **частично** | vegetation/object properties есть; нужен read presentation contract |
| Защита отдельно от маскировки | **частично** | object/fire protection есть; не смешивать с concealment |
| Объекты в точке/рядом | **частично** | `TacticalMap.objects`; нужна agreed query/радиус представления |
| Юниты под курсором/рядом | **частично** | `SimulationState.units`; нужна display spatial query |
| Клик по юниту → выбрать его | **готово** | `CombatLabSelectionController` / `SimulationState` |
| После выбора открыть `Юнит` | **не моя зона** | АРКА + ПУЛЬС, общий right-panel navigation |
| Состояние `точка под курсором / зафиксированная` | **готово** | UI-owned state |
| `Зафиксировать точку` через map context menu | **не моя зона** | АРКА/map interaction; backend не нужен |
| `Зафиксировать новую точку` | **не моя зона** | АРКА/map interaction |
| `Снять фиксацию точки` | **не моя зона** | АРКА/map interaction |

### 11.3. `Внимание` — полный плановый объём

| Плановая функция | Статус | Что нужно / владелец |
|---|---|---|
| Компактная легенда | **не моя зона** | UI/АРКА |
| Выбор профиля внимания | **готово** | AttentionProfileRegistry + `applyAttentionProfileToUnit()` |
| Выбор режима `Марш/Наблюдение/Поиск/Бой` | **готово** | `setAttentionMode()` / `setSearchSector()` |
| Вернуть автоматический режим | **готово** | `clearAttentionOverride()` |
| Фокус/direct/peripheral/rear zones | **готово** | `AttentionModeProfile` |
| Углы зон | **готово** | attention settings |
| Относительная сила внимания | **готово** | zone weights |
| Частоты проверки | **готово** | check intervals |
| Максимальная visual range | **готово** | vision settings |
| Начало distance falloff | **готово** | `distanceFalloffStartMeters` |
| Отдельная rear max range | **готово** | `rearMaximumRangeMeters` |
| Штриховая граница/fade после falloff | **не моя зона** | renderer; данные готовы |
| Центр overlay = выбранный боец | **готово по данным** | selected UnitModel position; rendering — АРКА |
| Направление overlay = фактический focus | **готово по данным** | `attentionRuntime.focusDirectionRadians` |
| World-bound при pan/zoom | **не моя зона** | renderer/АРКА; существующая world-bound база есть |
| Контактные markers постоянного screen size | **не моя зона** | renderer; не копировать старый world-scaled marker буквально |
| Текущий видимый контакт привязан к реальному unit center | **готово по данным** | `sourceUnitId` + current visibility guard; renderer/read adapter |
| Contacts выше units, field ниже units | **не моя зона** | layer ordering renderer/АРКА |
| Плавная геометрия без клеточных ступенек | **не моя зона** | renderer/АРКА; prepared data не требует нового LOS |
| `видит сейчас` | **готово** | perception contact flags/stage |
| `последние сведения` | **готово** | last-known contact state |
| `подозрение` | **готово** | cue/suspicion |
| `звук` | **готово** | source=sound |
| Confidence/context | **готово** | contact fields/explanation |
| Клик контакта → highlight marker | **готово по UI-state** | `selectedContactId` существует |
| Клик current contact → связанный реальный unit при допустимом сценарии | **частично** | selection/navigation policy должен не раскрывать скрытый unit; ПУЛЬС/АРКА |
| Не создавать display object на клетку | **готово как boundary** | existing raster/prepared field доказывает путь |
| Не пересчитывать LOS из UI | **готово как boundary** | simulation visibility owner |
| Узкие revision/dirty keys | **готово по runtime основе** | perception revision + field revision/calculationKey; новый UI не копирует polling как обязательную архитектуру |

### 11.4. `Память` — полный плановый объём

| Плановая функция | Статус | Что нужно / владелец |
|---|---|---|
| Субъективная картина конкретного бойца | **готово** | perception/tactical knowledge selected UnitModel |
| Подтверждённый контакт | **готово** | perception contacts |
| Последнее известное положение | **готово** | `lastKnownPosition` |
| Предположение | **частично** | cue/suspicion и threat evidence покрывают часть смысла; общего generic hypothesis owner нет |
| Разведданные/полученные сведения | **частично** | `reported` contacts есть; самостоятельного Intel owner нет |
| Предполагаемый фронт | **отсутствует** | нужен новый product owner/contract |
| Point geometry | **готово** | contacts/threats |
| Point + uncertainty | **готово** | uncertainty cells |
| Area geometry | **частично** | threat geometry есть, но универсальной memory-area entity нет |
| Front line/band | **отсутствует** | Front owner |
| Время получения/последнего подтверждения | **частично** | timestamps есть, но нужна source-aware display-time normalization |
| `сейчас / N с / N мин` | **готово по данным** | UI formatting над корректным timestamp |
| Старые сведения визуально слабее | **не моя зона** | UI renderer; simulation уже снижает confidence |
| Неопределённость растёт со временем | **готово** | simulation decay/growth уже существует |
| HISTORY без future leakage | **отсутствует** | ХРОНИСТ / history provider |
| Единый вертикальный список | **не моя зона** | UI/АРКА; read model должен сохранить provenance |
| Название | **готово** | label fields |
| Тип | **частично** | для существующих типов mapping возможен; Intel/Front отсутствуют |
| Возраст | **частично** | зависит от нормализации timestamp |
| Уверенность | **готово** | confidence |
| Источник | **готово** | source fields |
| Краткий смысл/неопределённость | **готово для существующих записей** | explanation + uncertainty + threat semantics |
| Filter `Тип` | **готово по UI-state** | фильтрует только реальные записи |
| Filter `Актуальность`, включая `Бессрочно` | **готово по UI-state после time normalization** | MemoryReadModel + UI |
| Toggle `Метки` default on | **не моя зона** | UI-state; аналог уже есть |
| Toggle `Время` default on | **не моя зона** | UI-state |
| Toggle `Названия` default on | **не моя зона** | UI-state |
| Toggle `Источники` default off | **не моя зона** | UI-state |
| Клик записи → highlight geometry | **частично** | contact highlight уже есть; нужен общий UI-only memory selection для threat/intel/front types |
| Приглушить всю карту | **не моя зона** | renderer/АРКА |
| World-bound memory geometry | **не моя зона** | renderer; реальные coords есть |
| Точная marker current contact | **готово по данным** | current contact |
| Last position + uncertainty circle | **готово по данным** | contact memory |
| Wide dashed hypothesis area | **частично** | style — UI; generic hypothesis area owner отсутствует |
| Отдельный стиль Intel | **частично** | style — UI; полноценный Intel owner отсутствует |
| Front band/dashed line | **отсутствует по данным** | Front owner; renderer только после появления данных |
| Renderer не владеет знаниями | **готово как boundary** | обязательное правило |

### 11.5. Связанные плановые части правой панели вне ЛИНЗЫ

| Функция | Статус для ЛИНЗЫ | Владелец/зависимость |
|---|---|---|
| Вкладка `Юнит` | **не моя зона** | ПУЛЬС + runtime unit contract |
| Общий shell, вкладки, collapse/hover/active | **не моя зона** | АРКА |
| Общая навигация linked entities | **не моя зона**, но нужна для переходов | coordinator/АРКА + entity resolver |
| Глобальный LIVE/HISTORY `viewTime` | **не моя зона**, но блокирует Memory HISTORY | ХРОНИСТ |
| `Опасность` | **не моя зона** | отдельная плановая вкладка; product layers уже существуют частично |
| `Скрытность` | **не моя зона** | отдельная плановая вкладка |
| `Позиции` | **не моя зона** | отдельная плановая вкладка |

`ACCEPTED_RIGHT_PANEL_V1.md` прямо отделяет `Опасность`, `Скрытность`, `Позиции` и дальнейшие вкладки от принятой четвёрки текущей итерации. ЛИНЗА не должна молча присваивать их себе, но самопроверка подтверждает, что они замечены и не потеряны из общего planned scope.

### 11.6. Итог обязательной самопроверки

Самопроверка выявила два существенных пробела первоначального результата:

1. контракт не раскладывал **весь** пользовательский planned scope `Инфо / Внимание / Память` по отдельным функциям;
2. write-path `Внимания` был ошибочно обозначен как полностью заблокированный, хотя на точной базе уже существуют `AttentionController`, profile registry и `applyAttentionProfileToUnit()`, которыми пользуется текущий продуктовый UI.

Оба пробела теперь зафиксированы и исправлены в этом документе.

После проверки полный статус зоны ЛИНЗЫ:

- **Инфо:** основа реальных данных есть; отдельные semantic gaps — slope, presentation cover/concealment и nearby query;
- **Внимание:** read и основные write actions продукта готовы; финальная accepted отрисовка — UI/render работа;
- **Память LIVE:** значительная часть реальных данных готова; generic hypothesis/Intel/front не полностью покрыты;
- **Память HISTORY:** отсутствует до общего history provider;
- **Intel:** только реальные `reported` contacts как частный случай; самостоятельная система отсутствует;
- **Front:** отсутствует;
- **UI LOS / fake memory / fake Intel / fake Front:** запрещены.
