# Polygon Exact Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the previous reconstructed dark shell with the accepted HTML prototype's exact light floating-panel visual language while keeping only shell/menu/tab UI visible.

**Architecture:** Keep the existing `CombatLabWorkspaceTabs` public contract so `CombatLabExtension` continues to initialize current product owners. Rebuild only its visible DOM: top bar, left tab panel, right inspector panel and transparent map center. Product workspace hosts remain mounted in a hidden compatibility host. Style the shell with exact prototype tokens and geometry.

**Tech Stack:** TypeScript DOM UI, CSS, existing Combat Lab extension, Vite, Playwright/Chromium visual QA.

## Global Constraints

- Work only on `feature/20260815-polygon-arka-shell`.
- Do not change `real-wargame-preview` or `main`.
- No fake runtime/gameplay/history data.
- No second selected-unit store or global domain state.
- Existing product map remains the only map.
- Visible result contains only top shell controls plus left/right panel headers/tabs and blank panel bodies.
- Exact visual source: `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`.

---

### Task 1: Rebuild visible workspace shell DOM

**Files:**
- Modify: `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`
- Modify: `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`
- Test: `scripts/combat_lab_polygon_shell_contract_smoke.mjs`

**Interfaces:**
- Consumes: existing `CombatLabWorkspaceTabs.root`, `.status`, `.toggle`, `.toolbarHost`, `.hosts`, `activate()`, `isActive()`.
- Produces: same public interface, new visible prototype-faithful shell.

- [ ] **Step 1:** Update the focused smoke contract to require prototype workspace labels, prototype panel/header classes, hidden compatibility hosts and absence of the previous global primary-tab strip/timeline UI.
- [ ] **Step 2:** Confirm the updated smoke would fail against the current implementation.
- [ ] **Step 3:** Rebuild the visible DOM while preserving existing workspace host registration and tab-change events.
- [ ] **Step 4:** Keep all existing product hosts mounted under a hidden compatibility container; activate them logically but do not render old product panels visibly.
- [ ] **Step 5:** Run the focused contract through the Preview verification gate on the exact deployed source.

### Task 2: Port exact prototype visual tokens and geometry

**Files:**
- Modify: `src/combat-lab/polygon-shell.css`
- Modify: `src/combat-lab/polygon-shell-compat.css`
- Test: `scripts/combat_lab_polygon_shell_contract_smoke.mjs`

**Interfaces:**
- Consumes: visible classes from Task 1.
- Produces: 58px olive top bar, 372px/336px floating panels, light panel surface, internal tab treatment and collapse states.

- [ ] **Step 1:** Add smoke assertions for exact key values `58px`, `372px`, `336px`, `14px`, `#344321`, `#273318`, `#d8b941`, `#f6f5ee`.
- [ ] **Step 2:** Replace the dark-shell CSS with prototype-derived tokens and selectors.
- [ ] **Step 3:** Style existing run toolbar inside the top bar to match prototype controls without changing runtime behavior.
- [ ] **Step 4:** Style the existing shared app menu trigger as the prototype top-right `МЕНЮ` control and hide conflicting old shell chrome.
- [ ] **Step 5:** Preserve responsive/collapse behavior without reintroducing dark overlays or auxiliary tabs.

### Task 3: Remove obsolete visible shell content

**Files:**
- Modify: `src/combat-lab/main.ts` only if necessary to prevent visible placeholder content.
- Modify: `src/combat-lab/polygon-shell.css`
- Test: existing Combat Lab workspace smoke checks.

**Interfaces:**
- Consumes: hidden product hosts from Task 1.
- Produces: visually blank left/right content regions while keeping product initialization alive.

- [ ] **Step 1:** Verify Laboratory placeholder, quick parameters, editors, metrics/journal/batch panels and legacy manual controls are not visible in the shell.
- [ ] **Step 2:** Remove only visible placeholder installation if it can surface despite hidden hosts; do not delete product functionality.
- [ ] **Step 3:** Ensure no old diagnostics/sidebar/unit bar overlays remain visible.

### Task 4: Exact-SHA Preview and screenshot correction loop

**Files:**
- No product file unless a screenshot reveals a defect.

**Interfaces:**
- Consumes: exact feature SHA deployment.
- Produces: fresh visual evidence and final corrected Preview.

- [ ] **Step 1:** Run canonical `npm run verify:preview` through the repository-approved exact-source deployment route.
- [ ] **Step 2:** Deploy the exact feature SHA to the permanent Vercel project `repo` as Preview.
- [ ] **Step 3:** Capture real product screenshots at `1600×900` and a narrower desktop viewport using Playwright/Chromium.
- [ ] **Step 4:** Open and visually compare screenshots with the exact reference screenshot; inspect panel sizes, offsets, topbar, tabs, map visibility and legacy leakage.
- [ ] **Step 5:** If mismatches are visible, fix them on the same feature branch, redeploy the changed SHA and repeat screenshots.
- [ ] **Step 6:** Report final SHA, deployment URL, screenshot evidence and any remaining deviations.
