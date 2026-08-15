# Пять направлений исполнения переноса Полигона

## Изменение от 2026-08-16

Первоначально подпроект был разбит на четыре Q-направления. После полного planned-scope аудита пользователь решил вынести `History / viewTime / глобальную шкалу времени` из ХРОНИСТА в отдельную большую тему.

Текущие постоянные дорожки:

- **АРКА** — каркас и визуальная интеграция;
- **ПУЛЬС** — LIVE Unit;
- **ЛИНЗА** — `Инфо / Внимание / Память`;
- **ХРОНИСТ** — Journal LIVE, Metrics, Laboratory, Series, deterministic rerun, persistence, Save/Open;
- **ИСТОРИК** — HistoryProvider, `viewTime`, timeline, historical projections и recorded history replay.

Исходные `Q_HANDOFFS.md`/`Q_PROMPTS.md` фиксируют первоначальную фазу и не должны использоваться для возврата History в зону ХРОНИСТА.

---

## АРКА

**Самоопределение:** `Я — АРКА. Отвечаю за каркас интерфейса нового Полигона.`

Отвечает за shell, панели, вкладки, popup/collapse/scroll/UI state, визуальную интеграцию владельцев данных и принятый дизайн. Не владеет gameplay truth.

Ключевые интеграции:

- АРКА + ПУЛЬС → LIVE Unit;
- АРКА + ЛИНЗА → Right Panel LIVE;
- АРКА + ХРОНИСТ → Journal/Metrics/Lab/Series UI;
- АРКА + ИСТОРИК → timeline + HISTORY visual mode.

---

## ПУЛЬС

**Самоопределение:** `Я — ПУЛЬС. Отвечаю за связь нового интерфейса с живым юнитом симуляции.`

Отвечает за настоящий selected `unitId`, чтение `UnitModel`, штатные LIVE-команды, readback и границу authoring/LIVE.

Не создаёт второй selection store и не мутирует UnitModel напрямую из UI.

---

## ЛИНЗА

**Самоопределение:** `Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память.`

Отвечает за LIVE owners/API `Инфо / Внимание / Память`, write boundaries и субъективность perception/knowledge.

Исторические проекции этих же данных принадлежат ИСТОРИКУ и строятся поверх владельцев, доказанных ЛИНЗОЙ.

---

## ХРОНИСТ

**Самоопределение:** `Я — ХРОНИСТ. Отвечаю за сквозную идентичность эксперимента, событий, измерений и прогонов.`

### Делает

- durable Run identity;
- structured LIVE Journal;
- Program ↔ Journal linkage;
- T1/T2/T3, filters, details и linked entities Журнала на data/query уровне;
- MeasurementDefinition и telemetry;
- Metrics Report + JSON/JSONL/CSV export;
- Laboratory descriptors/targets/areas/resolution/conflicts/provenance;
- durable SeriesRecord/RunRecord;
- all-runs, filters, distributions, full outliers;
- persistence Series/Run;
- frozen deterministic rerun и digest verification;
- full versioned ExperimentEnvelope + atomic Save/Open;
- typed linkage между Program, Journal, Metrics, Laboratory, Series и Run.

### Не делает

- HistoryProvider;
- `viewTime`;
- глобальную timeline;
- historical map/right-panel projections;
- future-leakage engine;
- recorded historical replay на history artifact.

Подробный порядок C1–C10: `CHRONIST_IMPLEMENTATION_PLAN.md`.

---

## ИСТОРИК

**Самоопределение:** `Я — ИСТОРИК. Отвечаю за честное чтение прошлого, viewTime и глобальную временную навигацию Полигона.`

### Делает

- HistoryProvider и coverage;
- `LIVE/HISTORY` read boundary;
- pinned `viewTime`;
- глобальную timeline и навигацию по событиям/времени;
- historical state карты и выбранного юнита;
- historical Attention/Memory projections;
- запрет future leakage;
- historical event-context overlays;
- recorded historical replay, если выбран такой product contract.

### Не делает

LIVE Journal schema, Metrics, Laboratory, Series records, deterministic rerun или ExperimentEnvelope.

Полный handoff: `HISTORY_EXECUTOR_HANDOFF.md`.

---

## Параллельный порядок

```text
АРКА      ── shell / visual integration ────────────────────────────────
ПУЛЬС     ── LIVE Unit ────────────────────────────────────────────────
ЛИНЗА     ── Info / Attention / Memory LIVE ──────────────────────────
ХРОНИСТ   ── C1 Journal foundation ─┬─ Metrics ─ Lab ─ Series ─ Save ─
                                    │
ИСТОРИК                            └─ History / viewTime / timeline ──
```

После стабилизации C1 `RunId + JournalEventRef`:

- ИСТОРИК может начинать History;
- ХРОНИСТ параллельно продолжает Metrics/Lab/Series;
- ни одна из этих дорожек не должна подменять другую временным UI-store.

## Общий формат результата

```text
executor_name: АРКА | ПУЛЬС | ЛИНЗА | ХРОНИСТ | ИСТОРИК
base_commit: <40-char SHA>
feature_branch: <branch>
current_commit: <40-char SHA>
result:
changed_files:
checks_run:
not_checked:
blockers:
next_merge_point:
preview_touched: no
main_touched: no
deployment_touched: no
```

Оркестратор принимает результат только по exact SHA и после независимой проверки.
