# Route X — независимая проверка результатов Q Полигона

Дата: 2026-08-16  
REQUEST_ID: `XROUTE-20260816-POLYGON-Q-REVIEW-001`

## 0. Объект проверки

Репозиторий: `AndrewVerhoturov1/Real-wargame`  
Базовая ветка продукта: `real-wargame-preview`  
Точная продуктовая база: [`1246e1d612e648e7d7378db1c02be3bbf3d2a16a`](https://github.com/AndrewVerhoturov1/Real-wargame/commit/1246e1d612e648e7d7378db1c02be3bbf3d2a16a)

Проверены только три результата:

- ПУЛЬС — [`aa7965ca06df12453466a5f03efc723318b94e44`](https://github.com/AndrewVerhoturov1/Real-wargame/commit/aa7965ca06df12453466a5f03efc723318b94e44);
- ЛИНЗА — [`7ee1bd62fbebbbd10461f718e484014f1d6efd8b`](https://github.com/AndrewVerhoturov1/Real-wargame/commit/7ee1bd62fbebbbd10461f718e484014f1d6efd8b);
- ХРОНИСТ — [`9e2a7d819440ae82572134ff3caa690724f007d1`](https://github.com/AndrewVerhoturov1/Real-wargame/commit/9e2a7d819440ae82572134ff3caa690724f007d1).

**АРКА не проверялась и выводов о её готовности в этом документе нет.**

Документы подпроекта `polygon-html-to-product` на product base ещё не находятся в `real-wargame-preview`; для проверки использовано документальное состояние ветки `feature/20260815-polygon-execution-map`, включая `SUBPROJECT.md`, `MIGRATION_SYNTHESIS.md`, `WORK_PLAN.md`, `EXECUTION_STREAMS.md`, `Q_HANDOFFS.md`, `STATUS.md`, `JOURNAL.md` и `subproject.json`. Для UX-объёма использованы принятые документы `polygon-prototype`: Interface Linkage v1, Right Panel v1, Series v1, Journal v4, Metrics v18, Laboratory v1 и v44.

Главное правило трактуется буквально: **перенос должен сохранить не только видимый интерфейс, но весь запланированный функциональный объём принятого HTML, при этом UI не может становиться владельцем игровой истины.**

### Как читать вердикты

`ACCEPT` ниже означает: **результат данного Q пригоден как контракт/исследование для следующей задачи**. Это не означает, что описанная продуктовая возможность уже реализована. Наличие Markdown-контракта никогда не засчитывалось как product capability.

---

## 1. Итоговая таблица

| Направление | Exact SHA | Результат | Доказательства | Пробелы / риски | Важность | Следующее действие |
|---|---|---|---|---|---|---|
| **ПУЛЬС** | `aa7965ca06df12453466a5f03efc723318b94e44` | **ACCEPT** как контракт | Diff от product base меняет только `PULSE_LIVE_UNIT_CONTRACT.md`; независимо подтверждены настоящий `unitId` через `SimulationState`, штатная posture-команда через `CombatLabCommands → requestPlayerPostureTransition`, readback из того же `UnitModel`, существующие ссылки на authoritative profiles | Новый LIVE Unit ещё не реализован; `Действие сейчас` и `Готовность оружия` требуют read-only resolver; HISTORY зависит от общего history provider; полный Unit Editor требует отдельного решения | **P0** для первого LIVE Unit | После отдельной проверки АРКИ выдать новый кодовый Q `АРКА + ПУЛЬС → первый LIVE Unit`; отдельно запланировать resolvers и решение Unit Editor |
| **ЛИНЗА** | `7ee1bd62fbebbbd10461f718e484014f1d6efd8b` | **NEEDS REVISION** | Exact diff содержит контракт, smoke и реальную runtime-реализацию: `MapInfoReadModel`, `AttentionReadModel`, `AttentionCommands`, `UnitMemoryReadModel`, `EstimatedFront`, `UnitKnowledgeHistory`, изменение `SimulationTick` | Нарушен исходный Q: было разрешено создать **только** контракт и запрещён product code. Новые Front/History — новые product capabilities, хотя задача требовала только установить готовность. Smoke преимущественно проверяет строки исходника, не поведение. Есть отдельные correctness/performance риски | **P0 blocker** для принятия exact SHA ЛИНЗЫ | Вернуть тому же Q: сделать audit-only кандидат на той же ветке или отделить реализацию в новые Q; текущий exact SHA не интегрировать |
| **ХРОНИСТ** | `9e2a7d819440ae82572134ff3caa690724f007d1` | **ACCEPT** как контракт | Diff от product base меняет только `CHRONIST_EXPERIMENT_CONTRACT.md`; независимо подтверждены structured Program journal, `trackId/stepId`, batch/seed/digest contracts. Самопроверка охватывает полный Journal/History/Metrics/Lab/Series/replay/Save/Open объём | Почти все крупные cross-system возможности остаются foundation-задачами: нет общего HistoryProvider, production Metrics v18 telemetry, durable Run/Series records, runtime version identity, recorded replay, generic Laboratory, full ExperimentEnvelope | **P1** после первого LIVE Unit | Принять контракт как карту gates и раздать отдельные Q: Program↔Journal LIVE → History → Metrics/telemetry → Laboratory/Envelope → durable Series/Run → replay/persistence |

---

## 2. Проверка точного diff и границ задания

### 2.1. ПУЛЬС

Сравнение `1246e1d... → aa7965c...`:

- ветка впереди базы на 2 коммита;
- изменён ровно один файл: `docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md`;
- product code не изменён.

Это соответствует Q-handoff: задача была исследовательской и разрешала только один контракт.

Контракт после собственной самопроверки не ограничивается одной кнопкой позы. В нём явно учтены здоровье, ранения, мораль, подавление, усталость, приказ игрока, действие сейчас, оружие, боезапас, готовность оружия, body/wounds summary, linked profiles, reset/stale-selection, HISTORY и граница полного Unit Editor.

**Вывод:** scope соблюдён. Пробелы правильно обозначены как будущие product-задачи, а не скрыты.

### 2.2. ЛИНЗА

Сравнение `1246e1d... → 7ee1bd6...`:

- ветка впереди базы на 11 коммитов;
- изменено 9 файлов;
- кроме документа добавлены 6 новых core/runtime-модулей, smoke-скрипт и изменён `SimulationTick`.

Изменённые runtime-файлы:

- `src/core/map/MapInfoReadModel.ts`;
- `src/core/perception/AttentionReadModel.ts`;
- `src/core/perception/AttentionCommands.ts`;
- `src/core/knowledge/UnitMemoryReadModel.ts`;
- `src/core/knowledge/EstimatedFront.ts`;
- `src/core/knowledge/UnitKnowledgeHistory.ts`;
- `src/core/simulation/SimulationTick.ts`.

Дополнительно:

- `scripts/linza_right_panel_product_smoke.mjs`;
- `docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md`.

Это прямое нарушение `Q_HANDOFFS.md`: ЛИНЗЕ было разрешено создать **только** `LINZA_RIGHT_PANEL_CONTRACT.md`, а product code, новые runtime-механизмы, fake/выдуманные capabilities были запрещены.

Поэтому даже функционально удачные куски кода нельзя принять в составе этого exact SHA: они не проходили положенный отдельный implementation handoff и readiness gate.

### 2.3. ХРОНИСТ

Сравнение `1246e1d... → 9e2a7d8...`:

- ветка впереди базы на 2 коммита;
- изменён ровно один файл: `docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md`;
- product code не изменён.

Это соответствует заданию ХРОНИСТА. Его поздняя самопроверка отдельно перечисляет ранее недостаточно явно описанные функции Journal v4, полного Metrics v18 Report/Export, Laboratory и Series v1.1, не выдавая их за реализованные.

---

## 3. Владельцы данных и read/write boundaries

### ПУЛЬС

Правильная цепочка подтверждается текущим продуктом:

`карта → findUnitAtGridPosition(state.units) → selectUnit(state, unit.id) → SimulationState.selectedUnitId → getSelectedUnit(state) → UnitModel`.

Для смены позы подтверждён штатный write-path:

`CombatLabVisualSession.executeInteractive(posture) → executeCombatLabCommand → requestPlayerPostureTransition → SimulationTick → readback UnitModel`.

Контракт правильно запрещает:

- второй `selectedUnit` store;
- UI-копию `UnitModel`;
- optimistic присваивание позы;
- использование direct-live mutation старого Unit Editor как shortcut.

Linked-profile переход опирается на существующий `resolveCombatLabSelectedUnitProfileLinks()` и `GameEditorRegistry`, то есть не создаёт второй каталог профилей.

### ЛИНЗА

Архитектурное направление в новых модулях в основном правильное: read-models не являются UI-owned gameplay stores, Attention делегирует существующим функциям, Memory не должна читать объективный список врагов.

Но это **не отменяет нарушение границы Q**. Более того, именно из-за преждевременной реализации появились новые спорные product semantics:

1. `EstimatedFront.ts` вводит новый алгоритм предполагаемого фронта. На исходной базе owner такого Front не был доказан. Это не аудит готовности, а создание новой capability и новой игровой интерпретации знаний.
2. `UnitKnowledgeHistory.ts` вводит отдельную историю субъективных знаний и подключает её в `SimulationTick`. На исходной базе общий HistoryProvider отсутствовал; ХРОНИСТ правильно фиксирует его как отдельный cross-system foundation.
3. Поэтому ЛИНЗА и ХРОНИСТ сейчас совместимы только концептуально: memory-history может в будущем стать одной исторической проекцией под общим HistoryProvider, но не должна самостоятельно определять глобальную модель HISTORY Полигона.

### ХРОНИСТ

Контракт правильно разделяет владельцев:

- Experiment definition — versioned experiment/envelope owner;
- Program — `trackId/stepId` и revision;
- Journal — структурированные события, а не строки;
- HistoryProvider — прошлое состояние, но не live runtime;
- Metrics/Measurement owner — definitions и telemetry;
- Series owner — множество Run, но не каталог Метрик;
- Replay owner — отдельно rerun и recorded history;
- Laboratory — overrides над authoritative sources;
- Save/Open — единый versioned input envelope, а не набор UI/localStorage ключей.

Ключевая сильная сторона: существующие `batchRunId`, `runIndex`, seed, `eventDigest` и `finalStateDigest` **не объявляются** тем, чем они пока не являются. `seed` не подменяет `RunId`, digest не подменяет replay artifact, current fixed Combat Lab metrics не подменяют Metrics v18.

---

## 4. Полный planned scope принятого HTML

| Функция | Реальность на product base / проверенный вывод | Решение review |
|---|---|---|
| Первый LIVE Unit | Владельцы selection, UnitModel и posture command существуют; новый UI ещё не подключён | ПУЛЬС принят как контракт; отдельный implementation Q |
| Полный Unit Editor | Семантика `authoring / LIVE / два режима` не решена | Отдельное продуктовое решение/Q; первый LIVE Unit не блокирует |
| `Инфо` | Реальные map/terrain/material/object/unit данные есть, но unified Polygon read contract на base не был готов | ЛИНЗА должна сначала вернуть честный audit; реализацию `MapInfoReadModel` рассматривать отдельным Q |
| `Внимание` | LIVE attention/perception owner существует; публичная UI-boundary должна быть явно принята и протестирована | Отдельный Q после revision ЛИНЗЫ |
| `Память` LIVE | На base есть perception/tactical knowledge и `reported` source; полный normalized contract/front отсутствовал | Не принимать текущую реализацию ЛИНЗЫ автоматически; разнести по отдельным capability Q |
| `History / viewTime` | Общего HistoryProvider на base нет | ХРОНИСТ правильно ставит foundation gate; memory-only WeakMap ЛИНЗЫ его не заменяет |
| Program ↔ Journal | Stable Program IDs и ограниченный structured runtime journal есть | Первый cross-system Q ХРОНИСТА после LIVE right-panel основы |
| Полный Journal v4 | Нет общего durable event store/history и полной correlation с Metrics | Отдельный Q/этап после event adapter и History |
| Metrics v18 / telemetry | Есть fixed production Combat Lab metrics, но нет user MeasurementDefinition/typed telemetry полного v18 | Отдельный foundation Q; нельзя переносить demo telemetry |
| Series / массовые прогоны | Реальный batch runner, seeds и агрегаты существуют | Execution core переиспользовать; accepted Series требует durable all-run records, selected Metrics, outliers/history/persistence |
| Seed-воспроизводимость | Seed + experiment digest + event/final digests уже есть; runtime version identity и durable frozen input отсутствуют | Нельзя обещать exact historical replay; нужен RuntimeVersionOwner + frozen input/run record |
| Laboratory overrides | Есть узкие test overrides, но нет generic descriptor/resolution chain | Отдельный Laboratory foundation Q |
| Save/Open | Current experiment codec/file/local persistence реальны, но не содержат весь Lab + Metrics accepted envelope | Создать versioned ExperimentEnvelope после Metrics/Lab contracts; atomic Open |
| Recorded replay | Не реализован; representative action — rerun-from-seed на текущем definition | Отдельное продуктовое решение и Replay Q |
| Linked entities | Узкие ссылки Unit→profiles существуют; универсального typed resolver/backlink index нет | Минимальный общий resolver нужен до массового Program/Journal/Metrics/Series linkage |
| `Используется` и безопасное удаление reusable сущностей | Готовый общий dependency index не доказан | Отдельный owner/Q; не строить на строковом поиске |

### Критически важный вывод

Ни ПУЛЬС, ни ХРОНИСТ не сузили конечный planned scope до текущего экрана. Они отделили то, что можно использовать сейчас, от того, что требует следующих foundations.

ЛИНЗА тоже попыталась закрыть полный planned scope, но сделала это **реализацией внутри audit-Q**, из-за чего её финальные статусы `ГОТОВО` нельзя использовать как основание интеграции: они описывают добавленную ею ветку, а не доказанную готовность исходной product base.

---

## 5. Совместимость трёх результатов

### ПУЛЬС ↔ ХРОНИСТ — совместимы

ПУЛЬС владеет LIVE selection/read/write/readback. ХРОНИСТ не создаёт второй selection и требует отдельный HistoryProvider для исторического Unit. Конфликта owners нет.

### ПУЛЬС ↔ ЛИНЗА — архитектурно совместимы, exact SHA ЛИНЗЫ не готов к интеграции

ЛИНЗА использует настоящий `unitId`/`UnitModel` и не создаёт свой selection store. Это правильная зависимость от ПУЛЬСА.

Но интегрировать текущий SHA ЛИНЗЫ нельзя до revision из-за нарушения scope и отсутствия достаточной проверки runtime/performance.

### ЛИНЗА ↔ ХРОНИСТ — требуется развести History ownership

ХРОНИСТ правильно говорит: глобального HistoryProvider пока нет. ЛИНЗА добавляет memory-only history в `WeakMap<SimulationState,...>` и пишет snapshots непосредственно из `SimulationTick`.

Разрешённая будущая схема:

`общий Run/HistoryProvider ХРОНИСТА → domain historical projections → Memory/Attention/Unit read models`.

Неразрешённая схема:

`каждая вкладка создаёт собственную независимую историю и собственный lifecycle`.

До отдельного History Q это является интеграционным риском.

### Отношение к первому LIVE Unit

Ни ЛИНЗА, ни ХРОНИСТ **не должны блокировать** первый LIVE Unit. По рабочему плану первая точка всё ещё `АРКА + ПУЛЬС`.

Однако АРКА в этом review не проверялась, поэтому этот документ **не даёт разрешения** считать её часть готовой.

---

## 6. Доказательность проверок и smoke-тестов

### ПУЛЬС

Product code не менялся. Независимо прочитаны исходники точной базы, которые подтверждают ключевой путь selection/posture/profile links.

На exact SHA нет опубликованных GitHub commit-status checks или PR workflow runs. Это не дефект документационного Q само по себе, но означает:

- первый LIVE Unit ещё не проходил реальный smoke;
- selection A/B, reset/new run, rejected posture, постепенный readback и return from profile должны проверяться уже на implementation-Q.

### ЛИНЗА

В документе заявлены:

- локальный strict TypeScript-check новых модулей;
- `LINZA_RIGHT_PANEL_PRODUCT_SMOKE_OK`;
- отдельная ручная проверка `EstimatedFront`.

Независимо установлено, что `scripts/linza_right_panel_product_smoke.mjs` преимущественно делает `source.includes(...)`, проверяет наличие/отсутствие текстовых токенов и число вызовов history function. Он **не доказывает поведение** read-models на реальном `SimulationState`, отсутствие future leakage на сценарии, correctness переключения Attention, bounded memory или производительность.

Полный repository build самим исполнителем не запускался. На exact SHA нет опубликованных commit-status checks или PR workflow runs.

Следовательно, smoke является полезным статическим контрактным guard, но **недостаточным доказательством готовности runtime-изменения**.

### ХРОНИСТ

Product code не менялся; контракт построен по чтению owners и принятых UX-документов. Независимо подтверждены ключевые факты:

- structured Program journal действительно содержит `sequence`, time, `trackId`, `stepId`, `attempt`, но имеет ограничение текущей сессии;
- batch contracts действительно содержат experiment identity/digest, seed, metrics, event/final digests, но не durable `RunId` и runtime version.

На exact SHA нет опубликованных commit-status checks или PR workflow runs. Реализация будущих gates не тестировалась, потому что её в этом Q нет.

### Ограничение этого Route X review

Локальное клонирование репозитория из текущей среды не удалось из-за отсутствия сетевого DNS-доступа к GitHub, поэтому `npm run docs:sync`, `npm run docs:check`, `npx tsc --noEmit`, build и runtime smoke независимо локально не запускались.

Это ограничение не скрывается: выводы основаны на точных GitHub compare/diff, чтении исходников по exact SHA и проверке опубликованных GitHub status/workflow данных.

---

## 7. Actionable remarks — что вернуть исполнителям

## ПУЛЬС — не возвращать на исправление текущего контракта

Текущий контракт можно принимать. Следующие пункты оформить как **отдельные Q**, а не как исправление документа ПУЛЬСА:

1. **PULSE-IMPL-1 — первый LIVE Unit.** Реализовать selection → Unit read → posture command → readback → B selection → reset/new run → linked profile return.
2. **PULSE-READ-2 — `Действие сейчас`.** Сделать один read-only presentation resolver над реальными runtime-подсистемами; не собирать случайный приоритет прямо в DOM.
3. **PULSE-READ-3 — готовность оружия.** Аналогичный read-only resolver с реальными action/deployment/ammo/capability owner-ами.
4. **UNIT-EDITOR-DECISION — отдельное решение.** Зафиксировать `authoring / LIVE / два режима`; не решать это скрыто внутри Right Panel.

## ЛИНЗА — вернуть тому же Q на revision

### LINZA-R1 — восстановить исходную границу задания

Нужно, чтобы кандидат audit-Q снова содержал только:

`docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md`.

Текущий product code не должен попадать в accepted SHA этого Q. Его можно сохранить отдельно как материал для будущих implementation-Q, но не выдавать за результат audit-handoff.

### LINZA-R2 — статусы должны описывать product base, а не собственные добавления

Контракт должен отдельно показать:

- что существовало на `1246e1d...`;
- что отсутствовало;
- какой отдельный Q это должен реализовать.

Особенно вернуть честные base-статусы для `estimated front` и History.

### LINZA-R3 — не принимать новый Front без отдельного product contract

`EstimatedFront.ts` вводит конкретную формулу и правила: минимум свидетельств, порог confidence, weighted axis, ширина полосы. Это продуктовая семантика, которой не было у доказанного owner на базе.

Нужен отдельный Q/решение: что означает `предполагаемый фронт`, кто владелец, какие сведения допустимы, как стареет/исчезает вывод и как проверяется.

### LINZA-R4 — History согласовать с ХРОНИСТОМ

Memory history должен стать исторической проекцией общего Run/History contract, а не отдельным глобальным жизненным циклом вкладки.

Отдельный History Q обязан определить:

- Run identity;
- coverage/retention;
- `viewTime` semantics;
- serialization/persistence policy;
- reset/new-run identity;
- historical Unit/Attention/Memory projections;
- future leakage tests.

### LINZA-R5 — performance blocker перед product integration

`UnitKnowledgeHistory` вызывается из `SimulationTick` до и после каждого тика, проходит по всем юнитам и хранит массив snapshots без явной верхней границы. Внутри также поддерживаются копии контактов. Это нарушает требование репозитория заранее задавать per-step budget и bounded cache/history.

Нужны отдельные доказательства worst-case complexity, retention/max bytes, eviction/teardown и профильная проверка.

Дополнительно `MapInfoReadModel` сканирует все map objects и units на каждый вызов, а `AttentionReadModel` для видимых контактов делает `state.units.find`. До подключения к pointer/ticker UI нужно доказать bounded query/update path.

### LINZA-R6 — correctness Attention

`applyUnitAttentionProfile(unit, null/'individual')` только очищает `playerAttentionProfileId`. При этом существующий `applyAttentionProfileToUnit()` заменяет `unit.attentionSettings`. Значит после применения профиля возврат к `individual` может оставить значения прошлого профиля, но назвать их индивидуальными.

Нужен поведенческий тест и утверждённая семантика возврата к индивидуальным настройкам.

### LINZA-R7 — revision key

`AttentionReadModel.revisionKey` не включает revision registry/profile definition и сами значения `attentionSettings` зон/range. Если settings меняются при том же `profileId/mode`, renderer, использующий этот ключ как dirty identity, может не обновиться.

Нужно определить точную semantic identity и проверить stale-update сценарий.

### LINZA-R8 — smoke должен проверять поведение

Статический token-smoke оставить можно, но отдельный implementation-Q должен иметь минимум:

- Info values на контролируемой карте;
- Attention profile/mode/auto/search round-trip;
- Memory current/last/supposition/reported без objective leakage;
- historical read на T1/T2 с изменением знаний после T1;
- Front null/positive cases по утверждённой семантике;
- reset/new run;
- TypeScript + production build;
- performance-selected проверку для `SimulationTick`/history.

## ХРОНИСТ — не возвращать на исправление текущего контракта

Контракт можно принять. Реализацию раздать отдельными Q с узкими owners:

1. **CHRONIST-JOURNAL-1:** structured Program↔Journal LIVE + typed entity refs + обратный query по step.
2. **CHRONIST-HISTORY-2:** общий HistoryProvider/viewTime/coverage, включая historical projections ПУЛЬСА и ЛИНЗЫ.
3. **CHRONIST-METRICS-3:** MeasurementDefinition + typed telemetry + Program anchors + raw data identity/export foundation.
4. **CHRONIST-LAB-4:** Laboratory descriptor/resolution/precedence/provenance + writable-owner policy для `Apply Globally`.
5. **CHRONIST-ENVELOPE-5:** versioned full ExperimentEnvelope с Lab + Metrics и атомарным Open.
6. **CHRONIST-SERIES-6:** durable SeriesId/RunId, all-run records, frozen envelope, measurement snapshot, runtime version, persistence, outlier/query indexes.
7. **CHRONIST-REPLAY-7:** после отдельного продуктового решения — verified rerun и/или recorded replay; не смешивать эти обещания.

---

## 8. Общий порядок интеграции

Рекомендуемый порядок по зависимостям, а не по тому, кто первым закончил ветку:

1. **Принять контракт ПУЛЬСА.** Он не меняет продукт и пригоден для первого LIVE Unit.
2. **Дождаться отдельной проверки АРКИ.** Этот review её не анализирует.
3. **АРКА + ПУЛЬС → первый LIVE Unit** с настоящим selection/posture/readback и обязательным smoke.
4. **Вернуть ЛИНЗУ на revision.** Текущий `7ee1bd6...` не интегрировать.
5. После принятого audit ЛИНЗЫ раздать отдельные вертикали: `Инфо → Внимание LIVE → Память LIVE`.
6. **Ввести минимальный typed navigation/ref contract** до массовых Program/Journal/Metrics/Series ссылок; Unit→profile может пока использовать существующий путь.
7. **Program ↔ Journal LIVE** на structured IDs без фальшивого rewind.
8. **Общий HistoryProvider/viewTime.** После него подключить historical Unit и historical Memory/Attention как проекции одного Run history.
9. **Metrics v18 → MeasurementDefinition + telemetry** и только затем подключать полный Metrics UX.
10. **Laboratory descriptor/resolution + полный ExperimentEnvelope/Save/Open input.** Это формирует честный frozen input для исследований.
11. **Durable Series/Run** поверх существующего batch execution: selected Metrics snapshot, frozen experiment, runtime version, all-run records, outliers, history/persistence.
12. **Replay/rerun** — только после явного решения обещания и доказанной runtime identity.
13. **Полный Unit Editor**, backlinks `Используется`, safe delete и оставшиеся linked-entity сценарии — отдельные продуктовые вертикали; они могут идти параллельно после фиксации соответствующих owners, но обязательны до общей финальной приёмки Полигона.

---

## 9. Финальные вердикты

- **ПУЛЬС @ `aa7965ca06df12453466a5f03efc723318b94e44` — ACCEPT.** Принимается только контракт. Первый LIVE Unit ещё не реализован.
- **ЛИНЗА @ `7ee1bd62fbebbbd10461f718e484014f1d6efd8b` — NEEDS REVISION.** Exact SHA нарушает Q scope и не должен интегрироваться. Исправления вернуть тому же Q; product additions раздать отдельными implementation-Q.
- **ХРОНИСТ @ `9e2a7d819440ae82572134ff3caa690724f007d1` — ACCEPT.** Принимается контракт/gate map, не отсутствующие product capabilities.

Общий статус трёх результатов: **два контракта готовы к использованию как handoff, один результат требует revision до интеграции**.

---

## 10. Навыки и ограничения проверки

`skills_read`:

- `real-wargame-orchestration`;
- `real-wargame-documentation` — обязательные правила переданы пользователем в текущем REQUEST_ID и считаются прочитанными;
- `real-wargame-ai-runtime`;
- `real-wargame-performance` — дополнительно прочитан, потому что exact SHA ЛИНЗЫ изменяет `SimulationTick`, perception/knowledge и runtime cost.

`skills_skipped`:

- `real-wargame-screenshots` — визуальная проверка продукта для выводов этого review не требовалась; deployment не выполнялся и АРКА исключена из проверки.

`skills_unavailable`:

- отсутствуют. `real-wargame-documentation` не доступен файлом в product base, но его обязательное содержимое передано пользователем и по условиям REQUEST_ID считается доступным/прочитанным.

`not_checked`:

- АРКА и любые её SHA;
- визуальное совпадение нового shell с HTML;
- deployment;
- локальный `npm run docs:sync/docs:check`, TypeScript/build/runtime smoke из-за отсутствия сетевого доступа среды для клонирования репозитория;
- будущие ветки implementation-Q, появившиеся после трёх заданных exact SHA.

`main`, `real-wargame-preview`, product code и deployment этим review не изменялись.