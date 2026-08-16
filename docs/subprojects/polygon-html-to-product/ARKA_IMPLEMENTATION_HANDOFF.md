# АРКА — implementation handoff каркаса нового Полигона

Дата фиксации: 2026-08-16.

Исполнитель: **АРКА** — каркас интерфейса нового Полигона.

Этот документ фиксирует фактически выполненную работу по переносу визуального shell Полигона из принятого HTML-прототипа в продукт. Он предназначен прежде всего как handoff для дальнейшей работы в Codex.

> **Критически важно:** текущую верстку нельзя считать окончательной pixel-perfect копией HTML-прототипа. Она стала заметно ближе к эталону и прошла браузерные проверки, но пользователь сознательно останавливает дальнейшую ручную доводку здесь и будет завершать визуальное соответствие в Codex. При продолжении нельзя исходить из предположения, что внешний вид уже принят целиком.

---

## 1. Source of truth и итоговое состояние

### Рабочая ветка

`feature/20260816-polygon-arka-exact-shell`

### Исходная база ARKA до exact-shell pass

`59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc`

Это состояние уже содержало первоначальный ARKA shell и документ `ARKA_PLANNED_SCOPE_CHECK.md`.

### Последний проверенный product commit до этого документа

`277dc05a0c9683558d10de310bcdf55ddd39d4e7`

Commit message:

`fix: keep start control readable at 1080`

Именно этот SHA был:

- проверен focused Polygon shell smoke;
- проверен полным `verify:preview`;
- собран через `build:app`;
- опубликован как exact-source Vercel Preview;
- повторно проверен в реальном Chromium на 1600×900 и 1080×800;
- визуально просмотрен по свежим PNG.

После добавления этого документа HEAD ветки естественно станет новым docs-only commit. **Product source, на котором проводился финальный visual QA, остаётся `277dc05a...`.**

### Защищённые ветки не трогались

На момент финальной проверки:

- `real-wargame-preview` — `1246e1d612e648e7d7378db1c02be3bbf3d2a16a`;
- `main` — `cce21338f1200a8676b62d69e85d537a3cbf3fef`.

Никакой merge в них не выполнялся.

---

## 2. Что именно было сделано

Работа прошла в два крупных этапа.

### Этап A — первоначальный продуктовый shell

Первоначальный ARKA pass перенёс в продукт общий каркас Полигона без создания отдельного runtime или копии HTML-прототипа:

- глобальную шапку;
- левую рабочую панель;
- центральную рабочую область;
- правую панель инспектора;
- нижнюю временную/статусную зону;
- переключение вкладок;
- active / hover / collapse состояния;
- responsive-поведение;
- сохранение существующих product hosts;
- подключение существующих реальных run controls;
- запрет fake runtime/gameplay/history данных.

Отдельная проверка полного planned scope зафиксирована в:

`docs/subprojects/polygon-html-to-product/ARKA_PLANNED_SCOPE_CHECK.md`

### Этап B — exact-shell visual pass по каноническому HTML

После визуального просмотра стало понятно, что первоначальная реконструкция слишком сильно расходится с принятым HTML-прототипом. Был сделан отдельный exact-shell pass.

В качестве визуального source of truth использовался канонический HTML-прототип:

`polygon-series-v1.1-memory-v3-interface-linkage(1).html`

Для exact-shell pass зафиксированы отдельные design/spec документы:

- `docs/superpowers/specs/2026-08-16-polygon-exact-shell-design.md`
- `docs/superpowers/plans/2026-08-16-polygon-exact-shell.md`

Главный принцип этого pass:

> приблизить внешний shell продукта к HTML-прототипу настолько близко, насколько это можно сделать без подмены product architecture демонстрационной JS-моделью прототипа.

---

## 3. Архитектурные границы, которые были сохранены

### Не создавался второй runtime

Никакой отдельный runtime Полигона внутри UI не создавался.

Не добавлялись:

- новый `appState`;
- новый gameplay store;
- второй selection store;
- глобальный `window` API;
- копия JS state model из HTML;
- fake selected unit;
- synthetic history;
- demo event stream;
- fake telemetry;
- fake Series/Run.

### Существующие product hosts сохранены

Новый видимый shell не ломает существующую инициализацию Combat Lab.

