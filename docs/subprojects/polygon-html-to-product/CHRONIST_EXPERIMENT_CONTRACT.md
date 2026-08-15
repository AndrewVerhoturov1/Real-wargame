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

---

## 20. Проверка полного planned scope

### 20.1. Что именно перепроверено

Эта самопроверка выполнена не только против узкого handoff ХРОНИСТА, но и против полного запланированного пользовательского объёма, зафиксированного в `WORK_PLAN.md`, `MIGRATION_SYNTHESIS.md` и принятых `Journal v4`, `Metrics v18`, `Laboratory v1`, `Series v1`, `Interface Linkage v1`.

В таблицах ниже **статус означает готовность product/runtime на исследованном exact base commit**, а не готовность HTML-прототипа. Поле `Учтено` показывает, был ли соответствующий planned scope явно отражён в исходном контракте ХРОНИСТА. Значение `добавлено сейчас` означает документационный пробел исходного отчёта, закрытый этой самопроверкой; это не новая реализация.

Статусы используются строго в смысле:

- **готово** — есть реальная product capability, достаточная для указанной функции в её текущей границе;
- **частично** — есть настоящая основа, но полного принятого сценария ещё нет;
- **отсутствует** — нужной общей product/runtime capability на exact base не доказано;
- **не моя зона** — функция относится к planned scope Полигона, но её реализация принадлежит другому исполнителю/owner; ХРОНИСТ фиксирует только зависимость, если она влияет на причинную связность.

### 20.2. Program ↔ Journal и полный Journal v4

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| Устойчивое `Program step → runtime event` | частично | да | `trackId/stepId` и Program journal уже есть; для общего случая нужен `RunId` и structured event identity |
| Канонический structured `JournalEvent`, а не строка | частично | да | `JournalEventOwner`/adapter над реальными runtime event sources |
| `Journal → точный Program step` | частично | да | typed `ProgramStepRef`; UI-навигация совместно с АРКОЙ |
| `Program step → Срабатывания в Журнале: N` и фильтрация по шагу | частично | да | event query/index по `run + experiment revision + trackId + stepId`; UI совместно с АРКОЙ |
| Ссылки Журнала на бойца, второго бойца, оружие, Метрику и шаг Программы | частично | частично → добавлено сейчас | общий typed entity/reference resolver; реальные entity IDs; Metric ref появится после MeasurementOwner |
| Лента событий: время, T1/T2/T3, понятное название, участники/контекст | частично | частично → добавлено сейчас | Journal taxonomy/tier mapping и event adapter; визуальная карточка — АРКА |
| Раскрытые подробности: что произошло, почему, смысл, участники, до/после, связанные изменения Метрик | частично | добавлено сейчас | event payload + HistoryProvider для `до/после` + Metrics telemetry/linkage; UI — АРКА |
| Поиск, быстрые фильтры `источник / важность / участник` и тонкая фильтрация | частично | добавлено сейчас | JournalEventOwner должен давать структурированные поля и query semantics; popup/scroll — АРКА |
| Основные события не исчезают при отключении Метрики | отсутствует | добавлено сейчас | отдельный канонический слой mandatory events и MeasurementOwner; правило объединения слоёв в Journal adapter |
| Метрика, связанная с уже существующим событием, добавляется в его подробности; самостоятельное значимое изменение может быть отдельным событием | отсутствует | добавлено сейчас | correlation contract `TelemetryRecord ↔ JournalEvent`; правила dedup/merge у Journal/Measurement owners |
| Фильтры меняют представление, а не записанную историю | частично | частично → добавлено сейчас | immutable/event-store или эквивалентный read model; UI-filter state — АРКА |
| Раскрытие карточек и локальные фильтры не сбрасывают scroll position | не моя зона | добавлено сейчас | АРКА; ХРОНИСТ не должен превращать filter/query в замену события/истории |

**Вывод по Journal:** исходный контракт полностью покрыл identity и Program linkage, но недостаточно явно перечислял пользовательские функции ленты, фильтрации, T1/T2/T3, подробностей и связь событий с выбранными Метриками. Эти пункты теперь зафиксированы и не должны потеряться при реализации.

