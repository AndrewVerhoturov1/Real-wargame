# AI Node Editor Inspector and Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать удаление исходящих связей симметричным входящим, заменить фильтры палитры на выпадающий список, оставить один видимый редактор ноды и добавить постоянно сохраняемые изменяемые ширины боковых панелей.

**Architecture:** `main-ux.ts` остаётся владельцем графа, связей, раскладки и скрытого общего пути сохранения. `human-node-ui.ts` остаётся единственным видимым редактором параметров и синхронизирует одну кнопку сохранения со скрытым мостом `main-ux.ts`. Ширины входят в существующий `EditorUiState`, а CSS использует переменные сетки вместо фиксированных колонок.

**Tech Stack:** TypeScript, DOM API, CSS Grid, Pointer Events, localStorage, Node.js smoke scripts, Vite.

## Global Constraints

- Graph v2 и JSON графа не меняются.
- Выполнение ИИ, симуляция и игра не меняются.
- Ветка: `feature/20260725-ai-node-editor-ux`.
- Базовый согласованный кандидат перед продолжением: `e89a6260c149ff92c25c41f111d96e5c19700ce3`.
- Новый деплой не выполняется без отдельного явного запроса.
- Визуальная проверка выполняется при 1440×900.
- Минимальная ширина графа: 520 px.
- Палитра: 180–420 px, стандарт 228 px.
- Инспектор: 260–520 px, стандарт 300 px.

---

### Task 1: Расширить UX-контракт до начала реализации

**Files:**
- Modify: `scripts/ai_node_editor_ux_smoke.mjs`

**Interfaces:**
- Consumes: текущее содержимое `main-ux.ts`, `human-node-ui.ts`, `editor-ui-preferences.ts`, `ai-node-editor-ux.css`.
- Produces: статические обязательные маркеры нового интерфейса.

- [ ] **Step 1: Добавить падающие проверки**

Проверить наличие:

```js
'palette-filter-select'
'paletteWidth'
'inspectorWidth'
'data-resize-panel="palette"'
'data-resize-panel="inspector"'
'getOutgoingDataConsumers'
'removeAllOutgoingLinks'
'outgoing-link-menu'
'inspector-save-bridge'
'Сохранить ноду'
```

Проверить отсутствие в видимом шаблоне:

```js
'palette-filter-row'
'<h3>${localized(\'Редактирование\''
```

- [ ] **Step 2: Зафиксировать ожидаемый первый провал**

Run:

```bash
node scripts/ai_node_editor_ux_smoke.mjs
```

