# ХРОНИСТ — контракт сквозной идентичности эксперимента

## 1. Назначение и границы

Этот документ фиксирует, как при переносе принятого Полигона в продукт должна сохраняться одна причинная цепочка между:

`Experiment → Program → runtime → Journal → History/viewTime → Metrics/telemetry → Run → Series → replay → persistence`.

Цель — не придумать недостающие подсистемы, а отделить уже существующие product owners от отсутствующих возможностей и определить минимальные контракты, без которых UI не имеет права изображать связную историю эксперимента.

Рабочая база исследования:

- `base_branch`: `real-wargame-preview`;
- `base_commit`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- `feature_branch`: `feature/20260815-polygon-chronist-experiment-contract`.

Документационный handoff прочитан из `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md` ветки `feature/20260815-polygon-execution-map`, где для ХРОНИСТА зафиксирован тот же base commit.

Обязательные принятые UX/reference-контракты:

- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`;
- дополнительно для границ исследования: `ACCEPTED_LABORATORY_V1.md` и `ACCEPTED_INTERFACE_LINKAGE_V1.md`.

Жёсткая граница этого документа:

- никаких fake Journal/history;
- никакой fake telemetry;
- никаких synthetic Series;
- никаких demo-ID как product identity;
- никакого временного replay, выдаваемого за историческое воспроизведение;
- никакого UI-owned runtime/history store вместо отсутствующей product capability;
- никакого нового универсального Laboratory engine без доказанных owners параметров и resolution chain.

---

## 2. Краткий вывод

На base commit уже есть реальная и полезная основа:

1. `CombatLabExperimentV1` — версионируемое описание эксперимента с `experimentId`, `revision`, сценой, ролями, Program tracks/steps, defaults, stop/success conditions и batch defaults.
2. Program имеет устойчивые `trackId` и `stepId`; редактор увеличивает `revision` при изменениях.
3. Визуальный runtime имеет структурированный `CombatLabExperimentRunJournal` с `sequence`, `simulatedSeconds`, `kind`, `trackId`, `stepId`, `attempt`.
4. Метрики текущего Combat Lab реально считаются из production `SimulationState` через `CombatLabMetrics`.
5. Серия реально запускает множество headless-прогонов; запрос имеет `batchRunId`, experiment snapshot, seed strategy и выбранные текущие `CombatLabMetricId`.
6. Результат прогона содержит `experimentId`, `experimentRevision`, `sourceDigest`, `seed`, metrics, `eventDigest`, `finalStateDigest`.
7. Эксперимент реально сериализуется, импортируется/экспортируется файлом и локально сохраняется в браузере.

Но принятую связность Полигона нельзя считать production-ready целиком:

- нет общего `HistoryProvider` и общего `viewTime` для исторического чтения всей сцены;
- нет универсального структурированного event/telemetry log, который связывает все product events с одним `runId`;
- текущий видимый Journal в Combat Lab в основном рендерит transient сообщения текущей сессии, а структурированный журнал не является долговременным хранилищем;
- принятый Metrics v18 — UX/reference contract; production measurement definitions и telemetry stream для него не реализованы;
- текущий `COMBAT_LAB_METRIC_IDS` — фиксированный каталог тестовых агрегатов, а не принятый пользовательский конструктор измерений;
- есть `batchRunId`, но нет долговременного `SeriesRecord` и отдельного устойчивого `RunRecord/runId` для каждого прогона;
- результат Series живёт в памяти UI (`latestBatchResult`) и не имеет product persistence;
- `replayCombatLabRepresentativeRun()` делает rerun-from-seed на текущем experiment definition; это не recorded historical replay;
- нет идентификатора версии simulation runtime в результатах прогона;
- принятая Laboratory v1 не имеет общего production descriptor/resolution/persistence слоя;
- текущий Save/Open сохраняет `CombatLabExperimentV1`, но он ещё не содержит принятые Laboratory definitions и Metrics measurement definitions, поэтому это не полный Polygon Experiment envelope.

Следовательно, ближайшая честная интеграция — **Program ↔ Journal LIVE на существующих идентификаторах**, но без заявления о полном History/replay. History, Metrics v18 → telemetry, Laboratory, долговременная Series и full Save/Open должны проходить отдельные capability gates ниже.

---

## 3. Карта существующих owners на base commit

| Область | Текущий product owner / источник | Что уже реально | Чего не хватает для принятого Полигона |
|---|---|---|---|
| Experiment definition | `src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts` | `experimentId`, `revision`, `sceneSnapshot`, roles, markers, tracks, defaults, conditions, batch defaults | Laboratory state, Metrics measurement definitions, общий persistence envelope результатов |
| Program authoring | `src/combat-lab/scenario-editor/CombatLabExperimentDraft.ts` | стабильные `trackId`/`stepId`, ссылки между шагами, revision bump | обратная навигация к долговременным Journal events |
| Program runtime | `CombatLabScenarioExecutor` + `CombatLabExperimentVisualController` | runtime state шага, ownerToken, started/completed time, failure reason | единый durable `runId`, общий event identity |
| Structured Program Journal | `src/combat-lab/runtime/CombatLabExperimentRunState.ts` | typed entries: sequence/time/kind/trackId/stepId/attempt | `eventId`, `runId`, entity refs вне Program, persistence |
| Visible runtime Journal | `CombatLabVisualSession.eventJournal` + `CombatLabExtension.renderRuntimeJournal()` | реальные сообщения текущей visual session | строки не являются каноническим event store; нет исторического состояния |
| Current time | `SimulationState.simulationTimeSeconds`; runtime snapshots `simulatedSeconds` | единое текущее simulation time внутри запуска | нет общего `viewTime`, History mode и history coverage |
| Current Combat Lab metrics | `src/core/testing/combat-lab/CombatLabMetrics.ts` | реальные агрегаты из `SimulationState` | нет accepted Metrics v18 definitions/telemetry stream |
| Current metric catalog | `COMBAT_LAB_METRIC_IDS` в `CombatLabContracts.ts` | фиксированный набор тестовых numeric metrics | не должен становиться вторым каталогом рядом с Metrics v18 |
| Batch/Series execution | `CombatLabBatchRunner` / `CombatLabBatchClient` / `CombatLabBatchPanel` | реальные независимые прогоны, seed, progress, aggregation | durable Series/Run records, runtime version, full run history |
| Batch correlation | `CombatLabBatchRequestV1.batchRunId` | идентичность одного выполняемого batch | UI генерирует ID; он не является доказанным долговременным `SeriesId` |
| Per-run result | `CombatLabExperimentRunResultV1` | experiment ref, sourceDigest, seed, metrics, event/final digests | отдельный `runId`, runtime version, telemetry/history refs |
| Representative result | `CombatLabRepresentativeRunV1` | `runIndex`, seed, result, metrics, digests | durable run identity и frozen input reference |
| Replay-like action | `CombatLabRepresentativeRunReplay.ts` | reset visual controller на seed + representative context | recorded replay отсутствует; frozen series snapshot не восстанавливается из хранилища |
| Experiment file persistence | `CombatLabExperimentSerialization` + `CombatLabExperimentFileActions` | `.combat-lab.json` import/export | ещё не полный accepted Polygon envelope |
| Browser persistence | `CombatLabExperimentLocalStore.ts` | до 10 экспериментов по `experimentId`, revision, savedAt | нет Series/Run/history/telemetry storage; localStorage не общий product archive |
| Laboratory | accepted UX: `ACCEPTED_LABORATORY_V1.md` | UX/роль определены | generic product descriptor/adapter, resolution chain, persisted overrides отсутствуют |

### Важное уточнение по Journal

На base commit существуют **два близких, но не одинаковых слоя**:

1. `CombatLabExperimentRunJournal` — структурированные переходы Program runtime;
2. `CombatLabVisualSession.eventJournal` — строки о более широких событиях visual session, включая выстрелы/попадания/эффекты и сообщения Program.

Нельзя объявлять строковый `eventJournal` каноническим Journal Полигона. Нельзя и считать структурированный Program journal полным Journal, потому что он пока описывает в основном Program transitions и command results, а не всю причинную историю production events.

---

## 4. Каноническая идентичность: что есть и что требуется

### 4.1. Уже существующие устойчивые ключи

На base commit допустимо опираться на:

- `experimentId`;
- `experiment.revision`;
- `sourceDigest = digestCombatLabExperiment(experiment)`;
- `roleId` + настоящий `unitId`;
- `trackId`;
- `stepId`;
- runtime `ownerToken` как техническую связь действия с активным шагом, пока действие живёт;
- production entity IDs, когда они реально существуют в соответствующем owner (`unitId`, `shotId`, `actionId` и т.п.);
- `batchRunId` как correlation ID выполняемой текущей batch-задачи;
- `runIndex` и `seed` как атрибуты batch-прогона, но **не как замену durable run identity**;
- `eventDigest` / `finalStateDigest` как контрольные отпечатки результата, но **не как ID события или replay artifact**.

### 4.2. Составная ссылка на Program step

`stepId` сам по себе недостаточен для долговременной ссылки. Минимальная причинная ссылка должна быть логически эквивалентна:

```text
ProgramStepRef =
  experimentId
  + experimentRevision
  + trackId
  + stepId