### 20.3. Global timeline, LIVE/HISTORY и исторический просмотр

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| Общий `HistoryProvider` с честным coverage | отсутствует | да | отдельный product history owner |
| Единый `viewTime` и режимы `LIVE / HISTORY` | отсутствует | да | HistoryProvider + общий UI view context |
| Выбор события переводит карту в его исторический момент | отсутствует | да | `JournalEventRef → HistoryPointRef/viewTime → historical state` |
| Переход к произвольному времени | отсутствует | частично → добавлено сейчас | HistoryProvider должен уметь `resolveStateAt(T)` или честно сообщать, что момент не покрыт |
| `К текущему` возвращает только представление в LIVE, не перезапуская runtime | отсутствует | да | HistoryProvider/view context; UI — АРКА |
| Навигация к соседним событиям | частично | добавлено сейчас | упорядоченный Journal event index; кнопки/поведение — АРКА |
| Глобальная timeline видна во всех рабочих вкладках, сворачивается и имеет свой независимый фильтр | не моя зона | добавлено сейчас | АРКА; от ХРОНИСТА нужны event query и time semantics |
| Timeline показывает T1/T2/T3, основные события, выбранные Metrics и мелкие metric T3 независимо от фильтра ленты Журнала | частично | добавлено сейчас | Journal taxonomy + Measurement linkage; UI-фильтры — АРКА |
| LIVE может продолжаться, пока пользователь смотрит HISTORY, и новые события не вырывают его из выбранного прошлого | отсутствует | частично → добавлено сейчас | отдельные `liveTime` и pinned `viewTime`; subscription contract без auto-follow в HISTORY |
| Историческая карта показывает состояние момента T | отсутствует | да | HistoryProvider для scene/unit state |
| Историческая карта показывает контекст события: участники, направление/линию, попадание/промах, LOS или другой релевантный след | отсутствует | добавлено сейчас | event geometry/provenance + historical map projection; отрисовка — АРКА/карта |
| Правая панель в HISTORY показывает именно состояние и знания выбранного юнита на T | отсутствует | да | HistoryProvider + ЛИНЗА для history-aware Unit/Attention/Memory reads |
| Запрет future leakage для perception, attention, memory, ammo, wounds, suppression, actions и других временных данных | отсутствует | да | HistoryProvider обязан выдавать `asOf <= viewTime` или `unavailable` |

**Вывод по History:** архитектурная граница была учтена, но теперь отдельно зафиксирован весь UX-план глобальной timeline, независимых фильтров, произвольного времени, соседних событий, pinned HISTORY и исторического event-context overlay.

