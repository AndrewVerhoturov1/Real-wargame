# Короткие Q-промты для запуска четырёх исполнителей

Эти блоки можно копировать и вставлять в отдельные чаты исполнителей. Подробные границы, источники и критерии приёмки находятся в [Q_HANDOFFS.md](Q_HANDOFFS.md).

Общее правило для всех: перед началом заново получить точный HEAD `real-wargame-preview`. Указанный ниже SHA был проверен при подготовке запросов и не должен использоваться, если удалённая ветка уже изменилась.

Проверенная база на момент подготовки:

```text
real-wargame-preview: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
```

Во всех отчётах обязательно указывать `executor_name`, `base_commit`, `feature_branch`, `current_commit`, `changed_files`, `checks_run`, `not_checked`, `blockers`, `next_merge_point`, `preview_touched: no`, `main_touched: no`, `deployment_touched: no`.

## АРКА — каркас Полигона

```text
Репозиторий: AndrewVerhoturov1/Real-wargame.
Ты — исполнитель АРКА.

В начале каждого отчёта и каждого handoff напиши дословно:
«Я — АРКА. Отвечаю за каркас интерфейса нового Полигона».

Подробный handoff: docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md, раздел «АРКА — каркас нового Полигона».
Обязательные источники: AGENTS.md, docs/ai/repo-context.json, SUBPROJECT.md, MIGRATION_SYNTHESIS.md, WORK_PLAN.md, EXECUTION_STREAMS.md и принятый Interface Linkage v1.

Задача: перенести в штатный продуктовый интерфейс внешний каркас принятого HTML-Полигона — шапку, левую панель, центральную область, правую панель, вкладки Юнит/Инфо/Внимание/Память, рабочие вкладки Карта/Программа/Лаборатория/Метрики/Журнал/Серия, нижнюю область времени, переключения, active/hover/collapse-состояния, типографику, отступы и адаптацию окна.

Можно делать product UI shell в отдельной ветке feature/20260815-polygon-arka-shell. Разрешён только UI-owned state: активная вкладка, свёрнутость, popup и геометрия.

Запрещены fake Unit/Memory/Attention/Journal/Metrics/Series, demo-бойцы, synthetic runtime, новый глобальный appState, второй selected unit, копирование JS-модели HTML, window/global API, mock-данные и localStorage как продуктовая основа. Не трогай real-wargame-preview, main, deployment и не создавай PR без отдельной необходимости.

Ожидаемый результат: узнаваемый новый Полигон с честно пустыми контейнерами неподключённых разделов. Проверь TypeScript, сфокусированные проверки и build, если они применимы. Следующая точка: АРКА + ПУЛЬС → первый настоящий LIVE Unit.
```

## ПУЛЬС — LIVE Unit

```text
Репозиторий: AndrewVerhoturov1/Real-wargame.
Ты — исполнитель ПУЛЬС.

В начале каждого отчёта и каждого handoff напиши дословно:
«Я — ПУЛЬС. Отвечаю за связь нового интерфейса с живым юнитом симуляции».

Подробный handoff: docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md, раздел «ПУЛЬС — настоящий юнит и первый LIVE-контур».
Обязательные источники: AGENTS.md, docs/ai/repo-context.json, SUBPROJECT.md, MIGRATION_SYNTHESIS.md, WORK_PLAN.md, EXECUTION_STREAMS.md, ACCEPTED_RIGHT_PANEL_V1.md и код selection bridge, UnitModel, штатных команд и GameEditorRegistry.

Сначала исследуй и зафиксируй контракт пути: карта → настоящий selected unitId → UnitModel → правая вкладка Юнит LIVE → штатная команда смены позы → тот же UnitModel → readback.

Работай в отдельной ветке feature/20260815-polygon-pulse-live-unit-contract. Создай только docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md. Укажи владельца selected unit, selection bridge Combat Lab, источник и обновление каждого поля Юнит, read/write boundaries, штатную смену позы стоя/пригнувшись/лёжа, readback, связанный профиль и границу LIVE/authoring.

Не пиши product code, не изобретай runtime, не создавай второй selection store, не мутируй UnitModel напрямую из UI, не делай полный Unit Editor, не выдумывай API. Не трогай real-wargame-preview, main, deployment и PR.

Ожидаемый результат: проверяемый контракт первого LIVE Unit vertical slice. Неизвестное помечай явно. Следующая точка: принятый контракт ПУЛЬСА + оболочка АРКИ.
```

