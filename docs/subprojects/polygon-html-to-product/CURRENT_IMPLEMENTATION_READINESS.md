# Текущая готовность переноса Полигона — 2026-08-16

> **Каноническая текущая матрица реализации.** Этот файл новее ранних промежуточных статусов `CHRONIST_READINESS.md` и фиксирует состояние после фактических product-code веток C1–C10 и их локальной проверки на полном checkout.

## Решение по History

`History / viewTime / глобальная шкала времени / historical projections / future leakage / recorded historical replay` не входят в реализацию ХРОНИСТА.

Это отдельная большая дорожка **ИСТОРИК** по `HISTORY_EXECUTOR_HANDOFF.md`.

ХРОНИСТ не создавал history-store, rewind, viewTime или глобальную timeline.

---

## Короткий итог

| Область | Статус сейчас | Что это означает |
|---|---|---|
| C1 Run/Event identity | **ГОТОВО** | настоящий RunId, eventId, ProgramStepRef, sourceDigest/seed; новый RunId на reset |
| C2 Structured LIVE Journal data layer | **ГОТОВО** | Program + реальные shot/impact events, T1/T2/T3, filters/search/participant/Program step |
| C3 MeasurementDefinition + raw telemetry | **ЧАСТИЧНО** | framework готов и проверен; реально подключены `fire.shot_committed` и `fire.impact`; остальные принятые streams ещё требуют product adapters |
| C4 Metrics Report + export | **ГОТОВО ДЛЯ ДОСТУПНОЙ TELEMETRY** | 8 принятых report blocks + JSON/JSONL/CSV работают поверх frozen real dataset |
| C5 Laboratory descriptor/target/resolution foundation | **ГОТОВО КАК FOUNDATION / ПОЛНЫЙ LAB ЧАСТИЧНО** | single/group/area targets, provenance, precedence, реальный Quick Parameter Registry; ещё нет полного runtime application всех overrides и полного descriptor coverage |
| C6 SeriesRecord/RunRecord + archive/file persistence | **ГОТОВО КАК ФОРМАТ/ХРАНЕНИЕ** | durable records, seed, frozen input, runtime version, max run time, measurement snapshot, archive digest, file save/open |
| C7 Series all-runs analysis | **ГОТОВО** | полный список RunRecord, filters, distributions→RunIds, summary, explainable outliers |
| C8 Frozen deterministic rerun | **ГОТОВО** | exact frozen input + seed + runtime version + max time → rerun → digest verification; это не recorded replay |
| C9 Full ExperimentEnvelope Save/Open | **ГОТОВО КАК ENVELOPE/FILE CONTRACT** | scene/units/Program + Laboratory + Metrics definitions, fingerprint, atomic validation/Open |
| C10 non-History linkage | **ГОТОВО КАК DATA LINKAGE** | Metrics record связывается с существующим LIVE Journal shot/impact; Program→Journal IDs; Series metric→Metrics identity |
| History/timeline | **НЕ ЗОНА ХРОНИСТА** | отдельный ИСТОРИК |

---

## Проверенные feature-ветки

### C1 — Run/Event identity

Ветка: `feature/20260816-polygon-journal-live-foundation`

Проверенный product commit: `264272b246a1fd235e1a55a372cc58262fd9f8cc`.

PASS:

- `combat_lab_journal_live_identity_smoke.mjs`;
- `combat_lab_journal_live_identity_behavior_smoke.ts`;
- существующий `npm run combat-lab-experiment:smoke`;
- `npx tsc --noEmit`;
- `npm run build`.

### C2 — Full LIVE Journal data layer без History

Ветка: `feature/20260816-polygon-journal-live-scope`.

Проверенный product commit: `e10e844a0721a782a0c0b698c35903830877dc08`.

PASS: source-contract smoke, behavior smoke, existing experiment smoke, TypeScript, build.

### C3 — MeasurementDefinition / telemetry

Ветка: `feature/20260816-polygon-metrics-telemetry`.

Проверенный product commit: `96870be05b9afe5498849861f7b900dd87588531`.

PASS: telemetry source/behavior, frozen dataset contract, TypeScript, build.

Реальные raw streams сейчас:

- `fire.shot_committed`;
- `fire.impact`.

Принятые, но пока **не подключённые** raw streams:

- `suppression.level`;
- `detection.contact`;
- `wounds.changed`;
- `soldier.state`;
- `movement.position`;
- `orders.state`;
- `position.cover`;
- `actions.result`;
- `machine_gun.state`;
- `developer.projectile_diagnostics`.

Важно: UI не получает fake-данные. Создание MeasurementDefinition для неподдержанного stream отклоняется с явной причиной.

### C4 — Metrics Report / export

Ветка: `feature/20260816-polygon-metrics-report`.

Проверенный product commit: `95d6c24f6d5c8a24902448b147f8ec45c7f84031`.

PASS: report source/behavior, telemetry smoke, TypeScript, build.

Реализованы принятые блоки:

1. Сводка;
2. Изменение во времени;
3. Распределение;
4. Сравнение;
5. X→Y;
6. Хронология данных;
7. Таблица;
8. Цепочка событий.

Экспорт:

- JSON для LLM;
- raw JSONL;
- CSV аналитического блока.

C4 не делает отсутствующие streams настоящими: он анализирует только данные, реально пришедшие из C3.

### C5 — Laboratory foundation

Ветка: `feature/20260816-polygon-laboratory-runtime`.

Проверенный foundation commit: `1f0d3e77c37fed1c9c81acb3c4bcdecae0ce23a6`.

PASS: source-contract, behavior, TypeScript, build.

Готово:

- target одного participant;
- target группы participants;
- reusable `AreaId` с полигоном в координатах карты;
- безопасные ссылки override→area;
- список применимых overrides;
- baseline/effective/winner/provenance;
- детерминированный precedence;
- повторное использование существующего `CombatLabQuickParameterRegistry`, без второго каталога.

Пока не закрыто:

- автоматическое применение generic Laboratory resolution в фактическом simulation/run path;
- descriptor coverage за пределами реально существующих numeric Quick Parameters;
- boolean/enum и другие типы до появления настоящих product descriptors;
- `Apply Globally` без утверждённого persistent writable owner;
- рисование/редактирование areas — UI/АРКА.

### C6 — SeriesRecord / RunRecord / persistence

Ветка: `feature/20260816-polygon-series-records`.

В ветке есть `verification/C6_SERIES_RECORDS.md` с точным PASS-набором.

PASS:

- Series/Run source-contract;
- behavior/negative tests;
- archive file actions contract;
- TypeScript;
- build.

Готовый record сохраняет:

- SeriesId / RunId;
- experiment id/revision/sourceDigest;
- frozen input artifact;
- runtimeVersionId;
- measurement-set snapshot;
- seed каждого Run;
- `maximumSimulationSeconds` как часть воспроизводимого execution context;
- metric values;
- telemetry/journal refs;
- event/final digests.

Есть versioned archive с digest validation и отдельный `.combat-lab-series.json` file Save/Open.

**Ещё не закрыта автоматическая запись этих records из текущего batch runner после каждого запуска.** Формат/валидация/файл готовы, wiring runner→records остаётся интеграционной задачей.

### C7 — Series analysis

Ветка: `feature/20260816-polygon-series-analysis`.

Проверенный code point до verification-only Markdown: `09fd6c3bb8d93ed57404e36e276501497ef28046`.

PASS: C6 contract/behavior, C7 source/behavior, TypeScript, build.

Готово:

- все RunRecords;
- filters по frozen measurements;
- mean/median/min/max/range/quartiles;
- distributions;
- каждая distribution bucket хранит реальные RunIds;
- deterministic IQR outliers;
- человекочитаемая причина выделения;
- lookup конкретного Run.

### C8 — Frozen deterministic rerun

Ветка: `feature/20260816-polygon-series-rerun`.

Проверенный code point до verification-only Markdown: `78809265ad95211ceea89c604261b282a4db7f20`.

PASS: C6 contract/behavior, C8 source/behavior, TypeScript, build.

Перед rerun обязательно совпадают:

- frozen artifact;
- experiment id/revision/sourceDigest;
- runtimeVersionId;
- seed;
- maximumSimulationSeconds.

После расчёта сравниваются `eventDigest` и `finalStateDigest`.

Расхождение возвращает `verified: false`; оно не маскируется как успех.

Recorded historical replay сюда сознательно не входит.

### C9 — Full ExperimentEnvelope

Ветка: `feature/20260816-polygon-experiment-envelope`.

Проверенный code point до verification-only Markdown: `18f2a68f517bcc4efffb643402205e7a6cc2d468`.