```

`sourceDigest` рекомендуется сохранять рядом с этой ссылкой при фиксации run/result, чтобы обнаружить рассогласование содержимого даже при ошибочной повторной выдаче той же revision.

UI не должен искать старый шаг только по заголовку или русской строке сообщения.

### 4.3. Требуемые типы идентичности

Следующие сущности нужны принятому Polygon contract, но на base commit не доказаны как общие product capabilities:

- `SeriesId` — долговременная идентичность результата серии;
- `RunId` — долговременная идентичность конкретного прогона;
- `JournalEventId` — долговременная идентичность структурированного события или, если owner гарантирует это контрактом, составная `(runId, eventSequence)`;
- `MeasurementDefinitionId` — идентичность пользовательского измерения Metrics;
- `TelemetryRecordId` либо эквивалентная устойчивая позиция в telemetry stream;
- `HistoryPointRef` / `SnapshotRef` — ссылка на доказанное историческое состояние;
- `RuntimeVersionId` — неизменяемая идентичность версии simulation runtime, влияющей на воспроизводимость;
- `LaboratoryOverrideId` — идентичность сохранённого experiment override, когда появится production Laboratory owner.

Это **целевой контракт**, а не утверждение, что такие ID уже реализованы. Их генерация должна принадлежать соответствующему product owner/persistence layer. UI не должен синтезировать их из `Date.now()`, индекса карточки, заголовка или demo seed.

---

## 5. Program ↔ Journal: причинный контракт

### 5.1. Program → runtime

Источник истины — зафиксированная revision `CombatLabExperimentV1`.

Каждое исполнение Program step должно сохранять причинную ссылку на:

- experiment identity (`experimentId`, `revision`, желательно `sourceDigest` на уровне run);
- `trackId`;
- `stepId`;
- attempt;
- simulation time;
- runtime owner/action identity, если production command её выдаёт.

Текущий `CombatLabExperimentRunJournal` уже хранит `trackId`, `stepId`, `attempt`, `simulatedSeconds` и тип перехода. Это пригодная основа для первой LIVE-связности.

### 5.2. runtime event → JournalEvent

Канонический `JournalEvent` не должен быть строкой. Минимально он должен нести:

```text
identity:
  runId
  event identity / monotonic event sequence

