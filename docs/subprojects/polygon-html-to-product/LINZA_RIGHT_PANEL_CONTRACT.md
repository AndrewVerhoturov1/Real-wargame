# LINZA — контракт реальных данных правой панели

## 0. Основание и границы

Роль: **ЛИНЗА** — контракт реальных данных вкладок `Инфо`, `Внимание`, `Память` нового Полигона.

Рабочая ветка:

`feature/20260815-polygon-linza-right-panel-contract`

Точная продуктовая база:

`real-wargame-preview@1246e1d612e648e7d7378db1c02be3bbf3d2a16a`

Документ фиксирует только владельцев, доступные источники чтения, допустимые границы записи и отсутствующие возможности. UI-код, новые runtime-механизмы и демонстрационные данные в эту работу не входят.

### Важный пробел входного handoff

Указанный в задаче файл

`docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md`

не найден ни на проверенном `real-wargame-preview`, ни в ветке `feature/20260815-polygon-html-to-product`, ни поиском по репозиторию на момент исследования. Поэтому этот документ **не восстанавливает и не додумывает** отсутствующий handoff.

Для понимания принятого UX и уже проведённой аналитики использованы существующие документы подпроекта, в частности `MIGRATION_SYNTHESIS.md`, `EXECUTION_STREAMS.md`, `PRODUCT_OWNER_MAP.md` из его собственного исследовательского коммита и принятый `ACCEPTED_RIGHT_PANEL_V1.md`. Все выводы о наличии product capability дополнительно сверены с исходниками на точной продуктовой базе выше.

## 1. Неподвижные архитектурные правила

1. Правая панель не является владельцем игровой истины.
2. UI может владеть только состоянием представления: активной вкладкой, раскрытием секций, фильтрами, зафиксированной точкой карты и параметрами показа оверлея.
3. `UnitModel`, карта, восприятие, внимание и память читаются из существующих владельцев; копия этих данных в новом store не создаётся.
4. UI **не вычисляет LOS, visibility, обнаружение или обновление памяти**. Он показывает уже подготовленное simulation-owned состояние.
5. Отсутствующие `Intel`/`Front` нельзя заменять чтением объективных вражеских юнитов, локальными массивами, эвристикой или данными HTML-прототипа.
6. Прямая запись в `UnitModel` из нового UI не считается разрешённой только потому, что такой код есть в старом редакторе. Для нового Полигона нужна подтверждённая штатная write-boundary.
7. Если реальных данных нет, допустимое состояние — честное `нет данных / возможность ещё не подключена`, а не синтетическое заполнение.

## 2. Сводная карта готовности

| Вкладка / часть | Реальный владелец | Подтверждённый источник | Чтение | Запись из нового UI | Статус |
|---|---|---|---|---|---|
| `Инфо`: координата/ячейка | `TacticalMap` | `src/core/map/MapModel.ts` (`worldToGrid`, `getCell`, `gridToCellLabel`) | да | нет | **готово к чтению** |
| `Инфо`: поверхность, растительность, высота | `TacticalMap` + environment profile | `MapCell.surfaceMaterialId`, `vegetationMaterialId`, `height`; `EnvironmentMaterialProfile.ts` | да | нет | **готово к чтению** |
| `Инфо`: проходимость/влияние на движение | environment profile | `SurfaceMaterialDefinition.movement`, `VegetationMaterialDefinition.movement` | да | нет | **готово к чтению** |
| `Инфо`: маскировка/часть защитных свойств | environment profile + map objects | `VegetationMaterialDefinition.visibility/fire`; `MapObject` и `resolveObjectCoverProperties()` | да, но из нескольких владельцев | нет | **частично** |
| `Инфо`: объекты и юниты рядом | `TacticalMap.objects` + `SimulationState.units` | `MapModel.ts`, `SimulationState` | да | только штатный selection-путь при выборе строки юнита | **частично** |
| `Инфо`: уклон как единое каноническое поле | не установлен | готовый info-query/resolver не подтверждён | нет единого контракта | нет | **пробел** |
| `Внимание`: режим/источник режима | attention subsystem / `UnitModel` | `UnitModel.attentionRuntime.mode`, `modeSource` | да | не подтверждено | **готово к чтению** |
| `Внимание`: профиль/геометрия/частоты/дальности | attention subsystem / `UnitModel` | `attentionSettings`, `AttentionModel.ts` | да | не подтверждено | **готово к чтению** |
| `Внимание`: направление/цель/сектор поиска | attention runtime | `attentionRuntime.focusDirectionRadians`, `focusTargetId`, `searchCenterRadians`, `searchArcRadians` | да | не подтверждено | **готово к чтению** |
| `Внимание`: воспринимаемые контакты | perception subsystem | `UnitModel.perceptionKnowledge.contacts` | да | нет | **готово к чтению** |
| `Внимание`: LOS/visibility | perception/visibility subsystem | simulation-owned расчёты; `AttentionModel.resolveAttentionSample()` — доменная часть модели внимания | только готовый результат | **запрещено считать в UI** | **владелец есть, UI не владеет** |
| `Память`: контакты и последние сведения | perception memory | `UnitModel.perceptionKnowledge` / `PerceptionContact.ts` | да | нет | **готово к ограниченному LIVE** |
| `Память`: тактические угрозы | tactical knowledge / threat-memory subsystem | `UnitModel.tacticalKnowledge`; `SoldierThreatMemory.ts` | да | нет | **готово к ограниченному LIVE** |
| `Память`: полученные/донесённые сведения | perception memory, когда реально присутствуют | `PerceptionContactSource = reported | sound | fire_pressure | visual` | да для существующих записей | нет | **частично** |
| `Память`: самостоятельный `Intel` owner | не найден | отдельный продуктовый Intel-контракт/API не подтверждён | нет | нет | **блокер** |
| `Память`: предполагаемый `Front` | не найден | продуктовый front-line knowledge owner/API не подтверждён | нет | нет | **блокер** |
| `Память`: HISTORY/viewTime | общий исторический read-contract | в этой задаче готовый контракт не подтверждён | не для этого среза | нет | **блокер для HISTORY, не для LIVE** |