### 20.4. Полный planned scope Metrics v18

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| MeasurementDefinition как единственный владелец того, что измеряется | отсутствует | да | новый/утверждённый `MeasurementOwner` |
| Потоки групп `Огонь / Подавление / Обнаружение / Ранения / Состояние / Движение / Маршрут и приказы / Позиция и укрытие / Действия / Пулемётный расчёт / Для разработчика` | отсутствует | добавлено сейчас | capability matrix реальных telemetry streams; недоступные потоки должны быть явно помечены, а не симулированы |
| Схема конструктора `поток → участники → ограничения состояния → период` | отсутствует | да | MeasurementDefinition schema + entity/state selectors |
| Дополнительные фильтры по участникам, целям, источникам, угрозам и состояниям | отсутствует | частично → добавлено сейчас | typed selector contracts над настоящими IDs/state schema |
| Якоря начала/конца измерения на конкретных входах/выходах Program, включая ветвления | частично | да | стабильные Program IDs есть; нужен отдельный stable Program anchor contract и runtime firing semantics |
| Карточки измерений: что/для кого/период/состояние сбора/число записей | отсутствует | добавлено сейчас | MeasurementDefinition + collection-status/read model; визуальный слой — АРКА |
| Изменение, дублирование, отключение без удаления и удаление measurement definition | отсутствует | частично → добавлено сейчас | lifecycle/versioning у MeasurementOwner; ссылки старых Run/Series не должны меняться задним числом |
| Реальный raw telemetry collection/store | отсутствует | да | telemetry collector/store с RunId и provenance |
| Отчёт с верхними разделами `Обзор / Измерения / Хронология` | отсутствует | добавлено сейчас | Metrics report/query owner над сохранённой telemetry; UI — АРКА |
| Восемь аналитических блоков: Сводка, Время, Распределение, Сравнение, X→Y, Хронология, Таблица, Цепочка событий | отсутствует | добавлено сейчас | analytics/query contract; блоки не мутируют definition или raw telemetry |
| Фильтры, разбивки, статистика и период анализа внутри аналитических блоков | отсутствует | добавлено сейчас | report-query/aggregation layer с provenance к measurement/run records |
| Один аналитический блок может использовать несколько measurements | отсутствует | добавлено сейчас | multi-source report query contract |
| Экспорт `JSON для LLM` | отсутствует | добавлено сейчас | versioned report/export owner; происхождение данных должно сохраняться |
| Экспорт исходных данных `JSONL` | отсутствует | добавлено сейчас | raw telemetry export contract |
| Экспорт `CSV` текущего аналитического среза | отсутствует | добавлено сейчас | report-query result export contract |
| Связь Metrics → Journal как дополнительный слой событий/деталей | отсутствует | частично → добавлено сейчас | `MeasurementDefinition/TelemetryRecord ↔ JournalEvent` correlation |
| Связь Metrics → Series без второго каталога показателей | частично | да | текущий batch использует fixed metrics; accepted связь ждёт MeasurementOwner + snapshot definitions |

**Вывод по Metrics:** это самый заметный пробел исходного отчёта по planned scope. Контракт правильно описал `definition → telemetry → run → Series`, но не перечислил полный конструктор, lifecycle definitions, весь Отчёт, восемь аналитических блоков и три вида экспорта. Теперь они явно входят в обязательный объём переноса.

Пространственная аналитика карты, удалённая из принятой Metrics v18, **не считается пропуском** этого scope.

### 20.5. Полный planned scope Laboratory v1

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| Descriptor над настоящим параметром и authoritative source | частично | да | generic descriptor/adapter layer; существующие accuracy overrides — только узкий пример |
| Baseline → experimental value → effective value + provenance | отсутствует | да | Laboratory resolution owner |
| Типизированные параметры: number/slider, boolean, enum и validation | отсутствует | добавлено сейчас | descriptor metadata/type/validation contract; сами controls — АРКА |
| Target одного юнита | отсутствует в generic Laboratory | частично → добавлено сейчас | stable target ref на production unit/participant identity |
| Target группы/нескольких юнитов | отсутствует | добавлено сейчас | stable group/selection target model; рамка выбора — UI/карта |
| Переиспользуемая полигональная область | отсутствует | частично → добавлено сейчас | `AreaId`, map-coordinate geometry, persistence и target resolution |
| Редактирование вершин области без зависимости от zoom/pan | не моя зона | добавлено сейчас | АРКА/карта; ХРОНИСТ требует только canonical map-coordinate geometry + identity |
| Один override может ссылаться на область, одна область — использоваться несколькими overrides | отсутствует | добавлено сейчас | Laboratory target/area reference model |
| `Действующие изменения` для выбранного юнита: личные, групповые и областные | отсутствует | добавлено сейчас | query `resolveApplicableOverrides(target, experiment context)` с provenance |
| Клик по изменению подсвечивает точную цель на карте | не моя зона | добавлено сейчас | АРКА/карта; owner должен отдавать stable target/area ref |
| Источник параметра кликабелен и ведёт в authoritative editor | частично | частично → добавлено сейчас | typed source ref + общий navigation resolver |
| Правила конфликтов перекрывающихся overrides и precedence | отсутствует | добавлено сейчас | Laboratory resolution owner; прямо указано как следующий production gap в accepted v1 |
| Clear/reset override возвращает authoritative baseline без ручной синхронизации UI | отсутствует в generic Laboratory | да | resolution chain + owner readback |
| `Применить глобально`: изменить настоящий baseline и очистить override | отсутствует в общем случае | да | product decision о разрешённых классах + доказанный writable authoritative owner |
| Сохранение Laboratory state в definition эксперимента | отсутствует | да | ExperimentEnvelopeOwner после появления generic Laboratory |
| Подвкладки `Изменения / Области`, трёхколоночный конструктор, независимая прокрутка | не моя зона | добавлено сейчас | АРКА; product contract должен только обеспечивать данные и stable selection |