time:
  simulatedSeconds

classification:
  tier
  category/kind
  outcome/severity where applicable

causality:
  programStepRef?   // exact experiment revision + trackId + stepId
  parent/cause event ref? if owner provides one

entities:
  stable typed refs to real unit/weapon/shot/action/marker/... IDs

history:
  historyPointRef?  // only if a real history provider can resolve it

presentation:
  localized message/details derived from structured data
```

Текст `messageRu` — представление события, а не его identity и не источник ссылок.

### 5.3. Journal → Program

Переход из события в Program разрешён, если событие содержит `ProgramStepRef`.

Алгоритм перехода:

1. открыть Program;
2. проверить, что доступна именно revision, на которой был выполнен run;
3. выбрать `trackId/stepId`;
4. если открыт уже изменённый текущий эксперимент, не подменять старую ссылку новым шагом с тем же ID без предупреждения/исторического контекста.

Для LIVE run на неизменённой revision текущий Program editor может использовать существующие IDs напрямую.

### 5.4. Program → Journal

Обратная ссылка `Срабатывания в Журнале: N` должна быть запросом к event owner:

```text
run/experiment revision + trackId + stepId → JournalEvent[]
```

Program UI не должен вести собственный массив «срабатываний».

### 5.5. Первый допустимый вертикальный срез

Можно реализовать раньше общего History:

`Program step → structured runtime transition → Journal event → двусторонний переход Program ↔ Journal`.

Условия:

- один текущий visual run;
- честная пометка LIVE;
- никакого обещания сохранённой истории после закрытия/перезапуска;
- никакой подстановки старого состояния карты при клике на событие, пока HistoryProvider отсутствует.

---

## 6. History / viewTime

### 6.1. Текущее состояние

На исследованном base commit общий `viewTime`/HistoryProvider не найден. Workspace Combat Lab содержит `Сцена`, `Программа`, `Серия`, `Параметры`, `Настройка игры`, `Метрики`, `Журнал`, но не имеет общей product-вкладки/службы History.

Есть текущее simulation time:

- `SimulationState.simulationTimeSeconds`;
- `simulatedSeconds` в runtime snapshots;
- время структурированных Journal entries.

Этого недостаточно для чтения прошлого состояния.

### 6.2. Минимальный history-provider contract

Чтобы выполнить Journal v4 и правую панель без fake-history, нужен read-only owner, способный ответить как минимум на следующие вопросы:

```text
getCoverage(runRef)
  → recorded/reconstructible time range + unavailable domains

