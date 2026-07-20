# Ctrl Cell Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить контекстную плашку клетки, появляющуюся при удержании `Ctrl` и объясняющую активный тактический слой.

**Architecture:** Один DOM-контроллер владеет клавиатурой, положением плашки и жизненным циклом. Чистый построитель содержимого читает только готовые снимки и формирует компактную модель отображения. Для обзора и стоимости добавляются безопасные read-only функции, не запускающие подготовку полей.

**Tech Stack:** TypeScript 5, DOM/CSS, PixiJS 8 application shell, существующие typed-array tactical fields.

## Global Constraints

- Базовая ветка: `real-wargame-preview`, базовый коммит: `7b9e9f13ba451b472b31eca594650ba5c46dfc77`.
- Рабочая ветка: `feature/20260720-ctrl-cell-inspector`.
- UI не запускает полно-картовые расчёты, worker jobs или pathfinding.
- Данные опасности, скрытности, обзора и стоимости остаются субъективными для выбранного бойца.
- Плашка русская, чёткая, не масштабируется вместе с картой и не перехватывает указатель.
- Playwright и визуальные проверки не запускаются без отдельного разрешения.

---

### Task 1: Read-only prepared-field access

**Files:**
- Modify: `src/core/visibility/SelectedUnitVisibilityField.ts`
- Modify: `src/core/navigation/RouteCostWorkerClient.ts`

**Interfaces:**
- Produces: `readCachedUnitVisibilityField(state, unitId): SelectedUnitVisibilityField | null`
- Produces: `readReadyAsyncRouteCostFields(map, profile, tacticalContext): RouteCostFields | null`

- [ ] Add a visibility cache reader that returns only an already-built field and never calls `getUnitVisibilityField`.
- [ ] Add a route-cost ready reader that uses the existing request identity and never creates a runtime or starts a job.
- [ ] Verify through the smoke contract that the cell inspector imports only these read-only functions.

### Task 2: Pure cell-inspector content model

**Files:**
- Create: `src/ui/CellInspectorContent.ts`

**Interfaces:**
- Produces: `CellInspectorContent`, `CellInspectorMetric`, `CellInspectorLayer`
- Produces: `buildCellInspectorContent(state, layer, cellX, cellY): CellInspectorContent | null`
- Produces: formatting helpers for danger, stealth, positions, memory, info and route cost.

- [ ] Write content rules for each layer with at most four metrics.
- [ ] Select one or two strongest human-readable reasons from existing values.
- [ ] Distinguish concealment from ballistic protection.
- [ ] Return explicit pending/unavailable messages without requesting work.
- [ ] Keep all per-hover work `O(1)` except bounded candidate/contact lookup.

### Task 3: Ctrl interaction and DOM presentation

**Files:**
- Create: `src/ui/CellInspector.ts`
- Create: `src/cell-inspector.css`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `installCellInspector(state): () => void`

- [ ] Create one long-lived fixed-position `<aside>`.
- [ ] Show it only while `Ctrl` is held and the pointer is over the game canvas.
- [ ] Reposition inside viewport bounds.
- [ ] Refresh on cell movement and every 250 ms only while visible; skip DOM replacement when the content key is unchanged.
- [ ] Hide on keyup, pointerleave, blur, editor mode or missing selected unit where required.
- [ ] Remove listeners, stop timer and remove DOM on teardown.
- [ ] Install and destroy from `main.ts`.

### Task 4: Focused regression contract

**Files:**
- Create: `scripts/cell_inspector_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run cell-inspector:smoke`

- [ ] Assert the controller listens to `Control`, handles keyup/blur/pointerleave and returns symmetric teardown.
- [ ] Assert the content module covers `info`, `danger`, `positions`, `stealth`, `memory`, and `routeCost`.
- [ ] Assert cell inspector source does not call `getOrRequestAsyncRouteCostFields`, `getSelectedUnitVisibilityField`, pathfinding, or full-map loops.
- [ ] Assert CSS uses fixed DOM presentation and `pointer-events: none`.
- [ ] Add the focused script to `package.json`.

### Task 5: Verification and branch completion

**Files:**
- Review all changed files.

- [ ] Run `npm run cell-inspector:smoke`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run workspace:smoke`.
- [ ] Run `npm run navigation-overlay:smoke`.
- [ ] Run `npm run build`.
- [ ] Confirm no browser, Playwright, GitHub Actions or deployment was started.
- [ ] Commit and push the exact implementation head on the feature branch.