## 3. Вкладка `Инфо`

### 3.1. Что можно подключать без нового backend/runtime

`Инфо` должна читать реальную точку карты, а не состояние выбранного юнита. Зафиксированная точка — допустимое UI-owned состояние.

На текущей базе `TacticalMap` уже содержит:

- размеры и `metersPerCell`;
- ячейки;
- `surfaceMaterialId`;
- `vegetationMaterialId`;
- дискретную высоту `height`;
- объекты карты.

`MapModel.ts` уже предоставляет преобразование world/grid, чтение ячейки и человекочитаемую координату. `EnvironmentMaterialProfile.ts` содержит настоящие свойства поверхности и растительности: проходимость, сопротивление движению, маскировку/visibility, свойства огневой защиты и тактическое укрытие. У объектов карты есть собственные cover/concealment свойства.

Следовательно, **узкий LIVE-инспектор точки можно строить как read-only агрегатор существующих данных**.

### 3.2. Чего нельзя объявлять готовым

Не подтверждён единый `InfoQuery`/`MapInspector` API, который одним вызовом возвращает весь принятый набор `высота + уклон + поверхность + проходимость + маскировка + защита + nearby objects/units`.

Особенно:

- отдельного канонического поля/результата `slope` для правой панели не подтверждено;
- «маскировка» и «защита» живут в нескольких физических свойствах материалов/объектов и не должны сводиться UI к новой игровой формуле;
- поиск «рядом» должен использовать существующую геометрию/пространственные правила либо простой явно интерфейсный радиус отображения, но не превращаться в новую доменную систему.

Поэтому первая интеграция `Инфо` может показывать только те значения, смысл которых уже однозначно принадлежит продукту. Для спорных агрегатов нужен отдельный owner/resolver.

### 3.3. Запись

`Инфо` по умолчанию read-only.

Разрешённое UI-состояние:

- `hoveredPoint`;
- `pinnedPoint`;
- режим `под курсором / зафиксировано`;
- раскрытие секций.

Нажатие на найденный реальный юнит может вызывать **существующий выбор юнита**, но не менять `SimulationState.units` напрямую.

## 4. Вкладка `Внимание`

### 4.1. Реальный read-contract

`UnitModel` прямо содержит:

- `attentionSettings: UnitAttentionSettings`;
- `attentionRuntime: AttentionRuntimeState`;
- `playerAttentionProfileId`;
- `perceptionKnowledge`.

`AttentionRuntimeState` даёт:

- режим `march | observe | search | engage`;
- источник режима `automatic | ai | player`;
- фактическое направление фокуса;
- `focusTargetId`;
- центр и ширину сектора поиска;
- runtime-времена следующих проверок зон.

`UnitAttentionSettings` даёт профили фокуса, прямого внимания, периферии и тыла, веса, частоты проверки, длительности выборок и параметры дальности зрения.

`perceptionKnowledge.contacts` даёт реальные текущие субъективные контакты с:

- стадией `cue / suspicion / contact / identified / confirmed`;
- источником `visual / sound / reported / fire_pressure`;
- уверенностью и неопределённостью;
- последним известным положением;
- `visibleNow` и `observedNow`;
- временем наблюдения/обновления;
- объяснениями perception-системы.

Это достаточная основа для честной LIVE-вкладки без новой модели данных.

### 4.2. Граница LOS/visibility

В `AttentionModel.ts` находится доменная модель зон внимания, включая `resolveAttentionSample()`. Контакты обновляются в perception subsystem и уже записываются в `UnitPerceptionKnowledge`.

**Новый UI не должен вызывать собственный клеточный LOS, повторно определять обнаружение или строить альтернативную visibility-систему.**

Для панели допустимо:

- рисовать геометрию зон из готовых `attentionSettings` + `attentionRuntime`;
- показывать уже опубликованные контакты;
- привязывать маркеры к карте;
- обновляться по выбранному юниту/revision/runtime/camera.

Недопустимо:

- сканировать карту ради определения видимости;
- пересчитывать LOS при движении курсора или открытии вкладки;
- превращать объективные `state.units` в «то, что боец видит».

### 4.3. Write-boundary

Старый `src/ui/AttentionProfileControls.ts` при `Применить к выбранному` прямо делает:

- замену `selected.attentionSettings`;
- сброс `selected.playerAttentionProfileId`;
- пересоздание `selected.attentionRuntime`;
- изменение `selected.viewAngleRadians`.

Это **подтверждает существующее поведение**, но не подтверждает публичный доменный API для нового Полигона.

Поэтому контракт ЛИНЗЫ:

- чтение `Внимания` — **разрешено сейчас**;
- изменение профиля/режима из новой правой панели — **заблокировано до фиксации штатной команды/мутационного порта владельца attention subsystem**;
- новый UI не должен копировать прямую мутацию `UnitModel` из `AttentionProfileControls.ts`.

## 5. Вкладка `Память`

### 5.1. Что реально существует

Есть два независимых, но связанных источника субъективного знания бойца.

#### A. `perceptionKnowledge`

`PerceptionContactMemory` уже хранит:

- тип/стадию контакта;
- источник;
- уверенность;
- неопределённость;
- последнее известное положение;
- `visibleNow` / `observedNow`;
- время последнего наблюдения и обновления;
- объяснения.

Это подходит для текущих контактов, прошлых контактов, подозрений, звуковых и реально полученных reported-сведений.

#### B. `tacticalKnowledge`

`UnitTacticalKnowledge.threats` хранит `KnownThreatMemory`: геометрию угрозы, уверенность, неопределённость, источник, текущую видимость, время последнего наблюдения/обновления и данные огневой угрозы.

`syncSoldierThreatMemory()` обновляет эту память внутри simulation-owned подсистемы на основании perception contacts, pressure zones и combat threat evidence. UI здесь только читатель.

### 5.2. Честный первый LIVE-срез

Первая продуктовая вкладка `Память` может объединить **для отображения**, не для владения:

- `perceptionKnowledge.contacts`;
- `tacticalKnowledge.threats`.

Допустимый адаптер должен сохранять provenance: тип исходной записи, source, confidence, uncertainty и timestamps. Он не должен сливать две модели так, чтобы потерять их смысл или создать новую каноническую память.

При отсутствии записей показывается пустое состояние.

### 5.3. Intel и Front

Принятый UX предусматривает отдельные классы знаний:

- разведданные/полученные сведения;
- предполагаемое положение фронта.

На проверенной продуктовой базе **не найден отдельный владелец или API для Intel и Front**, который соответствовал бы этим сущностям.

При этом `PerceptionContactSource.reported` уже позволяет честно показать конкретное донесённое сведение, если оно реально находится в памяти бойца. Это **не даёт права** объявить существование общего Intel subsystem.

Запрещено:

- генерировать Intel из объективного списка врагов;
- превращать pressure zones в «линию фронта»;
- строить Front по среднему положению сторон;
- переносить `intel/front` из HTML;
- создавать demo-ID или локальную память ради заполнения вкладки.

Итог:

- `reported` сведения из существующей perception memory — **можно показывать**;
- общий `Intel` — **не подтверждён**;
- `Front` — **не подтверждён**;
- соответствующие разделы должны отсутствовать/показывать честное отсутствие данных до появления product owner.

### 5.4. Write-boundary

Вкладка `Память` для этого этапа полностью read-only.

UI не должен:

- добавлять/удалять контакты;
- менять confidence/uncertainty/timestamps;
- помечать объективные позиции как «известные»;
- непосредственно писать `perceptionKnowledge` или `tacticalKnowledge`;
- запускать `syncSoldierThreatMemory()` как UI-действие.

