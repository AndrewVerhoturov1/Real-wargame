# Журнал подпроекта

## 2026-08-15 — подпроект создан

- Создан отдельный подпроект «Перенос Полигона из HTML-прототипа в продукт».
- Принятая исходная база: Interface Linkage v1.
- Идентичность источника: 2 292 772 байта, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.
- HTML не является production architecture.

## 2026-08-15 — аналитическая фаза завершена

- Выполнены `UX_GAP_AUDIT.md`, `PRODUCT_OWNER_MAP.md`, `RUNTIME_GAP_AUDIT.md`.
- Результаты сведены в `MIGRATION_SYNTHESIS.md` и `WORK_PLAN.md`.
- Зафиксирован первый доказательный LIVE Unit slice.

## 2026-08-15 — первоначальная схема четырёх исполнителей

- Созданы АРКА, ПУЛЬС, ЛИНЗА, ХРОНИСТ.
- Подготовлены `EXECUTION_STREAMS.md`, `Q_HANDOFFS.md`, `Q_PROMPTS.md` и карта состояния.

## 2026-08-15 — ХРОНИСТ: архитектурный контракт

- Исследованы Program/Journal, History, Metrics, Laboratory, Series, replay и persistence на exact product base `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`.
- Создан `CHRONIST_EXPERIMENT_CONTRACT.md`.
- Первый commit контракта: `237413cf5b487a7c1cd5f8b1a505e5c1d7bf2a54`.
- После обязательной проверки полного planned scope контракт дополнен функциями Journal v4, Metrics v18, Laboratory v1 и Series v1.1.
- Exact audit commit: `9e2a7d819440ae82572134ff3caa690724f007d1`.
- Product code не менялся.

## 2026-08-16 — History выделен в отдельную большую дорожку

Решение пользователя:

- ХРОНИСТ делает всё своё направление, кроме `History / глобальной шкалы времени`;
- History становится отдельной темой самостоятельного исполнителя;
- рабочий позывной в документации — **ИСТОРИК**.

Созданы/обновлены:

- `CHRONIST_IMPLEMENTATION_PLAN.md` — вертикали C1–C10 и readiness всего non-History scope;
- `HISTORY_EXECUTOR_HANDOFF.md` — отдельный scope HistoryProvider/viewTime/timeline;
- `EXECUTION_STREAMS.md` — пять дорожек вместо четырёх;
- `PROJECT_MAP_TEMPLATE.md` — параллельные дорожки ХРОНИСТ/ИСТОРИК;
- `SUBPROJECT.md` и status metadata — новая граница ответственности.

Текущая readiness ХРОНИСТА:

- ready core: stable Program IDs, structured Program journal, fixed Combat Lab metrics, batch/headless runner, seed, узкий experiment codec;
- partial: общий LIVE Journal, Program↔Journal, Series analysis, current rerun, full Save/Open;
- absent: durable RunId, Metrics v18 telemetry/report, generic Laboratory, durable Series/Run records, verified frozen rerun, full ExperimentEnvelope;
- History/timeline: отдельная дорожка ИСТОРИК.

Следующая продуктовая вертикаль ХРОНИСТА: **C1 Run identity + Structured LIVE Journal foundation**.

Документационная ветка не является product implementation. Для C1 перед стартом требуется свежий exact HEAD `real-wargame-preview` и отдельная feature-ветка.
