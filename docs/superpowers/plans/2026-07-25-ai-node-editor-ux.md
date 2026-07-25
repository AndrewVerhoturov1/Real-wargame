# AI Node Editor UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the soldier AI node editor compact and usable at 1440×900, with category filters and colors, persistent favorites, removable incoming links, and fully localized context menus.

**Architecture:** Keep the existing DOM-rendering editor and Graph v2 data model. Add a small editor-only preference/localization helper, then extend `main.ts` with bounded palette filtering and exact link-removal operations. Consolidate responsive CSS around a one-row 1440px layout and extend the existing smoke contract instead of adding a new test framework.

**Tech Stack:** TypeScript 5, Vite 5, browser DOM, CSS, localStorage, existing Node smoke scripts.

## Global Constraints

- Base commit is `3f745f2b0712f441c60aaa5896d8e8e2d4a0b0b1`.
- Work only on `feature/20260725-ai-node-editor-ux`.
- Do not modify `real-wargame-preview` or `main`.
- Do not change Graph v2 runtime semantics or graph JSON format.
- Favorites are global browser preferences and survive reload, import, export, reset, graph switching, and subgraph navigation.
- Russian mode must not show English context-menu commands.
- No new framework, worker, polling loop, recurring timer, map scan, or simulation work.
- Visual verification must use 1440×900 screenshots from the exact evaluated feature commit.
- Deployment and transfer remain separate explicit user permissions.

---

### Task 1: Editor preference and localization helper

**Files:**
- Create: `src/ai-node-editor/editor-ui-preferences.ts`
- Modify: `scripts/ai_node_editor_smoke.mjs`

**Interfaces:**
- Produces: `PALETTE_FAVORITES_STORAGE_KEY`, `loadFavoriteNodeTypes`, `saveFavoriteNodeTypes`, `getEditorText`, `getCategoryLabel`.
- Consumes: `LanguageMode` compatible string values (`ru | en | both`) and the existing finite node-definition type set.

- [ ] **Step 1: Extend the smoke contract with failing source assertions**

Add assertions that require:

```js
const preferences = readText('src/ai-node-editor/editor-ui-preferences.ts');
for (const needle of [
  'real-wargame.ai-node-editor.favorites.v1',
  'loadFavoriteNodeTypes',
  'saveFavoriteNodeTypes',
  'getEditorText',
  'getCategoryLabel',
]) expectContains(preferences, needle, `Editor preferences must contain: ${needle}`);
```

Also require the new file in `requiredFiles`.

- [ ] **Step 2: Run the focused smoke and confirm RED**

Run:

```text
npm run editor:smoke
```

Expected: failure because `editor-ui-preferences.ts` does not exist.

- [ ] **Step 3: Implement bounded favorite persistence and language text**

Create the helper with these public signatures:

```ts
export type EditorLanguageMode = 'ru' | 'en' | 'both';
export type EditorTextKey =
  | 'palette' | 'hide' | 'addNode' | 'inspector' | 'validate'
  | 'evaluate' | 'export' | 'import' | 'reset' | 'fit'
  | 'compact' | 'detailed' | 'all' | 'favorites' | 'searchNodes'
  | 'select' | 'addChildAction' | 'duplicate' | 'setLinkSource'
  | 'linkSourceToThis' | 'centerView' | 'unlinkOutgoing'
  | 'unlinkIncoming' | 'deleteNode' | 'removeLink';

export const PALETTE_FAVORITES_STORAGE_KEY = 'real-wargame.ai-node-editor.favorites.v1';

export function loadFavoriteNodeTypes(validTypes: ReadonlySet<string>): Set<string>;
export function saveFavoriteNodeTypes(favorites: ReadonlySet<string>): void;
export function getEditorText(key: EditorTextKey, mode: EditorLanguageMode): string;
export function getCategoryLabel(category: string, mode: EditorLanguageMode): string;
```

Rules:

- parse only JSON arrays of strings;
- filter against `validTypes`;
- return an empty set on malformed storage;
- store sorted unique strings;
- keep the Russian, English, and dual-language labels in one immutable table;
- do not write to graph storage.

- [ ] **Step 4: Run the focused smoke and confirm GREEN**

Run:

```text
npm run editor:smoke
```

Expected: pass.

- [ ] **Step 5: Commit**

```text
git add src/ai-node-editor/editor-ui-preferences.ts scripts/ai_node_editor_smoke.mjs
git commit -m "feat: add persistent editor favorites preferences"
```

---

### Task 2: Palette filtering, favorites, category colors, and localized controls