В `CombatLabWorkspaceTabs.ts` существующие workspace hosts продолжают создаваться и регистрироваться, но в exact-shell visual pass они находятся в скрытом compatibility container.

Это сделано, чтобы:

1. не удалять существующие product-owned UI/runtime связи;
2. не переписывать весь Combat Lab одновременно с визуальным переносом;
3. оставить точки подключения для следующих исполнителей;
4. не выдавать пока неготовое содержимое вкладок за завершённый новый интерфейс.

### Live map архитектурно не удалена

Реальный `#app` и canvas остаются частью продукта.

Однако в exact-shell visual pass canvas **намеренно скрыт визуально** в режиме Combat Lab/Polygon. Вместо него показывается нейтральный placeholder, близкий к поверхности канонического HTML.

Это временное решение для визуального pass, а не новая карта и не замена runtime renderer.

Codex при дальнейшей работе должен учитывать эту границу: если возвращается реальная карта, необходимо делать это через существующий product renderer, а не строить вторую карту в shell.

---

## 4. Итоговая структура видимого shell

Основная DOM-структура собирается в:

`src/combat-lab/ui/CombatLabWorkspaceTabs.ts`

### 4.1. Верхняя панель

Создана `.polygon-shell-topbar`.

В ней находятся:

#### Левая группа

- знак `П`;
- надпись `ПОЛИГОН` на широком экране;
- host настоящего `CombatLabExperimentRunToolbar`.

#### Центральная группа

Shell-кнопки, визуально соответствующие прототипу:

- `ФАЙЛ`;
- `РЕДАКТОРЫ`.

Эти элементы сейчас являются **только shell controls**. Недостающую доменную функциональность нельзя выдумывать только потому, что кнопка видна.

#### Правая группа

- `ВИД ▾`;
- `EN`;
- существующий продуктовый menu trigger визуально переоформлен под слот `МЕНЮ` на широком экране.

### 4.2. Реальные run controls

Сохранён настоящий продуктовый `CombatLabExperimentRunToolbar`.

Его функции не подменялись fake-кнопками.

В exact-shell CSS он визуально уплотнён и встроен в ритм верхней панели.

Отдельно была исправлена читаемость `ПУСК` на ширине 1080 px: предыдущий responsive override превращал его в узкую icon-button `▶`; финальный commit `277dc05a...` удалил этот override, поэтому реальная кнопка снова остаётся читаемой как `▶ ПУСК`.

### 4.3. History/status strip

Под topbar добавлена глобальная `.polygon-shell-history-strip`.

Она содержит:

- `LIVE`;
- визуальный track;
- существующий реальный status text host;
- shell-кнопки `ФИЛЬТРЫ`, переходы назад/вперёд и `ХРОНОЛОГИЯ ▾`.

Важно: это **только визуальная оболочка будущего History UX**.

Не реализованы:

- `HistoryProvider`;
- настоящий `viewTime`;
- scrub по истории;
- replay history;
- future-leakage-safe historical reads.

Shell не создаёт fake history, чтобы заполнить полосу.

### 4.4. Левая панель

Видимые вкладки в порядке exact-shell pass:

1. `Программа`
2. `Лаборатория`
3. `Редактор карты`
4. `Редактор юнита`
5. `Серия`
6. `Метрики`
7. `Журнал`

Их product tab IDs продолжают опираться на существующую систему workspace hosts:

- `program`
- `laboratory`
- `scene`
- `parameters`
- `batch`
- `metrics`
- `journal`

На широкой версии семь вкладок были специально доведены до стабильной раскладки в **две строки**.

Состояние активной вкладки:

- управляется UI;
- записывается в `sessionStorage` через существующий ключ;
- отражается через `active`, `aria-selected`, `tabIndex`;
- вызывает существующее событие `combat-lab-workspace-tab-change`.

Не создаётся отдельная доменная сущность «активный раздел Полигона» в runtime.

### 4.5. Правая панель

Созданы четыре постоянные вкладки:

- `Юнит`
- `Инфо`
- `Внимание`
- `Память`

Для каждой существует честный `tabpanel` без fake gameplay data.

Состояние правой вкладки хранится только как UI preference в `sessionStorage`.

Header сейчас честно показывает `Юнит не выбран`, если real integration ещё не подключена.

### 4.6. Collapse