getLiveTime(runRef)
  → latest simulation time

resolveStateAt(runRef, viewTime, requestedDomains)
  → historical snapshot/projection OR explicit unavailable

resolveStateForEvent(runRef, journalEventRef, requestedDomains)
  → same, anchored to the event time/ref
```

`requestedDomains` нужен, потому что разные подсистемы могут получить history support не одновременно: physical/unit state, ammunition, suppression, perception, attention, memory и т.д.

Provider не обязан с первого дня уметь rewind всего мира. Он обязан **честно сообщать coverage**.

### 6.3. LIVE и HISTORY

Логическая модель:

```text
LIVE:
  viewTime = liveTime
  reads = current authoritative runtime

HISTORY:
  viewTime = explicitly selected past time
  reads = HistoryProvider only
  live runtime may continue independently
```

Переключение в HISTORY не должно откатывать, клонировать или мутировать настоящий runtime.

Возврат `К текущему` меняет только режим просмотра.

### 6.4. Future-leakage boundary

В HISTORY запрещено читать current runtime для поля, которое пользователь воспринимает как историческое.

Особенно это относится к:

- perception/contact state;
- attention;
- memory;
- ammunition;
- wounds/physiology;
- suppression/morale;
- weapon/action state;
- effective Laboratory values, если они зависели от времени.

Если на `viewTime` нет исторического значения, UI должен показать `недоступно в истории`/эквивалентное состояние. Подставлять текущее значение нельзя.

Формальное правило:

> Данные, отображаемые в HISTORY, могут зависеть только от источника с `asOfTime <= viewTime` либо от явно timeless metadata. Current runtime state после `viewTime` не участвует в вычислении.

### 6.5. JournalEvent ≠ history snapshot

Событие отвечает на вопрос «что произошло».

Исторический снимок отвечает «каким было состояние».

Наличие `JournalEvent.simulatedSeconds` не доказывает, что product умеет восстановить состояние на этой секунде.

---

## 7. Metrics → telemetry → Series

### 7.1. Два разных слоя, которые нельзя смешивать

На base commit `CombatLabMetrics` — реальный, но фиксированный тестовый collector. Он считает набор `COMBAT_LAB_METRIC_IDS` непосредственно из `SimulationState` и возвращает агрегированные числа.

Принятый Metrics v18 описывает другое:

`measurement definition → структурированный raw telemetry stream → аналитический отчёт`.

Следовательно:

- существующий Combat Lab collector остаётся действующим product/testing owner своих текущих metrics;
- он не становится скрытой реализацией всего Metrics v18;
- Series Полигона не должен заводить второй независимый каталог `hits/accuracy/losses/...`, если accepted linkage требует выбранные пользователем measurement definitions.

### 7.2. MeasurementDefinition

Product Metrics должен владеть определением измерения. Минимальная идентичность определения:

```text
MeasurementDefinitionRef =
  measurementDefinitionId
  + definition revision/fingerprint
```

Само определение должно содержать только необходимые для сбора данные, соответствующие принятому v18:

- источник/тип потока;
- участники/targets через реальные entity refs;
- необязательные условия состояния;
- период сбора;
- Program anchors через точные ProgramStepRef/anchor IDs;
- enabled/disabled state.

Series не редактирует это определение.

### 7.3. TelemetryRecord

Минимальная запись потока должна иметь связь:

```text
runId
measurementDefinitionRef
simulatedSeconds
source event/entity refs
value/payload согласно типу measurement
typed provenance
```

Если запись порождена конкретным Journal/runtime event, связь должна идти по структурированному event ref, а не по совпадению времени/текста.

### 7.4. Run values

Агрегированные значения одного прогона вычисляются из telemetry, а не заменяют её там, где accepted Metrics требует raw data.

Допустима оптимизация с предварительными агрегатами, если остаётся доказуемая связь:

```text
MeasurementDefinitionRef
  → telemetry coverage for RunId
  → derived RunMetricValue
