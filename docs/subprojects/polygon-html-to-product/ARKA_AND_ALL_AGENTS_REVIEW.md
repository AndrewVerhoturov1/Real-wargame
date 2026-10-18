# Route X — review АРКИ и сводный итог по четырём направлениям Полигона

Дата: 2026-08-17  
REQUEST_ID: `XROUTE-20260817-POLYGON-ALL-AGENTS-REVIEW-001`

## 0. Режим проверки и объект review

Репозиторий: `AndrewVerhoturov1/Real-wargame`  
Целевая ветка: `real-wargame-preview`  
Точная база: `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`

На момент проверки `real-wargame-preview` указывает ровно на этот SHA.

Проверены exact branch heads:

- АРКА — `feature/20260816-polygon-arka-exact-shell` → `0309b34d71d4bf4987c58a343576fbf79c185b44`;
- ПУЛЬС — `feature/20260815-polygon-pulse-live-unit-contract` → `aa7965ca06df12453466a5f03efc723318b94e44`;
- ЛИНЗА — `feature/20260815-polygon-linza-right-panel-contract` → `8040f5282b81d6465c02cc41b02ec024819ac575`;
- ХРОНИСТ — `feature/20260815-polygon-chronist-experiment-contract` → `9e2a7d819440ae82572134ff3caa690724f007d1`.

Это review-only проверка. Product code, ветки исполнителей, `main`, merge, auto-merge и deployment не менялись.

### Источники документов

На точной product base `1246e1d...` каталог `docs/subprojects/polygon-html-to-product/` ещё не присутствует. Поэтому обязательные документы планирования проверялись по их опубликованным веткам:

- `SUBPROJECT.md`, `STATUS.md`, `MIGRATION_SYNTHESIS.md`, `WORK_PLAN.md`, `EXECUTION_STREAMS.md` — состояние `feature/20260815-polygon-html-to-product @ 078423776a890547533c0519b60417c39a9eda69`;
- `Q_HANDOFFS.md`, `Q_PROMPTS.md` — состояние `feature/20260815-polygon-execution-map @ aaac48c9953785655470512350650b54147df118`;
- предыдущий Route X review — `POLYGON_Q_RESULTS_REVIEW.md @ b10d827a093eaa56e8f52aec8a00860104041e47`, PR #273;
- `ARKA_IMPLEMENTATION_HANDOFF.md` — exact ARKA `0309b34...`;
- контракты ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА — на их exact SHA;
- принятые документы `polygon-prototype` — с product base `1246e1d...`.

Принятый интерфейс трактуется буквально: HTML-прототип — визуальный эталон, а Markdown-документы — контракт и описание поведения. Ни HTML, ни Markdown сами по себе не являются доказательством готовой product capability.

---

## 1. Итоговая таблица

