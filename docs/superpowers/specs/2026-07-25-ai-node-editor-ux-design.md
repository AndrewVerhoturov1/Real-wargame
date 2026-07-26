# AI Node Editor UX Design

## Goal

Adapt the soldier AI node editor for a 1440×900 desktop viewport, make the graph workspace dominant, improve node discovery and graph editing, and keep Russian mode fully Russian.

## Scope

The change affects only editor presentation and authoring interactions. It does not change Graph v2 runtime semantics, AI execution, node contracts, simulation, game UI, deployment policy, or graph JSON format.

## Baseline

- Base branch: `real-wargame-preview`
- Base commit: `3f745f2b0712f441c60aaa5896d8e8e2d4a0b0b1`
- Feature branch: `feature/20260725-ai-node-editor-ux`
- Target viewport: `1440 × 900` CSS pixels

## Layout

At 1440×900 the editor must fit inside the viewport without page-level horizontal or vertical scrolling.

- The application navigation remains one compact row.
- The graph toolbar remains inside the workspace and may hide nonessential help text when space is tight.
- The palette uses a compact width and its own scrolling.
- The inspector uses a compact width and its own scrolling.
- The graph workspace receives all remaining width and height.
- The bottom console remains collapsed by default and must not consume graph height until opened.
- Existing collapse controls for the palette and inspector remain available.

The design will consolidate responsive rules so the 1440px layout does not become a two-row header merely because the viewport is below 1600px.

## Palette filters and category colors

The palette receives:

- a text search field;
- an `Все` filter;
- one filter per non-empty node category;
- a `★ Избранное` filter;
- category-colored filter buttons and node rows;
- Russian category labels in Russian mode;
- English labels in English mode;
- both labels in dual-language mode.

Filtering is local and immediate. It scans only the static node-definition list, so its cost is `O(number of node types)` per input and does not affect simulation or recurring runtime work.

Each node category has one stable accent used consistently for:

- its palette filter;
- its palette row marker;
- its graph-node border and type badge.

Color is supplementary. Text labels remain present so the interface is not dependent on color alone.

## Favorites

Every palette row has a one-click star button.

- Filled star: the node type is in favorites.
- Empty star: the node type is not in favorites.
- Clicking the star must not add the node.
- Favorites are global editor preferences, not graph content.
- Favorites are stored under a dedicated versioned `localStorage` key.
- They survive page reload, graph import, graph export, graph reset, graph switching, and subgraph navigation.
- They disappear only when site data is explicitly cleared or when a future explicit clear-favorites command is used.
- Unknown node types from old storage are ignored and removed on the next save.

The stored set is bounded by the finite node-contract registry.

## Removing links from node inputs

The editor must support removing incoming links directly at the target node.

### Typed data input

A typed input has at most one node binding. When occupied:

- it is visually marked as connected;
- its title identifies the source node and source port;
- a small remove control appears next to the input label;
- activating that control deletes exactly that `inputBindings[inputPortId]` entry.

### Flow input

A node can have several incoming flow parents because flow edges are stored in parent `children` arrays.

- The flow input is visually marked when one or more parents point to the node.
- A small remove control opens a compact list when more than one incoming flow edge exists.
- With exactly one incoming flow edge, the control removes that edge directly.
- The list names every parent and allows removal of one exact edge.
- No action silently deletes every incoming flow edge unless the user explicitly chooses an `Удалить все входящие связи` command.

Deleting a node must also remove typed bindings in other nodes that reference the deleted node, preventing dangling data links.

## Context menu localization

All user-facing context-menu commands are selected from the active editor language mode.

Russian mode uses only Russian labels:

- `Выбрать`
- `Добавить дочернее действие`
- `Дублировать`
- `Назначить источником связи`
- `Связать источник с этой нодой`
- `Показать по центру`
- `Удалить исходящие связи`
- `Удалить входящие связи`
- `Удалить ноду`

English mode uses English labels. Dual-language mode may show `Русский / English` labels.

The same rule applies to the graph toolbar and panel headings touched by this work. Existing developer identifiers such as node type and id remain canonical English data.

## General usability corrections

- Replace ambiguous `+ Add node`, `Inspector`, `Fit`, `Compact`, `Evaluate`, `Export`, `Import`, and `Reset` labels with language-aware text.
- Keep destructive actions visually distinct.
- Shorten or hide the long toolbar help sentence at 1440px.
- Preserve keyboard focus styling on interactive controls.
- Give star and unlink controls clear accessible labels and titles.
- Prevent clicks on star/unlink controls from starting node dragging or graph panning.
- Do not add a new framework or duplicate the node-contract registry.

## State model

Extend editor UI state with transient palette selection:

- search query;
- active category or favorites filter.

Persist only durable preferences:

- favorites in a dedicated storage key;
- existing panel, zoom, language, and detail preferences in the existing UI key.

The search query is session-only and resets on page reload to avoid unexpectedly hiding nodes.

## Files

Primary changes:

- `src/ai-node-editor/main.ts`
- `src/ai-node-editor/ai-node-editor-authoring.css`
- `src/ai-node-editor/ai-node-editor-visual-fix.css`
- `src/ai-node-editor/directional-terrain-responsive.css`
- `src/ai-node-editor/navigation-profile-editor.css`
- `scripts/ai_node_editor_smoke.mjs`

A small focused helper file may be added if localization or favorites logic would otherwise make `main.ts` harder to review.

## Performance review

- Hot path: user-triggered editor render and palette filtering only.
- Worst-case complexity: linear in node definitions or graph nodes; no map-sized work.
- Main-thread work: bounded DOM replacement already used by the editor; search filters a finite registry.
- Full-map work: none.
- Shared prepared result: the existing `AI_NODE_TYPE_DEFINITIONS` remains the single node catalog.
- Invalidation identity: editor UI state and finite favorites set only.
- Worker/queue budget: not applicable.
- Cache memory bound: favorites contain at most one string per registered node type.
- Teardown: no recurring timers, workers, or new permanent document listeners.
- Measurement: focused smoke tests plus 1440×900 browser screenshots and interaction checks.

## Verification

Required non-browser checks:

1. `npm run editor:smoke`
2. `npm run node-contract-ui:smoke`
3. `npm run typecheck`
4. `npm run build`

Required visual checks at 1440×900:

1. full editor with palette and inspector open;
2. palette filtered by category;
3. favorites view with at least one starred node;
4. graph containing a connected typed input and visible unlink control;
5. Russian context menu;
6. confirmation that the page itself has no horizontal or vertical overflow.

Screenshots must come from the exact feature-branch implementation being evaluated. Visual evidence for another commit is invalid.

## Out of scope

- Graph runtime changes;
- new node types;
- undo/redo;
- keyboard shortcut system;
- automatic layout;
- minimap;
- mobile layout;
- deployment or transfer to `real-wargame-preview` without separate explicit permission.