```

### 7.5. Series aggregation

Series агрегирует **один и тот же снимок определения измерений** по множеству RunRecord.

Она обязана знать:

- какой measurement set был зафиксирован при старте;
- какие runIds входят в aggregate;
- сколько run values реально доступно;
- версию/отпечаток определения каждого measurement;
- правила обработки failed/cancelled/incomplete runs.

Series не должна читать «текущий» Metrics editor после того, как серия завершилась, и молча переименовывать/переопределять старые результаты.

---

## 8. SeriesRecord и RunRecord

### 8.1. Что есть сейчас

Текущий batch stack уже имеет полезные элементы:

- `CombatLabBatchRequestV1.batchRunId`;
- целый `experiment` внутри request;
- `experimentRevision` + `sourceDigest` в batch identity/result;
- seed каждого запуска;
- `runIndex` для representative runs;
- metrics, result, event/final digests.

`CombatLabBatchPanel` создаёт `batchRunId` в UI и держит active identity только на время запуска. `CombatLabExtension` хранит только `latestBatchResult` в памяти. При изменении эксперимента batch отменяется, а latest result очищается.

Поэтому нынешний `batchRunId` — полезный execution correlation ID, но его нельзя автоматически объявить долговременным `SeriesId`.

### 8.2. Целевой SeriesRecord

Минимальный долговременный record должен логически содержать:

```text
SeriesRecord
  seriesId
  experimentRef:
    experimentId
    experimentRevision
    sourceDigest
  frozenExperimentInputRef OR embedded immutable input envelope
  runtimeVersionId
  measurementSetSnapshot/ref
  executionConfig
  status
  created/completed metadata
  ordered runIds
  aggregate results + aggregation version
  integrity metadata
```

`frozenExperimentInputRef` не может быть ссылкой на mutable current draft.

### 8.3. Целевой RunRecord

```text
RunRecord
  runId
  seriesId?                // null/absent for standalone run
  runIndex?                // ordering attribute, not identity
  experimentRef
  frozenExperimentInputRef
  runtimeVersionId
  seed
  status/stopReason
  simulatedSeconds
  measurement values/refs
  telemetryRef?            // only when persisted
  journalRef?              // only when persisted
  history/replayArtifactRef? // only when real
  eventDigest
  finalStateDigest
```

### 8.4. Почему `seed` недостаточен

Одинаковый seed не гарантирует тот же результат при изменении:

- experiment inputs;
- simulation code/runtime version;
- ordering/determinism behavior;
- каталогов/данных, влияющих на runtime;
- Laboratory resolution rules.

Поэтому воспроизводимость требует как минимум frozen input + seed + runtime version и проверки результата.

---

## 9. Rerun-from-seed и recorded replay

### 9.1. Что делает текущий код

`replayCombatLabRepresentativeRun(controller, representative)`:

1. останавливает visual controller;
2. вызывает `controller.reset(representative.seed)`;
3. записывает контекст `runIndex/stopReason`.

`controller.reset()` берёт experiment через текущий `getExperiment()` и заново строит runtime.

Это **rerun-from-seed**.

Функция не читает записанный event log, snapshot stream или replay artifact и не восстанавливает frozen Series input из долговременного хранилища.

### 9.2. Разрешённые названия поведения

Пока есть только описанный механизм, допустимые формулировки:

- `Повторить с тем же seed`;
- `Перезапустить репрезентативный прогон`;
- `Rerun` в техническом интерфейсе.

Нельзя обещать пользователю `точное историческое воспроизведение`, если оно не доказано.

### 9.3. Recorded historical replay

Настоящий recorded replay требует product artifact, который позволяет читать/восстанавливать фактически записанный прошлый run. Возможные реализации могут отличаться, но контракт должен доказать хотя бы одно:

- сохранённые snapshots/checkpoints + event stream;
- сохранённый детерминированный input/event log с совместимым runtime;
- другой канонический replay artifact.

ХРОНИСТ не выбирает здесь конкретный движок хранения.

### 9.4. Детерминированный rerun

Даже при frozen inputs и runtime version rerun следует отличать от recorded replay.

Можно повышать доверие проверкой:

```text
rerun eventDigest == stored eventDigest
AND
rerun finalStateDigest == stored finalStateDigest
```

Совпадение digest подтверждает воспроизведение результата для проверяемого набора данных, но не превращает rerun в recorded history source для произвольного historical `viewTime`, если соответствующие исторические состояния не сохранены/не восстанавливаются provider-ом.

---

## 10. Laboratory в Experiment envelope

### 10.1. Принятая роль

Accepted Laboratory v1 определяет Laboratory как временные experiment overrides над реальными product параметрами. Она не создаёт второй каталог и не становится глобальным source of truth.

Production должен иметь цепочку:

```text
parameter descriptor
→ authoritative owner/source
→ base value
→ Laboratory target/scope
→ experiment override
→ runtime resolution
→ effective value + provenance
```

### 10.2. Текущее состояние

В текущем `CombatLabExperimentV1` есть специализированные test overrides, например accuracy settings на participant/default/step level. Это не доказывает наличие универсального Laboratory.

Workspace tabs на base commit не содержат отдельной product Laboratory capability.

Следовательно, нельзя:

- обобщать существующий accuracy override в универсальную лабораторию на уровне UI;
- хранить произвольные пары `path/value` без descriptor owner;
- применять глобально значение без доказанного authoritative write path.

### 10.3. Место в сохранении

Когда production Laboratory contract появится, её definitions должны быть частью versioned **Experiment input envelope**, потому что они влияют на результат run и на его воспроизводимость.

Каждый override должен ссылаться на стабильный descriptor/source и stable target IDs. Геометрические области должны храниться в канонических координатах карты с собственной identity, а не как пиксели UI.

---

## 11. Save / Open и persistence

### 11.1. Что уже реализовано

Текущий Combat Lab реально умеет:

- сериализовать/парсить `CombatLabExperimentV1`;
- экспортировать `.combat-lab.json` через Blob;
- импортировать файл с валидацией;
- сохранять до 10 последних экспериментов в `window.localStorage`;
- индексировать их по `experimentId`, `titleRu`, `revision`, `savedAt`.

Это не fake persistence.

### 11.2. Но это ещё не full Polygon Save/Open

Accepted Interface Linkage требует, чтобы `Сохранить эксперимент` покрывало концептуально:

- карту;
- юниты;
- Program;
- Laboratory;
- Metrics definitions и относящиеся настройки.

Текущий `CombatLabExperimentV1` уже покрывает scene snapshot/units и Program, но не доказывает наличие accepted Laboratory state и Metrics v18 definitions. Поэтому видимый новый Polygon UI не должен называть неполный payload «полным сохранением эксперимента» до расширения envelope.

### 11.3. Целевой ExperimentEnvelope

Минимально:

```text
ExperimentEnvelope
  envelopeSchemaVersion
  experimentId
  experimentRevision
  sourceDigest/fingerprint

  scene/participants
  program
  laboratory definitions
  measurement definitions
  experiment settings/defaults/conditions
  batch/series defaults that are experiment inputs

  referenced catalog/schema versions where required