| Направление | Exact SHA | Зона | Доказательства | Статус | Пробелы | Риск | Следующее действие |
|---|---|---|---|---|---|---|---|
| **АРКА** | `0309b34d71d4bf4987c58a343576fbf79c185b44` | Визуальный shell, верхняя панель, вкладки, collapse/UI-state, адаптивность, скрытые product hosts | Exact `base...SHA` = 55 коммитов, 26 файлов; source-level подтверждены shell, 7 левых и 4 правых вкладки, collapse, `sessionStorage`, нейтральный placeholder, общий hover File/Editors/View/EN/Menu, отсутствие demo counts и прямого `selectedUnitId=`; на exact SHA успешен только `agent-docs-integrity` | **NEEDS REVISION** | Последний `8a8d5fa...→0309b34...` — не CSS-only: 16 файлов и крупные изменения CSS/toolbar/settings/tabs/runtime option. TypeScript/build/full preview/browser evidence относится к более раннему `277dc05...`, а не к exact SHA. Правые panel-hosts пока private, нет стабильного API для первого LIVE Unit | Высокий: exact SHA не имеет доказанного регрессионного и visual gate; pixel-perfect не доказан | Перепроверить/пересобрать exact ARKA SHA: полный набор проверок + браузерные снимки exact SHA против локального HTML; отдельно объяснить или вынести scope-расширения. После принятия — первый LIVE Unit по ПУЛЬСУ |
| **ПУЛЬС** | `aa7965ca06df12453466a5f03efc723318b94e44` | Контракт карта → real `unitId` → `UnitModel` → LIVE Unit → штатная posture-команда → readback | Exact diff: 2 коммита, ровно `PULSE_LIVE_UNIT_CONTRACT.md`, product code не менялся; прежний Route X ACCEPT; контракт использует существующие selection/command/profile owners | **ACCEPT** как контракт | Сам LIVE Unit не реализован; нет HISTORY; часть presentation-resolvers остаётся будущей реализацией; полный Unit Editor отдельно | Низкий для контракта, высокий если ошибочно считать его capability | После принятой АРКИ выдать implementation Q на первый LIVE Unit; не превращать контракт в «готовую функцию» |
| **ЛИНЗА** | `8040f5282b81d6465c02cc41b02ec024819ac575` | Контракт правой панели Инфо/Внимание/Память + smoke существующих owners | Exact base diff: 12 коммитов, только 3 файла — контракт + `.mjs` + `.ts` smoke. Revision `7ee1bd6...→8040f52...` удаляет `EstimatedFront`, `UnitKnowledgeHistory`, `UnitMemoryReadModel`, `MapInfoReadModel`, `AttentionCommands`, `AttentionReadModel`; `SimulationTick` откатан относительно base. Smoke выполняет реальные map/Attention/perception owners и проверяет отсутствие запрещённых модулей | **ACCEPT WITH FOLLOW-UP** как пересмотренный контракт | На exact SHA `agent-docs-integrity` падает на «Verify generated files are committed»; это не доказывает дефект контракта, но exact checks не зелёные. Нет нового Polygon read/write API, нет estimated front, нет общего HISTORY | Средний: можно снова случайно создать локальную history/front truth в ЛИНЗЕ | Следующие implementation Q разделить: LIVE Info, LIVE Attention boundary, LIVE Memory; HISTORY только после общего `HistoryProvider`; estimated front — отдельное решение/Q |
| **ХРОНИСТ** | `9e2a7d819440ae82572134ff3caa690724f007d1` | Сквозная идентичность Experiment/Program/Journal/History/Metrics/Series/replay/persistence | Exact diff: 2 коммита, ровно `CHRONIST_EXPERIMENT_CONTRACT.md`, product code не менялся; прежний Route X ACCEPT; контракт честно отделяет существующие foundations от отсутствующих capabilities | **ACCEPT** как контракт | Нет общего `HistoryProvider`, production Metrics v18 telemetry, durable Run/Series records, runtime-version identity, recorded replay, generic Laboratory resolution и полного Save/Open envelope | Средний как объём будущих foundations; низкий для самого контракта | Использовать как карту последовательных Q: Program↔Journal → History → Metrics → Laboratory → Series/replay/persistence |

---

## 2. Вердикты

### АРКА — `NEEDS REVISION`

АРКА не отклоняется из-за найденного fake gameplay state — такого нарушения в проверенной зоне не обнаружено. Причина иная: **точный результат `0309b34...` существенно отличается от того exact SHA, для которого заявлены полные проверки и браузерные доказательства**.

Критический факт:

- handoff фиксирует полноценный проверенный product commit `277dc05a0c9683558d10de310bcdf55ddd39d4e7`;
- затем идёт docs-only состояние `8a8d5fa28df8381ede866933d44398f60739ebe8`;
- requested exact SHA `0309b34...` — ещё один коммит;
- `8a8d5fa...→0309b34...` меняет **16 файлов**, а не один CSS hover;
- среди них `polygon-shell-exact.css` (+1727/-11), `CombatLabExperimentRunToolbar.ts`, `CombatLabExperimentSettingsSummary.ts`, `CombatLabWorkspaceTabs.ts`, `AiTestLabRuntime.ts`, `AppShellMenu.ts`, smoke и generated docs;
- в `AiTestLabRuntime.ts` допустимая скорость `4` заменена на `5`;
- в settings summary добавляются реальные изменения seed/duration;
- на `0309b34...` GitHub показывает только успешный `agent-docs-integrity`; full Preview/TypeScript/build/browser gate для этого exact SHA не доказан.

Следовательно, исторический PASS на `277dc05...` нельзя переносить на `0309b34...`.

### ПУЛЬС — `ACCEPT`

ACCEPT означает **контракт принят**, а не «LIVE Unit готов». Exact diff чисто документальный и соответствует исходному handoff. Selection, `UnitModel`, штатная posture-команда и readback не подменены UI-состоянием.

### ЛИНЗА — `ACCEPT WITH FOLLOW-UP`

