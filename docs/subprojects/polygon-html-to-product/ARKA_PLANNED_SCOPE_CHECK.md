# АРКА — самопроверка полного planned scope

## Проверка полного planned scope

Дата самопроверки: 2026-08-16.

Исполнитель: **АРКА** — каркас интерфейса нового Полигона.

Проверяемый результат до этой записи:

- `feature_branch`: `feature/20260815-polygon-arka-shell`;
- `implementation_commit`: `d6f819ecc6b3d8d98747886cab57dad2a4595de4`;
- `base_commit`: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`.

Эта запись не меняет product code. Она расширяет исходный узкий handoff АРКИ проверкой против **полного запланированного функционального объёма принятого HTML-прототипа**.

### Источники проверки

Сопоставлены:

- `docs/subprojects/polygon-html-to-product/Q_HANDOFFS.md` из `feature/20260815-polygon-execution-map`;
- `SUBPROJECT.md`, `STATUS.md`, `MIGRATION_VISION.md`, `MIGRATION_SYNTHESIS.md`, `WORK_PLAN.md` подпроекта переноса;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- принятый общий planned scope Полигона: карта, юниты, Программа, Лаборатория, Метрики, Журнал, Серия, общая навигация, linked entities, History/viewTime и Save/Open;
- фактический код АРКИ на `implementation_commit`;
- результаты контрактов ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА.

Ключевой вывод: исходный `Q_HANDOFFS.md` сознательно ограничивал АРКУ визуальной оболочкой. Поэтому первоначальный результат корректно выполнил этот handoff, но **сам по себе не покрывает весь planned scope Полигона**. Ниже отдельно отмечено, что уже закрыто каркасом, что только подготовлено, а что должно прийти из следующих вертикальных интеграций.

## 1. Функции planned scope, относящиеся к каркасу АРКИ

| Плановая функция прототипа | Что есть в результате АРКИ | Статус | Что ещё требуется |
|---|---|---|---|
| Единое рабочее пространство: шапка + левая панель + центральная карта + правая панель + нижняя зона времени | Новый `.polygon-shell` собирает эти зоны вокруг существующей продуктовой карты | **готово** | Только визуальная приёмка на целевых разрешениях |
| Основная навигация `Карта / Программа / Лаборатория / Метрики / Журнал / Серия` | Шесть основных вкладок созданы и переключаются; существующие product hosts переиспользуются | **готово** как shell | Содержимое вкладок остаётся у их product owners |
| Постоянный правый инспектор `Юнит / Инфо / Внимание / Память` | Четыре вкладки и честные пустые контейнеры присутствуют | **готово** как shell | LIVE-содержимое: ПУЛЬС + ЛИНЗА; HISTORY: ХРОНИСТ |
| Левая рабочая панель и сохранение текущих продуктовых инструментов | Существующие `Параметры` и `Общие редакторы` сохранены как вспомогательные инструменты, а не объявлены новыми основными разделами | **готово** как переходный shell | Финальная linked-entity навигация к authoritative editors ещё нужна |
| Переключение вкладок и UI-owned state | Активные вкладки и состояние свёрнутости принадлежат только UI; используются `sessionStorage` и CSS-классы | **готово** | Не превращать это в gameplay/experiment SSOT |
| Active / hover / collapse состояния | Есть active/hover для вкладок и независимое сворачивание левой/правой панелей | **готово** | Визуальная проверка браузером на нескольких размерах окна |
| Типографика, размеры, отступы, адаптация окна | Отдельные shell/compat CSS и responsive breakpoints добавлены | **готово** по коду и контрактным smoke | Нужна отдельная visual QA, код менять не требуется для этой проверки |
| Центральная карта остаётся настоящей картой продукта, а не второй картой | Shell оставляет реальный `#app`/canvas владельцем карты; центральный shell-слой не перехватывает pointer events | **готово** как архитектурная граница | Selection и map inspector подключаются отдельными вертикалями |
| Общие команды одиночного эксперимента: `Сбросить / Запустить / Пауза / Шаг / Остановить / Скорость / Серия` | Существующий `CombatLabExperimentRunToolbar` сохранён и монтируется в shell-host | **частично** | Функции настоящие и уже имеют owner, но их окончательное положение/иерархия относительно принятой общей шапки ещё не зафиксированы визуальной приёмкой |
| Общая временная шкала | Нижний timeline-контейнер, LIVE-маркер и реальный текущий статус/время предусмотрены | **частично** | Нет product `HistoryProvider/viewTime`, scrub, перехода LIVE↔HISTORY и исторического чтения. Нужен контракт ХРОНИСТА и отдельная реализация |
| Общий механизм связанных выборов между картой, юнитом и разделами | Каркас не создаёт второй selection store и сохраняет существующие hosts | **частично** | Настоящий `unitId` и первый LIVE Unit — ПУЛЬС. Универсальная связь остальных сущностей отсутствует |
| Универсальная linked-entity навигация: unit/profile/weapon/program step/journal event/metric/run/source | В shell есть только обычная навигация вкладок; общего resolver/navigation contract нет | **отсутствует** | Нужен минимальный typed entity-ref + navigator/resolver над настоящими product IDs. Владельцы: ПУЛЬС для unit/profile, ХРОНИСТ для Program/Journal/Metric/Run, существующие registries для профилей/оружия |
| Контекстные меню нового Полигона | Общего shell-owned механизма контекстных меню не добавлено | **отсутствует** | Для `Инфо` нужен сценарий `Зафиксировать точку / новую точку / снять фиксацию` после подключения LINZA read-contract; остальные меню добавляются по конкретным owners, не как fake global API |
| Всплывающие/общие редакторы и переход к authoritative source | Существующие Общие редакторы сохранены в auxiliary host, но общего linked-source открытия из нового UI нет | **частично** | Нужен resolver к `GameEditorRegistry` и другим authoritative editors; конкретные ссылки добавляются вертикально |
| `Сохранить эксперимент / Открыть эксперимент` как глобальная функция оболочки | Новый shell не добавляет этот глобальный сценарий | **отсутствует** в новом shell | ХРОНИСТ подтвердил: текущая сериализация сохраняет только существующий `CombatLabExperimentV1`, но accepted envelope должен также включать Laboratory и Metrics definitions. До полного experiment-envelope нельзя выдавать частичный механизм за готовый Save/Open |
| Сохранение map-only операций отдельно от experiment Save/Open | АРКА не переименовывала и не дублировала map persistence | **не моя зона** | Карта должна сохранять отдельные `Экспортировать карту / Импортировать карту`; full experiment persistence — ХРОНИСТ |
| Единый контекст выбранного `viewTime` по всем разделам | В shell нет собственного fake `viewTime` | **отсутствует** как capability, что корректно | Требуется общий History/viewTime owner от ХРОНИСТА; UI сможет владеть только текущим режимом/положением ползунка, но не историческими данными |