```

Envelope должен сериализоваться одним product owner или согласованным versioned codec, а не собираться UI из нескольких несвязанных `localStorage` ключей.

### 11.4. Атомарность Open

`Открыть эксперимент` должно:

1. прочитать и проверить schema version;
2. проверить ссылки/IDs и обязательные owners;
3. выполнить миграцию только через поддерживаемый product migration path;
4. валидировать полный envelope;
5. только после успеха заменить текущий experiment state.

При ошибке нельзя частично загрузить карту, оставив старую Program/Laboratory/Metrics.

### 11.5. Результаты прогонов — отдельный слой

`SeriesRecord`, `RunRecord`, persisted telemetry/history/replay — **результаты исследования**, а не mutable input definition.

Обычный `Save Experiment` должен сохранять полный input envelope. Хранилище результатов должно связывать записи с `experimentId/revision/sourceDigest`, но не подменять experiment definition.

Если позже появится экспорт полного исследования вместе с результатами, это должен быть отдельный явно versioned archive contract.

---

## 12. Runtime version и воспроизводимость

На base commit per-run result хранит experiment identity/digest и seed, но отдельный `RuntimeVersionId` в `CombatLabExperimentRunResultV1`/`CombatLabBatchResultV1` не найден.

Для долговременной Series это блокер.

`RuntimeVersionId` должен:

- приходить от product/build/runtime owner;
- быть неизменяемым для конкретного выполненного run;
- однозначно различать версии симуляции, способные изменить результат;
- сохраняться и в SeriesRecord, и в RunRecord.

Нельзя автоматически использовать текущий UI build label, дату, branch name или произвольный Git SHA как runtime contract, если simulation owner явно не принял это значение как свою version identity.

---

## 13. Capability gates для UI

### Gate A — Program ↔ Journal LIVE

**Можно после минимальной интеграции.**

Нужно:

- использовать existing structured Program runtime journal;
- добавить/сохранить структурированные entity refs для событий, которые показываются в новом Journal;
- маршрутизировать ссылки по `experiment revision + trackId + stepId`;
- не обещать persisted history.

### Gate B — Global timeline + HISTORY/viewTime

**Заблокировано HistoryProvider.**

Нужно:

- run identity;
- history coverage;
- read-only `resolveStateAt`;
- future-leakage rules;
- исторические projections хотя бы для тех полей, которые UI показывает в HISTORY.

Без этого шкала может показывать время текущего run, но не должна изображать произвольный исторический rewind.

### Gate C — Metrics v18 LIVE

**Заблокировано production measurement/telemetry layer.**

Текущий fixed `CombatLabMetrics` не заменяет accepted constructor.

Нужно:

- MeasurementDefinition owner;
- typed telemetry collection;
- Program anchors;
- run linkage;
- raw export/analysis boundary.

### Gate D — Series по выбранным Metrics

**Частично готов execution, заблокирована accepted data linkage/persistence.**

Уже есть batch runner. Нужно добавить:

- frozen experiment input persistence;
- measurement set snapshot;
- durable SeriesId/RunId;
- runtime version;
- per-run records;
- result store.

До этого допустим существующий Combat Lab batch как свой текущий инструмент, но не перенос accepted Polygon Series как будто все данные уже product-backed.

### Gate E — Representative rerun

**Текущий rerun-from-seed существует.**

Можно использовать только с честным названием и текущими ограничениями. Для долговременного historical run нужен frozen input + runtime version + record storage.

### Gate F — Recorded replay

**Заблокировано replay/history artifact owner.**

Никакой UI-обход не допускается.

### Gate G — Laboratory

**Заблокировано generic descriptor/resolution chain.**

Специализированные существующие test overrides не являются разрешением создать universal Laboratory.

### Gate H — Full Save/Open

**Частично готово.**

Текущий experiment codec — сильная база. Gate закрывается после включения настоящих Laboratory definitions и Metrics definitions в единый versioned ExperimentEnvelope и атомарную загрузку.

---

## 14. Рекомендуемый минимальный product contract

Не как готовый API, а как граница ответственности владельцев:

### ExperimentDefinitionOwner

Отвечает за:

- `ExperimentEnvelope`;
- experimentId/revision;
- content digest;
- validation/migration;
- Save/Open input definition.

Не отвечает за историю результатов.

### ExperimentRunOwner

Отвечает за:

- создание `RunId`;
- frozen experiment input ref;
- seed;
- runtime version;
- lifecycle/status;
- связь с Journal/telemetry/history artifacts.

### JournalEventOwner

Отвечает за:

- structured event identity;
- simulation time;
- causality refs;
- entity refs;
- фильтрацию/навигацию;
- не хранит историческое состояние вместо HistoryProvider.

### HistoryProvider

Отвечает за:

- historical read coverage;
- `viewTime` resolution;
- past projections;
- отсутствие future leakage;
- не мутирует live runtime.

### MeasurementOwner

Отвечает за:

- measurement definitions;
- их revision/fingerprint;
- telemetry schema/collection;
- Program anchors;
- raw data provenance.

### SeriesOwner

Отвечает за:

- SeriesId;
- frozen input/measurement set;
- scheduling множества RunId;
- aggregates/outliers;
- persistence результатов;
- не владеет measurement catalog.

### ReplayOwner

Отвечает за различение:

- rerun-from-seed;
- verified deterministic rerun;
- recorded historical replay.

UI лишь отражает фактическую capability.

---

## 15. Инварианты, которые нельзя нарушать

1. Один `experimentId` не означает одну неизменяемую конфигурацию: причинная ссылка всегда учитывает revision, а для записанного run — также content digest.
2. `stepId` не является глобальным ID; историческая ссылка включает experiment revision и track.
3. `messageRu` никогда не используется как identity/foreign key.
4. `runIndex` и `seed` не заменяют `RunId`.
5. `batchRunId` текущего UI не объявляется durable `SeriesId`, пока persistence owner не примет этот контракт.
6. `eventDigest` и `finalStateDigest` — проверки целостности, а не replay payload.
7. History не строится из текущего state с подменённым timestamp.
8. В HISTORY субъективные данные perception/attention/memory не читаются из будущего.
9. Metrics definitions принадлежат Metrics; Series только потребляет их snapshot.
10. Current fixed Combat Lab metrics не копируются во второй каталог accepted Polygon Metrics.
11. Laboratory override не имеет права писать в owner, если нет доказанного write path.
12. Save/Open эксперимента атомарно относится ко всему input envelope.
13. Старый run никогда не пересчитывает свою идентичность по текущему изменённому experiment draft.
14. Rerun и recorded replay всегда различаются в модели и в пользовательском тексте.
15. Отсутствующая capability отображается как unavailable/blocked, а не заполняется демонстрационными данными.

---

## 16. Точки интеграции по порядку

### 1. `АРКА + ХРОНИСТ → Program ↔ Journal LIVE`

Первая следующая точка.

Использовать существующие:

- `CombatLabExperimentV1.experimentId/revision`;
- `trackId/stepId`;
- `CombatLabExperimentRunJournal`;
- реальный simulation time;
- production entity IDs, где доступны.

Не включать HISTORY/replay как будто они готовы.

### 2. `HistoryProvider + viewTime`

После определения owner и coverage подключить:

- global timeline;
- Journal event → historical moment;
- historical map;
- time-aware right panel без future leakage.

### 3. `Metrics definition → telemetry`

После появления product owner measurement definitions связать:

- Program anchors;
- runtime events/state sampling;
- telemetry records;
- Journal metric layer.

### 4. `SeriesRecord/RunRecord persistence`

Расширить существующий реальный batch runner, не заменяя его demo-моделью:

- durable IDs;
- frozen inputs;
- runtime version;
- measurement snapshot;
- run results store.

### 5. `Laboratory descriptors/resolution`

Только после доказанного каталога/adapter chain owners включить Laboratory state в ExperimentEnvelope и run provenance.

### 6. `Recorded replay / verified rerun`

После появления соответствующего product owner связать старые RunRecord с честным типом воспроизведения.

### 7. `Full Save/Open`

Завершить единый ExperimentEnvelope и атомарное открытие; отдельно определить archive/results persistence, не смешивая definition и run history.

---

## 17. Блокеры продукта

### P0 — для следующего Program ↔ Journal LIVE

Нет критического блокера на использование существующего structured Program journal в пределах текущего visual run. Но для полноценного accepted Journal события вне Program transitions требуют общего structured event adapter с entity refs.

### P1 — History

Отсутствует общий HistoryProvider/viewTime с историческими projections и coverage.

### P1 — Metrics v18

Отсутствует production MeasurementDefinition/telemetry pipeline. Текущий `CombatLabMetrics` — другой, более узкий fixed collector.

### P1 — долговременная Series

Отсутствуют durable SeriesRecord/RunRecord, result storage и runtime version identity.

### P1 — replay

Отсутствует recorded historical replay. Текущая representative action — rerun-from-seed.

### P1 — Laboratory

Отсутствуют generic descriptor/adapter и runtime resolution chain для accepted Laboratory overrides.

### P1 — full Save/Open

Текущий codec не содержит отсутствующие production Laboratory/Metrics definitions и потому ещё не закрывает accepted full Experiment envelope.

---

## 18. Проверяемые доказательства исследования

Проверены на exact base commit `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`:

- `src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts`;
- `src/core/testing/combat-lab/experiment/CombatLabBatchContracts.ts`;
- `src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts`;
- `src/core/testing/combat-lab/CombatLabContracts.ts`;
- `src/core/testing/combat-lab/CombatLabMetrics.ts`;
- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- `src/combat-lab/runtime/CombatLabExperimentVisualController.ts`;
- `src/combat-lab/runtime/CombatLabExperimentRunState.ts`;
- `src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts`;
- `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`;
- `src/combat-lab/ui/CombatLabBatchPanel.ts`;
- `src/combat-lab/CombatLabExtension.ts`;
- `src/combat-lab/CombatLabWorkspaceServices.ts`;
- `src/combat-lab/scenario-editor/CombatLabExperimentDraft.ts`;
- `src/combat-lab/scenario-editor/CombatLabScenePanel.ts`;
- `src/combat-lab/scenario-editor/CombatLabExperimentLocalStore.ts`;
- `src/combat-lab/scenario-editor/CombatLabExperimentFileActions.ts`.

Также проверены repo/handoff/accepted contracts:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `MIGRATION_SYNTHESIS.md`;
- `WORK_PLAN.md`;
- `EXECUTION_STREAMS.md`;
- `Q_HANDOFFS.md`;
- `ACCEPTED_JOURNAL_V4.md`;
- `ACCEPTED_METRICS_V18.md`;
- `ACCEPTED_SERIES_V1.md`;
- `ACCEPTED_LABORATORY_V1.md`;
- `ACCEPTED_INTERFACE_LINKAGE_V1.md`.

---

## 19. Приёмочный итог ХРОНИСТА

Контракт считает готовыми к непосредственному использованию:

- Experiment `experimentId/revision/sourceDigest`;
- Program `trackId/stepId`;
- реальный visual Program runtime;
- structured transient Program journal;
- текущие production Combat Lab metrics;
- реальный batch execution;
- seed/digests;
- текущую experiment serialization/file/local persistence.

Контракт **не считает реализованными**:

- общий durable Journal event store;
- общий History/viewTime provider;
- production Metrics v18 definitions/telemetry;
- durable SeriesRecord/RunRecord;
- runtime version identity для архивных прогонов;
- recorded replay;
- generic Laboratory engine;
- full accepted Polygon Save/Open envelope.

Следующая точка интеграции:

`АРКА + ХРОНИСТ → Program ↔ Journal LIVE` на существующих structured IDs и runtime transitions, затем отдельным product foundation — `History/viewTime → Metrics telemetry → Series/Run persistence → Laboratory → replay/full Save/Open`.