Предыдущий `NEEDS REVISION` закрыт по сути границы Q:

- запрещённые runtime/read-model модули удалены;
- `SimulationTick` в итоговом `base...8040f52...` отсутствует, то есть совпадает с base;
- итоговый exact diff содержит только контракт и два smoke-файла;
- smoke не просто ищет строки: он создаёт реальный state, читает map/terrain/material/spatial owners, вызывает существующие Attention functions с readback и кладёт reported contact в существующий perception knowledge owner;
- smoke дополнительно запрещает возврат LINZA-owned history/front/read-model модулей.

Остаётся follow-up: CI exact SHA не полностью зелёный из-за generated-docs integrity; новые product API ещё не реализованы; HISTORY принадлежит общему будущему owner, не ЛИНЗЕ.

### ХРОНИСТ — `ACCEPT`

ACCEPT — только для контракта. ХРОНИСТ правильно не выдаёт `batchRunId`, seed, digest, текущий fixed metrics collector или локальное сохранение эксперимента за готовые Series/Replay/Metrics v18/Persistence.

---

## 3. АРКА: exact diff

`1246e1d... → 0309b34...`:

- status: ahead;
- ahead by: 55 commits;
- changed files: 26;
- merge base: exact product base `1246e1d...`.

Изменённые файлы:

1. `docs/ai/CURRENT_STATE.md`;
2. `docs/subprojects/INDEX.md`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/polygon-html-to-product/ARKA_IMPLEMENTATION_HANDOFF.md`;
5. `docs/subprojects/polygon-html-to-product/ARKA_PLANNED_SCOPE_CHECK.md`;
6. `docs/subprojects/polygon-prototype/JOURNAL.md`;
7. `docs/subprojects/polygon-prototype/STATUS.md`;
8. `docs/subprojects/polygon-prototype/subproject.json`;
9. `docs/superpowers/plans/2026-08-16-polygon-exact-shell.md`;
10. `docs/superpowers/specs/2026-08-16-polygon-exact-shell-design.md`;
11. `scripts/combat_lab_polygon_shell_contract_smoke.mjs`;
12. `scripts/combat_lab_stage10_ui_integration_contract_smoke.mjs`;
13. `scripts/combat_lab_ui_contract_smoke.mjs`;
14. `scripts/combat_lab_workspace_layout_smoke.mjs`;
15. `scripts/combat_lab_workspace_tabs_contract_smoke.mjs`;
16. `src/combat-lab/main.ts`;
17. `src/combat-lab/polygon-shell-compat.css`;
18. `src/combat-lab/polygon-shell-exact.css`;
19. `src/combat-lab/polygon-shell.css`;
20. `src/combat-lab/ui/CombatLabExperimentRunToolbar.ts`;
21. `src/combat-lab/ui/CombatLabExperimentSettingsSummary.ts`;
22. `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`;
23. `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
24. `src/core/testing/AiTestLabRuntime.ts`;
25. `src/shared/AppShellMenu.ts`;
26. `src/shared/app-shell-menu.css`.

### Совпадение заявленной зоны и фактического diff

Основная масса diff относится к shell, адаптации существующих product controls, smoke и документации. Однако exact final commit расширяет зону сильнее, чем формулировка «единый hover пяти правых кнопок»:

- изменяет toolbar layout/поведение;
- изменяет редактирование seed/duration в существующем experiment draft;
- меняет набор test runtime speeds;
- изменяет вкладки и app menu;
- вносит крупный дополнительный exact CSS слой.

Это не автоматически неправильный код, но это **не тот узкий дельта, который описан последним handoff-разделом**, поэтому требует новой exact-SHA проверки.

---

## 4. АРКА: владельцы состояния и отсутствие fake gameplay truth

Проверенный source-level результат соблюдает ключевую границу:

- active left/right tab хранится как UI-state через `sessionStorage`;
- collapse left/right — UI-state;
- shell не присваивает `selectedUnitId`;
- shell не создаёт второй `CombatLabVisualSession`;
- shell не публикует новый глобальный `window.*` API;
- центральный светлый placeholder inert (`pointer-events: none`) и не изображает gameplay data;
- live product canvas остаётся смонтирован, но визуально скрыт на этапе exact shell;
- history strip не содержит demo event counts и fake replay state;
- Laboratory показывает честное сообщение, что product parameters ещё не подключены, и не создаёт временные значения;
- seed/duration берутся из реального experiment draft, а не из demo copy.

