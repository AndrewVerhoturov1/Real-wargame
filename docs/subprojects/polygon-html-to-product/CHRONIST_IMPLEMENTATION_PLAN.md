# ХРОНИСТ — план реализации без History

> **Для исполнителей:** перед каждой продуктовой вертикалью использовать `superpowers:test-driven-development`; для последовательного выполнения плана — `superpowers:executing-plans` или эквивалентный оркестраторский маршрут Real Wargame.

**Цель:** довести до настоящей product-готовности весь functional scope ХРОНИСТА, кроме `History / viewTime / глобальной шкалы времени`, которые с 2026-08-16 являются отдельной большой дорожкой другого исполнителя.

**Архитектура:** сохраняется существующее ядро Combat Lab и production simulation. Новые возможности добавляются только там, где отсутствует настоящий product owner: run/event identity, Metrics definitions/telemetry, Laboratory resolution, durable Series/Run persistence, verified rerun и полный ExperimentEnvelope. UI остаётся проекцией этих владельцев и не становится источником gameplay truth.

**Стек:** Vite + TypeScript + PixiJS 8; существующие Combat Lab runtime, batch runner, experiment contracts и product simulation.

## Общие ограничения

- База каждой кодовой вертикали заново берётся из точного текущего HEAD `real-wargame-preview`; зафиксированный при подготовке плана HEAD: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`.
- Каждая продуктовая вертикаль выполняется на отдельной `feature/YYYYMMDD-...` ветке.
- Не переносить `window.*`, demo arrays, synthetic results, prototype IDs и локальные HTML-store как production architecture.
- Не создавать второй runner, второй каталог Metrics или второй каталог Laboratory parameters.
- Не менять `real-wargame-preview`, `main` и не выполнять deployment без отдельного разрешения пользователя.
- Для product code: сначала failing test, затем минимальная реализация, затем focused smoke, `npx tsc --noEmit` и `npm run build`.
- После каждого принятого exact SHA обновлять readiness в документации подпроекта.

---

## 1. Новая граница ответственности

### ХРОНИСТ делает

1. `RunId` и сквозную идентичность одного запуска.
2. Structured LIVE Journal и `Program ↔ Journal` linkage.
3. Полный LIVE-функциональный объём Journal v4, не требующий путешествия во времени.
4. Metrics v18: definitions, telemetry, report/query, export, связь с Journal и Series.
5. Laboratory v1: descriptors, targets/areas, resolution, conflicts, clear/reset, provenance, допустимый `Apply Globally`.
6. Series v1.1: durable Series/Run records, all-runs, filters, outliers, persistence и восстановление результатов.
7. Rerun из frozen input + seed + runtime version и проверку воспроизводимости digest-ами.
8. Полный versioned ExperimentEnvelope и атомарный Save/Open.
9. Сквозные typed links между Program, Journal, Metrics, Laboratory, Series и Run.

### Отдельный исполнитель History делает

- `HistoryProvider`;
- `viewTime`;
- `LIVE/HISTORY`;
- глобальную временную шкалу;
- выбор произвольного прошлого времени и соседних событий;
- historical map projections;
- historical Unit/Attention/Memory projections;
- запрет future leakage;
- event-context overlays в прошлом;
- recorded historical replay, если для него выбран history-artifact путь.

ХРОНИСТ не создаёт временный history-store и не задерживает остальные свои системы до готовности History.

---

## 2. Легенда готовности

- **ГОТОВО** — capability уже реально существует в продукте и достаточна для указанной функции.
- **ЧАСТИЧНО** — есть настоящее ядро, но не закрыт весь принятый пользовательский сценарий.
- **ОТСУТСТВУЕТ** — нужного общего product/runtime механизма нет.
- **В РАБОТЕ** — есть активная отдельная feature-ветка реализации.
- **ЖДЁТ** — зависит от другой вертикали или продуктового решения.
- **НЕ ЗОНА ХРОНИСТА** — выполняется другим потоком.

---

## 3. Сводная readiness-матрица

| Область | Сейчас | Целевое состояние | Основная зависимость |
|---|---|---|---|
| Stable Program IDs `trackId/stepId` | ГОТОВО | сохранить | существующий Program owner |
| Durable `RunId` | ОТСУТСТВУЕТ | ГОТОВО | Run owner/persistence |
| Structured Program runtime journal | ГОТОВО узко | использовать как источник | существующий runtime |
| Общий structured LIVE Journal | ЧАСТИЧНО | ГОТОВО | RunId + event adapter |
| Program → Journal / Journal → Program | ЧАСТИЧНО | ГОТОВО | typed refs + query/index |
| Journal T1/T2/T3, filters, details, linked entities | ЧАСТИЧНО | ГОТОВО | event taxonomy/query + UI интеграция АРКИ |
| Journal ↔ Metrics correlation | ОТСУТСТВУЕТ | ГОТОВО | Measurement/Telemetry owners |
| History / timeline | ОТСУТСТВУЕТ | отдельная дорожка | ИСТОРИК |
| Current fixed Combat Lab metrics | ГОТОВО | сохранить как узкий collector | существующий simulation state |
| Metrics v18 MeasurementDefinition | ОТСУТСТВУЕТ | ГОТОВО | новый Measurement owner |
| Raw telemetry store | ОТСУТСТВУЕТ | ГОТОВО | RunId + typed streams |
| Metrics report 8 blocks | ОТСУТСТВУЕТ | ГОТОВО | telemetry query layer |
| JSON / JSONL / CSV export | ОТСУТСТВУЕТ | ГОТОВО | report/raw export contracts |
| Узкие experiment accuracy overrides | ГОТОВО узко | не обобщать напрямую | существующие owners |
| Generic Laboratory descriptors/resolution | ОТСУТСТВУЕТ | ГОТОВО | parameter owners |
| Laboratory target single/group/area | ОТСУТСТВУЕТ | ГОТОВО | typed target/AreaId |
| Laboratory conflict precedence | ОТСУТСТВУЕТ | ГОТОВО | resolution owner |
| Batch/headless Series execution | ГОТОВО | переиспользовать | существующий batch runner |
| Seed каждого запуска | ГОТОВО для batch | сохранять в RunRecord | Series persistence |
| Durable SeriesId/RunId + all-runs | ОТСУТСТВУЕТ | ГОТОВО | SeriesStore/RunStore |
| Series filters/distributions/outliers | ЧАСТИЧНО | ГОТОВО | all RunRecords + Metrics refs |
| Series history after restart | ОТСУТСТВУЕТ | ГОТОВО | persistence policy/store |
| Pause/resume долгой Series | ОТСУТСТВУЕТ как доказанная capability | ГОТОВО только если реальный scheduler поддержит | execution contract |
| Current rerun-from-seed helper | ЧАСТИЧНО | заменить на frozen rerun | frozen input + runtime version |
| Verified deterministic rerun | ОТСУТСТВУЕТ | ГОТОВО | RunRecord + RuntimeVersionId |
| Recorded historical replay | НЕ ЗОНА ХРОНИСТА | отдельная дорожка | History/replay artifact owner |
| Current experiment JSON/file/local save | ГОТОВО узко | переиспользовать | existing codec/store |
| Full ExperimentEnvelope | ЧАСТИЧНО | ГОТОВО | Lab + Metrics definitions |
| Atomic full Open | ЧАСТИЧНО | ГОТОВО | versioned envelope validation/migration |

---

# Часть I. Foundation

## Вертикаль C1 — Run identity + Structured LIVE Journal foundation

**Статус:** НЕ НАЧАТО.

**Рекомендуемая ветка:** `feature/20260816-polygon-journal-live-foundation`.

**Цель:** получить устойчивую идентичность запуска и каноническое структурированное событие текущего LIVE-прогона без History.

**Кодовые области для исследования перед изменением:**

- `src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts`;
- `src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts`;
- `src/combat-lab/runtime/CombatLabExperimentRunState.ts`;
- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- `src/combat-lab/CombatLabExtension.ts`;
- существующие focused tests рядом с Combat Lab runtime.

**Производит:**

- durable/typed `RunId` для visual и batch run lifecycle;
- run reference: experimentId + revision + sourceDigest + runtime version field/placeholder owner boundary;
- `JournalEvent` identity внутри Run;
- structured event projection поверх реальных runtime sources;
- typed `ProgramStepRef` и entity refs;
- query `ProgramStepRef → JournalEvent[]`;
- обратный `JournalEvent → ProgramStepRef?`.

**Не включает:** `viewTime`, snapshots прошлого, timeline, historical state.

**Приёмка:** текущий LIVE-прогон даёт события, которые можно однозначно отнести к Run, шагу Program и реальным сущностям без разбора русской строки.

---

## Вертикаль C2 — Полный LIVE Journal v4 без History

**Статус:** ЖДЁТ C1.

**Рекомендуемая ветка:** `feature/20260816-polygon-journal-live-scope`.

**Цель:** закрыть весь planned scope Журнала, который не требует чтения прошлого состояния.

**Нужно реализовать на data/query уровне:**

- T1/T2/T3 taxonomy;
- source/importance/participant filters;
- тонкие фильтры;
- поиск;
- mandatory core events независимо от включённых Metrics;
- linked entities: unit, second unit/target, weapon, Program step, MeasurementDefinition;
- details payload: what/why/context/participants;
- correlation Metrics changes с существующим событием и отдельные metric events, когда они самостоятельны;
- immutable filtering semantics: фильтр меняет представление, не историю;
- независимые query models для ленты Journal и будущей timeline.

**UI-интеграция:** внешний вид карточек, popup и scroll behavior делает/сводит АРКА, но источники, IDs и query semantics принадлежат этой вертикали.

**Приёмка:** Program ↔ Journal работает в обе стороны в текущем run; фильтры и Metrics layer работают по структурированным данным; никакой HISTORY-функции не изображается.

---

# Часть II. Metrics

## Вертикаль C3 — MeasurementDefinition + telemetry collection

**Статус:** НЕ НАЧАТО; может стартовать после фиксации C1 identity contract.

**Рекомендуемая ветка:** `feature/20260816-polygon-metrics-telemetry`.

**Цель:** сделать Metrics единственным владельцем определений измерений и реально собирать выбранные данные по RunId.

**Обязательный scope:**

- stable `MeasurementDefinitionId` + revision/fingerprint;
- схема `stream → participants → optional state constraints → collection period`;
- stable Program anchors, включая входы/выходы/ветвления;
- lifecycle: create/edit/duplicate/disable/delete без изменения старых Run records;
- collection status + record count;
- capability matrix потоков: Огонь, Подавление, Обнаружение, Ранения/поражение, Состояние бойца, Движение, Маршрут/приказы, Позиция/укрытие, Действия, Пулемётный расчёт, Для разработчика;
- typed raw `TelemetryRecord` с RunId, measurement ref, simulated time, source event/entity refs и provenance;
- storage policy первой версии без fake/raw demo data.

**Приёмка:** хотя бы один сохранённый MeasurementDefinition реально производит raw records в настоящем run; неподдержанные streams честно помечаются unavailable.

---

## Вертикаль C4 — Metrics Report + export

**Статус:** ЖДЁТ C3.

**Рекомендуемая ветка:** `feature/20260816-polygon-metrics-report`.

**Цель:** закрыть принятый Metrics v18 аналитический слой над реальной telemetry.

**Обязательный scope:**

- разделы `Обзор / Измерения / Хронология`;
- 8 блоков: Сводка, Изменение во времени, Распределение, Сравнение, X→Y, Хронология, Таблица данных, Цепочка событий;
- block-local filters, breakdowns, statistics, analysis period;
- multi-measurement block;
- никакого изменения source MeasurementDefinition или raw telemetry из Report;
- JSON для LLM;
- JSONL raw telemetry;
- CSV текущего аналитического среза;
- provenance от результата отчёта обратно к measurement/run/source records.

**Приёмка:** один реальный run/Series dataset строит отчёт из настоящей telemetry и экспортируется во все три принятых формата.

---

# Часть III. Laboratory

## Вертикаль C5 — Laboratory descriptor/resolution

**Статус:** НЕ НАЧАТО.

**Рекомендуемая ветка:** `feature/20260816-polygon-laboratory-runtime`.

**Цель:** сделать Laboratory временным overlay над настоящими владельцами параметров, а не вторым каталогом.

**Обязательный scope:**

- stable parameter descriptor;
- authoritative source/baseline read;
- typed metadata: number/boolean/enum + validation;
- experimental override;
- effective value + provenance;
- stable targets: one unit, multiple/group target, reusable `AreaId`;
- area geometry в map coordinates;
- one area → many overrides;
- query `applicable overrides for unit/target`;
- precedence/conflict rules;
- clear/reset и readback authoritative baseline;
- persistence Laboratory definitions внутри ExperimentEnvelope boundary;
- source link к authoritative editor;
- `Apply Globally` только для классов с доказанным persistent writable owner и с очисткой временного override.

**Не включает:** визуальное рисование/редактирование polygon vertices как UI — это интеграция с АРКОЙ/картой.

**Приёмка:** baseline → override → effective → clear → baseline проходит на реальном owner; конфликт двух overrides разрешается детерминированно и объяснимо.

---

# Часть IV. Series

## Вертикаль C6 — Durable SeriesRecord / RunRecord + persistence

**Статус:** НЕ НАЧАТО; execution core уже ГОТОВ.

**Рекомендуемая ветка:** `feature/20260816-polygon-series-records`.

**Цель:** превратить существующий batch runner в долговременную историю исследования без переписывания runner-а.

**Обязательный scope:**

- durable `SeriesId`;
- durable `RunId`;
- frozen ExperimentEnvelope/ref;
- frozen MeasurementDefinition set;
- Laboratory context;
- `RuntimeVersionId` от канонического owner;
- seed каждого Run;
- status/stop reason/simulatedSeconds;
- metric/measurement values;
- event/final digests;
- persistence выбранной первой версии;
- reopening completed Series;
- all RunRecords, не только representative subset;
- stale-result rejection по frozen identity.

**Приёмка:** после завершения Series можно снова открыть тот же SeriesRecord и получить тот же полный список RunRecords и producing context.

---

## Вертикаль C7 — Series analysis, filters, outliers, navigation

**Статус:** ЖДЁТ C3 + C6.

**Рекомендуемая ветка:** `feature/20260816-polygon-series-analysis`.

**Обязательный scope:**

- setup: experiment identity, run count, accepted seed policy;
- progress: total/done/remaining/errors/speed/stop; pause только при доказанной runtime capability;
- incremental aggregates;
- mean, median, min/max, spread, distributions, counts in range;
- distribution bucket/value → real RunIds;
- полный all-runs list;
- filters по выбранным MeasurementDefinition values;
- short outlier block + full `Необычные` section;
- outlier reason/value/comparison/seed/metrics;
- Metrics names link back to authoritative MeasurementDefinition;
- Run context: SeriesId/RunId/seed/Program/Laboratory/Metrics;
- return navigation to exact Series/Run context after rerun.

**Приёмка:** пользователь от статистики/диапазона доходит до конкретного настоящего RunRecord и обратно без потери контекста.

---

# Часть V. Rerun

## Вертикаль C8 — Frozen deterministic rerun

**Статус:** ЧАСТИЧНО: текущий helper умеет reset по seed, но использует текущий mutable draft.

**Рекомендуемая ветка:** `feature/20260816-polygon-series-rerun`.

**Цель:** реализовать честный повтор расчёта исторического Run без выдачи его за recorded replay.

**Обязательный scope:**

- загрузить frozen input именно выбранного Run/Series;
- использовать сохранённый seed;
- проверить совместимость `RuntimeVersionId`;
- запустить существующий production runner/runtime;
- сравнить полученные `eventDigest` и `finalStateDigest` с сохранёнными;
- показать verified/mismatch result;
- сохранить контекст SeriesId/RunId для возврата в отчёт.

**Не включает:** восстановление произвольного `viewTime` и recorded historical replay — это History executor.

**Приёмка:** выбранный Run можно повторно рассчитать из сохранённых входов; UI и данные явно называют это rerun, а не записью прошлого.

---

# Часть VI. Full Save/Open

## Вертикаль C9 — Versioned ExperimentEnvelope

**Статус:** ЧАСТИЧНО: scene/units/Program codec уже есть; Lab + Metrics отсутствуют.

**Рекомендуемая ветка:** `feature/20260816-polygon-experiment-envelope`.

**Цель:** команда `Сохранить эксперимент` сохраняет один согласованный input experiment.

**Envelope обязан включать:**

- schema version;
- experimentId/revision/fingerprint;
- scene/map + participants/start state;
- Program;
- Laboratory definitions/areas;
- MeasurementDefinitions + experiment Metrics settings;
- experiment defaults/conditions;
- Series defaults, только если это input configuration.

**Open обязан:**

1. проверить schema;
2. мигрировать только поддержанным versioned path;
3. проверить refs/owners;
4. валидировать весь envelope;
5. атомарно заменить current experiment только после полной успешной проверки.

Map-only import/export остаётся отдельной явно названной операцией.

**Приёмка:** round-trip сохраняет смысл `scene + units + Program + Lab + Metrics`; повреждение одной обязательной части не оставляет частично загруженный эксперимент.

---

# Часть VII. Финальная связность

## Вертикаль C10 — Full non-History linkage + acceptance

**Статус:** ЖДЁТ C2 + C4 + C5 + C7 + C8 + C9.

**Рекомендуемая ветка:** `feature/20260816-polygon-chronist-linkage`.

**Должны работать:**

- Program ↔ Journal;
- Journal ↔ unit/weapon/MeasurementDefinition;
- MeasurementDefinition ↔ Journal;
- MeasurementDefinition ↔ Series report;
- Series ↔ RunRecord;
- RunRecord ↔ frozen rerun;
- Laboratory parameter ↔ authoritative source;
- Experiment Save/Open round-trip;
- старый Run сохраняет producing Program/Lab/Metrics context.

**Финальная проверка planned scope:** все пункты раздела `20. Проверка полного planned scope` в `CHRONIST_EXPERIMENT_CONTRACT.md`, кроме History/timeline и recorded historical replay, имеют статус `ГОТОВО` либо явное принятое пользователем ограничение версии.

---

## 4. Параллельность

После C1 можно вести параллельно:

```text
C2 Journal LIVE
C3 Metrics telemetry → C4 Metrics report
C5 Laboratory runtime
C6 Series records
```

Затем:

```text
C3 + C6 → C7 Series analysis
C6 + runtime version → C8 rerun
C3 + C5 → C9 ExperimentEnvelope
всё выше → C10 linkage/acceptance
```

Отдельная дорожка History может стартовать после стабилизации `RunId + JournalEventRef` из C1 и не должна блокировать C3/C5/C6/C9.

---

## 5. Как обновлять готовность в документации

После каждого принятого feature SHA обязательно обновляются:

1. `docs/subprojects/polygon-html-to-product/subproject.json` — `current_focus`, `next_step`, ключевые решения;
2. сгенерированный `STATUS.md` через `npm run docs:sync`; если checkout недоступен — вручную воспроизводится ожидаемое generated-содержимое и это явно отмечается;
3. этот `CHRONIST_IMPLEMENTATION_PLAN.md` — статус конкретной вертикали и accepted SHA;
4. `JOURNAL.md` — короткая запись: что реализовано, проверки, блокеры, exact SHA;
5. при изменении ownership — `EXECUTION_STREAMS.md`.

Не использовать память чата как статус проекта.

---

## 6. Текущая точка

На момент создания плана:

- архитектурный аудит ХРОНИСТА завершён: `9e2a7d819440ae82572134ff3caa690724f007d1`;
- product implementation по C1–C10 ещё не начиналась;
- точный проверенный HEAD `real-wargame-preview`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- **следующая продуктовая вертикаль ХРОНИСТА: C1 `Run identity + Structured LIVE Journal foundation`**;
- History/timeline вынесены в отдельный `HISTORY_EXECUTOR_HANDOFF.md`.