**Вывод по Laboratory:** исходный контракт учёл source/baseline/effective value, stable targets, area coordinates, resolution и Save/Open, но не выделил отдельно multi-target/area reuse, `Действующие изменения`, типы параметров и конфликтующие overrides. Они теперь явно зафиксированы.

### 20.6. Полный planned scope Series v1.1

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| Реально запускать много headless-прогонов одного эксперимента | готово | да | существующие `CombatLabBatchRunner`/`CombatLabExperimentRunner` |
| Перед стартом заморозить один experiment snapshot | частично | да | request уже несёт experiment, но долговременный frozen artifact/store отсутствует |
| Отдельный seed каждого прогона | готово для текущего batch | да | существующий runner; для истории нужны RunRecord и persistence всех seeds |
| Настройка числа прогонов и запуск Серии | частично | добавлено сейчас | execution core есть; новый accepted UI — АРКА; durable Series identity отсутствует |
| Выполнение: всего / выполнено / осталось / progress | готово/частично по текущему batch | добавлено сейчас | current batch progress есть; accepted UI — АРКА |
| Остановка/cancel | готово для текущего batch | добавлено сейчас | существующий batch control |
| Пауза Series | отсутствует как доказанная capability | добавлено сейчас | Series scheduler/runtime contract; не показывать кнопку без реальной pause/resume semantics |
| Ошибки и скорость выполнения | частично | добавлено сейчас | execution diagnostics/result model + user-facing projection |
| Предварительная статистика по мере поступления результатов | частично | добавлено сейчас | incremental aggregation над persisted/active RunRecords; не доказана полностью для accepted Metrics |
| SeriesId / RunId и долговременная история всех прогонов | отсутствует | да | SeriesOwner/RunStore |
| Использование именно выбранных Metrics definitions | частично | да | current fixed metrics real; accepted MeasurementDefinition snapshot отсутствует |
| Среднее, медиана, min/max, разброс, распределение, count по диапазонам | частично | частично → добавлено сейчас | real aggregation core есть в узком виде; полный scope ждёт selected Metrics + all RunRecords |
| Интерактивный график распределения ведёт к реальным прогонам значения/диапазона | отсутствует | добавлено сейчас | aggregate bucket → RunId index/query |
| Полный список всех прогонов | отсутствует | добавлено сейчас | durable/active RunRecord collection; current representative runs недостаточны |
| Фильтры списка по выбранным Метрикам и порогам/диапазонам | отсутствует | добавлено сейчас | RunRecord metric index/query над MeasurementDefinition IDs |
| `Необычные`: короткий блок в обзоре + полный раздел всех outliers | частично | частично → добавлено сейчас | current representative results — только основа; нужен explainable outlier selection над all runs |
| Для outlier показываются причина, значение, сравнение со статистикой, seed и выбранные Метрики | отсутствует как полный record | добавлено сейчас | SeriesOwner + RunRecord + aggregation provenance |
| Название Метрики в Series ведёт обратно в Metrics | отсутствует | добавлено сейчас | stable MeasurementDefinitionRef + navigation resolver |
| Исторический Run показывает ID Series/Run, seed, использованную Program, Laboratory changes и Metrics context | отсутствует как durable context | частично → добавлено сейчас | frozen ExperimentEnvelope + Measurement snapshot + Run/Series records |
| `Воспроизвести прогон` открывает обычный Полигон, показывает Series/run/seed и даёт вернуться к тому же прогону отчёта | частично | частично → добавлено сейчас | current helper reruns seed на текущем draft и теряет accepted frozen/context/return contract; нужен ReplayOwner + navigation context |
| История завершённых Серий переживает выбранную persistence-политику и снова открывается для анализа | отсутствует | да | SeriesStore + решение persistence policy |
| Долгие Серии: восстановление после прерывания приложения | отсутствует | добавлено сейчас | scheduler/persistence recovery contract; accepted runtime task, не имитировать UI |

