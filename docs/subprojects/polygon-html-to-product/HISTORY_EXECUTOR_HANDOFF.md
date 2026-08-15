# Отдельный исполнитель — History / глобальная шкала времени

## Решение владельца продукта

С 2026-08-16 `History / viewTime / глобальная шкала времени` больше не являются реализационной зоной ХРОНИСТА. Это отдельная большая тема для самостоятельного исполнителя.

Рабочий позывной в документации: **ИСТОРИК**.

Самоопределение:

> Я — ИСТОРИК. Отвечаю за честное чтение прошлого, viewTime и глобальную временную навигацию Полигона.

Это разделение не отменяет связей с Journal, Unit, Attention, Memory и Run records. ИСТОРИК потребляет их устойчивые идентификаторы, но не становится владельцем LIVE-событий, Metrics, Laboratory или Series.

---

## Цель

Реализовать product foundation и пользовательский сценарий:

`LIVE → выбрать событие/момент T → HISTORY(T) → карта + выбранный юнит + Attention/Memory соответствуют T → переходы между вкладками сохраняют T → К текущему → LIVE`, не изменяя живую симуляцию и не подмешивая данные из будущего.

---

## База

Перед стартом исполнитель обязан заново получить точный HEAD `real-wargame-preview` и создать отдельную feature-ветку. SHA из этого документа не является разрешением начать от устаревшей базы.

Рекомендуемое имя ветки:

`feature/YYYYMMDD-polygon-history-viewtime`

---

## Обязательные источники

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md`;
- `docs/subprojects/polygon-html-to-product/CHRONIST_IMPLEMENTATION_PLAN.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- реальные owners Unit/Attention/Memory на exact base;
- принятый `RunId/JournalEventRef` contract из C1 ХРОНИСТА, когда он будет реализован.

---

## Зона ответственности

### 1. HistoryProvider

Product owner должен уметь как минимум:

- сообщить coverage истории конкретного Run;
- сообщить доступные исторические домены;
- разрешить состояние на `viewTime=T`;
- разрешить состояние, привязанное к JournalEventRef;
- вернуть `unavailable`, если домен не записан/не восстанавливается;
- никогда не мутировать LIVE runtime ради просмотра прошлого.

### 2. `viewTime` и LIVE/HISTORY

- `LIVE` читает current authoritative runtime;
- `HISTORY(T)` читает только history provider;
- live simulation может продолжать идти отдельно;
- новые события не должны автоматически сбрасывать pinned historical time;
- `К текущему` меняет режим просмотра, а не состояние симуляции.

### 3. Глобальная шкала времени

Обязательный scope принятого Journal v4:

- шкала во всех рабочих вкладках;
- свернуто/развернуто;
- current historical position и live time;
- T1/T2/T3 points;
- переход к событию;
- произвольное время;
- соседние события;
- отдельный независимый timeline filter;
- основные события / selected Metrics / мелкие metric T3.

Внешний визуальный shell делает АРКА, но time/query semantics принадлежат ИСТОРИКУ совместно с Journal owner.

### 4. Historical map

На T карта должна показывать реальные исторические данные и, где доступно, контекст выбранного события:

- участников;
- направление/линию;
- попадание/промах;
- LOS или иной сохранённый релевантный след.

Не вычислять исторический LOS из текущего мира в UI.

### 5. Historical right panel

Совместно с ПУЛЬСОМ/ЛИНЗОЙ определить projections для:

- Unit state;
- position/posture;
- health/wounds;
- ammo/weapon state;
- suppression/morale;
- action/order state;
- Attention;
- perception;
- Memory.

Каждое поле либо имеет historical source `asOf <= viewTime`, либо отображается как недоступное в истории.

### 6. Future leakage

Запрещено использовать current/future runtime data для исторического поля. Особенно для perception, attention, memory, ammo, wounds, suppression, orders/actions и time-dependent effective overrides.

### 7. Recorded historical replay

Если продуктовым решением replay станет воспроизведение сохранённой истории, ИСТОРИК владеет или совместно владеет replay artifact/provider. ХРОНИСТ отдельно реализует только frozen deterministic rerun.

---

## Не зона ИСТОРИКА

- создание LIVE `JournalEvent` schema;
- Program ↔ Journal identity;
- MeasurementDefinition и telemetry collection;
- Metrics Report/export;
- Laboratory descriptor/resolution;
- SeriesRecord/RunRecord persistence как таковые;
- deterministic rerun из frozen input;
- полный ExperimentEnvelope Save/Open;
- UI shell и визуальное оформление.

---

## Зависимости

### Входы от ХРОНИСТА

Минимально:

- стабильный `RunId`;
- `JournalEventRef`/event sequence contract;
- simulation time на событиях;
- typed entity refs;
- ProgramStepRef при наличии;
- при recorded replay — RunRecord link на history/replay artifact.

### Входы от ЛИНЗЫ/ПУЛЬСА

- field ownership правой панели;
- distinction objective state / subjective knowledge;
- stable entity IDs.

### Вход от АРКИ

- место глобальной timeline;
- LIVE/HISTORY indicators;
- visual containers карты и правой панели.

---

## Требуемые проверки

Для product implementation:

- failing tests first;
- focused HistoryProvider tests;
- test: HISTORY не меняет LIVE runtime;
- test: pinned `viewTime` не auto-follow при новых событиях;
- test: `К текущему` возвращает current state;
- test: unavailable domain не подставляет current state;
- test: perception/memory не видят будущего;
- `npx tsc --noEmit`;
- relevant focused smoke;
- `npm run build`;
- визуальная QA только через repository screenshot router и только при соответствующем разрешении.

---

## Критерий готовности

History считается готовой только когда один пользовательский сценарий проходит на настоящих данных:

`LIVE → T1 → historical map + selected unit + subjective knowledge at T1 → T2 → другая historical projection → перейти в другую рабочую вкладку без потери T2 → К текущему → LIVE`, при этом live runtime не откатывается и данные из будущего не появляются.

---

## Формат отчёта

```text
executor_name: ИСТОРИК
base_commit:
feature_branch:
current_commit:
result:
changed_files:
checks_run:
not_checked:
history_coverage:
future_leakage_checks:
blockers:
next_merge_point:
preview_touched: no
main_touched: no
deployment_touched: no
```
