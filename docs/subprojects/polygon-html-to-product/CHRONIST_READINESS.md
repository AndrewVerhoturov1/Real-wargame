# ХРОНИСТ — текущая готовность реализации

Этот файл является короткой живой матрицей выполнения `CHRONIST_IMPLEMENTATION_PLAN.md`. Он не заменяет архитектурный контракт и не позволяет считать capability готовой без проверок.

Обновлено: 2026-08-16.

## Граница

`History / viewTime / глобальная шкала времени / historical projections / future leakage / recorded historical replay` — **не зона ХРОНИСТА**, отдельный исполнитель **ИСТОРИК** (`HISTORY_EXECUTOR_HANDOFF.md`).

ХРОНИСТ выполняет всё остальное: Journal LIVE, Metrics, Laboratory, Series, deterministic rerun, persistence, full Save/Open и non-History linkage.

## Вертикали C1–C10

| Вертикаль | Статус | Exact SHA / зависимость | Что реально готово сейчас | Что ещё нужно до `ГОТОВО` |
|---|---|---|---|---|
| C1 Run identity + Structured LIVE Journal foundation | **В РАБОТЕ** | candidate `264272b246a1fd235e1a55a372cc58262fd9f8cc` на `feature/20260816-polygon-journal-live-foundation` | visual RunId; sourceDigest/seed в RunIdentity; eventId; exact ProgramStepRef; новый RunId на reset; bounded journal 256; RED source-contract test + behavior smoke добавлены; hot-path digest убран | штатно выполнить focused smoke, behavior smoke, `npx tsc --noEmit`, `npm run build`; независимая проверка diff; после этого accepted SHA |
| C2 Full LIVE Journal v4 без History | **ЖДЁТ C1** | C1 accepted identity | planned scope зафиксирован | event adapter всех нужных LIVE sources, T1/T2/T3, filters/search/details, linked entities, Metrics correlation, UI integration |
| C3 MeasurementDefinition + telemetry | **НЕ НАЧАТО** | стабильный RunId contract C1 | fixed CombatLabMetrics существует отдельно | MeasurementOwner, definitions lifecycle, Program anchors, typed raw telemetry streams/store |
| C4 Metrics Report + export | **ЖДЁТ C3** | C3 | UX v18 принят | 8 report blocks, queries, JSON/JSONL/CSV export на реальной telemetry |
| C5 Laboratory descriptor/resolution | **В РАБОТЕ** | foundation candidate `1f0d3e77c37fed1c9c81acb3c4bcdecae0ce23a6` на `feature/20260816-polygon-laboratory-runtime` | Laboratory state; single/group/AreaId targets; map-coordinate polygons; reuse existing Quick Parameter descriptors; deterministic override resolution + provenance; referenced-area deletion guard; source-contract + behavior smoke добавлены | штатные smoke/tsc/build; подключить resolution к реальному experiment/runtime; расширять только через реальные parameter descriptors; persistence в ExperimentEnvelope; product decision/write-path для Apply Globally; UI areas — АРКА |
| C6 Durable SeriesRecord/RunRecord + persistence | **НЕ НАЧАТО** | persistence policy + Run identity | batch/headless runner и seed готовы | durable SeriesId/RunId store, frozen inputs/measurements/Lab/runtime version, all RunRecords, reopen |
| C7 Series analysis/all-runs/outliers/navigation | **ЖДЁТ C3+C6** | C3+C6 | часть агрегатов/representatives есть | all-runs, filters, bucket→RunIds, full outliers, Metrics links, producing context |
| C8 Frozen deterministic rerun | **ЧАСТИЧНО** | C6 + RuntimeVersionId | current reset-by-seed helper | frozen input, runtime version compatibility, digest verification, return context; не recorded history replay |
| C9 Full ExperimentEnvelope Save/Open | **ЧАСТИЧНО** | C3+C5 | scene/units/Program serialization/file/local save есть | Lab + Metrics definitions, versioned envelope, validation/migration, atomic Open |
| C10 Full non-History linkage + acceptance | **ЖДЁТ C2+C4+C5+C7+C8+C9** | предыдущие вертикали | contracts перечислены | сквозные реальные links и полный planned-scope acceptance без History |

## C1 — Run/Event identity candidate

Product branch: `feature/20260816-polygon-journal-live-foundation`.

