<!-- GENERATED FILE. Edit docs/subprojects/polygon-html-to-product/subproject.json, then run npm run docs:generate. -->
# Перенос Полигона из HTML-прототипа в продукт — Current Status

- **ID:** `polygon-html-to-product`
- **Status:** `active`
- **Updated:** 2026-08-16
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Перенести принятый интерфейс и весь planned functional scope Полигона из HTML-прототипа в штатную реализацию Real Wargame поверх настоящих product owners.

## Current focus

History/viewTime/global timeline выделены в отдельную дорожку ИСТОРИК. ХРОНИСТ выполняет non-History вертикали C1–C10. C1 `Run identity + Structured LIVE Journal foundation` уже имеет product candidate `264272b246a1fd235e1a55a372cc58262fd9f8cc`, но остаётся **В РАБОТЕ** до штатных repository smoke/TypeScript/build gates. Детальная матрица: `CHRONIST_READINESS.md`.

## Next step

Проверить exact C1 candidate `264272b246a1fd235e1a55a372cc58262fd9f8cc` штатными focused smoke, behavior smoke, `npx tsc --noEmit` и `npm run build`. После зелёной приёмки C1 открыть параллельно C2 Journal LIVE, C3 Metrics telemetry, C5 Laboratory runtime и C6 Series records; ИСТОРИК отдельно использует стабильные Run/Event refs.

## Current readiness

- `Program trackId/stepId` — **готово**.
- Structured Program journal — **готово узко**.
- C1 visual RunId/eventId/ProgramStepRef — **в работе**, candidate `264272b...`.
- Общий LIVE Journal / Program↔Journal — **частично**; C2 ждёт C1.
- History/viewTime/timeline — **не зона ХРОНИСТА**, отдельная дорожка ИСТОРИК; отсутствует.
- Current fixed Combat Lab metrics — **готово узко**.
- Metrics v18 definitions/telemetry/report/export — **отсутствует**, C3/C4.
- Узкие accuracy overrides — **готово**; generic Laboratory — **отсутствует**, C5.
- Batch/headless Series execution + seed — **готово**.
- Durable Series/Run records/history — **отсутствует**, C6.
- Series all-runs/filters/full outliers — **частично/отсутствует**, C7.
- Current rerun-by-seed — **частично**; verified frozen rerun — **отсутствует**, C8.
- Recorded historical replay — **не зона ХРОНИСТА**, ИСТОРИК.
- Current experiment file save — **готово узко**; full ExperimentEnvelope — **частично**, C9.
- Full non-History linkage/acceptance — **ждёт C2+C4+C5+C7+C8+C9**, C10.

## C1 verification state

Есть:

- TDD RED на отсутствии RunIdentity до production changes;
- source-contract smoke в product branch;
- behavior smoke в product branch;
- локальная зеркальная focused contract-проверка ключевых инвариантов — PASS;
- performance self-review: повторный digest убран из hot path, journal остаётся capped 256.

Не выполнено в текущем remote-only окружении:

- штатный focused smoke на полном checkout;
- behavior smoke на полном checkout;
- `npx tsc --noEmit`;
- `npm run build`.

Поэтому C1 не называется готовым.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
- `docs/subprojects/polygon-html-to-product/STATUS.md`
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_IMPLEMENTATION_PLAN.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_READINESS.md`
- `docs/subprojects/polygon-html-to-product/HISTORY_EXECUTOR_HANDOFF.md`
- `docs/subprojects/polygon-html-to-product/PROJECT_MAP_TEMPLATE.md`
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`

## Main files

- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
- `docs/subprojects/polygon-html-to-product/STATUS.md`
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_IMPLEMENTATION_PLAN.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_READINESS.md`
- `docs/subprojects/polygon-html-to-product/HISTORY_EXECUTOR_HANDOFF.md`
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`

## Suggested verification

- `npm run docs:sync`
- `npm run docs:check`
- проверить base-to-head diff: на документационной ветке не должно быть product-code изменений.

## Safety rules

- Каждая product-code вертикаль — отдельная feature-ветка от свежего exact preview SHA.
- History не возвращается в scope ХРОНИСТА.
- Не создавать fake Journal/telemetry/Series/Laboratory/history.
- Не создавать второй runner/metric catalog/parameter catalog.
- Не менять `main`/`real-wargame-preview` и не выполнять deployment без отдельного разрешения.