**Вывод по Series:** вычислительное ядро реально и его нельзя переписывать. Главные отсутствующие части planned scope — все RunRecord, фильтры, полноценные outliers, долговременная история Серий, accepted Metrics linkage, freeze/version provenance, pause/recovery и корректный переход `run → Polygon → обратно в тот же report context`.

Сознательно отложенные за пределы принятой Series v1 функции — сравнение/объединение Серий, сложные статистические тесты, ручное управление workers, ручное распределение seed, научный экспорт и автоматические ИИ-объяснения — **не считаются пропусками текущего planned scope**.

### 20.7. Replay, persistence и Save/Open

| Плановая функция | Статус | Учтено | Нужный owner / зависимость / следующий шаг |
|---|---|---|---|
| Повторный запуск с seed | частично | да | текущий helper есть, но использует текущий mutable experiment, а не сохранённый frozen Series snapshot |
| Rerun именно исторического Run из frozen input + seed + runtime version | отсутствует | да | RunStore + frozen input artifact + RuntimeVersionOwner + ReplayOwner |
| Проверка воспроизводимости через event/final digests | частично | да | digests уже есть; нужен persisted expected result и runtime version identity |
| Recorded historical replay фактически записанного прошлого | отсутствует | да | replay/history artifact owner |
| Runtime version identity каждого Run | отсутствует | да | simulation/build/runtime owner должен выдать канонический immutable version ID |
| Полный `Save Experiment`: карта + юниты + Program + Laboratory + Metrics/settings | частично | да | current codec покрывает scene/units/Program; ждёт Lab + Metrics в ExperimentEnvelope |
| Versioned schema, validation/migration и атомарный `Open Experiment` | частично | да | current parser — основа; полный envelope/migration owner ещё нужен |
| Map-only import/export существует отдельно от полного Save/Open и не называется «сохранить эксперимент» | готово как узкая product capability | добавлено сейчас | Scene import/export уже есть; точное пользовательское название/место — АРКА |
| Series/Run/telemetry/history persistence хранится отдельно от mutable experiment input, но связано с его frozen identity | отсутствует | да | Result/Series store + stable refs |
| Отдельный versioned archive полного исследования с результатами, если он будет нужен | отсутствует, и не обязателен первой версией | да | отдельное продуктовое решение; не смешивать с обычным `Save Experiment` |

### 20.8. Planned функции рядом с зоной ХРОНИСТА, но не являющиеся его реализационной ответственностью

| Плановая функция | Статус | Почему не моя зона / зависимость |
|---|---|---|
| Внешний shell, вкладки, collapse/hover, popup, адаптивная компоновка | не моя зона | АРКА; ХРОНИСТ предоставляет contracts данных/времени |
| Сохранение scroll position ленты/конструкторов при локальных UI-действиях | не моя зона | АРКА |
| Отрисовка historical map/event overlays | не моя зона | АРКА/карта; ХРОНИСТ обязан дать time/event refs и historical data contract |
| LIVE `Юнит` и штатная смена позы | не моя зона | ПУЛЬС; History-проекция этого же юнита позже зависит от ХРОНИСТА |
| LIVE `Инфо / Внимание / Память` | не моя зона | ЛИНЗА; HISTORY для них зависит от HistoryProvider и future-leakage rules ХРОНИСТА |
| Полный Unit Editor authoring/LIVE | не моя зона | отдельное product решение и будущий поток |
| Общие backlinks `Используется` и безопасное удаление reusable profiles | не моя зона | нужен общий usage-index/navigation owner; ХРОНИСТ потребляет stable refs там, где они участвуют в Program/Lab/Journal |
| Одиночные `Run/Pause/Step/Stop/Speed` текущего visual experiment | не моя зона | существующий Combat Lab/runtime owner; ХРОНИСТу нужна только корректная Run/event identity |
| Размещение технических worker/diagnostic controls вне основного пользовательского UX | не моя зона | product/АРКА; ХРОНИСТ не переносит их в Series contract |

