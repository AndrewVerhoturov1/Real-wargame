# Перенос Полигона — статус интеграции принятых результатов

Дата: 2026-08-17

## Решение пользователя

Пользователь лично проверил финальный внешний результат АРКИ и подтвердил, что он его устраивает. Поэтому прежний Route X-блокер, связанный только с отсутствием независимого pixel-perfect доказательства финального SHA АРКИ, считается снятым пользовательским приёмочным решением.

## Интегрированные результаты

Все четыре принятых направления собраны в одной интеграционной ветке от `real-wargame-preview @ 1246e1d612e648e7d7378db1c02be3bbf3d2a16a`.

| Направление | Принятый exact SHA | Статус | Что переносится |
|---|---|---|---|
| АРКА | `0309b34d71d4bf4987c58a343576fbf79c185b44` | ACCEPT по пользовательской визуальной приёмке | Реальный продуктовый shell Полигона, панели, вкладки, topbar и UI-каркас без fake gameplay state |
| ПУЛЬС | `aa7965ca06df12453466a5f03efc723318b94e44` | ACCEPT | Контракт `map selection → unitId → UnitModel → LIVE Unit → штатная команда → readback` |
| ЛИНЗА | `8040f5282b81d6465c02cc41b02ec024819ac575` | ACCEPT после ревизии | Контракт реальных владельцев данных `Инфо / Внимание / Память` и focused smoke; без LINZA-owned runtime/history/front |
| ХРОНИСТ | `9e2a7d819440ae82572134ff3caa690724f007d1` | ACCEPT | Контракт experiment identity, Program↔Journal, History, Metrics, Laboratory, Series, replay/persistence и Save/Open boundaries |

## Интеграционная цепочка

Ветка: `integration/20260817-polygon-accepted-results`

- ARKA: PR #277 → merge `633e64b7674b4ddbef1fe00085f64656a65520c5`;
- PULSE: PR #278 → merge `04e9d33e0ce9bf88852862e32933a7fc9356eec1`;
- LINZA: PR #279 → merge `389af8a192966e5f92950d74260f0ba83d740631`;
- CHRONIST: PR #280 → merge `7577894072fda4dce9c455cd8476d3111bd8a19b`.

Все четыре результата объединились без merge-конфликтов.

## Что реально уже реализовано

АРКА — продуктовая реализация нового интерфейсного shell.

ПУЛЬС, ЛИНЗА и ХРОНИСТ в этом интеграционном пакете в основном являются утверждёнными контрактами следующей продуктовой разработки. Их наличие в ветке не означает, что уже реализованы все LIVE/HISTORY-возможности соответствующих вкладок.

Особенно важно:

- ПУЛЬС ещё не означает готовый полный LIVE Unit UI;
- ЛИНЗА не создаёт собственные `MapInfoReadModel`, `AttentionReadModel`, `UnitMemoryReadModel`, `EstimatedFront` или локальный HistoryProvider;
- HISTORY для правой панели должен использовать общий canonical HistoryProvider;
- ХРОНИСТ не объявляет replay, persistence, Series runtime или Laboratory полностью реализованными только на основании контракта.

## Следующая продуктовая точка

Первый следующий вертикальный срез:

`АРКА + ПУЛЬС → настоящий выбранный unitId → тот же UnitModel → вкладка «Юнит» LIVE → штатная команда смены позы → readback того же UnitModel`.

После него:

1. `Инфо LIVE` через существующих product owners и bounded queries;
2. `Внимание LIVE` через существующие Attention write/read boundaries;
3. supported `Память LIVE` без выдуманного Estimated Front;
4. общий HistoryProvider до подключения HISTORY в Journal/Unit/Info/Attention/Memory;
5. затем Program↔Journal, Metrics/telemetry, Laboratory, Series, replay и Save/Open по контракту ХРОНИСТА.

## Ограничения интеграции

- `main` не трогать;
- deployment не является частью этой интеграции;
- не считать контрактные документы доказательством уже реализованных capabilities;
- не вводить второй selection store, второй gameplay truth, UI-owned LOS/perception/history или synthetic production data;
- финальная передача в `real-wargame-preview` выполняется отдельным merge интеграционного PR после итоговых проверок.
