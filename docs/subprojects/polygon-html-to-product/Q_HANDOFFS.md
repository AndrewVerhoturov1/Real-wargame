# Q-handoff: четыре параллельных направления переноса Полигона

Дата подготовки: 2026-08-15.

Документ фиксирует четыре независимых задания для параллельного запуска. Q пока не запущены. Каждый исполнитель получает отдельную feature-ветку и обязан вернуть точный SHA результата.

## Общая база и правила

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
documentation_context_commit: 078423776a890547533c0519b60417c39a9eda69
```

`base_commit` — точный HEAD `real-wargame-preview`, проверенный при подготовке handoff. Перед фактическим запуском каждого Q его нужно получить заново. Если HEAD изменился, старый SHA нельзя использовать.

Принятые ограничения:

- HTML-прототип задаёт пользовательский контракт, но не архитектуру и не владельцев данных;
- нельзя переносить `window`/global API, demo-массивы, mock-данные, synthetic RNG, demo events, `localStorage` или временный `appState` как продуктовую основу;
- UI не владеет gameplay truth и не вычисляет runtime/perception/LOS вместо продукта;
- каждая кодовая работа идёт только в отдельной feature-ветке;
- `real-wargame-preview`, `main` и deployment не затрагиваются;
- PR не создаётся без отдельной необходимости по правилам репозитория;
- начало каждого отчёта и каждого handoff должно содержать самообозначение исполнителя в точной форме, указанной ниже.

Обязательный формат результата каждого Q:

```text
executor_name: <АРКА | ПУЛЬС | ЛИНЗА | ХРОНИСТ>
base_commit: <40-character SHA>
feature_branch: <branch>
current_commit: <40-character SHA>
result: <что доказано или реализовано>
changed_files: <точный список>
checks_run: <проверки>
not_checked: <что не проверено>
blockers: <если есть>
next_merge_point: <куда должен войти результат>
preview_touched: no
main_touched: no
deployment_touched: no
```

Все четыре направления можно запустить одновременно. Первая интеграционная точка — `АРКА + ПУЛЬС → первый настоящий LIVE Unit`; ЛИНЗУ и ХРОНИСТА для этого ждать не нужно.

---

## 1. АРКА — каркас нового Полигона

Самообозначение обязательно:

> Я — АРКА. Отвечаю за каркас интерфейса нового Полигона.

```text
executor_name: АРКА
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260815-polygon-arka-shell
```

### Цель

Перенести в продукт внешнюю конструкцию принятого HTML-прототипа, получив узнаваемую оболочку нового Полигона без переноса demo/runtime-модели.

### Обязательные источники

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- локальный принятый HTML-файл, его размер и SHA из `SUBPROJECT.md`.

### Разрешено

Создать или изменить только product UI shell и его локальное подключение в рамках текущей архитектуры:

- общую оболочку;
- верхнюю шапку;
- левую панель;
- центральную область карты;
- правую панель;
- вкладки `Юнит / Инфо / Внимание / Память`;
- рабочие вкладки `Карта / Программа / Лаборатория / Метрики / Журнал / Серия`;
- нижнее место под общую шкалу времени;
- переключение вкладок;
- active/hover/collapse-состояния;
- типографику, отступы, размеры и адаптацию окна;
- только UI-owned state: активная вкладка, свёрнутость панели, popup и геометрия интерфейса.

### Запрещено

- fake Unit, Memory, Attention, Journal, Metrics или Series;
- demo-бойцы и synthetic gameplay state;
- новая симуляция, карта или глобальный доменный `appState`;
- второй владелец selected unit;
- копирование внутренней JS-модели HTML;
- прямое подключение временных `window`/global API;
- изменение `real-wargame-preview` или `main`;
- deployment.

### Зависимости

На старте зависимостей от остальных потоков нет. Результат станет оболочкой для `ПУЛЬСА`; не ждать ЛИНЗУ и ХРОНИСТА.

### Ожидаемый результат

В отдельной feature-ветке существует визуально узнаваемый новый Полигон с оформленными, но честно пустыми контейнерами неподключённых разделов.

### Критерии приёмки

- все перечисленные зоны и вкладки доступны пользователю;
- переходы и локальные состояния работают;
- оболочка соответствует принятому HTML-контракту по структуре и компоновке;
- в коде нет fake runtime/gameplay данных;
- UI не становится владельцем доменного состояния;
- `npx tsc --noEmit`, сфокусированные проверки и `npm run build` выполнены, если они применимы;
- diff не затрагивает запрещённые области.

### Следующая точка

`АРКА + ПУЛЬС → первый настоящий LIVE Unit`.

---

## 2. ПУЛЬС — настоящий юнит и первый LIVE-контур

Самообозначение обязательно:

> Я — ПУЛЬС. Отвечаю за связь нового интерфейса с живым юнитом симуляции.

```text
executor_name: ПУЛЬС
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260815-polygon-pulse-live-unit-contract
```

### Цель

Исследовать и зафиксировать путь `карта → selected unitId → UnitModel → правый «Юнит» LIVE → штатная команда смены позы → тот же UnitModel → readback`.

### Обязательные источники

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- текущий код selection bridge, `UnitModel`, штатных команд и `GameEditorRegistry` на точном base commit.

### Разрешено

Создать только `docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md` и зафиксировать:

- настоящего владельца выбранного юнита и путь получения настоящего `unitId`;
- существующий selection bridge Combat Lab;
- поля вкладки `Юнит → источник → тип → механизм обновления`;
- read/write boundaries;
- штатную команду смены позы `стоя / пригнувшись / лёжа` и readback;
- путь к связанному профилю через authoritative editor/`GameEditorRegistry`;
- границу между live runtime и стартовым authoring-состоянием.

### Запрещено

- продуктовая реализация до принятия контракта;
- новый runtime и новый selection store;
- прямое изменение `unit.posture` из UI;
- UI-копия `UnitModel`;
- полный Unit Editor;
- выдуманные API или владельцы;
- изменение `real-wargame-preview`, `main` или deployment.

### Зависимости

Исследование полностью параллельно. Для последующей кодовой вертикали потребуется принятый результат ПУЛЬСА и визуальная вкладка `Юнит` от АРКИ.

### Ожидаемый результат

Проверяемый контракт первого LIVE Unit vertical slice, на основании которого отдельный кодовый исполнитель сможет подключить настоящий selection, чтение, штатную смену позы и readback.

### Критерии приёмки

- каждый факт подтверждён кодом или документом;
- неизвестные границы явно помечены;
- выбран один authoritative owner для каждого действия;
- описана failure semantics штатной команды;
- отделены authoring и LIVE;
- нет изменений product code.

### Следующая точка

Принятие контракта ПУЛЬСА → отдельная кодовая задача `АРКА + ПУЛЬС → первый LIVE Unit`.

---

## 3. ЛИНЗА — Инфо, Внимание и Память

Самообозначение обязательно:

> Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память.

```text
executor_name: ЛИНЗА
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260815-polygon-linza-right-panel-contract
```

### Цель

Установить, какие данные правой панели уже являются настоящими product data, какие доступны частично, а какие HTML только демонстрирует.

### Обязательные источники

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- реальные owners/API карты, perception, Attention и Memory на точном base commit.

### Разрешено

Создать только `docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md`.

Для `Инфо` установить owner/API/готовность для координат, высоты, склона, поверхности, проходимости, concealment, cover, объектов и юнитов рядом.

Для `Внимание` установить owner/API для profile, режима, сектора, runtime attention state и perception; отдельно описать допустимые write-boundaries и запрет повторного LOS в UI.

Для `Память` классифицировать текущий подтверждённый контакт, прошлый контакт, предположение, разведданные и предполагаемый фронт как `есть / частично / отсутствует`; отдельно проверить `intel/front`.

### Запрещено

- код UI;
- fake Info, Attention или Memory;
- вычисление perception/LOS в UI;
- исторические данные до готовности history provider;
- выдуманные типы памяти;
- прямое изменение runtime в обход штатных границ;
- изменение `real-wargame-preview`, `main` или deployment.

### Зависимости

Исследование полностью параллельно. Для будущего подключения потребуется оболочка АРКИ и подтверждённые owners; отдельные части могут зависеть от ХРОНИСТА для history/viewTime.

### Ожидаемый результат

Матрица `UI → product owner/API → LIVE readiness → write boundary → gap` и очередь вертикалей `Инфо → Внимание → Память`.

### Критерии приёмки

- каждое поле имеет доказанный источник или честный gap;
- `intel/front` разобран отдельно;
- субъективные данные не смешаны с objective gameplay truth;
- write-boundaries не придуманы;
- отмечено, что можно подключать сейчас, а что блокируется product foundation;
- product code не изменён.

### Следующая точка

`АРКА + ЛИНЗА → Right Panel LIVE` после контрактных gates.

---

## 4. ХРОНИСТ — связность эксперимента и будущие сложные системы

Самообозначение обязательно:

> Я — ХРОНИСТ. Отвечаю за сквозную идентичность эксперимента, событий, измерений и прогонов.

```text
executor_name: ХРОНИСТ
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260815-polygon-chronist-experiment-contract
```

### Цель

Зафиксировать контракты, сохраняющие одну причинную идентичность между Program, runtime events, Journal, History, Metrics, Laboratory, Series, replay и persistence.

### Обязательные источники

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/polygon-html-to-product/SUBPROJECT.md`;
- `docs/subprojects/polygon-html-to-product/MIGRATION_SYNTHESIS.md`;
- `docs/subprojects/polygon-html-to-product/WORK_PLAN.md`;
- `docs/subprojects/polygon-html-to-product/EXECUTION_STREAMS.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_JOURNAL_V4.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_SERIES_V1.md`;
- существующие владельцы Program, Journal, telemetry и experiment state на точном base commit.