## 2. Planned scope, который виден внутри shell, но функционально не принадлежит АРКЕ

| Функция | Статус относительно результата АРКИ | Product owner / зависимость |
|---|---|---|
| `Юнит` LIVE: состояние, поза, приказ, действие, оружие, боезапас и readback | **не моя зона**; контейнер готов | ПУЛЬС: `SimulationState.selectedUnitId → UnitModel`; изменения через `CombatLabVisualSession.executeInteractive(...)` и штатные команды |
| Полный Unit Editor / стартовое authoring-состояние | **не моя зона** | Нужна отдельная продуктовая семантика authoring vs LIVE и authoritative editor path |
| `Инфо`: точка карты, поверхность, высота, проходимость, concealment/cover, nearby entities | **не моя зона**; контейнер готов | ЛИНЗА: `TacticalMap`, environment profiles, `SimulationState`; для slope/агрегации нужен resolver/owner |
| `Внимание`: профиль, режим, секторная схема, контакты, world-bound overlay | **не моя зона**; контейнер готов | ЛИНЗА: `UnitModel.attentionSettings`, `attentionRuntime`, perception. Write-boundary для изменения профиля/режима ещё не утверждён; UI не считает LOS |
| `Память`: субъективные контакты, возраст, фильтры, источники, world-bound overlay | **не моя зона**; контейнер готов | ЛИНЗА: `perceptionKnowledge`, `tacticalKnowledge`; `Intel`, presumed `Front` и HISTORY пока имеют gaps |
| `Программа ↔ Журнал` на устойчивых ID | **не моя зона** | ХРОНИСТ: существующие `experimentId/revision/trackId/stepId` — основа; нужен durable event identity/run context для полной версии |
| `Метрики ↔ Серия` | **не моя зона**; вкладки shell готовы | ХРОНИСТ: текущие Combat Lab metrics реальны, но accepted Metrics v18 definitions/telemetry contract шире текущего фиксированного каталога |
| `Лаборатория` | **не моя зона**; вкладка сейчас честно пустая | ХРОНИСТ + authoritative parameter owners: нужен descriptor/resolution layer, provenance, baseline/effective values, persistence |
| `Серия`, Run context, representative run, replay | **не моя зона**; вкладка существующего batch-потока сохранена | ХРОНИСТ: real batch runner есть; durable SeriesRecord/RunRecord, runtime version и accepted replay semantics отсутствуют |
| History для Journal/Unit/Memory/карты | **не моя зона**; timeline только shell | ХРОНИСТ: нужен HistoryProvider/viewTime без future leakage |
| World-bound overlays Внимания/Памяти | **не моя зона** | ЛИНЗА + renderer/performance contract; только simulation-owned data, без full-map UI computation |

## 3. Главные обнаруженные gaps после проверки полного planned scope

### Gap A — timeline сейчас только оболочка