Найденное изменение `AI_TEST_TIME_SCALES 4→5` — не fake state, но это runtime-adjacent изменение вне чисто визуальной задачи и должно быть отдельно оправдано и покрыто exact checks.

---

## 5. АРКА: структура, верхняя панель, hover, адаптивность

### Подтверждено исходным кодом

В `CombatLabWorkspaceTabs.ts` есть:

- верхняя панель с брендом ПОЛИГОН;
- File и Editors в центральной группе;
- View и EN в правой группе;
- Menu остаётся существующим `AppShellMenu`;
- 7 левых вкладок: Программа, Лаборатория, Редактор карты, Редактор юнита, Серия, Метрики, Журнал;
- 4 правых вкладки: Юнит, Инфо, Внимание, Память;
- левая и правая collapse-механика;
- нормализация сохранённой вкладки;
- resize request при создании и collapse;
- отдельные скрытые product hosts, чтобы ARKA не переписывала существующие owner-компоненты.

CSS/source-smoke фиксируют, среди прочего:

- top bar 58 px;
- history strip 30 px;
- left panel 372 px;
- right panel 336 px;
- panel gap 14 px;
- grid 20/80 px;
- responsive rules, включая диапазоны до 760, 761–1320 и desktop;
- скрытие старых competing sidebars/HUD;
- единый нейтральный hover для File/Editors/View/EN и Menu: фон `rgba(255, 255, 255, .15)`, Menu имеет тот же базовый border `rgba(255, 255, 255, .16)`, а top buttons на hover получают этот border явно.

### Важная интеграционная щель АРКА + ПУЛЬС

Правые panel elements существуют, но `rightPanels` внутри `CombatLabWorkspaceTabs` сейчас private и публичного стабильного accessor/host-contract для `unit/info/attention/memory` в проверенном source нет.

Поэтому первый LIVE Unit не должен:

- лезть в private map;
- зависеть от случайного DOM query как от архитектурного owner;
- создавать второй правый panel store.

Первый implementation Q должен добавить небольшой явный presentation-host contract в UI-слое АРКИ и затем подключить к нему ПУЛЬС. Это обычная интеграционная работа, а не новый gameplay owner.

---

## 6. Визуальный verdict АРКА

**Visual verdict: BLOCKED — pixel-perfect НЕ ДОКАЗАН для exact SHA `0309b34...`.**

Разделение доказательств:

### Browser-verified

По handoff АРКИ реальные Chromium screenshots на `1600×900` и `1080×800`, full preview verification и production build были получены для более раннего product SHA `277dc05a0c9683558d10de310bcdf55ddd39d4e7`.

Это полезное историческое доказательство, но не доказательство exact SHA review.

### Проверено по исходному коду exact SHA

- DOM-структура shell;
- численные CSS tokens;
- группы верхней панели;
- пять hover-состояний по правилам CSS;
- вкладки/collapse/UI-state;
- responsive media rules;
- отсутствие явно прошитых demo counts/fake replay/второго selection store в shell;
- наличие нейтрального placeholder вместо притворной карты.

### Не проверено

- реальный рендер `0309b34...` в Chromium;
- pixel-by-pixel сравнение `0309b34...` с каноническим HTML;
- точная геометрия после последнего крупного 16-file commit;
- реальные шрифты/метрики текста/иконки/hover/focus в браузере на exact SHA;
- переполнение и композиция на целевых размерах после final commit.