### 20.9. Product owners и runtime-контракты, которые ещё обязательны

После полной проверки planned scope нужны следующие владельцы/контракты; без них соответствующие функции нельзя честно переносить из HTML в продукт:

1. **JournalEventOwner / structured event adapter** — общие typed события, tier/category, entity refs, Program refs, query/filter semantics и correlation с Metrics.
2. **HistoryProvider** — coverage, `viewTime`, `resolveStateAt`, state-by-event, historical projections и запрет future leakage.
3. **MeasurementOwner** — versioned MeasurementDefinition, Program anchors, selectors и lifecycle definitions.
4. **TelemetryCollector/Store** — typed raw records с `RunId`, временем, source refs и provenance.
5. **Metrics Report/Export owner** — queries/analytics над telemetry, восемь типов блоков, JSON/JSONL/CSV export без изменения raw data.
6. **Laboratory Descriptor/Resolution owner** — descriptor types, source/baseline, stable targets/areas, precedence/conflicts, effective value, clear/reset и provenance.
7. **Authoritative writable owners для `Apply Globally`** — только для явно разрешённых классов параметров.
8. **SeriesOwner + RunStore** — durable SeriesId/RunId, all-runs history, indexes/filtering, outliers, result persistence и восстановление завершённых Серий.
9. **Series execution pause/recovery contract** — если accepted UI сохраняет pause и долгие серии должны переживать interruption.
10. **RuntimeVersionOwner** — immutable identity версии simulation runtime, влияющей на воспроизводимость.
11. **ReplayOwner** — чётко различает rerun из frozen input, verified deterministic rerun и recorded historical replay.
12. **ExperimentEnvelopeOwner/versioned codec** — полный input experiment, validation/migration и атомарный Save/Open.
13. **Typed navigation/resolver** совместно с АРКОЙ — Program step, Journal entity, MeasurementDefinition, RunRecord и Laboratory source должны открывать именно authoritative entity, а не искать её по строке.
14. **Historical projections правой панели** совместно с ЛИНЗОЙ — какие домены Unit/Attention/Memory реально доступны на `viewTime`.

Отдельно остаются **product-owner решения пользователя**, которые нельзя решить одним чтением кода:

- что именно обещает кнопка `Воспроизвести прогон` в первой product-версии: frozen rerun или recorded replay;
- какая persistence policy обязательна для Series/Run: только сессия, локально между запусками, файл или другой store;
- полный ли Metrics v18 делается сразу или первая версия получает ограниченный, но настоящий набор telemetry streams;
- для каких параметров Laboratory разрешено `Применить глобально`.

### 20.10. Итог обязательной самопроверки

Главный вывод проверки:

- **исходный контракт ХРОНИСТА не потерял фундаментальную архитектуру**: Program/Journal identity, History boundary, Metrics→telemetry→Series, Run/Series records, replay taxonomy, Laboratory resolution и ExperimentEnvelope были зафиксированы правильно;
- **но он был неполон как инвентарь всего planned UX/function scope**: особенно недоставало поштучной фиксации функций Journal v4, полного Metrics v18 Report/Export, target/area поведения Laboratory и all-runs/outlier/navigation поведения Series v1.1;
- этот документационный пробел закрыт текущим разделом;
- статусы продукта при этом не изменились: новая реализация не начиналась и отсутствующие capabilities остаются отсутствующими;
- следующая интеграционная точка остаётся прежней: `АРКА + ХРОНИСТ → Program ↔ Journal LIVE`, но будущие handoff теперь обязаны сверяться с матрицами этого раздела, чтобы переносить **не только внешний интерфейс, но и весь принятый planned functional scope**.