В АРКЕ есть нижнее место под шкалу и LIVE-статус, но нет исторической функции прототипа. Это не следует закрывать локальным массивом кадров или fake `viewTime`.

**Следующий шаг:** после принятия контракта ХРОНИСТА создать отдельную foundation/integration задачу на `HistoryProvider + viewTime + LIVE/HISTORY navigator`, затем подключить timeline к этому owner.

### Gap B — нет общего linked-entity / selection navigator

`MIGRATION_VISION.md` относит к новому верхнему UI-слою не только вкладки, но и переходы между связанными сущностями. АРКА не создала такой механизм, потому что исходный handoff запрещал придумывать новые доменные ID/owners.

**Следующий шаг:** определить минимальный typed reference/navigator contract, который не хранит копии сущностей и резолвит только настоящие IDs. Первый реальный тип — `unitId` по контракту ПУЛЬСА; затем Program/Journal/Metric/Run refs по ХРОНИСТУ и map/info context по ЛИНЗЕ.

### Gap C — полный global Save/Open не представлен новым shell

Прототип требует, чтобы `Сохранить эксперимент` охватывал карту, юниты, Программу, Лабораторию и Метрики. Текущий product Save/Open пока не является полным таким envelope.

**Следующий шаг:** не добавлять в шапку кнопку с ложной семантикой. Сначала ХРОНИСТ/foundation должен определить versioned Polygon Experiment envelope и persistence owner; после этого АРКА-подобная UI-задача размещает реальные глобальные команды в shell.

### Gap D — контекстные действия карты не оформлены как общий новый UX

Принятая `Инфо` требует фиксации точки из контекстного меню карты. Общего shell-owned контекстного механизма пока нет.

**Следующий шаг:** после подключения LINZA Info read-contract добавить узкий map context menu только для подтверждённых действий; не строить универсальный `window` router.

### Gap E — run controls функционально сохранены, но финальная общая шапка не доказана

Запуск/сброс/пауза/шаг/остановка/скорость продолжают работать через существующий `CombatLabExperimentRunToolbar`, однако АРКА разместила toolbar в левой рабочей панели. UX-аудит до реализации прямо отмечал, что окончательное размещение этих команд относительно принятой шапки не установлено без визуальной проверки канонического HTML.

**Следующий шаг:** на интеграционной visual QA сравнить с exact accepted HTML/reference. Если шапка требует эти команды сверху, перемещать только их UI-host, не создавать второй runner.

## 4. Необходимые owners и контракты перед следующими интеграциями

1. **ПУЛЬС / LIVE Unit**
   - owner selection: `SimulationState.selectedUnitId`;
   - read owner: `UnitModel`;
   - write path: `CombatLabVisualSession.executeInteractive(...)` → штатная command boundary;
   - readback только из того же живого `UnitModel`.

2. **ЛИНЗА / Right Panel LIVE**
   - `Инфо`: `TacticalMap` + environment profiles + `SimulationState.units`;
   - `Внимание`: `attentionSettings`, `attentionRuntime`, perception; нужен отдельный штатный write-port для изменений профиля/режима;
   - `Память`: perception/tactical knowledge; `Intel`, `Front` и History нельзя изображать до появления owner/provider.

3. **ХРОНИСТ / experiment identity**
   - Program identity: `experimentId + revision + trackId + stepId`;
   - нужны durable `RunId/SeriesId/JournalEventId` или эквивалентные product contracts;
   - HistoryProvider/viewTime;
   - accepted Metrics definitions + telemetry contract;
   - Laboratory descriptor/resolution/persistence;
   - versioned full Experiment envelope для Save/Open;
   - определённая replay semantics + runtime version identity.

4. **Общие authoritative editors**
   - использовать существующий `GameEditorRegistry` и владельцев профилей/оружия;
   - linked entity должен хранить/передавать настоящий typed ID/ref, а не название или demo-ID.

## 5. Итог самопроверки

Исходная задача АРКИ **выполнена как UI-shell handoff**, но после проверки против полного planned scope нельзя утверждать, что одна ветка АРКИ завершает перенос функциональности HTML-прототипа.

Точный результат:

- внешний shell и локальные UI-состояния — **готовы**;
- реальные run controls — **сохранены**, финальная компоновка шапки требует visual QA;
- timeline/HISTORY — **частично**;
- общий linked-entity/selection navigator — **отсутствует**;
- общий новый context-menu механизм — **отсутствует**;
- full Experiment Save/Open в новом shell — **отсутствует** до product envelope;
- содержимое `Юнит / Инфо / Внимание / Память`, Program↔Journal, Metrics↔Series, Laboratory, History/replay/persistence — **не зона АРКИ**, но shell должен быть их общей точкой интеграции.

Первая допустимая следующая интеграция остаётся:

`АРКА + ПУЛЬС → первый настоящий LIVE Unit`.

После неё planned scope следует закрывать вертикалями, а не заполнением пустых контейнеров mock-данными.