Обе боковые панели могут независимо сворачиваться.

Левая:

- `polygon-shell-left-collapsed`;
- синхронизация `aria-expanded`;
- существующие body compatibility classes;
- resize request для workspace.

Правая:

- `polygon-shell-right-collapsed`;
- `aria-expanded`;
- body class;
- resize request.

Placeholder центрального поля учитывает collapse-state.

### 4.7. Центральный placeholder

Добавлены:

- `.polygon-shell-map-placeholder`;
- `.polygon-shell-map-board`.

Placeholder:

- `aria-hidden`;
- не получает pointer events;
- не содержит юнитов;
- не содержит terrain demo;
- не содержит fake map state;
- использует светло-серо-бежевый фон;
- имеет тонкую сетку 20 px;
- имеет более крупный визуальный ритм 80 px;
- маскирует live canvas только визуально.

Центральный board — нейтральное квадратное поле, размеры которого зависят от доступной области между боковыми панелями.

---

## 5. Геометрия exact-shell pass

В exact design были приняты следующие основные размеры:

- topbar — `58px`;
- history/status strip — `30px`;
- суммарный top chrome — `88px`;
- левая панель — `372px`;
- правая панель — `336px`;
- gap боковых панелей от viewport edge — `14px`;
- fine grid — `20px`;
- large grid rhythm — `80px`.

### Финальная браузерная геометрия на 1600×900

Зафиксировано Chromium-run:

- левая панель: `x=14`, `w=372`;
- правая панель: `x=1250`, `w=336`;
- центральный board: примерно `x=451`, `y=127`, `734×734`.

### Финальная браузерная геометрия на 1080×800

После исправления responsive mismatch:

- левая панель сохраняет `372px`;
- правая панель сохраняет `336px`;
- gap сохраняется `14px`;
- правая панель начинается примерно на `x=730`;
- центральный board: примерно `x=431`, `y=317`, `254×254`;
- кнопка `ПУСК` остаётся читаемой одной строкой, около `58.77×34px`.

---

## 6. Что пришлось исправлять по итогам реального Chromium QA

Работа не ограничивалась статическими CSS smoke. Были несколько итераций реального browser QA.

### 6.1. Расхождение responsive-панелей на 1080 px

Первый финальный Chromium-run показал mismatch на 1080×800.

Причина:

старые responsive rules Combat Lab на `≤1120` сжимали shell до примерно:

- `330px` слева;
- `300px` справа;
- `10px` gap.

Это противоречило каноническому HTML, где при такой ширине боковые панели сохраняют `372/336` и `14px` gap.

Исправление:

- responsive override был отменён в exact-shell CSS;
- закреплено smoke-тестом.

### 6.2. Верхняя панель была слишком иконографической

Ранний вариант exact pass использовал условные иконки для top-level shell actions.

После сверки с HTML возвращены текстовые группы:

- `ФАЙЛ`;
- `РЕДАКТОРЫ`;
- `ВИД ▾`;
- `EN`;
- `МЕНЮ`.

Это сделано в `CombatLabWorkspaceTabs.ts` и CSS.

### 6.3. `ПУСК` на 1080 был слишком агрессивно ужат

Responsive rule превращал кнопку в 38 px `▶`.

Свежий PNG показал, что это ухудшает соответствие и читаемость.

Финальный product commit `277dc05a...` удаляет только этот responsive override.

Результат:

- текст `ПУСК` снова виден;
- кнопка не становится icon-only;
- 1080 layout остаётся стабильным.

### 6.4. Две строки вкладок

Из-за различий font rendering Linux Chromium / Windows исходная раскладка вкладок могла нестабильно переноситься.

Была отдельно уменьшена горизонтальная chrome/padding вкладок без уменьшения базовой читаемости текста, чтобы семь вкладок левой панели стабильно занимали две строки.

---

## 7. Файлы, изменённые в exact-shell работе

Ниже — итоговый diff относительно `59a255d...` перед exact-shell pass.

### Документация

#### `docs/superpowers/specs/2026-08-16-polygon-exact-shell-design.md`

Содержит утверждённый visual contract:

- HTML как визуальный source of truth;
- геометрия;
- цветовой язык;
- visible scope;
- placeholder map;
- responsive constraints;
- non-goals;
- acceptance criteria.

