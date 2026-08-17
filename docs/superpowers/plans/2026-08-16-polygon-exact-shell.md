# Polygon Exact Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the visible Polygon shell match the attached HTML prototype closely, with a light prototype-style central placeholder instead of the live product map.

**Architecture:** Preserve the existing Combat Lab runtime and workspace host contracts, but keep them hidden from this visual pass. The visible layer is only the prototype-derived top chrome, left/right tab panels and a non-interactive central placeholder that masks the live canvas. No new domain state is introduced.

**Tech Stack:** TypeScript DOM UI, CSS, existing Combat Lab extension, Vite, Playwright/Chromium visual QA.

## Global Constraints

- Work only on `feature/20260816-polygon-arka-exact-shell`.
- Do not modify `real-wargame-preview` or `main`.
- Visual source of truth: attached `polygon-series-v1.1-memory-v3-interface-linkage(1).html`.
- No fake runtime/gameplay/history data.
- No selected-unit store, fake inspectors, fake event counts or standalone prototype JS state.
- Live map remains architecturally present but must be visually hidden in Polygon mode for this pass.
- Visible scope: top bar, 30 px history/status strip, left/right panels with tabs, central placeholder.

---

### Task 1: Lock exact visual contract in focused smoke tests

**Files:**
- Modify: `scripts/combat_lab_polygon_shell_contract_smoke.mjs`
- Modify: `scripts/combat_lab_workspace_layout_smoke.mjs` only if its previous map-visible assumption conflicts with the approved placeholder pass.

**Interfaces:**
- Consumes: current shell DOM/CSS strings.
- Produces: regression contract for placeholder map and prototype-derived geometry/tokens.

- [ ] Require visible `.polygon-shell-map-placeholder` and assert it is non-interactive.
- [ ] Require top chrome `58px + 30px`, left/right widths `372px / 336px`, gap `14px`.
- [ ] Require fine/large grid tokens equivalent to `20px` and `80px` rhythms.
- [ ] Require the product canvas/HUD/sidebar to be visually masked/hidden in Polygon mode.
- [ ] Preserve assertions forbidding demo event counts, fake history, old global tabs and old auxiliary tabs.

### Task 2: Build the prototype-style central placeholder

**Files:**
- Modify: `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`
- Modify: `src/combat-lab/polygon-shell.css`

**Interfaces:**
- Consumes: existing shell viewport and collapse-state classes.
- Produces: `.polygon-shell-map-placeholder` filling the central workspace below 88 px top chrome.

- [ ] Add one inert placeholder element to the shell viewport; no unit markers or fake map data.
- [ ] Mask the live `#app` canvas visually in Polygon mode without removing/destroying it.
- [ ] Style placeholder from prototype-derived warm grey-beige background and 20/80 px grid rhythm.
- [ ] Ensure placeholder remains correct when panels collapse and at 1080 px viewport width.

### Task 3: Tighten top bar, history strip and panel visual fidelity

**Files:**
- Modify: `src/combat-lab/polygon-shell.css`
- Modify: `src/combat-lab/polygon-shell-compat.css` only where shared product controls need prototype styling.
- Modify: `src/combat-lab/ui/CombatLabWorkspaceTabs.ts` only if compact grouping/labels require DOM changes.

**Interfaces:**
- Consumes: existing real run toolbar and shell-only buttons.
- Produces: prototype-like density, borders, shadows, typography and tab treatment.

- [ ] Match topbar control heights/padding/gaps to the prototype's compact rhythm.
- [ ] Match history strip surface/border/track treatment to the prototype while keeping real status and no demo counts.
- [ ] Match side-panel radius, border, shadow, header density and internal tab rows to the reference.
- [ ] Keep active tabs olive through hover/focus/click.
- [ ] Keep run controls visible after left-panel collapse.

### Task 4: Full verification and exact-SHA Preview

**Files:**
- No product files unless verification finds a defect.

**Interfaces:**
- Consumes: feature branch head.
- Produces: verified Vercel Preview with exact `deployment-source.json` identity.

- [ ] Run repository `verify:preview` through the approved exact-source deployment path.
- [ ] Require all isolated checks to pass and `skippedChecks` to be empty.
- [ ] Require production Vite build and deployment-page verification to pass.
- [ ] Publish Preview only, never production.

### Task 5: Fresh Chromium comparison loop

**Files:**
- Temporary CI-only `ci/**` branches/PR per repository screenshot skill; never merge them.

**Interfaces:**
- Consumes: exact deployed product SHA and attached prototype.
- Produces: fresh PNG evidence at `1600×900` and `1080×800` plus visual findings.

- [ ] Capture exact-SHA product screenshots in real Chromium.
- [ ] Render/capture the attached HTML prototype at the same viewport sizes.
- [ ] Compare center surface, top chrome density, panel geometry, tab treatment, borders, shadows and responsive composition.
- [ ] If a material mismatch remains, fix the product feature branch, redeploy changed SHA and repeat with fresh evidence.
- [ ] Close the temporary CI PR and report final SHA/URL/evidence.
