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

После полного planned-scope аудита History/viewTime/global timeline выделены из ХРОНИСТА в отдельную дорожку ИСТОРИК. ХРОНИСТ ведёт Journal LIVE, Metrics, Laboratory, Series, deterministic rerun, persistence и full Save/Open по вертикалям C1-C10. Product implementation этих вертикалей ещё не начиналась.

## Next step

ХРОНИСТ: начать C1 Run identity + Structured LIVE Journal foundation на отдельной feature-ветке от свежего exact HEAD real-wargame-preview. ИСТОРИК может начинать History после стабилизации RunId/JournalEventRef из C1 и не блокирует Metrics/Lab/Series.

## Current readiness

- `Program trackId/stepId` — готово.
- Structured Program journal — готово узко.
- Durable RunId — отсутствует.
- Общий LIVE Journal / Program↔Journal — частично.
- History/viewTime/timeline — отдельная дорожка ИСТОРИК; отсутствует.
- Current fixed Combat Lab metrics — готово узко.
- Metrics v18 definitions/telemetry/report/export — отсутствует.
- Узкие experiment overrides — готово; generic Laboratory — отсутствует.
- Batch/headless Series execution + seed — готово.
- Durable Series/Run records/history — отсутствует.
- Series all-runs/filters/outliers — частично/отсутствует.
- Current rerun-by-seed — частично; verified frozen rerun — отсутствует.
- Recorded historical replay — отдельная дорожка ИСТОРИК.
- Current experiment file save — готово узко; full ExperimentEnvelope — частично.

## Read first

- `AGENTS.md`
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`
- `docs/subprojects/polygon-html-to-product/STATUS.md`
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md`
- `docs/subprojects/polygon-html-to-product/CHRONIST_IMPLEMENTATION_PLAN.md`
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
- `docs/subprojects/polygon-html-to-product/HISTORY_EXECUTOR_HANDOFF.md`
- `docs/subprojects/polygon-html-to-product/JOURNAL.md`

## Suggested verification

- `npm run docs:sync`
- `npm run docs:check`
- проверить base-to-head diff: на этой документационной ветке не должно быть product-code изменений.

## Safety rules

- Каждая product-code вертикаль — отдельная feature-ветка от свежего exact preview SHA.
- History не возвращается в scope ХРОНИСТА.
- Не создавать fake Journal/telemetry/Series/Laboratory/history.
- Не создавать второй runner/metric catalog/parameter catalog.
- Не менять `main`/`real-wargame-preview` и не выполнять deployment без отдельного разрешения.