Канонический HTML не находится в репозитории. Принятые документы фиксируют его имя, размер `2 292 772` байта и SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`, но это не заменяет сами байты и screenshot comparison.

Поэтому заявлять «pixel-perfect» в данном Route X нельзя.

### Что нужно для снятия BLOCKED

На новом точном кандидате АРКИ:

1. запустить focused shell smoke;
2. TypeScript/full preview verification;
3. production build;
4. открыть exact SHA в реальном Chromium;
5. открыть локальный канонический HTML с проверенным SHA-256;
6. снять одинаковые viewport `1600×900` и `1080×800` минимум;
7. сравнить структуру, размеры, отступы, цвета, типографику, иконки, border/radius, five-button hover, active/focus, обе collapse-позиции и responsive state;
8. исправить расхождения и повторить на новом exact SHA.

---

## 7. Evidence по checks

### АРКА `0309b34...`

Подтверждено GitHub Actions на exact SHA:

- `agent-docs-integrity` — **SUCCESS**.

Не найдено exact-SHA доказательств:

- TypeScript;
- `npm run build:app`;
- full `verify:preview`;
- focused shell smoke execution;
- exact-SHA browser screenshots.

Handoff содержит PASS этих проверок для `277dc05...`; они не переносятся на `0309b34...` автоматически.

### ЛИНЗА `8040f52...`

GitHub Actions:

- generator smoke — success;
- regenerate agent documentation — success;
- `Verify generated files are committed` — failure;
- repository context integrity после этого skipped;
- общий `agent-docs-integrity` — **FAILURE**.

Это соответствует известному классу generated-doc drift на ветках от старой product base и не отменяет факт exact diff cleanup. Но зелёного полного CI у revision SHA нет.

### Независимый локальный запуск Route X

Не выполнен: рабочая среда Route X не смогла выполнить `git clone` из-за DNS `Could not resolve host: github.com`. Репозиторий проверялся через подключённый GitHub API по exact commits. Поэтому локальные Node/TypeScript/build/browser проверки не выдаются за выполненные.

---

## 8. ПУЛЬС: совместимость с АРКОЙ для первого LIVE Unit

Архитектурно контракты совместимы:

`карта → настоящий unitId → SimulationState.selectedUnitId → getSelectedUnit(state) → тот же UnitModel → правый Unit LIVE → штатная команда позы → runtime transition → readback того же UnitModel`.

ПУЛЬС правильно запрещает:

- второй selection store;
- UI-копию `UnitModel` как gameplay truth;
- optimistic posture mutation;
- прямое изменение `UnitModel` из UI;
- использование старого direct-write Unit Editor как shortcut;
- подмену LIVE данными HISTORY.

Linked profiles должны идти через существующий `GameEditorRegistry`/resolver, а не через второй каталог.

### Можно ли начинать первый LIVE Unit сейчас

**Можно готовить и выдавать implementation Q, но нельзя считать текущую ARKA `0309b34...` принятой интеграционной основой.**

Практический порядок:

1. закрыть ARKA exact-SHA revision/evidence gate;
2. зафиксировать новый принятый ARKA SHA;
3. от него делать отдельную integration branch первого LIVE Unit по контракту ПУЛЬСА;
4. в той же задаче добавить стабильный right-panel host contract;
5. не тянуть в эту вертикаль History/Metrics/Series/Laboratory.

---

## 9. ЛИНЗА после ревизии

Revision `7ee1bd62... → 8040f528...` исправляет главное нарушение прежнего review:

Удалены:

- `src/core/knowledge/EstimatedFront.ts`;
- `src/core/knowledge/UnitKnowledgeHistory.ts`;
- `src/core/knowledge/UnitMemoryReadModel.ts`;
- `src/core/map/MapInfoReadModel.ts`;
- `src/core/perception/AttentionCommands.ts`;
- `src/core/perception/AttentionReadModel.ts`.

Из `SimulationTick.ts` удалены пять ранее добавленных строк; итоговый `base...revision` больше не содержит `SimulationTick.ts`.

### Owner boundaries после revision

**Инфо**

Читать из существующих map/terrain/material/object owners. Локальные object queries должны быть spatial/bounded, а не full-map scan из UI.

**Внимание**

LIVE source — существующий `UnitModel` + Attention runtime/perception. Существуют реальные product functions (`applyAttentionProfileToUnit`, `setAttentionMode`, `setSearchSector`, `clearAttentionOverride`), но отдельный Polygon-facing command boundary ещё должен быть спроектирован и проверен: command → owner → readback → failure semantics.

**Память**

LIVE memory должна читать только субъективное knowledge/perception конкретного бойца. Existing reported provenance подтверждён. `EstimatedFront` не является готовой product capability и не должен возвращаться «потому что он был в HTML».

### HISTORY / common HistoryProvider

ЛИНЗА больше не владеет историей. Это правильно.

Будущий общий `HistoryProvider` должен быть отдельным cross-system owner и как минимум задавать:

- run/session identity;
- `viewTime`;
- coverage/retention;
- read-only historical projection по unitId/domain;
- явное `unavailable`, если истории нет;
- запрет LIVE fallback, который выдаст будущие знания в историческом просмотре;
- bounded storage/read cost;
- общий контракт для Journal/right panel/Memory/Attention, а не отдельную историю внутри каждой вкладки.

До него можно реализовать LIVE Инфо/Внимание/Память, но не HISTORY-режим этих вкладок.

---

## 10. ХРОНИСТ и полный experiment scope

ХРОНИСТ правильно разделяет существующие foundations и будущие capabilities.

### Уже есть как product foundations

- `CombatLabExperimentV1` и revision/source identity;
- стабильные Program `trackId/stepId`;
- structured Program journal/event foundations;
- текущий реальный Combat Lab metrics collector;
- headless/batch runs, seeds, progress/cancel и aggregates;
- per-run digests/final state digest;
- сериализация текущего experiment definition.

### Ещё не готово как полный контракт HTML

**History/viewTime** — нет общего владельца исторических снимков/проекций.

**Metrics v18 / telemetry** — fixed текущий metrics collector не равен принятому Metrics v18 measurement/report contract; нет общей production telemetry модели для всего утверждённого отчёта.

**Series / массовые прогоны** — runner foundation есть, но нужны durable `SeriesId/RunId`, frozen experiment inputs, связанная measurement definition, сохранение результатов и runtime version identity.

**Seed reproducibility** — seed важен, но один seed не доказывает воспроизводимость. Нужны frozen inputs + runtime/version identity + deterministic contract/digests.

**Replay** — текущий rerun по seed не является автоматически recorded replay исторического прогона.

**Laboratory** — UX принят, но нет общего descriptor/adapter/resolution chain для overrides поверх authoritative owners.

**Save/Open** — сохранение `CombatLabExperimentV1` не равно полному versioned envelope принятого HTML.

---

## 11. Полный planned scope HTML: честная карта готовности

| Planned scope | Что есть сейчас | Что ещё нужно | Зависимость |
|---|---|---|---|
| LIVE Unit | selection/UnitModel/command foundations + контракт ПУЛЬСА | новый UI wiring, stable right-panel host, readback/error/stale/reset tests | принятая exact ARKA |
| Unit Editor | принят UX; authoritative profile registry существует | пользовательское решение authoring/LIVE/два режима, допустимые writes, затем отдельный Q | после первого LIVE Unit, не смешивать |
| Linked entities | Interface Linkage contract, GameEditorRegistry/profile links | внедрять по вертикалям, reverse references/used-by там, где owner готов | вместе с соответствующими owners |
| Инфо | реальные map/terrain/material/object owners | bounded Polygon adapter/read contract и UI wiring | после ARKA; history отдельно |
| Внимание | реальный Attention/perception runtime | Polygon command boundary + readback + UI; historical projection позже | LIVE можно после Unit; HISTORY после HistoryProvider |
| Память | субъективный perception knowledge, reported provenance | нормализованный LIVE presentation; scope estimated front отдельным решением; historical projection | LIVE после Unit; HISTORY после HistoryProvider |
| Journal LIVE | structured Program/event foundations | стабильная causal navigation Program↔Journal и linked entities | после первого LIVE/right panel |
| History/viewTime | отдельные локальные foundations/snapshots существуют, но общего owner нет | common HistoryProvider, run identity, retention/coverage, no-future-leak | до любых HISTORY вкладок/replay-history |
| Metrics/telemetry | fixed collector | measurement definitions, streams, storage/aggregation, Metrics v18 report/export | после identity + Journal/History contract |
| Series/mass runs | batch/headless runner, seed, aggregates | durable Series/Run records, frozen inputs, same Metrics definitions, result persistence | после Metrics owner |
| Seed reproducibility | seed + digests | frozen complete inputs + runtime version + reproducibility gate | до серьёзного replay/Series provenance |
| Replay | rerun foundation | пользовательское решение rerun vs recorded track; owner/artifact/identity | после run identity + persistence/history policy |
| Laboratory overrides | UX contract | descriptors/adapters/resolution chain у настоящих owners; provenance | после owner map; до full Save/Open |
| Save/Open | experiment serialization foundation | versioned full envelope, migration, canonical storage, Series/history policy | после persistence decision + Laboratory/Metrics identity |

---

## 12. Какие Q назначить дальше

### Q0 — ARKA exact revision / verification

Цель: получить один новый exact SHA, для которого фактический diff, handoff и доказательства совпадают.

Критерии готовности:

- объяснены/разделены изменения final 16-file delta;
- focused shell smoke PASS;
- TypeScript PASS;
- full preview verification PASS без скрытых пропусков;
- production build PASS;
- docs integrity PASS;
- real Chromium exact-SHA screenshots;
- сравнение с локальным HTML проверенного SHA;
- пять header controls имеют одинаковый утверждённый hover;
- нет визуального regress на 1600×900 и 1080×800.

### Q1 — первый LIVE Unit: ARKA + ПУЛЬС

После Q0.

Scope:

- stable right-panel host contract;
- real selection;
- LIVE Unit read from same `UnitModel`;
- штатная posture-команда;
- accepted/transition/readback semantics;
- reset/stale/deleted selection;
- authoritative linked profiles;
- без полного Unit Editor, History и fake state.

### Q2 — ЛИНЗА LIVE right-panel implementation

Разделить внутри одной последовательности или на небольшие независимые Q:

- Info bounded read adapter;
- Attention command/readback boundary;
- Memory LIVE presentation from subjective knowledge.

Не включать common HistoryProvider и не изобретать estimated front.

### Q3 — Program ↔ Journal LIVE linkage

Стабильные structured causal links: experiment revision → trackId/stepId → journal event → linked entity/metric context.

### Q4 — common HistoryProvider owner

Отдельный cross-system foundation. Он нужен Journal HISTORY, historical Unit/Attention/Memory, будущему replay и no-future-leak.

### Q5 — Metrics v18 / telemetry owner

Одна measurement definition должна кормить Metrics report и Series, без параллельных каталогов метрик.

### Q6 — Laboratory owner/resolution

Descriptor/adapter/resolution chain поверх настоящих owners; provenance baseline/override/effective; `Apply Globally` только после решения пользователя.

### Q7 — durable Series/Run + reproducibility

Использовать существующий batch runner, но добавить стабильные IDs, frozen inputs, runtime version, Metrics linkage, durable results и воспроизводимость.

### Q8 — replay

Только после решения пользователя о модели replay и после identity/persistence/history foundations.

### Q9 — persistence + full Save/Open

Versioned ExperimentEnvelope, migrations, canonical storage, policy Series/history/telemetry.

### Q10 — полный Unit Editor

После пользовательского решения о режиме. Не использовать первый LIVE Unit как неявное разрешение редактировать весь `UnitModel`.

---

## 13. Порядок ближайших шагов и критерии готовности

### 1. Что делать первым после текущей АРКИ

Сначала не LIVE Unit, а **короткая revision/verification АРКИ**, потому что requested exact SHA не совпадает по объёму с проверенным SHA и visual proof устарел относительно final commit.

После получения принятого ARKA SHA — сразу первый LIVE Unit по ПУЛЬСУ.

### 2. Проверки перед первой интеграцией

Для объединённого кандидата ARKA + LIVE Unit:

- exact base/head diff;
- только ожидаемые файлы;
- no fake selection/unit/history/telemetry;
- shell contract smoke;
- новый LIVE Unit smoke: select → read → posture command → transition/readback;
- stale/reset/deleted unit cases;
- linked profile route;
- TypeScript;
- full preview verification;
- production build;
- docs integrity;
- exact-SHA Chromium screenshots;
- pixel comparison с локальным HTML;
- 1600×900, 1080×800, collapse left/right, active tabs, five-button hover, responsive overflow.

### 3. Какие Q дальше

Порядок: Q0 ARKA verify → Q1 LIVE Unit → Q2 ЛИНЗА LIVE panel → Q3 Program↔Journal → Q4 HistoryProvider → Q5 Metrics → Q6 Laboratory → Q7 Series/Run → Q8 replay → Q9 persistence/Save/Open → Q10 full Unit Editor.

Linked entities следует добавлять внутри каждой вертикали, а не оставлять на один поздний «линковочный» мегапатч.

### 4. Порядок закрытия полного planned scope

1. exact visual shell;
2. первый настоящий LIVE Unit;
3. LIVE Инфо/Внимание/Память;
4. Program↔Journal LIVE;
5. общий History/viewTime;
6. Metrics/telemetry;
7. Laboratory overrides;
8. durable Series/mass runs + run identity + seed reproducibility;
9. replay;
10. persistence + full Save/Open;
11. полный Unit Editor и окончательная end-to-end связность всех linked entities/used-by/provenance.

Unit Editor может технически идти раньше части ХРОНИСТА после отдельного решения пользователя, но не должен блокировать первый LIVE Unit и не должен смешиваться с ним.

### 5. Пользовательские решения до ключевых foundations

**До полного Unit Editor:**

- это authoring editor, LIVE inspector/editor или два явных режима;
- какие поля в LIVE вообще можно менять;
- какие изменения идут только через команды/runtime owners;
- как показывать недоступные для live-write поля.

**До replay:**

- replay = повторный запуск frozen inputs + seed;
- или replay = воспроизведение сохранённого исторического track;
- или поддерживаются оба режима с разными названиями;
- какой уровень детерминизма обещается пользователю.

**До persistence / Save/Open:**

- где canonical storage;
- что входит в envelope;
- живут ли Series/Run результаты между сессиями;
- сохраняются ли telemetry/history artifacts;
- versioning/migration policy.

**До common HistoryProvider:**

- кто владелец;
- какие domains обязательно историзируются: unit state, perception, attention, memory, wounds/weapons, map changes и т. п.;
- retention/budget/granularity;
- snapshot, event reconstruction или гибрид;
- поведение `viewTime`, пока LIVE продолжает идти;
- что UI показывает при неполном coverage;
- связь history с `RunId`/experiment revision.

**Дополнительно до соответствующих Q:**

- Metrics v18 переносится сразу полностью или по этапам;
- нужен ли estimated front как отдельная product capability;
- что именно входит в Memory scope;
- семантика Laboratory `Apply Globally` и какие authoritative owners разрешено менять.

---

## 14. Что блокирует интеграцию, а что не блокирует разработку

### Блокирует принятие текущей АРКИ в preview

- нет exact-SHA полного regression gate для `0309b34...`;
- нет exact-SHA browser/pixel comparison;
- final commit существенно шире заявленного hover delta.

### Не блокирует разработку первого LIVE Unit после исправленной АРКИ

- отсутствие HistoryProvider;
- отсутствие Metrics v18 telemetry;
- отсутствие durable Series/Replay/Persistence;
- отсутствие полного Unit Editor;
- отсутствие estimated front.

### Блокирует HISTORY-функции правой панели

- отсутствие общего HistoryProvider и договорённого coverage/no-future-leak contract.

### Блокирует настоящий replay/persistence

- отсутствие стабильной run identity/frozen input/runtime version/persistence model;
- отсутствие пользовательского решения о replay semantics и storage scope.

---

## 15. Skills manifest

### skills_read

1. `real-wargame-orchestration` — прочитан из репозитория `real-wargame-preview`; применены exact SHA, preview policy, review-only, запрет main/merge/deploy.
2. `real-wargame-ai-runtime` — прочитан; применены simulation/UI owners, perception/memory subjectivity и запрет UI gameplay truth.
3. `real-wargame-performance` — прочитан; применены bounded/spatial work, отсутствие gameplay computation в UI и требование evidence после executable changes.
4. `real-wargame-screenshots` — прочитан; exact target + real browser + fresh screenshot обязательны для visual acceptance.
5. `real-wargame-local-preview` — прочитан, потому что была предпринята локальная visual-check попытка; локальный запуск не состоялся из-за отсутствия DNS к GitHub.

### skills_skipped

- нет.

### skills_unavailable

- `real-wargame-documentation` — прямой URL был недоступен, а чтение `.agents/skills/real-wargame-documentation/SKILL.md` из `real-wargame-preview` через GitHub вернуло 404. Содержание не выдумывалось. Использованы только явно переданные в задаче/предыдущем контексте правила этого skill: канонические документы, generated status, journal и docs checks.

---

## 16. Финальный вывод

Три контрактных направления после этой проверки дают пригодную карту дальнейшей работы:

- ПУЛЬС — принят как контракт первого LIVE Unit;
- ЛИНЗА — revision исправляет прошлое нарушение и принимается как контракт с follow-up;
- ХРОНИСТ — принят как системный контракт будущих foundations.

АРКА структурно приблизила продукт к принятому shell и по source-level сохраняет правильные owner boundaries, но её **requested exact SHA нельзя принять сейчас**: последний commit гораздо шире заявленного hover-уточнения, а полный regression/browser evidence относится к предыдущему SHA.

Поэтому общий ближайший маршрут:

`ARKA exact revision/visual gate → ARKA + ПУЛЬС first LIVE Unit → ЛИНЗА LIVE right panel → Program↔Journal → common HistoryProvider → Metrics → Laboratory → durable Series/Run → replay → persistence/Save/Open → full Unit Editor/end-to-end linkage`.

Наличие принятого HTML или Markdown-контракта ни на одном этапе не засчитывается как готовая product capability.
