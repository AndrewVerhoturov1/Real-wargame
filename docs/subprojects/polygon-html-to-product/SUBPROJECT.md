# Перенос Полигона из HTML-прототипа в продукт

## Цель

Перенести принятый пользовательский интерфейс режима «Полигон» из HTML-прототипа в штатную реализацию Real Wargame, сохранив не только внешний вид, но и весь принятый функциональный объём.

Перенос сохраняет:

- видимое поведение интерфейса;
- пользовательские сценарии;
- связи между разделами;
- смысл действий пользователя;
- принятые правила интерфейса;
- planned functionality Journal, Metrics, Laboratory, Series, Save/Open и связанных разделов.

HTML остаётся UX/reference-контрактом. Внутренняя реализация использует настоящих product owners и существующую simulation/runtime архитектуру.

## Принятая исходная база

Канонический UX/reference — Interface Linkage v1 из `docs/subprojects/polygon-prototype/`.

Пользовательский исходный файл: `polygon-series-v1.1-memory-v3-interface-linkage.html`.

Каноническое имя: `polygon-interface-linkage-v1.html`.

- дата: 2026-08-15;
- размер: 2 292 772 байта;
- SHA-256: `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.

## Текущее состояние

Аналитическая фаза завершена. Выполнены UX/runtime/owner-аудиты, синтез, рабочий план и первоначальные Q-handoff.

ХРОНИСТ завершил архитектурный контракт сквозной идентичности и обязательную проверку полного planned scope. Источник принятого аудита ХРОНИСТА: `9e2a7d819440ae82572134ff3caa690724f007d1`.

Решением пользователя от **2026-08-16** изменена граница работ:

- **ХРОНИСТ делает всё своё сложное product-направление, кроме History / глобальной шкалы времени**;
- `HistoryProvider`, `viewTime`, `LIVE/HISTORY`, глобальная timeline, historical projections и future-leakage выделены отдельному исполнителю **ИСТОРИК**;
- recorded historical replay относится к ИСТОРИКУ, если replay строится на сохранённой истории;
- ХРОНИСТ продолжает Journal LIVE, Metrics, Laboratory, Series, deterministic rerun, persistence и full Save/Open.

Подробный новый порядок: `CHRONIST_IMPLEMENTATION_PLAN.md`.

Отдельный handoff History: `HISTORY_EXECUTOR_HANDOFF.md`.

## Пять направлений исполнения

### АРКА

UI shell, панели, вкладки, visual integration и UI-owned state. Не создаёт fake gameplay data.

### ПУЛЬС

LIVE Unit: selection → настоящий `unitId` → `UnitModel` → штатная команда → readback.

### ЛИНЗА

Настоящие LIVE-данные `Инфо / Внимание / Память`, read/write boundaries и субъективность данных.

### ХРОНИСТ

- Run identity;
- Program ↔ Journal LIVE;
- полный non-History scope Journal;
- Metrics definitions/telemetry/report/export;
- Laboratory descriptor/resolution;
- Series/Run persistence, all-runs, filters/outliers;
- frozen deterministic rerun;
- полный ExperimentEnvelope и Save/Open;
- typed linkage этих систем.

### ИСТОРИК

- HistoryProvider;
- `viewTime`;
- `LIVE/HISTORY`;
- глобальная шкала времени;
- historical map/right-panel projections;
- future leakage protection;
- recorded historical replay при history-artifact семантике.

Первоначальные четыре Q-handoff остаются историей исходного разделения. Для текущей фазы приоритет имеют `EXECUTION_STREAMS.md`, `CHRONIST_IMPLEMENTATION_PLAN.md` и `HISTORY_EXECUTOR_HANDOFF.md`.

## Текущая readiness сложных систем

| Область | Статус |
|---|---|
| Program `trackId/stepId` | готово |
| Structured Program journal | готово узко |
| Durable RunId | отсутствует |
| Общий LIVE Journal | частично |
| Program ↔ Journal LIVE | частично |
| History / timeline | отдельная дорожка ИСТОРИК, отсутствует |
| Current fixed Combat Lab metrics | готово узко |
| Metrics v18 definitions/telemetry | отсутствует |
| Metrics Report/export | отсутствует |
| Узкие experiment overrides | готово узко |
| Generic Laboratory | отсутствует |
| Batch/headless Series execution | готово |
| Durable Series/Run records | отсутствует |
| All-runs / filters / full outliers | частично/отсутствует |
| Current rerun-by-seed | частично |
| Verified frozen rerun | отсутствует |
| Recorded historical replay | ИСТОРИК / отсутствует |
| Current experiment file save | готово узко |
| Full ExperimentEnvelope Save/Open | частично |

Полная детализация готовности находится в `CHRONIST_IMPLEMENTATION_PLAN.md` и разделе `20. Проверка полного planned scope` файла `CHRONIST_EXPERIMENT_CONTRACT.md`.

## Порядок сложной реализации ХРОНИСТА

1. **C1 Run identity + Structured LIVE Journal foundation.**
2. **C2 Full LIVE Journal v4 без History.**
3. **C3 MeasurementDefinition + telemetry.**
4. **C4 Metrics Report + export.**
5. **C5 Laboratory descriptor/resolution.**
6. **C6 Durable SeriesRecord/RunRecord + persistence.**
7. **C7 Series analysis/all-runs/outliers/navigation.**
8. **C8 Frozen deterministic rerun.**
9. **C9 Versioned ExperimentEnvelope Save/Open.**
10. **C10 Full non-History linkage + acceptance.**

После C1 отдельный ИСТОРИК может независимо строить History на стабильных Run/Event references. History не блокирует C3/C5/C6/C9.

## Основные этапы всего подпроекта

1. Анализ и планирование — завершено.
2. UI Shell + первый LIVE Unit.
3. Right Panel LIVE.
4. Program ↔ Journal LIVE.
5. Две параллельные длинные дорожки:
   - ИСТОРИК: History/viewTime/timeline;
   - ХРОНИСТ: Metrics/Laboratory/Series/persistence/Save/Open.
6. Сквозная интеграция.
7. Полный planned-scope acceptance.
8. Только после явного GO — transfer exact accepted SHA в `real-wargame-preview`.
9. Только после отдельного запроса — deployment.

## Правила готовности

Экран или вкладка не считаются готовыми по факту наличия UI. Для статуса `готово` должны быть доказаны:

- настоящий owner;
- настоящий read/write или query contract;
- отсутствие fake/demo fallback;
- пользовательский сценарий принятого HTML;
- focused tests;
- `npx tsc --noEmit`;
- релевантный smoke;
- `npm run build`;
- exact feature SHA.

После каждого принятого SHA готовность обновляется в `subproject.json`, `STATUS.md`, соответствующем implementation plan и `JOURNAL.md`.

## Зависимости и продуктовые решения

Остаются отдельные решения пользователя:

- семантика полного Unit Editor;
- persistence policy Series/Run;
- объём первой product-версии Metrics, если не все telemetry streams доступны одновременно;
- классы Laboratory parameters, где разрешено `Apply Globally`;
- recorded replay vs frozen deterministic rerun как пользовательское обещание кнопки воспроизведения.

## Правила подпроекта

- Перед каждой кодовой веткой заново фиксировать exact current `real-wargame-preview` HEAD.
- Не считать HTML источником истины симуляции.
- Не вводить mock-владельцев игровых данных.
- UI владеет только чистым UI-state.
- Не менять `main` или `real-wargame-preview` без отдельного разрешения.
- Не выполнять deployment без отдельного запроса.
- GitHub exact SHA является состоянием работы; память чата — нет.