Все изменения этих данных принадлежат simulation/perception/knowledge subsystem.

## 6. Минимальные адаптеры, которые допустимы позже

Ниже — **границы**, а не требование создать их в этой ветке.

### `InfoReadModel`

Тонкий read-only адаптер над:

- `SimulationState.map`;
- `SimulationState.units`;
- environment profile.

Он может нормализовать подписи и формат представления, но не вводить новые игровые формулы.

### `AttentionReadModel`

Тонкий read-only адаптер над выбранным `UnitModel`:

- `attentionSettings`;
- `attentionRuntime`;
- `perceptionKnowledge`.

### `MemoryReadModel`

Тонкий read-only адаптер над:

- `perceptionKnowledge.contacts`;
- `tacticalKnowledge.threats`.

Он обязан сохранять источник каждой записи и не объявляется новым memory owner.

### `AttentionWritePort`

Нужен **до** реализации управления профилем/режимом из правой панели. Его владельцем должна быть существующая attention/perception сторона, а не UI. Конкретное имя/API в этой работе не выдумывается.

## 7. Пробелы и блокеры

### Пробелы

1. `Q_HANDOFFS.md` отсутствует в проверенных refs.
2. Для `Инфо` нет единого готового query API.
3. Канонический смысл `уклона` для панели не оформлен отдельным read-contract.
4. Составные показатели маскировки/защиты требуют аккуратного чтения существующих физических свойств; UI не должен придумывать итоговый балл.
5. Для изменения профиля/режима внимания нет подтверждённой публичной write-boundary нового Полигона.
6. Нет доказанного общего `Intel` owner/API.
7. Нет доказанного `Front` knowledge owner/API.
8. Историческое чтение `Памяти`/`Внимания` по `viewTime` этим LIVE-контрактом не решено.

### Что не является блокером первого LIVE-среза

- отсутствие Intel/Front не блокирует показ настоящих perception contacts и tactical threats;
- отсутствие единого `InfoQuery` не блокирует узкое read-only отображение однозначных полей карты;
- отсутствие write-port внимания не блокирует read-only `Внимание`.

## 8. Следующая точка интеграции

Рекомендуемый следующий merge/integration point после принятия этого контракта:

1. В каркас АРКИ подключить **read-only** источники `Инфо`, `Внимание`, `Память` через тонкие адаптеры без нового store игровых данных.
2. Для выбранного юнита использовать тот же настоящий `unitId`/`UnitModel`, который установит контракт ПУЛЬСА; отдельный selected-unit для правой панели не создавать.
3. Сначала реализовать `Внимание` LIVE и ограниченную `Память` LIVE на подтверждённых полях.
4. `Инфо` подключать только по однозначным значениям карты; спорные агрегаты вынести в отдельный resolver владельца.
5. До включения управления профилем/режимом внимания отдельно утвердить `AttentionWritePort`/штатную команду.
6. Intel, Front и HISTORY не реализовывать до появления соответствующих product contracts.

## 9. Проверенные исходники

На `real-wargame-preview@1246e1d612e648e7d7378db1c02be3bbf3d2a16a` непосредственно проверены:

- `src/core/units/UnitModel.ts`;
- `src/core/perception/AttentionModel.ts`;
- `src/core/perception/PerceptionContact.ts`;
- `src/core/knowledge/SoldierThreatMemory.ts`;
- `src/ui/AttentionProfileControls.ts`;
- `src/core/map/MapModel.ts`;
- `src/core/map/EnvironmentMaterialProfile.ts`;
- `src/core/simulation/SimulationState.ts`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`.

Аналитические ориентиры:

- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `PRODUCT_OWNER_MAP.md` из исследовательского commit `7058ab74c0f22df65a913a61e6ce759bcd4ecedc`.

## 10. Итоговый контракт ЛИНЗЫ

- **Инфо:** `PARTIAL / LIVE READ` — реальные карта и юниты есть, но нет единого info-query и не все принятые производные оформлены владельцем.
- **Внимание:** `READY / LIVE READ`; `WRITE BLOCKED` — реальные settings/runtime/perception есть, но новый UI не получает право прямой мутации `UnitModel`.
- **Память:** `READY-PARTIAL / LIVE READ` — perception contacts и tactical threats реальны; объединение только представительное и с сохранением происхождения.
- **Intel:** `NOT ESTABLISHED`.
- **Front:** `NOT ESTABLISHED`.
- **LOS/visibility calculation in UI:** `FORBIDDEN`.
- **Memory writes from UI:** `FORBIDDEN`.