**Files:**
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/ai-node-editor/ai-node-editor-authoring.css`
- Modify: `src/ai-node-editor/ai-node-editor-visual-fix.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`

**Interfaces:**
- Consumes: Task 1 helper functions.
- Produces: `PaletteFilter`, `toggleFavoriteNodeType`, `setPaletteFilter`, `setPaletteSearch`, category-aware palette markup, language-aware toolbar and context-menu labels.

- [ ] **Step 1: Add failing smoke assertions for palette behavior**

Require these source markers in `main.ts`:

```text
PALETTE_FAVORITES_STORAGE_KEY
paletteSearch
paletteFilter
data-palette-filter
data-palette-favorite
toggleFavoriteNodeType
setPaletteFilter
setPaletteSearch
getEditorText
getCategoryLabel
```

Require these CSS markers:

```text
.palette-search
.palette-filter-row
.palette-filter
.palette-node-row
.palette-favorite
[data-category="flow"]
[data-category="condition"]
[data-category="action"]
```

- [ ] **Step 2: Run the focused smoke and confirm RED**

Run:

```text
npm run editor:smoke
```

Expected: missing palette and localization markers.

- [ ] **Step 3: Extend editor state and load favorites once**

In `main.ts`:

```ts
type PaletteFilter = 'all' | 'favorites' | AiNodeCategory;

interface EditorUiState {
  // existing durable fields
  paletteFilter: PaletteFilter;
}

let paletteSearch = '';
const validNodeTypes = new Set(Object.keys(AI_NODE_TYPE_DEFINITIONS));
let favoriteNodeTypes = loadFavoriteNodeTypes(validNodeTypes);
```

Persist `paletteFilter` in the existing UI state. Keep `paletteSearch` in memory only.

- [ ] **Step 4: Render compact search, filters, favorite stars, and empty state**

The palette renderer must:

- build category filters only for categories with definitions;
- filter definitions by active category/favorites and case-insensitive search across type, English label, Russian label, and both descriptions;
- render each result as a row with a separate add-node button and star button;
- add `data-category` attributes for styling;
- render a localized empty-state message when no nodes match;
- keep star clicks separate from add-node clicks.

- [ ] **Step 5: Localize touched controls and context menu**

Replace hard-coded user-facing labels in the top bar, graph toolbar, palette/inspector headings, rails, and context menu with `getEditorText`.

In Russian mode, the context menu source must not contain mixed labels such as:

```text
Select / выбрать
Add child Action
Duplicate
Center view
Unlink all children
Delete
```

Developer-facing ids and node types remain English.

- [ ] **Step 6: Install event handlers without drag/pan leakage**

Add handlers for:

```ts
[data-palette-filter]
[data-palette-favorite]
#palette-search
```

Star handlers must call `event.preventDefault()` and `event.stopPropagation()`, update the set, save it immediately, and re-render without adding a node.

Search input should update the palette without writing graph state.

- [ ] **Step 7: Add stable category accents**

Use CSS custom properties per category. Palette filters, palette rows, graph-node borders, and type chips consume the same category accent. Keep visible text labels for every category.

- [ ] **Step 8: Run focused smoke and typecheck**

Run:

```text
npm run editor:smoke
npm run typecheck
```

Expected: both pass.

- [ ] **Step 9: Commit**

```text
git add src/ai-node-editor/main.ts src/ai-node-editor/ai-node-editor-authoring.css src/ai-node-editor/ai-node-editor-visual-fix.css scripts/ai_node_editor_smoke.mjs
git commit -m "feat: add filtered colored AI node palette"
```

---

### Task 3: Exact incoming-link removal and dangling-binding cleanup

**Files:**
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/ai-node-editor/ai-node-editor-authoring.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`

**Interfaces:**
- Produces: `getIncomingFlowParents`, `removeTypedInputBinding`, `removeIncomingFlowLink`, `removeAllIncomingLinks`, connected input markup and exact unlink controls.
- Preserves: parent `children` arrays for flow links and target `inputBindings` for typed data links.

- [ ] **Step 1: Add failing smoke assertions for unlink behavior**

Require source markers:

```text
getIncomingFlowParents
removeTypedInputBinding
removeIncomingFlowLink
removeAllIncomingLinks
data-unlink-data-input
data-unlink-flow-parent
inputBindings[inputPortId]
binding.nodeId !== deleting
```

Require CSS markers:

```text
.node-input-link-control
.node-data-port.connected
.node-port.in.connected
.incoming-link-menu
```

- [ ] **Step 2: Run the focused smoke and confirm RED**

Run:

```text
npm run editor:smoke
```

Expected: missing unlink functions and markup.

- [ ] **Step 3: Render occupied typed inputs with one-click removal**

For every contract input:

- resolve `node.inputBindings[port.id]`;
- when `source === 'node'`, mark the port connected;
- include source node/port in the title;
- render a localized remove button with `data-unlink-data-input`;
- remove exactly the selected binding and save graph state.

- [ ] **Step 4: Render incoming flow state and exact parent removal**

Implement:

```ts
function getIncomingFlowParents(nodeId: string): EditableAiNode[];
function removeIncomingFlowLink(parentId: string, childId: string): void;
function removeAllIncomingLinks(nodeId: string): void;
```

With one parent, the input-side remove control deletes that exact parent-child edge. With several parents, open a compact menu listing each parent plus an explicit remove-all command.

- [ ] **Step 5: Clean dangling typed bindings when deleting a node**

When deleting node `deleting`, iterate remaining nodes and rebuild input bindings so any binding with `source === 'node' && binding.nodeId === deleting` is removed. Preserve non-node bindings and bindings to other nodes.

- [ ] **Step 6: Prevent unlink controls from dragging nodes**

Update port-event detection and handlers so unlink buttons and incoming-link menus stop pointer propagation and never initiate node drag or workspace pan.

- [ ] **Step 7: Run focused checks**

Run:

```text
npm run editor:smoke
npm run node-contract-ui:smoke
npm run typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit**

```text
git add src/ai-node-editor/main.ts src/ai-node-editor/ai-node-editor-authoring.css scripts/ai_node_editor_smoke.mjs
git commit -m "feat: remove AI graph links from node inputs"
```

---

### Task 4: 1440×900 layout consolidation and production verification

**Files:**
- Modify: `src/ai-node-editor/navigation-profile-editor.css`
- Modify: `src/ai-node-editor/directional-terrain-responsive.css`
- Modify: `src/ai-node-editor/ai-node-editor-visual-fix.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`
- Optionally create visual scenario only in an already-approved existing visual harness; do not create or modify a workflow without separate approval.

**Interfaces:**
- Produces: one-row navigation at 1440px, bounded panel widths, no page-level overflow, exact screenshot evidence.

- [ ] **Step 1: Add failing layout contract assertions**

Require CSS markers proving:

```text
@media (max-width: 1500px)
.navigation-profile-tabs
.navigation-profile-main-tabs
.ai-editor-shell.palette-open.inspector-open .compact-main
body { overflow: hidden; }
```

Also reject the old 1440-hostile behavior that assigns the global action group to a second row and reduces editor height to `calc(100vh - 90px)` under 1600px.

- [ ] **Step 2: Run editor smoke and confirm RED**

Run:

```text
npm run editor:smoke
```

Expected: old responsive markers still present or new compact markers absent.

- [ ] **Step 3: Consolidate responsive navigation**

At widths from 1180px through 1500px:

- keep navigation in one row;
- allow only the main tab strip to scroll horizontally;
- keep application actions visible on the right;
- reduce button height/padding;
- keep the editor shell height at `calc(100vh - compact-header-height)`;
- do not create a second global-action row.

- [ ] **Step 4: Tune editor panel widths and workspace controls**

At 1440px use approximately:

```text
palette: 220–232px
inspector: 292–308px
collapsed rail: 34–38px
```

Hide the long help sentence before it forces overflow. Keep zoom, fit, detail, and language controls visible.

- [ ] **Step 5: Run the complete non-browser verification matrix**

Run:

```text
npm run editor:smoke
npm run node-contract-ui:smoke
npm run typecheck
npm run build
```

Expected: all pass; build contains both required pages.

- [ ] **Step 6: Perform exact-commit visual verification at 1440×900**

Using the repository-approved browser route and the exact feature commit:

1. open `/ai-node-editor.html` at 1440×900;
2. capture the full editor with palette and inspector open;
3. filter to one category and capture it;
4. star a node, switch to favorites, reload, and capture the persisted favorite;
5. create a typed connection and capture the connected input unlink control;
6. open the context menu in Russian mode and capture it;
7. assert in the browser that:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
document.documentElement.scrollHeight === document.documentElement.clientHeight
```

Inspect every screenshot for clipping, overlap, unreadable text, accidental English labels, and missing controls.

- [ ] **Step 7: Correct visual defects in one package and rerun focused checks**

Make one aggregated correction pass, then repeat Step 5 and Step 6 on the new exact commit. Do not reuse screenshots from the previous product commit.

- [ ] **Step 8: Commit final corrections**

```text
git add src/ai-node-editor/navigation-profile-editor.css src/ai-node-editor/directional-terrain-responsive.css src/ai-node-editor/ai-node-editor-visual-fix.css scripts/ai_node_editor_smoke.mjs
git commit -m "fix: fit AI node editor into 1440 by 900"
```

---

## Final Review

- [ ] Review the full base-to-head diff.
- [ ] Confirm favorites never enter graph JSON.
- [ ] Confirm deleting a node removes typed references to it.
- [ ] Confirm Russian context menu contains no English commands.
- [ ] Confirm no recurring listener, timer, worker, queue, or simulation change was introduced.
- [ ] Record exact checks, exact screenshot commit, screenshot files, and whether deployment was or was not separately authorized.
- [ ] Do not transfer to `real-wargame-preview` without explicit user approval.