#### `docs/superpowers/plans/2026-08-16-polygon-exact-shell.md`

Implementation plan:

- сначала regression contract;
- потом placeholder;
- затем visual fidelity;
- полный verification gate;
- exact-SHA Preview;
- Chromium comparison loop.

### Контрактные проверки

#### `scripts/combat_lab_polygon_shell_contract_smoke.mjs`

Сильно расширен.

Проверяет, среди прочего:

- структуру Polygon shell;
- правильные вкладки;
- правый инспектор;
- topbar labels;
- отсутствие произвольных иконок вместо канонических текстовых controls;
- history strip;
- placeholder;
- скрытие live canvas в exact visual pass;
- grid tokens;
- 372/336/14 geometry;
- 1080 responsive geometry;
- реальные duration/seed sources;
- оформление product menu trigger как `МЕНЮ`;
- отсутствие fake/demo state.

#### `scripts/combat_lab_workspace_layout_smoke.mjs`

Обновлён под новую геометрию/placeholder-композицию.

#### `scripts/combat_lab_workspace_tabs_contract_smoke.mjs`

Обновлён под новый visible tab contract.

#### `scripts/combat_lab_stage10_ui_integration_contract_smoke.mjs`

Обновлены ожидания старой integration contract, чтобы новый shell не считался регрессией только из-за смены layout.

### Основной UI

#### `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`

Главная точка сборки нового shell.

Изменено:

- visible Polygon left tabs;
- right inspector tabs;
- topbar groups;
- history/status strip;
- central placeholder;
- hidden compatibility hosts;
- collapse behavior;
- sessionStorage для UI-owned state;
- ARIA/tab semantics.

#### `src/combat-lab/ui/CombatLabExperimentRunToolbar.ts`

Минимально адаптирован, чтобы реальные run controls корректно жили внутри нового shell и сохраняли существующее поведение.

#### `src/combat-lab/ui/CombatLabExperimentSettingsSummary.ts`

Минимально адаптирован для компактного отображения real experiment duration/seed в topbar.

Значения не синтетические: используются реальные данные текущего experiment draft.

### CSS

#### `src/combat-lab/polygon-shell.css`

Основная визуальная система shell была существенно переработана:

- layout;
- topbar;
- status strip;
- side panels;
- tabs;
- collapse;
- responsive;
- hidden host treatment;
- устранение старого темного Combat Lab look.

#### `src/combat-lab/polygon-shell-exact.css`

Добавлен как отдельный exact visual correction layer.

Содержит наиболее точечные prototype-derived overrides:

- placeholder/canvas visibility;
- map board;
- topbar density;
- run toolbar density/order;
- status strip;
- panel geometry;
- tabs;
- menu trigger;
- 1080 behavior;
- final readable `ПУСК` behavior.

#### `src/combat-lab/polygon-shell-compat.css`

Обновлены compatibility rules, скрывающие старый UI chrome и не позволяющие старым Combat Lab элементам конкурировать с новым Polygon shell.

### Entrypoint

#### `src/combat-lab/main.ts`

Подключён exact-shell CSS слой.

Другой runtime здесь не создавался.

---

## 8. Что визуально скрыто и почему

В exact-shell pass намеренно скрыты/не показываются как часть нового видимого Polygon shell:

- старый глобальный Combat Lab workspace tab bar;
- старые sidebar/HUD элементы, которые создавали дублирование;
- live canvas;
- hidden compatibility workspace hosts.

Это не означает, что соответствующие product capabilities удалены.

Это означает только, что их прежнее визуальное представление не должно конкурировать с новым shell до вертикальной интеграции.

---

## 9. Что НЕ было реализовано в этой работе

Несмотря на визуальное наличие разделов, следующие capability не следует считать готовыми.

### История

Нет:

- HistoryProvider;
- viewTime;
- полноценного LIVE/HISTORY режима;
- historical snapshots;
- replay semantics.

Owner: ХРОНИСТ / отдельная foundation задача.

### `Юнит`

Shell готов, но реальные данные/команды должны подключаться через контракт ПУЛЬСА:

`SimulationState.selectedUnitId → UnitModel → штатная команда → readback`.

Нельзя создавать новый UI selection store или напрямую мутировать UnitModel.

### `Инфо`, `Внимание`, `Память`

