# Soldier AI Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one interactive bilingual catalog for soldier AI values, checks, actions, live explanations, map focus and node creation.

**Architecture:** `AiConceptCatalog.ts` is the canonical English data contract with complete Russian overlay fields. One shared DOM panel is installed in both the tactical game and the node editor; adapters supply live values and mutations without coupling core AI to the DOM.

**Tech Stack:** TypeScript, Vite, DOM/CSS, existing GraphRunner/localStorage bridge, Playwright, Node smoke checks.

## Global Constraints

- Work only in `real-wargame-preview` until explicit user GO for `main`.
- Canonical development names and base text are English.
- Every user-facing string has a complete Russian translation.
- Russian is the default UI language.
- Normal workflows require no source-code, JSON, Git or terminal editing by the user.
- Simplified and planned mechanics are visibly marked.
- Persistent controls are not rebuilt on each simulation tick.

---

### Task 1: Catalog contract and audit

- [x] Write a failing static contract test.
- [x] Add the canonical concept catalog, aliases, statuses and validation.
- [x] Document the audit and language rules.
- [x] Re-run the contract test.

### Task 2: Shared interactive dictionary

- [x] Add search, categories, readiness/type filters and RU/EN switching.
- [x] Add live values, plain-language explanations and readiness limitations.
- [x] Update existing value nodes without rebuilding the whole dialog.

### Task 3: Tactical game integration

- [x] Add the dictionary to the existing top bar.
- [x] Build live snapshots from the real selected soldier.
- [x] Add map-layer/position focus and editor handoff.

### Task 4: Node editor integration

- [x] Add the same dictionary to the editor top bar.
- [x] Read the latest live soldier snapshot and runtime trace.
- [x] Insert and link preconfigured nodes without manual JSON.
- [x] Generate parameter selectors from the shared catalog.

### Task 5: Verification and documentation

- [x] Add Node smoke coverage.
- [x] Add Playwright game/editor interaction and screenshots.
- [ ] Run full build and smoke suite in CI.
- [ ] Inspect fresh real-browser screenshots.
- [ ] Transfer the verified commit to `real-wargame-preview` and clean the temporary branch.