Expected: FAIL на первом отсутствующем маркере нового интерфейса.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai_node_editor_ux_smoke.mjs
git commit -m "test: specify inspector resize refinement"
```

### Task 2: Заменить фильтры палитры на выпадающий список

**Files:**
- Modify: `src/ai-node-editor/main-ux.ts`
- Modify: `src/ai-node-editor/ai-node-editor-ux.css`

**Interfaces:**
- Consumes: `PaletteFilter`, `setPaletteFilter`, `getCategoryLabel`.
- Produces: `<select id="palette-filter-select">` с теми же значениями фильтра.

- [ ] **Step 1: Заменить генерацию кнопок**

В `renderPalettePanel()` сформировать `filterOptions`:

```ts
const filterOptions = [
  renderPaletteFilterOption('all', getEditorText('all', uiState.languageMode)),
  renderPaletteFilterOption('favorites', getEditorText('favorites', uiState.languageMode)),
  ...nonEmptyCategories.map((category) => renderPaletteFilterOption(
    category,
    getCategoryLabel(category, uiState.languageMode),
  )),
].join('');
```

Добавить:

```ts
function renderPaletteFilterOption(filter: PaletteFilter, label: string): string {
  return `<option value="${filter}" ${uiState.paletteFilter === filter ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}
```

- [ ] **Step 2: Подключить событие change**

```ts
document.querySelector<HTMLSelectElement>('#palette-filter-select')
  ?.addEventListener('change', (event) => setPaletteFilter((event.target as HTMLSelectElement).value as PaletteFilter));
```

Удалить обработчики `[data-palette-filter]`.

- [ ] **Step 3: Переписать CSS**

Удалить стили `.palette-filter-row` и `.palette-filter`. Добавить единый `.palette-filter-field` и стандартный `<select>` высотой 28–30 px.

- [ ] **Step 4: Проверить smoke**

Run:

```bash
node scripts/ai_node_editor_ux_smoke.mjs
```

Expected: фильтрные проверки PASS, дальнейшие новые проверки ещё FAIL.

- [ ] **Step 5: Commit**

```bash
git add src/ai-node-editor/main-ux.ts src/ai-node-editor/ai-node-editor-ux.css scripts/ai_node_editor_ux_smoke.mjs
git commit -m "feat: use palette type dropdown"
```

### Task 3: Добавить удаление исходящих связей со стороны выхода

**Files:**
- Modify: `src/ai-node-editor/main-ux.ts`
- Modify: `src/ai-node-editor/ai-node-editor-ux.css`

**Interfaces:**
- Produces:

```ts
interface OutgoingDataConsumer {
  node: EditableAiNode;
  inputPortId: string;
}

export function getOutgoingDataConsumers(sourceNodeId: string, sourcePortId: string): OutgoingDataConsumer[];
export function removeOutgoingDataLink(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): void;
export function removeAllOutgoingLinks(sourceNodeId: string, sourcePortId?: string, kind?: 'flow' | 'data'): void;
```

- [ ] **Step 1: Добавить состояние меню**

```ts
interface OutgoingMenuState {
  sourceNodeId: string;
  sourcePortId: string;
  kind: 'flow' | 'data';
}

let outgoingMenuState: OutgoingMenuState | null = null;
```

Закрывать его при внешнем `pointerdown` вместе с входящим меню.

- [ ] **Step 2: Реализовать поиск потребителей данных**

Пройти по всем `inputBindings` всех нод и вернуть только привязки:

```ts
binding.source === 'node'
&& binding.nodeId === sourceNodeId
&& binding.port === sourcePortId
```

- [ ] **Step 3: Отрисовать занятые выходы и кнопки удаления**

Для управляющего выхода использовать `node.children`.

Для каждого data-out использовать `getOutgoingDataConsumers(node.id, port.id)`.

При одной связи кнопка удаляет её сразу. При нескольких открывает `outgoing-link-menu` со списком целей и командой удаления всех связей порта.

- [ ] **Step 4: Реализовать точное и массовое удаление**

Точное удаление data-link должно удалить `target.inputBindings[targetPortId]` только если привязка всё ещё совпадает с источником и портом.

Массовое удаление без `sourcePortId` должно очищать и `children`, и все чужие `inputBindings`, ссылающиеся на ноду.

- [ ] **Step 5: Исправить контекстное меню**

Заменить:

```ts
case 'unlink-outgoing': node.children = []; break;
```

на вызов `removeAllOutgoingLinks(node.id)`.

- [ ] **Step 6: Изолировать события**

Добавить новые классы и меню в `isPortEvent()` и использовать `installIsolatedClick()` для всех кнопок удаления.

- [ ] **Step 7: Добавить CSS**

Добавить `.node-output-link-control`, правые позиции для flow/data и `.outgoing-link-menu`, зеркальный входящему меню.

- [ ] **Step 8: Проверить smoke**

Run:

```bash
node scripts/ai_node_editor_ux_smoke.mjs
```

Expected: проверки исходящих связей PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ai-node-editor/main-ux.ts src/ai-node-editor/ai-node-editor-ux.css scripts/ai_node_editor_ux_smoke.mjs
git commit -m "feat: unlink graph connections from outputs"
```

### Task 4: Оставить один видимый редактор ноды

**Files:**
- Modify: `src/ai-node-editor/main-ux.ts`
- Modify: `src/ai-node-editor/human-node-ui.ts`
- Modify: `src/ai-node-editor/human-node-ui.css`

**Interfaces:**
- Consumes: существующий `saveSelectedNodeFromInspector()` и интеграции, использующие `#node-parameters` и `#save-node`.
- Produces: один видимый `.human-node-panel` и скрытый `.inspector-save-bridge`.

- [ ] **Step 1: Удалить видимую карточку общего редактирования**

`renderInspector()` больше не показывает поля displayName, description, contract parameters, JSON textarea и отдельную кнопку сохранения.

- [ ] **Step 2: Добавить скрытый мост**

Отрисовать скрытые значения:

```html
<div class="inspector-save-bridge" hidden>
  <input id="node-display-name" />
  <input id="node-display-name-ru" />
  <textarea id="node-description"></textarea>
  <textarea id="node-description-ru"></textarea>
  <textarea id="node-parameters"></textarea>
  <button id="save-node" type="button"></button>
</div>
```

Не отрисовывать `#contract-parameter-fields`, чтобы скрытые устаревшие поля не перезаписывали человеческий интерфейс.

- [ ] **Step 3: Добавить метаданные в человеческую панель**

Добавить сворачиваемый блок названия и описания с полями:

```html
[data-node-meta="displayNameRu"]
[data-node-meta="descriptionRu"]
[data-node-meta="displayName"]
[data-node-meta="description"]
```

Русские поля показывать первыми, английские — во вложенном сворачиваемом блоке.

- [ ] **Step 4: Оставить одну кнопку**

Переименовать `.human-save-node` в «Сохранить ноду» / `Save node`.

В `savePanelParameters()` синхронизировать метаданные и параметры со скрытым мостом, затем вызвать `#save-node.click()`.

- [ ] **Step 5: Сохранить специальные интеграции**

Не менять идентификаторы `#node-parameters`, `#save-node`, `.human-field`, `.human-save-node`, `#stateful-subgraph-id`.

- [ ] **Step 6: Уплотнить человеческую панель**

Привести отступы к 6–8 px, поля к 30 px, действия выровнять вправо, основную кнопку не растягивать на всю ширину.

- [ ] **Step 7: Проверить smoke**

Run:

```bash
node scripts/ai_node_editor_ux_smoke.mjs
node scripts/ai_node_editor_v2_only_smoke.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ai-node-editor/main-ux.ts src/ai-node-editor/human-node-ui.ts src/ai-node-editor/human-node-ui.css scripts/ai_node_editor_ux_smoke.mjs
git commit -m "refactor: unify node inspector editing"
```

### Task 5: Переработать визуальную структуру инспектора

**Files:**
- Modify: `src/ai-node-editor/main-ux.ts`
- Modify: `src/ai-node-editor/ai-node-editor-ux.css`
- Modify: `src/ai-node-editor/human-node-ui.css`

**Interfaces:**
- Produces: единая последовательность summary → editor → links → diagnostics → danger.

- [ ] **Step 1: Уплотнить summary**

Показать заголовок, категорию и две короткие строки ID/type без крупной пустой области.

- [ ] **Step 2: Уплотнить связи**

Сделать короткую кнопку «Связать», список дочерних нод с компактными кнопками × и счётчик исходящих управляющих связей.

- [ ] **Step 3: Свернуть диагностику**

`renderEngineResultCard()` вернуть как закрытый `<details>` с коротким `<summary>`.

- [ ] **Step 4: Уменьшить опасную зону**

Удаление ноды оставить отдельным компактным действием с предупреждающим цветом, но без огромной кнопки на всю ширину.

- [ ] **Step 5: Нормализовать размеры**

В CSS задать общую высоту 28–30 px для обычных button/input/select, одинаковые радиусы 6–8 px и единый шаг вертикальных отступов.

- [ ] **Step 6: Commit**

```bash
git add src/ai-node-editor/main-ux.ts src/ai-node-editor/ai-node-editor-ux.css src/ai-node-editor/human-node-ui.css
git commit -m "style: redesign node inspector hierarchy"
```

### Task 6: Добавить изменяемые и постоянные ширины панелей

**Files:**
- Modify: `src/ai-node-editor/main-ux.ts`
- Modify: `src/ai-node-editor/ai-node-editor-ux.css`

**Interfaces:**
- Extends `EditorUiState`:

```ts
paletteWidth: number;
inspectorWidth: number;
```

- Produces CSS variables:

```css
--palette-width
--inspector-width
```

- [ ] **Step 1: Добавить константы и state**

```ts
const MIN_GRAPH_WIDTH = 520;
const PALETTE_MIN_WIDTH = 180;
const PALETTE_DEFAULT_WIDTH = 228;
const PALETTE_MAX_WIDTH = 420;
const INSPECTOR_MIN_WIDTH = 260;
const INSPECTOR_DEFAULT_WIDTH = 300;
const INSPECTOR_MAX_WIDTH = 520;
```

- [ ] **Step 2: Загружать и ограничивать сохранённые ширины**

Добавить поля в defaults и использовать `clamp()` при чтении `localStorage`.

- [ ] **Step 3: Передать CSS variables**

На `.compact-main` установить:

```html
style="--palette-width:${uiState.paletteWidth}px;--inspector-width:${uiState.inspectorWidth}px"
```

- [ ] **Step 4: Добавить разделители**

Палитра получает `data-resize-panel="palette"` на правой границе, инспектор — `data-resize-panel="inspector"` на левой.

- [ ] **Step 5: Реализовать Pointer Events**

На `pointerdown` сохранить исходный X и ширину. На `pointermove` менять CSS variable напрямую без `render()`. На `pointerup` сохранить `uiState`, убрать класс resize и выполнить один итоговый `render()`.

Динамический максимум должен сохранять минимум 520 px для графа с учётом второй открытой панели.

- [ ] **Step 6: Добавить CSS**

Сетки открытых панелей используют `var(--palette-width)` и `var(--inspector-width)`. Разделители имеют ширину 8 px, визуальную линию при hover/active и `cursor: col-resize`.

- [ ] **Step 7: Проверить smoke**

Run:

```bash
node scripts/ai_node_editor_ux_smoke.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ai-node-editor/main-ux.ts src/ai-node-editor/ai-node-editor-ux.css scripts/ai_node_editor_ux_smoke.mjs
git commit -m "feat: resize editor side panels"
```

### Task 7: Полная автоматическая проверка и визуальные снимки

**Files:**
- Modify if needed: `scripts/ai_node_editor_ux_smoke.mjs`
- Create outside git: `/mnt/data/ai-editor-refinement-visual/*`

**Interfaces:**
- Consumes: финальный exact feature HEAD.
- Produces: CI evidence and screenshots 1440×900.

- [ ] **Step 1: Запустить профильные проверки**

```bash
node scripts/ai_node_editor_ux_smoke.mjs
node scripts/ai_node_editor_v2_only_smoke.mjs
```

Expected: PASS.

- [ ] **Step 2: Запустить разрешённый PR Risk CI**

Проверить на точном HEAD:

- documentation/policy integrity;
- TypeScript;
- focused AI contracts;
- focused UI/editor contracts;
- production build.

- [ ] **Step 3: Подготовить визуальный стенд 1440×900**

Стенд должен повторять финальную сетку, CSS variables, палитру, единый инспектор, занятые выходы и меню исходящих связей.

- [ ] **Step 4: Сделать снимки**

```text
01-default-layout-1440x900.png
02-palette-dropdown.png
03-wide-palette-narrow-inspector.png
04-narrow-palette-wide-inspector.png
05-unified-inspector.png
06-outgoing-links-menu.png
```

- [ ] **Step 5: Проверить геометрию**

В отчёте подтвердить:

```json
{
  "viewport": { "width": 1440, "height": 900 },
  "horizontalOverflow": false,
  "verticalOverflow": false,
  "paletteDropdownPresent": true,
  "duplicateInspectorEditor": false,
  "outgoingMenuPresent": true
}
```

- [ ] **Step 6: Обновить PR**

Добавить новый exact HEAD, результаты CI и честное указание, являются ли снимки реальной собранной страницей или контролируемым визуальным стендом.

- [ ] **Step 7: Остановиться**

Не сливать PR и не выполнять новый Vercel-деплой без отдельного явного запроса.