# Performance Report v6

`performance-report-v6` — встроенный диагностический стандарт Real-Wargame. Он связывает состояние сцены, действия пользователя, игровые приказы, очереди, тяжёлые операции, браузерные LongTask/LoAF и последствия для игровой семантики.

## Зачем нужен v6

Старый v5 в основном отвечал на вопрос «сколько занял кадр» и сохранял конечный `scene.unitCount`. Если во время запуска пользователь добавлял бойцов, старый отчёт не позволял надёжно восстановить исходное, максимальное и конечное количество. При зависании финальный экспорт мог не состояться вообще.

v6 разделяет данные на три части внутри одного JSON:

- `summary` — быстро читаемая идентичность сборки, verdict, численность сцены, худшие окна, диагнозы, здоровье отчёта и semantic health;
- `report` — агрегаты фаз, очередей, навигации, workers, памяти, объёма работы и outliers;
- `trace` — ограниченная временная история последних 30 секунд: кадры, scene timeline, события, пользовательские метки и самые медленные операции.

Один JSON выбран намеренно: текущий интерфейс уже умеет надёжно скачивать один файл, его проще прислать в чат и открыть без архиватора. Разделы сохраняют логическое отделение summary/report/trace, а подробный trace остаётся bounded.

## Как получить отчёт

1. Открой редактор сцены и вкладку со служебными действиями.
2. Найди блок **«Отладка производительности»**.
3. Выполни проблемный сценарий.
4. Нажми **«Экспортировать Performance Report v6»**.
5. Передай скачанный JSON вместе с кратким описанием того, что было видно на экране.

В компактной строке статуса показываются версия, длительность capture, текущее и максимальное число бойцов, dropped samples и dropped events.

## Пользовательская метка

Перед важным действием или сразу после него нажми **«Добавить метку производительности»** и введи короткий текст, например:

```text
Добавил ещё 94 бойца
Продолжил симуляцию
Дал массовый приказ движения
Включил слой опасности
```

Метка сохраняется как защищённое событие `user.marker` и попадает в соответствующее worst window.

## Динамическая численность

`summary.scenePopulation` содержит:

- `initial` — первый снимок capture;
- `measurementStart` — начало измерения;
- `minimum` — минимальная наблюдавшаяся численность;
- `maximum` — максимальная численность;
- `final` — последний снимок перед экспортом или checkpoint.

Каждый снимок содержит количество живых/погибших бойцов, стороны, graph/manual control, движение, приказы, ожидание маршрутов, активные маршруты, replans и бой.

`trace.sceneTimeline` хранит дешёвые агрегированные снимки примерно раз в 750 мс и чаще при изменении численности, всплеске очереди или медленном кадре. Полные игровые объекты и вся карта туда не копируются.

## События и причинная связь

События имеют `eventId`, время, priority, небольшой `data` и, когда доступно, causal context:

```text
operationId
requestId
orderId
routeRequestId
workerRequestId
unitId
revision
profileId
```

Редакторские изменения определяются по изменению устойчивых ID сцены. Приказы и маршруты наблюдаются по unit/order identity. Для точной внутренней телеметрии новые подсистемы могут публиковать явный event/queue/work context через telemetry bridge вместо глобальной изменяемой «текущей причины».

## Очереди и навигация

В `report.queues` всегда присутствуют стандартные очереди:

```text
routePlanning
routeReplanning
routeCostWorker
pointLos
aiWake
dangerField
backgroundTacticalSnapshots
rendererDeferredUpdates
```

Для каждой записываются created/started/completed/cancelled/failed/timedOut/stale, текущая и максимальная глубина, in-flight, wait percentiles, bounded timeline и Top-N ожиданий.

`report.navigation` дополнительно содержит route/replan queue, агрегаты pathfinding, work counters, slowest searches и unit outliers. Когда точная внутренняя длительность A* ещё не опубликована системой, отчёт честно помечает измерение как `observed_order_to_route`, а не выдаёт его за чистое время поиска.

## Worst windows

`summary.worstWindows` автоматически выбирает самые тяжёлые окна длиной 1, 5 и 10 секунд. Для каждого окна сохраняются:

- frame/application/simulation statistics;
- ближайший снимок сцены;
- queue peaks;
- top phases и operations;
- события, метки и semantic violations.

Это главный раздел для ответа на вопрос «что происходило непосредственно перед зависанием».

## Диагнозы

Диагноз появляется только при измеряемом условии. Примеры:

- `ROUTE_QUEUE_OVERLOAD` — глубина или ожидание route queue превысили порог;
- `MAIN_THREAD_PATHFINDING` — наблюдалась длительная route operation;
- `MEMORY_GROWTH` — доступный браузерный heap counter показал существенный рост;
- `TELEMETRY_DATA_LOSS` — bounded buffers отбросили обычную историю;
- `TELEMETRY_OVERHEAD` — collection path превысил p95/max target;
- `SEMANTIC_FAILURE` — обнаружено нарушение корректности игры.

`info`, `warning`, `critical` отражают серьёзность доказанного условия. Отсутствие достаточных измерений не превращается в уверенный диагноз.

## Semantic health

Быстрый сценарий не считается успешным, если игра потеряла приказ, применила stale route, допустила starvation, duplicate unit IDs, invalid/NaN positions, worker error или unhandled rejection. Такие нарушения попадают в `summary.semanticHealth`, `report.semanticHealth`, события и влияют на verdict.

## Аварийный checkpoint

Раз в несколько секунд capture асинхронно сохраняет в IndexedDB один последний незавершённый checkpoint. Запись запускается вне SimulationTick и не использует регулярный большой `localStorage` write.

После перезагрузки страницы:

1. открой блок отчёта;
2. нажми **«Экспортировать аварийный отчёт»**;
3. после сохранения при необходимости нажми **«Очистить checkpoint»**.

Восстановленный файл всегда имеет:

```json
{
  "recoveredFromCheckpoint": true,
  "exportCompleted": false,
  "possibleMissingTailMs": 2400
}
```

Он получает verdict `incomplete`. `possibleMissingTailMs` — время между последней успешной записью и восстановлением; это верхняя оценка возможного потерянного хвоста, а не доказанная длительность зависания.

## Bounded storage

Ограничения по умолчанию:

- подробные frame samples: последние 30 секунд, максимум 3600;
- scene timeline: максимум 1200;
- обычные events: максимум 2048;
- critical events/markers/errors: отдельный защищённый буфер;
- queue timeline: максимум 512 на очередь;
- queue wait outliers: Top-20;
- slow operations: Top-100;
- navigation searches: Top-20;
- telemetry cost reservoir: максимум 2048 значений.

При переполнении сначала удаляется старая обычная история. Report health показывает section, lost count и причину. Recent tail, critical events и Top-N хранятся отдельно от обычного потока.

## Накладные расходы

`summary.reportHealth.telemetryCostMs` разделяет:

- `collection` — стоимость frame-path сбора;
- `serialization` — сериализация;
- `checkpointWrite` — подготовка и запись checkpoint;
- `export` — построение/экспорт.

Цель обычного collection path: p95 не более 0,10 мс, max не более 1 мс. Checkpoint и export могут быть дороже, но запускаются вне критического simulation path и измеряются отдельно.

## Память и approximate данные

`performance.memory` доступен не во всех браузерах. Если API отсутствует, `memory.supported=false`. Оценки размера telemetry buffers, caches и payloads помечаются `approximate=true`; это диагностические оценки крупных структур, а не heap profiler каждого объекта JavaScript.

## Совместимость с v5

v6 имеет явные поля:

```json
{
  "version": "performance-report-v6",
  "schemaVersion": 6
}
```

Legacy reader определяет v5 отдельно. Он может показать конечный `scene.unitCount`, но обязан вернуть dynamic population как unavailable и `maximumUnitCount: null`. v5 никогда не маскируется под v6 и не получает выдуманный maximum.

## Для разработчиков новой тяжёлой подсистемы

Публикуй не только duration, но и:

- явную причину запуска;
- operation/request identity;
- work counters;
- queue created/depth/wait/in-flight;
- cancelled/failed/timedOut/stale;
- semantic consequences;
- bounded teardown и memory estimate.

Если точная интеграция ещё отсутствует, оставляй поле unavailable/empty и сохраняй raw diagnostics. Не подставляй догадку.