### Разрешено

Создать только `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md` и зафиксировать:

- `Program/trackId/stepId → runtime event → Journal event → entity refs`;
- typed/stable identity и навигацию Program ↔ Journal;
- минимальный history-provider contract без fake-машины;
- `viewTime`, прошлое состояние и future-leakage boundary;
- `measurement definition → telemetry stream → run values → Series aggregation`;
- `SeriesRecord`, `RunRecord`, seed, frozen experiment inputs, runtime version и persistence;
- отличие rerun-from-seed от recorded historical replay;
- место Laboratory и full Save/Open в общем Experiment envelope.

### Запрещено

- fake Journal history;
- fake telemetry, synthetic Series или demo-ID;
- обещание exact replay без доказанного контракта;
- универсальный Laboratory engine без owner/descriptor/resolution chain;
- UI-реализация сложных разделов вместо product foundation;
- изменение `real-wargame-preview`, `main` или deployment.

### Зависимости

Исследование параллельно трём остальным потокам. Оно не блокирует первый LIVE Unit, но создаёт основу для `АРКА + ХРОНИСТ → Program ↔ Journal`, затем History, Metrics, Laboratory и Series.

### Ожидаемый результат

Проверяемый набор контрактов и решений, снимающий неопределённость сквозной идентичности эксперимента, времени, измерений, прогонов и сохранения.

### Критерии приёмки

- причинные связи описаны устойчивыми идентификаторами, а не строками и demo-ID;
- история отделена от rerun и replay;
- future leakage явно ограничен;
- Metrics остаётся владельцем definitions, Series не создаёт второй каталог;
- место Save/Open определено на уровне полного эксперимента;
- отсутствующие capabilities перечислены как зависимости, а не замаскированы UI;
- product code не изменён.

### Следующая точка

`АРКА + ХРОНИСТ → Program ↔ Journal LIVE → History → Metrics/Laboratory/Series → persistence`.

---

## Параллельный запуск и приёмка

Стартовые зависимости отсутствуют: все четыре Q можно запустить одновременно. Приёмка ведётся по отдельным feature-веткам и точным SHA. Нельзя считать ветку частью `real-wargame-preview` до отдельного GO пользователя.

После приёма:

1. проверить четыре SHA и diff;
2. принять контракт ПУЛЬСА до кодовой реализации LIVE Unit;
3. отдельно принять результат АРКИ как UI shell;
4. свести ЛИНЗУ и ХРОНИСТА с соответствующими product gates;
5. только затем подготовить следующие кодовые вертикали.

Сами Q этим документом не запускаются: для запуска требуется отдельное разрешение пользователя.