Shell готов, доменные данные принадлежат ЛИНЗЕ и существующим simulation/perception owners.

UI не должен:

- вычислять LOS;
- строить собственную perception truth;
- придумывать Intel/Front data;
- синтезировать memory contacts.

### Linked entities

Нет универсального typed entity navigator/resolver между:

- unit;
- map entity;
- Program step;
- Journal event;
- metric;
- Series run;
- viewTime.

Это остаётся planned-scope gap.

### Save/Open experiment

Не реализован новый полный global experiment Save/Open.

Нельзя показывать частичную существующую сериализацию как завершённый accepted Polygon Save/Open, пока experiment envelope не охватывает требуемые Laboratory/Metrics и связанные данные.

### Context menu

Новый универсальный context-menu mechanism Полигона не создавался.

### Полный Unit Editor

`Редактор юнита` в shell сейчас использует существующий product host mapping, но полноценная authoring/LIVE семантика Unit Editor — отдельная задача.

---

## 10. Проверки, которые были реально выполнены

### Focused smoke

Финальный candidate `277dc05a...` прошёл focused Polygon shell smoke.

### Полный Preview gate

`npm run verify:preview`

Результат:

- **31 isolated checks passed**;
- `skippedChecks = []`.

В gate входят TypeScript и набор существующих product/runtime regression smokes, поэтому exact-shell pass не был принят только по одному UI-тесту.

### Production build

`npm run build:app`

PASS.

Vite предупреждение о больших chunks существовало как обычный build warning и не являлось ошибкой этого UI pass.

### Deployment pages

Проверены:

- `index.html`;
- `ai-node-editor.html`;
- `combat-lab.html`;
- `deployment-source.json`.

### Chromium visual QA

Финальный точный SHA проверен в реальном Chromium.

Viewport:

- 1600×900;
- 1080×800.

Проверялось:

- shell загрузился;
- live canvas не виден;
- панели имеют требуемую геометрию;
- семь вкладок левой панели лежат в две строки;
- topbar сохраняется;
- `ПУСК` не схлопывается в icon-only на 1080;
- центральный board остаётся корректным;
- responsive layout не возвращает старые 330/300 px panel widths.

Свежие PNG также были просмотрены вручную после автоматического PASS.

---

## 11. Финальный Preview product SHA

Финальный проверенный Preview exact-source:

`https://repo-htlztff5p-111s-projects-807221af.vercel.app/combat-lab.html`

Deployment ID:

`dpl_4Gyacizqz4FLcZar4UiYHkVicnrd`

`deployment-source.json` подтверждал:

- repository: `AndrewVerhoturov1/Real-wargame`;
- ref: `feature/20260816-polygon-arka-exact-shell`;
- sourceSha: `277dc05a0c9683558d10de310bcdf55ddd39d4e7`;
- verificationStatus: `passed`;
- skipped checks отсутствуют.

Это Preview, не production deployment.

---

## 12. Важная оценка визуального результата

### Что стало существенно ближе к HTML

- светлый, а не прежний темный shell;
- olive topbar;
- 58+30 px верхняя композиция;
- panel widths и edge gaps;
- расположение двух floating side panels;
- набор и порядок левых вкладок;
- набор правых вкладок;
- двухстрочная раскладка левых tabs;
- текстовые top-level controls вместо произвольных иконок;
- нейтральное центральное поле и сетка;
- компактная типографика/контролы;
- сохранение geometry на 1080;
- читаемый `ПУСК`.

### Что НЕ следует считать окончательно совпавшим

Пользователь прямо указал, что верстка **не во всём соответствует** прототипу и будет доделываться в Codex.

Поэтому для следующего исполнителя правильный статус:

**visual shell = хорошая рабочая база, архитектурно безопасная, browser-verified, но не финально принятая pixel-perfect верстка.**

Не следует превращать текущие smoke thresholds в аргумент против дальнейшей визуальной доводки. Тесты фиксируют важные layout invariants и отсутствие архитектурных регрессий, но не доказывают полное визуальное совпадение.

---

## 13. Что Codex должен делать дальше по верстке

Продолжение должно быть **визуальным**, не архитектурным переписыванием.

Рекомендуемый порядок:

1. Открыть канонический HTML и текущий exact Preview рядом на одинаковом viewport.
2. Использовать screenshot/browser loop, а не только чтение CSS.
3. Доводить по зонам:
   - topbar;
   - run controls;
   - history strip;
   - left panel header/tabs/body;
   - right panel header/tabs/body;
   - central board/grid;
   - shadows/borders/radius;
   - typography;
   - responsive 1080.
4. После каждого визуального изменения сохранять архитектурные ограничения:
   - не возвращать fake data;
   - не создавать новый runtime;
   - не создавать новый selection store;
   - не копировать HTML JS state;
   - не вычислять gameplay truth в UI;
   - не удалять реальные hidden product hosts без отдельного migration решения.
5. Если нужно вернуть реальную карту в видимый shell, делать это отдельной integration задачей через существующий renderer.
6. Не считать shell labels доказательством наличия product capability: `ФАЙЛ`, `РЕДАКТОРЫ`, History controls и т.п. пока могут быть только визуальными slots.

### Что желательно не ломать при доводке

- top chrome 58 + 30 px, если эталон не показывает иное;
- 372/336 panel widths на 1600 и 1080;
- 14 px edge gap;
- две строки семи левых tabs;
- реальные run controls;
- реальный duration/seed source;
- читаемый `ПУСК`;
- collapse;
- ARIA/tab semantics;
- hidden compatibility hosts;
- exact-source verification workflow.

---

## 14. Временная CI инфраструктура, созданная только для проверки

Во время visual loop использовались временные `ci/**` branches и CI-only PR для запуска GitHub Actions/Chromium.

Последние финальные:

- PR #270 — focused verify `277dc05a...`;
- PR #271 — full verify/build `277dc05a...`;
- PR #272 — final visual QA `277dc05a...`.

Ранее создавались аналогичные CI-only PR для промежуточных кандидатов.

Их назначение — только проверки.

**Их не нужно merge в product branch.**

При уборке репозитория Codex может закрыть такие PR и удалить временные CI branches после того, как убедится, что артефакты больше не нужны.

---

## 15. Итоговый handoff

### Что можно считать сделанным АРКОЙ

- создан новый Polygon shell в существующем Combat Lab;
- сохранены product/runtime boundaries;
- создана структура topbar/history/left/center/right;
- добавлены 7 видимых workspace tabs;
- добавлены 4 right inspector tabs;
- сохранены настоящие run controls;
- добавлен light prototype-style placeholder вместо видимого live canvas на этом pass;
- реализованы UI-owned active/collapse states;
- сохранены hidden product hosts;
- добавлен отдельный exact CSS correction layer;
- визуальная геометрия существенно приближена к HTML;
- устранены основные 1080 responsive mismatches;
- проведены focused, full gate, production build и real Chromium QA;
- создан exact-source Preview;
- documented planned-scope gaps без fake implementations.

### Что следующий исполнитель не должен предполагать

- что верстка pixel-perfect завершена;
- что History уже реализована;
- что `Юнит/Инфо/Внимание/Память` имеют реальные данные;
- что Save/Open experiment завершён;
- что context menus завершены;
- что linked-entity navigation завершена;
- что central placeholder является новой product map;
- что shell-owned top buttons уже имеют authoritative behavior.

### Следующая функциональная точка интеграции после визуальной доводки

`АРКА + ПУЛЬС → первый настоящий LIVE Unit`

После этого последовательно подключаются реальные данные ЛИНЗЫ и исторические/экспериментальные контракты ХРОНИСТА.

---

## 16. Короткая инструкция Codex перед продолжением

Перед изменениями прочитать:

1. `docs/subprojects/polygon-html-to-product/ARKA_IMPLEMENTATION_HANDOFF.md` — этот документ;
2. `docs/subprojects/polygon-html-to-product/ARKA_PLANNED_SCOPE_CHECK.md`;
3. `docs/superpowers/specs/2026-08-16-polygon-exact-shell-design.md`;
4. `docs/superpowers/plans/2026-08-16-polygon-exact-shell.md`;
5. фактические текущие `CombatLabWorkspaceTabs.ts`, `polygon-shell.css`, `polygon-shell-exact.css`, `polygon-shell-compat.css`;
6. канонический HTML-прототип.

Далее визуально доводить текущий shell, **не начиная его заново и не меняя runtime architecture без отдельной причины**.