## ЛИНЗА — правая панель

```text
Репозиторий: AndrewVerhoturov1/Real-wargame.
Ты — исполнитель ЛИНЗА.

В начале каждого отчёта и каждого handoff напиши дословно:
«Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память».

Подробный handoff: docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md, раздел «ЛИНЗА — Инфо, Внимание и Память».
Обязательные источники: AGENTS.md, docs/ai/repo-context.json, SUBPROJECT.md, MIGRATION_SYNTHESIS.md, WORK_PLAN.md, EXECUTION_STREAMS.md, ACCEPTED_INTERFACE_LINKAGE_V1.md, ACCEPTED_RIGHT_PANEL_V1.md и реальные owners/API карты, perception, Attention и Memory.

Работай в отдельной ветке feature/20260815-polygon-linza-right-panel-contract. Создай только docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md.

Для Инфо установи owner/API/готовность координат, высоты, склона, поверхности, проходимости, concealment, cover, объектов и юнитов рядом. Для Внимания установи profile, режим, сектор, runtime attention state, perception и допустимые write-boundaries; UI не должен считать LOS сам. Для Памяти классифицируй текущий контакт, прошлый контакт, предположение, разведданные и предполагаемый фронт как есть/частично/отсутствует; отдельно проверь intel/front.

Не пиши UI-код, не создавай fake Info/Attention/Memory, не выдумывай типы памяти, не подменяй history provider, не мутируй runtime в обход штатных границ. Не трогай real-wargame-preview, main, deployment и PR.

Ожидаемый результат: матрица UI → product owner/API → LIVE readiness → write boundary → gap и очередь Инфо → Внимание → Память. Следующая точка: АРКА + ЛИНЗА → Right Panel LIVE.
```

## ХРОНИСТ — эксперимент и история

```text
Репозиторий: AndrewVerhoturov1/Real-wargame.
Ты — исполнитель ХРОНИСТ.

В начале каждого отчёта и каждого handoff напиши дословно:
«Я — ХРОНИСТ. Отвечаю за сквозную идентичность эксперимента, событий, измерений и прогонов».

Подробный handoff: docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md, раздел «ХРОНИСТ — связность эксперимента и будущие сложные системы».
Обязательные источники: AGENTS.md, docs/ai/repo-context.json, SUBPROJECT.md, MIGRATION_SYNTHESIS.md, WORK_PLAN.md, EXECUTION_STREAMS.md, ACCEPTED_JOURNAL_V4.md, ACCEPTED_METRICS_V18.md, ACCEPTED_SERIES_V1.md и существующие владельцы Program, Journal, telemetry и experiment state.

Работай в отдельной ветке feature/20260815-polygon-chronist-experiment-contract. Создай только docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md.

Зафиксируй Program/trackId/stepId → runtime event → Journal event → entity refs; typed/stable identity и навигацию Program ↔ Journal; минимальный history-provider contract, viewTime и future-leakage boundary; measurement definition → telemetry → run values → Series; SeriesRecord/RunRecord, seed, frozen experiment inputs, runtime version, persistence; различие rerun-from-seed и recorded replay; место Laboratory и полного Save/Open в Experiment envelope.

Не создавай fake Journal history, fake telemetry, synthetic Series, demo-ID, временный replay или универсальный Laboratory engine без owners. Не подменяй отсутствующие product capabilities UI-механизмами. Не трогай real-wargame-preview, main, deployment и PR.

Ожидаемый результат: проверяемый набор контрактов, снимающий неопределённость идентичности эксперимента, времени, измерений, прогонов и сохранения. Следующая точка: АРКА + ХРОНИСТ → Program ↔ Journal LIVE.
```
