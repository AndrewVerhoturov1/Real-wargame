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
| C5 Laboratory descriptor/resolution | **НЕ НАЧАТО** | product parameter owners | узкие accuracy overrides существуют | generic descriptors, targets/groups/AreaId, precedence/conflicts, provenance, clear/reset, допустимый Apply Globally |
| C6 Durable SeriesRecord/RunRecord + persistence | **НЕ НАЧАТО** | persistence policy + Run identity | batch/headless runner и seed готовы | durable SeriesId/RunId store, frozen inputs/measurements/Lab/runtime version, all RunRecords, reopen |
| C7 Series analysis/all-runs/outliers/navigation | **ЖДЁТ C3+C6** | C3+C6 | часть агрегатов/representatives есть | all-runs, filters, bucket→RunIds, full outliers, Metrics links, producing context |
| C8 Frozen deterministic rerun | **ЧАСТИЧНО** | C6 + RuntimeVersionId | current reset-by-seed helper | frozen input, runtime version compatibility, digest verification, return context; не recorded history replay |
| C9 Full ExperimentEnvelope Save/Open | **ЧАСТИЧНО** | C3+C5 | scene/units/Program serialization/file/local save есть | Lab + Metrics definitions, versioned envelope, validation/migration, atomic Open |
| C10 Full non-History linkage + acceptance | **ЖДЁТ C2+C4+C5+C7+C8+C9** | предыдущие вертикали | contracts перечислены | сквозные реальные links и полный planned-scope acceptance без History |

## C1 — что изменено в candidate

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
- `npm run build`;
- browser/performance run не требуется по смыслу C1; после штатного CI classifier должен быть зафиксирован конкретный selection.

Поэтому C1 остаётся **В РАБОТЕ**, а не `ГОТОВО`.

## Следующее действие

1. Получить штатное выполнение проверок candidate C1 на exact HEAD `264272b...`.
2. Если gates зелёные — зафиксировать C1 accepted SHA в этой матрице/JOURNAL/STATUS.
3. После этого параллельно открыть:
   - C2 Journal LIVE;
   - C3 Metrics telemetry;
   - C5 Laboratory runtime;
   - C6 Series records;
   - отдельную дорожку ИСТОРИКА поверх стабильных Run/Event refs C1.

`real-wargame-preview`, `main` и deployment текущей работой не изменяются.
