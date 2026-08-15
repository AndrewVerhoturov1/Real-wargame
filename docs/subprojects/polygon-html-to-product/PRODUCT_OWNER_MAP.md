# Карта штатных владельцев данных Полигона

## Назначение

Этот документ фиксирует карту владельцев данных и точек подключения для переноса принятого HTML-прототипа Полигона в продуктовый Real Wargame.

Рабочая база исследования: `6d0f567f72c89d0f0c0401bf790b5122a9eb0ad3`.

Исходный HTML указан в постановке задачи как:

`C:\Users\andre\Downloads\polygon-series-v1.1-memory-v3-interface-linkage.html`

с SHA-256:

`4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.

Локальный файл из Windows в рамках этой работы не открывался и его SHA-256 независимо не перепроверялся. Его назначение здесь — идентичность принятого UX-артефакта, а не источник продуктовой архитектуры.

## Правила чтения карты

Статусы:

- **есть** — в коде на рабочей базе подтверждены настоящий владелец и пригодная штатная точка подключения для указанной узкой ответственности;
- **частично** — владелец или механизм существует, но контракт принятого Полигона шире либо публичная граница чтения/изменения ещё не подтверждена полностью;
- **отсутствует** — обязательная продуктовая основа явно не представлена найденным механизмом и принятые документы прямо отделяют её как будущую runtime-задачу;
- **не установлено** — по проверенным источникам нельзя доказать, кто является настоящим владельцем либо какой интерфейс считается штатным; додумывание запрещено.

Основные архитектурные правила:

1. HTML фиксирует UX, связи и сценарии, но не является владельцем игровых данных, архитектурой или API.
2. Живое игровое состояние принадлежит симуляции и её подсистемам. UI может владеть только чисто интерфейсным состоянием: активной вкладкой, раскрытием панели, фильтром, текущим режимом показа и подобным.
3. Старый продуктовый Полигон (`src/combat-lab/**`, `src/core/testing/combat-lab/**`) рассматривается как источник уже работающих механизмов и точек интеграции, но не как разрешение копировать временные UI-структуры.
4. Имена из `docs/ai/repo-context.json` используются только как архитектурный контекст. Если конкретный класс из этого документа не подтверждён в коде точной рабочей базы, он не считается установленным владельцем. В частности, такие имена, как `SessionController` и `GamePersistenceService`, не были подтверждены как текущие TypeScript-точки подключения на указанной базе.
5. Семантические ключи Interface Linkage v1 (`eventId`, `sourceActionId`, `artifactId`, `journalId`, `messageId`, `metricRefs[]`) не объявляются продуктовыми идентификаторами автоматически. Сам принятый документ прямо оставляет их сопоставление с продуктом открытым.

## Обязательные источники

Документ составлен по следующим источникам на рабочей базе:

- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/STATUS.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_VISION.md`;
- `docs/subprojects/polygon-prototype/SUBPROJECT.md`;
- `docs/subprojects/polygon-prototype/STATUS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_LABORATORY_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`;
- `docs/ai/repo-context.json`;
- `docs/architecture/MODULE_MAP.md`;
- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- перечисленные ниже файлы продукта в `src/**`.

## Основная карта

| Функция UI | Данные или действие | Настоящий владелец | Существующий код / источник | Точка подключения при переносе | Статус |
|---|---|---|---|---|---|
| 1. Оболочка Полигона: активная вкладка, раскрытые блоки, фильтры | Только состояние представления | Новый UI Полигона в пределах UI-состояния; игровая истина ему не принадлежит | `MIGRATION_VISION.md`; `AGENTS.md` | Локальное состояние новой оболочки без дублирования `SimulationState`/эксперимента | **есть** |
| 2. Каталог встроенных сценариев | ID, revision, название, описание, категория, роли, поддерживаемые метрики, исходное состояние | Реестр сценариев Combat Lab в своей узкой области | `src/core/testing/combat-lab/CombatLabScenarioRegistry.ts`: `listCombatLabScenarioDefinitions()`, `getCombatLabScenarioDefinition()`, `buildCombatLabInitialState()` | Читать текущие встроенные сценарии через реестр, а не из HTML-массива | **частично** |
| 3. Определение эксперимента | `experimentId`, revision, snapshot сцены, роли, метки, дорожки/шаги, условия, batch defaults | `CombatLabExperimentV1` | `src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts` | Рабочий черновик через `CombatLabExperimentDraft.getExperiment()/replaceExperiment()` | **есть** |
| 4. Сохранение/импорт определения эксперимента | JSON эксперимента и список локальных сохранений | Codec определения + локальное хранилище старого Combat Lab | `CombatLabExperimentFileActions.ts`; `CombatLabExperimentLocalStore.ts` | `CombatLabExperimentFileCodecV1`, `CombatLabExperimentLocalStore` | **частично** |
| 5. Редактор карты/сцены эксперимента | Карта и объекты стартовой сцены, позиции участников, метки | Определение эксперимента и штатная модель сцены/карты | `CombatLabExperimentV1.sceneSnapshot`; `src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts`; `src/core/simulation/SceneSnapshot.ts`; `src/core/map/MapModel.ts` по `MODULE_MAP.md` | Использовать существующий authoring-контроллер/scene snapshot; не переносить HTML-карту как данные | **частично** |
| 6. Редактор участника/юнита | Стартовые параметры участника в определении эксперимента | Роль эксперимента + `sceneSnapshot`; конечные поля юнита принадлежат `UnitModel` и подсистемам | `src/combat-lab/editor/CombatLabParticipantMutationPort.ts`; `CombatLabExperimentDraft.ts`; `src/core/units/UnitModel.ts` | `CombatLabParticipantMutationPort.readInitial()/updateInitial()` и штатные функции обновления определения | **частично** |
| 7. Выбор юнита на карте | `selectedUnitId` и выбранный `UnitModel` | `SimulationState` | `src/core/simulation/SimulationState.ts`: `getSelectedUnit(s)`; `src/combat-lab/selection/CombatLabSelectionController.ts` | `CombatLabSelectionController.selectParticipant()/syncFromProductSelection()` | **есть** |
| 8. Связанный выбор между картой, Программой, Журналом, Метриками, Серией | Универсальная ссылка на продуктовую сущность и режим фокуса | Для юнита — `SimulationState`; общий владелец межраздельной навигации не подтверждён | `ACCEPTED_INTERFACE_LINKAGE_V1.md`; `CombatLabSelectionController.ts` | Для участника уже есть мост `roleId -> unitId`; для остальных сущностей штатный общий resolver не установлен | **частично** |
| 9. Правая вкладка «Юнит» в LIVE | Положение, состояние, здоровье, мораль, подавление, усталость, поза, приказ игрока, текущее действие, оружие, боезапас, ранения | `UnitModel` и его runtime-подсистемы внутри `SimulationState` | `src/core/units/UnitModel.ts`; `src/core/simulation/SimulationState.ts`; `ACCEPTED_RIGHT_PANEL_V1.md` | Чтение выбранного `UnitModel` через `getSelectedUnit()`; конкретные поля — из соответствующих runtime-структур | **есть** |
| 10. Изменение позы/боевых действий/движения из Полигона | Производственные команды симуляции | Подсистемы orders/actions/infantry-combat; Combat Lab лишь адаптер | `src/core/testing/combat-lab/CombatLabCommands.ts` | `executeCombatLabCommand()` уже переводит действия Полигона в штатные команды, включая posture/fire/move/reload/deploy/transfer/first aid | **есть** |
| 11. Программа: редактирование структуры | Дорожки, стабильные `trackId`, `stepId`, действия, условия, повторы, таймауты | `CombatLabExperimentV1` + `CombatLabExperimentDraft` | `CombatLabExperimentContracts.ts`; `CombatLabExperimentDraft.ts`; `src/combat-lab/scenario-editor/**` | Редактировать через draft и существующие редакторы шагов/дорожек | **есть** |
| 12. Программа: выполнение, Processing, Follow Up | Состояние шага, попытка, owner token, start/complete time, результат команды | `CombatLabScenarioExecutor` + производственная симуляция | `src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts`; `CombatLabCommands.ts`; `SimulationTick.ts` | `beforeSimulationStep()`, `afterSimulationStep()`, `getSnapshot()` | **частично** |
| 13. Единая причинная цепочка Interface Linkage | `eventId -> sourceActionId -> artifactId -> journalId/messageId/metricRefs` | Продуктовый универсальный владелец такой идентичности не подтверждён | `ACCEPTED_INTERFACE_LINKAGE_V1.md`; runtime имеет `experimentId/trackId/stepId/ownerToken`, но не принятый общий набор | Сначала установить официальное сопоставление с существующими product IDs; HTML-ключи не копировать | **не установлено** |
| 14. `focusArtifact()` и переход из события к карте/артефакту | UI-навигация по настоящему ID без изменения доменного состояния | Общий продуктовый навигатор/selection resolver не подтверждён | `ACCEPTED_INTERFACE_LINKAGE_V1.md`; частичные механизмы `CombatLabSelectionController.ts`, `CombatLabGameEditorLinks.ts` | Переиспользовать узкие существующие переходы, но общий `artifactId -> navigation` контракт сначала установить | **не установлено** |
| 15. Правая вкладка «Инфо» | Координата, высота/уклон, местность, проходимость, маскировка/защита, объекты/юниты рядом | Модель карты/мира + `SimulationState.units`; сама зафиксированная точка может быть UI-состоянием | `ACCEPTED_RIGHT_PANEL_V1.md`; `src/core/map/MapModel.ts` по `MODULE_MAP.md`; `SimulationState.ts` | Чтение штатной карты и юнитов по мировой координате; единого готового info-query API не подтверждено | **частично** |
| 16. Правая вкладка «Внимание»: чтение | Режим, профиль, геометрия внимания, восприятие/контакты | `UnitModel.attentionSettings`, `attentionRuntime`, `perceptionKnowledge` и perception/attention subsystem | `src/core/units/UnitModel.ts`; `src/core/perception/AttentionModel.ts`; `ACCEPTED_RIGHT_PANEL_V1.md` | Читать уже подготовленное simulation-owned состояние; UI не пересчитывает LOS/видимость | **есть** |
| 17. Правая вкладка «Внимание»: изменение профиля/режима | Настройки/выбранный профиль внимания | Attention subsystem / поля `UnitModel`; окончательная публичная команда изменения не подтверждена | `src/ui/AttentionProfileControls.ts` показывает текущую продуктовую запись; `UnitModel.ts` | Существующий UI меняет поля напрямую и пересоздаёт runtime; перед переносом подтвердить, является ли это допустимой штатной write-boundary | **частично** |
| 18. Правая вкладка «Память» | Текущие/прошлые контакты, уверенность, неопределённость, источник, тактические угрозы | `UnitModel.perceptionKnowledge`, `UnitModel.tacticalKnowledge`; обновление угроз — `SoldierThreatMemory` | `src/core/knowledge/SoldierThreatMemory.ts`; `UnitModel.ts`; `ACCEPTED_RIGHT_PANEL_V1.md` | Читать знания конкретного бойца и их revision; не строить объективную память в UI | **частично** |
| 19. Общие игровые редакторы | Обычные авторитетные профили/настройки игры | Собственные реестры редакторов и владельцы соответствующих профилей | `src/game-editors/GameEditorRegistry.ts`; `src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts`; `CombatLabGameEditorLinks.ts` | `GameEditorRegistry.listForSurface('combat-lab')`; открытие через существующие определения редакторов | **есть** |
| 20. Лаборатория: временные overrides | Параметр + экспериментальное значение + цель/область | Постоянное значение — реальный subsystem/registry owner; экспериментальный override — определение эксперимента после появления штатной цепочки разрешения | `ACCEPTED_LABORATORY_V1.md`; текущие `CombatLabExperimentV1` participant parameters покрывают только узкую часть | Каталог владельцев можно брать из реальных editor/registry definitions; общей production resolution chain overrides пока нет | **частично** |
| 21. Метрики: существующий фиксированный сбор Combat Lab | Выстрелы, попадания, ранения, подавление, время действий, боезапас, blood loss, first aid и др. из списка v1 | `SimulationState` + `CombatLabMetrics` как сборщик производных | `src/core/testing/combat-lab/CombatLabMetrics.ts`; `CombatLabContracts.ts` | `createCombatLabMetricCollector()`, `observeCombatLabMetrics()`, `finalizeCombatLabMetrics()` | **есть** |
| 22. Метрики v18: конструктор измерения и raw telemetry | Поток данных, участники, ограничения состояния, период, записи JSON/JSONL, аналитика поверх них | Универсальный product telemetry collector/store не подтверждён | `ACCEPTED_METRICS_V18.md` прямо отделяет production telemetry как будущую задачу; текущий `CombatLabMetrics.ts` — фиксированный агрегатор | Нельзя брать demo-data HTML. Сначала определить существующие структурированные источники и общий контракт сбора/хранения | **отсутствует** |
| 23. Якоря Метрик к Программе | Стабильный ID входа/выхода узла или выхода ветвления | Программа владеет шагами; отдельная модель measurement-anchor не подтверждена | `ACCEPTED_METRICS_V18.md`; `CombatLabExperimentV1` имеет стабильные `trackId/stepId` | `trackId/stepId` могут быть частью сопоставления, но сам контракт anchor нельзя выводить из них без подтверждения | **частично** |
| 24. Журнал одного живого запуска | Переходы шагов, принятые/отклонённые команды, ошибки, breakpoint, время | Runtime эксперимента; текущая проекция — `CombatLabExperimentRunJournal` | `src/combat-lab/runtime/CombatLabExperimentRunState.ts` | `recordTransitions()` по snapshot executor и command results | **частично** |
| 25. Журнал v4: структурированная полная история и `viewTime` | Основные события + metric events + состояние мира и выбранного юнита в прошлом без утечки будущего | Универсальный Journal adapter + history/replay provider должны быть продуктовой основой; готовый общий владелец не найден | `ACCEPTED_JOURNAL_V4.md` прямо разделяет `JournalEvent` и history/replay state и фиксирует отсутствие найденного generic rewind provider | Текущий журнал на 256 записей не заменяет history provider. Подключение возможно только после установления источников событий и исторического состояния | **отсутствует** |
| 26. Чат: системная карточка того же действия/события | Проекция того же causal event и ссылки на Journal/artifact | Продуктовый источник/хранилище игровых chat/system messages не установлен | `ACCEPTED_INTERFACE_LINKAGE_V1.md` оставляет product chat/log source открытым; поиск кода не подтвердил игровой chat owner | Не создавать отдельный HTML-массив сообщений. Сначала установить, существует ли вообще штатный игровой message/log механизм | **не установлено** |
| 27. Серия: массовый расчёт | Замороженный эксперимент, run count, seed strategy, результаты, агрегаты, представители | `CombatLabBatchRunner` + `CombatLabExperimentRunner` | `src/core/testing/combat-lab/experiment/CombatLabBatchRunner.ts`; `CombatLabExperimentRunner.ts`; batch contracts | `runCombatLabBatch()` и связанные функции уже дают детерминированный вычислительный каркас | **частично** |
| 28. Серия: история серий, долговечные результаты и точное воспроизведение выбранного прогона | Сохранённый snapshot, все seeds, версия runtime, run records, отчёт, replay | Долговечное хранилище Series и deterministic replay provider в проверенном коде не подтверждены | `ACCEPTED_SERIES_V1.md` прямо называет эти пункты следующими runtime-задачами; `BatchRunner` возвращает результаты в памяти | Не использовать массивы/снимки HTML как хранилище. Сначала определить persistence + runtime version identity + replay contract | **отсутствует** |
| 29. Каноническое сохранение состояния продукта/сессии | Живой мир, состояние запуска, возможно история | Текущий канонический владелец на точной TypeScript-базе не установлен | `docs/ai/repo-context.json` упоминает архитектурные сервисы сохранения, но соответствующая актуальная точка кода на базе не подтверждена; Combat Lab local store хранит только definition | Не подменять сохранение продукта `localStorage` старого Combat Lab | **не установлено** |
| 30. Идентичность игрока / готовность участника | Кто пользователь/игрок, какие участники готовы к запуску | Для участника есть `roleId -> unitId`; отдельный owner player identity/readiness не подтверждён | `polygon-html-to-product/STATUS.md` фиксирует это как blocker; `CombatLabExperimentRoleV1` покрывает только роль и unit ID | До сценариев, зависящих от player/readiness, установить настоящий product owner | **не установлено** |
| 31. Reservation/planning DTO -> runtime | Планирование/резервирование перед запуском и его преобразование в runtime | Не установлено | `polygon-html-to-product/STATUS.md` фиксирует границу как blocker; в проверенных Combat Lab contracts отдельный подтверждённый owner не установлен | Не переносить DTO/структуры из HTML. Сначала найти или утвердить существующую product boundary | **не установлено** |

## Подробности и границы ответственности

### 1. UI-оболочка

**Источник факта:** `MIGRATION_VISION.md`, разделы о новом верхнем UI и правиле «один объект — один настоящий владелец»; `AGENTS.md` о том, что UI не должен становиться gameplay truth.

**Граница владельца:** оболочка может хранить только состояние представления. Она не хранит копию юнита, карты, эксперимента, метрик, памяти или результата запуска.

**Ограничение:** даже удобный объект `appState` в HTML нельзя переносить целиком, если в нём смешаны UI и доменные данные.

**Подтвердить:** форму минимального UI-state нового shell и способ подписки на реальные владельцы.

### 2-5. Сценарий, эксперимент, сохранение definition и карта

**Источники факта:** `CombatLabScenarioRegistry.ts`, `CombatLabExperimentContracts.ts`, `CombatLabExperimentDraft.ts`, `CombatLabExperimentFileActions.ts`, `CombatLabExperimentLocalStore.ts`, `CombatLabMapAuthoringController.ts`, `SceneSnapshot.ts`, `MIGRATION_VISION.md`.

**Граница владельца:** встроенный scenario registry владеет именно текущим каталогом Combat Lab; `CombatLabExperimentV1` владеет настраиваемым определением одного эксперимента. `sceneSnapshot` — стартовое состояние эксперимента, а не произвольная UI-копия живого мира.

**Ограничения:**

- наличие `listCombatLabScenarioDefinitions()` не доказывает, что этот registry должен стать общим каталогом всех будущих сценариев;
- `CombatLabExperimentLocalStore` использует браузерный `localStorage`, хранит максимум 10 недавних definition и не является подтверждённым общим сохранением игры;
- карта HTML не переносится как источник данных.

**Подтвердить до реализации:** должен ли новый Полигон продолжать использовать именно `CombatLabScenarioRegistry` как каталог базовых экспериментов и является ли `CombatLabExperimentV1` долгоживущим продуктовым контрактом нового shell без изменения семантики.

### 6-9. Участник, выбор и инспектор юнита

**Источники факта:** `CombatLabParticipantMutationPort.ts`, `CombatLabSelectionController.ts`, `SimulationState.ts`, `UnitModel.ts`, `ACCEPTED_RIGHT_PANEL_V1.md`, `MIGRATION_VISION.md`.

**Граница владельца:**

- выбор живого бойца принадлежит `SimulationState`;
- живое состояние бойца принадлежит `UnitModel` и его runtime-подсистемам;
- редактируемое стартовое состояние эксперимента принадлежит definition/snapshot и не должно автоматически считаться тем же самым, что live runtime.

**Ограничение:** это главная неоднозначность первого вертикального среза. Старый редактор участника редактирует исходное состояние эксперимента, тогда как правый инспектор должен читать живого выбранного юнита. Нельзя соединить их прямой общей mutable-моделью ради удобства UI.

**Подтвердить до реализации:** точную семантику команды «изменить юнита» в новом Полигоне: изменение стартового definition до запуска, изменение live runtime через допустимую команду, либо два явно разделённых режима.

### 10-12. Команды и Программа

**Источники факта:** `CombatLabCommands.ts`, `CombatLabExperimentContracts.ts`, `CombatLabScenarioExecutor.ts`, `CombatLabExperimentRunner.ts`, `MIGRATION_VISION.md`.

**Граница владельца:** Программа задаёт экспериментальную последовательность и ссылки на роли/метки; реальное действие выполняют производственные подсистемы симуляции. `CombatLabCommands` — адаптер, а не владелец оружия, движения, позы или медицины.

**Ограничения:**

- `accuracyOverrides` и другие test-oriented возможности нельзя автоматически превращать в общие игровые настройки;
- executor умеет дать состояние шага и результат команды, но Interface Linkage требует более широкую идентичность, связывающую те же факты с Журналом, Чатом, Метриками и навигацией.

**Подтвердить до реализации:** какие runtime identity (`experimentId`, `trackId`, `stepId`, `ownerToken`, production event IDs) официально участвуют в межраздельных ссылках.

### 13-14. Причинная идентичность и навигация

**Источник факта:** `ACCEPTED_INTERFACE_LINKAGE_V1.md` прямо говорит, что prototype IDs могут быть сопоставлены с product IDs только если такие IDs существуют, и оставляет durable identity/navigator открытыми.

**Граница владельца:** UI может хранить только текущий фокус. Истинная идентичность объекта или события должна происходить из владельца соответствующей сущности.

**Ограничение:** `eventId`, `artifactId` и подобные строки HTML нельзя объявить продуктовой схемой без проверки.

**Подтвердить:** таблицу фактического соответствия для каждого вида сущности: Program step, unit, marker, runtime event, Journal event, measurement, Series run.

### 15. «Инфо» карты

**Источники факта:** `ACCEPTED_RIGHT_PANEL_V1.md`, `MODULE_MAP.md`, `MapModel.ts`, `SimulationState.ts`.

**Граница владельца:** данные местности и объектов — у карты/мира; список и состояние бойцов — у симуляции. Зафиксированная пользователем точка может быть локальным UI-состоянием.

**Ограничение:** отдельный стабильный query/service, который одним вызовом собирает все принятые поля «Инфо», не подтверждён.

**Подтвердить:** штатные read-функции для elevation/slope/passability/concealment/cover и поиска объектов/юнитов возле мировой точки.

### 16-18. «Внимание» и «Память»

**Источники факта:** `UnitModel.ts`, `AttentionModel.ts`, `AttentionProfileControls.ts`, `SoldierThreatMemory.ts`, `ACCEPTED_RIGHT_PANEL_V1.md`.

**Граница владельца:** perception/attention/memory считаются производным состоянием симуляции конкретного бойца. Renderer только показывает подготовленный результат.

**Ограничения:**

- текущий `AttentionProfileControls.ts` показывает рабочий путь записи, но делает прямую мутацию полей `UnitModel`; не установлено, что именно этот способ должен стать публичной write-boundary нового Полигона;
- `SoldierThreatMemory` подтверждает тактическую память угроз с confidence/uncertainty/source/revision, но не доказывает готовность всех принятых типов памяти, например общей разведывательной области и предполагаемой линии фронта в требуемой форме;
- в HISTORY нужен time-aware снимок этих данных, которого текущая live-модель сама по себе не даёт.

**Подтвердить:** публичный путь изменения attention mode/profile и наличие product contracts для всех пяти принятых типов знаний памяти.

### 19-20. Общие редакторы и Лаборатория

**Источники факта:** `GameEditorRegistry.ts`, `CombatLabGameEditorCatalogue.ts`, `CombatLabGameEditorLinks.ts`, `ACCEPTED_LABORATORY_V1.md`.

**Граница владельца:** общий игровой параметр остаётся у своего настоящего registry/config/subsystem owner. Лаборатория имеет право только временно переопределять значение в рамках эксперимента.

**Ограничение:** принятый Laboratory v1 прямо фиксирует production descriptor/adapter layer и resolution chain overrides как будущую задачу. Наличие каталога общих редакторов решает поиск постоянных владельцев, но не разрешение экспериментального override.

**Подтвердить:** для каждого параметра Лаборатории — authoritative owner, descriptor, допустимый scope, precedence и способ сброса override.

### 21-23. Метрики

**Источники факта:** `CombatLabMetrics.ts`, `CombatLabContracts.ts`, `ACCEPTED_METRICS_V18.md`.

**Граница владельца:** факты возникают в симуляции; сборщик метрик только наблюдает и агрегирует. Определение пользовательского измерения и raw telemetry — отдельный продуктовый слой, если он будет существовать.

**Ограничения:** текущий `CombatLabMetrics` имеет фиксированный список metric IDs и возвращает агрегированные числовые результаты. Он не реализует весь контракт Metrics v18: произвольный поток, участников, state constraints, временное окно по Program anchors, raw records, хранение и аналитические блоки.

**Подтвердить:** какие runtime-структуры считаются источниками каждого принятого потока и существует ли общий способ подписки/снимка без введения параллельной истории в UI.

### 24-26. Журнал, история и Чат

**Источники факта:** `CombatLabExperimentRunState.ts`, `ACCEPTED_JOURNAL_V4.md`, `ACCEPTED_INTERFACE_LINKAGE_V1.md`.

**Граница владельца:** текущий `CombatLabExperimentRunJournal` — ограниченная runtime-проекция переходов Program/commands. Он не является универсальной историей мира. `JournalEvent` и историческое состояние мира — разные сущности.

**Ограничения:**

- текущий журнал ограничен 256 записями;
- у его записи есть sequence/time/kind/trackId/stepId, но нет принятой общей durable identity для `artifactId/messageId/metricRefs`;
- `ACCEPTED_JOURNAL_V4.md` прямо фиксирует, что универсальный generic rewind provider не был найден;
- игровой product chat/system-message owner по проверенным источникам не установлен.

**Подтвердить:** источники T1/T2/T3 событий, ID события, правила корреляции с Program/metrics и отдельный history/replay provider, способный восстановить также perception/memory/weapon state на `viewTime`.

### 27-28. Серия

**Источники факта:** `CombatLabBatchRunner.ts`, `CombatLabExperimentRunner.ts`, `CombatLabExperimentContracts.ts`, `ACCEPTED_SERIES_V1.md`.

**Граница владельца:** batch runner отвечает за вычисление независимых запусков и агрегирование текущих результатов; история исследований и детерминированное воспроизведение требуют отдельной долговечной основы.

**Что уже есть:** run count, fixed/sequential/explicit seeds, проверка identity/source digest, метрики по запускам, success/failure summary, representative candidates.

**Ограничения:** принятый Series v1 прямо не считает доказанными background runner, хранилище результатов, production telemetry aggregation и deterministic replay. Текущий batch result в памяти не заменяет эти части.

**Подтвердить:** где сохраняются frozen experiment, runtime version, каждый seed/run result и как конкретный run заново открывается в обычном live Полигоне с проверкой воспроизводимости.

### 29-31. Неподтверждённые системные границы

**Источники факта:** `polygon-html-to-product/STATUS.md`, `docs/ai/repo-context.json`, проверенный текущий TypeScript-код Combat Lab.

**Граница:** не подменять product persistence локальным `CombatLabExperimentLocalStore`; не выводить player identity/readiness из `roleId`; не переносить reservation/planning DTO из HTML.

**Подтвердить:** актуальные TypeScript-владельцы на рабочей базе. Пока это не установлено, в реализации должны оставаться явные разрывы, а не временные «источники истины» в новой оболочке.

## Владельцы, которые уже готовы

Готовность здесь означает только указанную узкую ответственность, а не полную готовность соответствующей вкладки UX.

- **`SimulationState` + `UnitModel`** — живое состояние и выбор бойца для чтения.
- **Производственные orders/actions/infantry-combat механизмы через `CombatLabCommands`** — выполнение основных действий Полигона без отдельной симуляции.
- **`CombatLabExperimentV1` + `CombatLabExperimentDraft`** — определение эксперимента, роли, метки, дорожки и шаги со стабильными ID и revision.
- **`CombatLabScenarioExecutor`** — выполнение Программы и runtime-состояние шагов.
- **`CombatLabMetrics`** — существующий фиксированный набор боевых метрик.
- **`GameEditorRegistry`** — каталог уже существующих общих авторитетных редакторов.
- **Attention/perception live state в `UnitModel`** — источник чтения для вкладки «Внимание».

## Владельцы, которые есть частично

- **`CombatLabScenarioRegistry`** — реальный каталог текущих встроенных сценариев, но не подтверждён как общий будущий каталог всего Полигона.
- **`CombatLabSelectionController`** — хорошо связывает участника с настоящим юнитом, но не является универсальным селектором Program/Journal/Metrics/Series.
- **`CombatLabParticipantMutationPort`** — штатно изменяет стартовое состояние участника в definition, но не решает семантику live-редактирования.
- **Map authoring + `sceneSnapshot`** — есть продуктовая основа сцены, но полный accepted Map Editor contract требует отдельной сверки каждого инструмента.
- **Attention write-path** — рабочая запись существует, но публичная доменная граница не подтверждена.
- **`SoldierThreatMemory` / perception knowledge** — реальная память угроз/контактов есть, но весь accepted Memory contract не доказан.
- **Laboratory** — есть настоящие общие registries/editors, но нет подтверждённой общей цепочки экспериментальных overrides.
- **Метрики** — есть фиксированный сбор текущего Combat Lab, но нет принятого общего measurement/telemetry слоя Metrics v18.
- **`CombatLabExperimentRunJournal`** — есть runtime timeline Program, но не полный Journal v4 и не history provider.
- **`CombatLabBatchRunner`** — есть вычислительное ядро Series, но не долговечная история Series и не доказанный deterministic replay.

## Где HTML особенно легко ошибочно принять за источник истины

Нельзя переносить из standalone HTML как продуктовые данные или владельцев:

- массив сценариев и их demo metadata, если аналог должен приходить из `CombatLabScenarioRegistry`/другого подтверждённого product registry;
- локальные копии юнитов, оружия, боезапаса, здоровья, приказов и действий;
- `eventId`, `sourceActionId`, `artifactId`, `journalId`, `messageId` как готовую продуктовую схему идентификаторов;
- массивы Journal/history и искусственные snapshots;
- массивы chat/system cards;
- demo-метрики, нормализованные A/B-значения и raw telemetry, которой нет в продукте;
- seed/result arrays Серии как замену product batch result store;
- расчёты LOS, внимания, видимости и памяти;
- разведданные и предполагаемую линию фронта, если их product owner не публикует;
- `window.*`, глобальные объекты, временные router/focus functions;
- `localStorage` прототипа как замену каноническому сохранению продукта;
- любые demo fallbacks, которые тихо заполняют отсутствующие product data.

## Функции, которым сначала нужна продуктовая основа

До реализации соответствующего интерфейса необходимо сначала закрыть продуктовый контракт для:

1. **единой причинной идентичности** между действием, Program runtime, Journal event, chat projection, metric refs и навигацией;
2. **общего межраздельного navigator/selection resolver** по настоящим product IDs;
3. **Metrics v18 telemetry**: measurement definition, raw event/state collection, временные окна/anchors и хранение;
4. **Journal v4 history/replay provider**, включая historical `UnitModel`-проекцию без знаний из будущего;
5. **игровой chat/system-message projection**, если она действительно должна существовать как отдельный продуктовый механизм;
6. **Laboratory override resolution chain** над настоящими владельцами параметров;
7. **Series result persistence + runtime version identity + deterministic replay**;
8. **каноническое product/session persistence**, отличное от локального сохранения definition старого Combat Lab;
9. **player identity/readiness** там, где UI-сценарий от них зависит;
10. **reservation/planning DTO -> runtime boundary**, если она нужна выбранному вертикальному срезу.

## Порядок уточнения владельцев для первого вертикального среза

Первый срез из `MIGRATION_VISION.md` должен оставаться узким:

`карта -> выбранный юнит -> редактор юнита -> правая вкладка «Юнит» -> настоящий Unit`

До начала кода предлагается уточнить владельцев в следующем порядке:

1. **Зафиксировать выбор юнита.** Подтвердить `SimulationState` и существующий selection path как единственный источник выбранного live unit; `CombatLabSelectionController` использовать как адаптер старого Полигона, не как второй SSOT.
2. **Развести definition и live runtime.** Принять решение, что именно редактирует «Редактор юнита»: стартовое состояние `CombatLabExperimentV1.sceneSnapshot`, живой runtime через штатные команды или два явно разделённых режима. Это необходимо сделать раньше подключения полей формы.
3. **Зафиксировать read-contract правой вкладки «Юнит».** Для каждого принятого поля указать точный путь в `UnitModel`/runtime: player command отдельно от текущего действия, posture, health/wounds, morale, suppression, fatigue, weapon/ammo/readiness.
4. **Для каждого изменяемого поля найти write-boundary.** Если уже есть production command/request function — использовать её. Прямая запись в объект допускается только там, где существующий продуктовый редактор действительно является штатным владельцем редактируемого definition/config state.
5. **Проверить обновление после изменения.** Один и тот же `unitId` должен оставаться связан между картой, редактором и инспектором; после допустимого изменения все три представления должны читать новое значение от настоящего владельца, без промежуточной копии в новой оболочке.
6. **Зафиксировать критерий готовности среза.** Выбор на карте открывает того же юнита в редакторе и инспекторе; изменение проходит через установленную точку подключения; инспектор показывает фактический результат; смена выбора синхронно переключает все три части; после перезапуска/сброса не остаётся скрытого UI-owned доменного состояния.
7. **Только после этого переходить к коду.** Журнал, Метрики, Series и Interface Linkage causal identity не должны блокировать первый срез, если он не пытается включить их связи преждевременно.

Такой порядок позволяет начать перенос с уже существующих владельцев (`SimulationState`, `UnitModel`, experiment definition и штатные команды) и не создавать временную архитектуру, которую затем пришлось бы удалять при подключении Журнала, Метрик и Серии.