Candidate HEAD: `264272b246a1fd235e1a55a372cc58262fd9f8cc`.

Изменения:

- `CombatLabExperimentVisualController.reset()` создаёт новую identity каждого visual run;
- `CombatLabRunIdentityV1`: `runId + experimentId + experimentRevision + sourceDigest + seed`;
- `CombatLabExperimentJournalEntryV1`: `runId + eventId + ProgramStepRef` поверх прежних sequence/time/kind/trackId/stepId;
- `eventId` монотонен внутри Run: `runId:event:sequence`;
- visual runtime snapshot публикует `runIdentity`;
- structured journal остаётся bounded до 256 entries;
- соответствие текущему experiment проверяется O(1) по `experimentId/revision`; digest не пересчитывается в simulation-step path;
- History/viewTime/historyStore не добавлялись.

TDD evidence:

- RED был получен до production changes: source-contract падал на отсутствии `CombatLabRunIdentityV1`;
- test-only RED commit на отдельной контрольной ветке: `5f36b61ab9f20e5ac2f1877258ecf8d98c29f210`;
- рабочая ветка содержит source-contract smoke и отдельный behavior smoke.

Локально в доступном окружении выполнена зеркальная focused source-contract проверка ключевых C1-инвариантов — PASS. Это **не заменяет** штатный repository smoke/typecheck/build.

Не проверено из-за отсутствия рабочего checkout/недоступности shell clone GitHub в текущем окружении:

- полный `node scripts/combat_lab_journal_live_identity_smoke.mjs` на repository checkout;
- `node scripts/combat_lab_journal_live_identity_behavior_smoke.ts`;
- существующий `npm run combat-lab-experiment:smoke`;
- `npx tsc --noEmit`;
- `npm run build`.

Поэтому C1 остаётся **В РАБОТЕ**, а не `ГОТОВО`.

## C5 — Laboratory foundation candidate

Product branch: `feature/20260816-polygon-laboratory-runtime`.

Candidate HEAD: `1f0d3e77c37fed1c9c81acb3c4bcdecae0ce23a6`.

Что уже есть в candidate:

- собственный Laboratory state, но **без второго каталога параметров**;
- `parameterId` обязан существовать в текущем `CombatLabQuickParameterRegistry`;
- цели: один participant, набор participants, переиспользуемая `AreaId`;
- область хранит вершины в координатах карты;
- одна область может использоваться несколькими overrides;
- area target вычисляется point-in-polygon на runtime target context;
- `listApplicable...` возвращает всю цепочку применимых overrides;
- `resolve...` возвращает baseline/effective value, winner и `appliedOverrideIds` как provenance;
- текущая явная conflict semantics foundation: последний подходящий enabled override в сохранённом порядке имеет приоритет;
- нельзя удалить область, пока на неё ссылается override;
- значения нормализуются правилами настоящего descriptor owner;
- History/viewTime/localStorage/window runtime в foundation не добавлены.

TDD evidence:

- source-contract test создан до owner-файла и RED получен на отсутствии `CombatLabLaboratoryRuntime.ts`;
- добавлен отдельный behavior smoke для single/group/area resolution, precedence и safe area deletion.

Ограничения candidate:

- сейчас он поддерживает только те numeric accuracy descriptors, которые уже реально есть в Quick Parameter Registry; это сознательно, а не fake полнота;
- generic bool/enum и другие классы параметров появятся только через настоящие product descriptors;
- foundation ещё не применяется к Simulation/Experiment run автоматически;
- Laboratory state ещё не входит в `CombatLabExperimentV1`/будущий ExperimentEnvelope;
- `Apply Globally` не реализован без доказанного persistent writable owner;
- рисование/редактирование областей относится к АРКЕ.

Полные repository smoke/tsc/build в текущем remote-only окружении не выполнены, поэтому C5 остаётся **В РАБОТЕ**.

## Следующее действие

1. Получить штатное выполнение проверок C1 и C5 candidates.
2. Продолжать независимые foundations C3 Metrics и C6 Series records, не ожидая History.
3. После принятия C1 открыть C2 Journal LIVE и дать ИСТОРИКУ стабильные Run/Event refs.
4. После C3+C5 собрать C9 ExperimentEnvelope; после C3+C6 — C7 Series analysis.

`real-wargame-preview`, `main` и deployment текущей работой не изменяются.