PASS: envelope source/behavior, full-file actions, Metrics smoke, Laboratory smoke, TypeScript, build.

Полный input envelope:

`Experiment(scene/units/Program) + Laboratory + MeasurementDefinitions + fingerprint`.

Open является атомарным validation gate: при повреждении любой части текущий эксперимент не должен частично заменяться.

Файл полного эксперимента отделён от узкого старого `.combat-lab.json` и имеет расширение `.polygon-experiment.json`.

### C10 — non-History linkage/integration

Ветка: `feature/20260816-polygon-chronist-linkage`.

В ветке есть `verification/C10_CHRONIST_LINKAGE.md`.

В одну интеграционную ветку сведены проверенные C1–C9 contracts.

PASS:

- объединённые новые smoke/behavior tests;
- новый CHRONIST linkage source/behavior;
- существующий `npm run combat-lab-experiment:smoke`;
- полный `npx tsc --noEmit`;
- `npm run build`.

Linkage:

- TelemetryRecord с real shot/impact ID ищет соответствующее mandatory LIVE Journal event;
- Measurement provenance добавляется к этому событию вместо второй дублирующей строки;
- unmatched telemetry может стать отдельным metrics-only T3 event;
- ProgramStepRef даёт стабильный список JournalEventIds;
- frozen Series measurement snapshot сохраняет стабильную identity для возврата в Metrics.

---

# Что ещё НЕ ГОТОВО и поэтому направление нельзя считать полностью завершённым

## 1. Полный Metrics v18 — ЧАСТИЧНО

Архитектура definitions/telemetry/report/export уже реальная и проверенная.

Но из полного принятого каталога raw streams реально подключены только выстрелы и impacts. Остальные потоки должны получить отдельные product adapters над настоящими owners.

Следующая работа:

1. suppression raw/sampling adapter;
2. detection/perception-contact adapter;
3. wounds/physiology change adapter;
4. soldier-state sampling policy;
5. movement/position stream;
6. orders/route stream;
7. simulation-owned cover/position query stream;
8. action-result stream;
9. machine-gun-team stream;
10. developer raw projectile stream.

До этого полный Metrics v18 = **ЧАСТИЧНО**, даже несмотря на готовый Report.

## 2. Full Laboratory — ЧАСТИЧНО

Foundation targets/resolution настоящий и проверенный.

Но до полного planned scope ещё нужны:

- runtime integration: effective Lab value должен реально участвовать в расчёте через parameter owner;
- новые descriptor adapters для всех реально поддерживаемых классов параметров;
- conflict/precedence policy должна быть утверждена как product policy, а не только foundation order;
- `Apply Globally` только для параметров с доказанным persistent writable owner.

## 3. Full Series execution/history — ЧАСТИЧНО

Records/archive/analysis/rerun готовы как product contracts.

Но текущий существующий batch runner ещё должен:

- создавать SeriesRecord при старте;
- создавать RunRecord после каждого реального run;
- использовать frozen MeasurementDefinitions C3, а не fixed parallel metric catalog;
- сохранять/экспортировать archive из фактического batch execution;
- реализовать pause/resume только если scheduler действительно поддерживает согласованную паузу;
- recovery долгой незавершённой Series требует отдельного execution-store/scheduler contract.

## 4. UI — не зона ХРОНИСТА

ХРОНИСТ сделал product/data foundations. Видимые карточки, popup, списки, графики, области на карте и accepted визуальный shell подключает АРКА поверх этих contracts.

---

# Следующий порядок работ ХРОНИСТА

1. **M-streams:** добрать реальные Metrics streams по owners, по одному типу за раз, без fake telemetry.
2. **Lab-runtime:** включить Laboratory resolution в настоящий parameter/run path.
3. **Series-wiring:** текущий batch runner → SeriesRecord/RunRecord + selected MeasurementDefinitions + archive.
4. **Series pause/recovery:** только над реальным scheduler/storage contract.
5. **Apply Globally:** только после подтверждения writable owners.
6. Повторная C10-интеграция и full non-History acceptance.
7. После этого non-History часть ХРОНИСТА может получить итоговый статус `ГОТОВО`.

ИСТОРИК работает отдельно и не блокирует пункты 1–6.

---

`real-wargame-preview`, `main` и deployment этими feature-ветками не изменялись. Transfer готового результата в preview — только после отдельного GO пользователя.
