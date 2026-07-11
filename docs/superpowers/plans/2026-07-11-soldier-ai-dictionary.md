# Soldier AI Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one interactive bilingual catalog and authoring workbench for soldier AI values, checks, actions, live explanations, map focus, safe memory, diagnostics, decision history and node creation.

**Architecture:** `AiConceptCatalog.ts` is the canonical English data contract with complete Russian overlay fields. One shared DOM panel is installed in both the tactical game and the node editor; adapters supply live values and mutations without coupling core AI to the DOM. Editor-only authoring tools store safe user memory and small bounded diagnostics/history records in browser storage.

**Tech Stack:** TypeScript, Vite, DOM/CSS, existing GraphRunner/localStorage bridge, Playwright, Node smoke checks.

## Global Constraints

- Work only in `real-wargame-preview` until explicit user GO for `main`.
- Canonical development names and base text are English.
- Every user-facing string has a complete Russian translation.
- Russian is the default UI language.
- Normal workflows require no source-code, JSON, Git or terminal editing by the user.
- Simplified and planned mechanics are visibly marked.
- Persistent controls are not rebuilt on each simulation tick.
- Browser decision history is bounded and must not recalculate tactical awareness.

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

### Task 5: Safe custom memory

- [x] Add a Russian-first wizard for boolean, numeric and text memory.
- [x] Generate safe `user_memory_N` keys automatically.
- [x] Write defaults into the real graph and expose compatible selectors.
- [x] Create configured flag, threshold and score nodes from the memory card.
- [x] Prevent deletion while graph nodes still reference the memory.

### Task 6: Human graph diagnostics

- [x] Detect unknown dictionary keys and recognized aliases.
- [x] Warn about placeholder or simplified checks, actions, searches and target selection.
- [x] Recommend the memory wizard for manually entered memory keys.
- [x] Let the user jump from a diagnostic to the relevant graph node.

### Task 7: Decision history

- [x] Store up to 20 unique recent runtime decisions in browser storage.
- [x] Show soldier, selected branch, explanation, leading scores and VETO status.
- [x] Translate saved blackboard keys through the canonical dictionary.
- [x] Add a clear-history action.

### Task 8: Verification and documentation

- [x] Add Node smoke coverage for the dictionary and authoring workbench.
- [x] Add Playwright game/editor dictionary interaction and screenshots.
- [x] Add Playwright custom-memory, diagnostics and decision-history coverage.
- [x] Verify the first dictionary release on `real-wargame-preview` with full build and real-browser screenshots.
- [ ] Verify the authoring-workbench completion branch with full build and real-browser screenshots.
- [ ] Transfer the verified completion commit to `real-wargame-preview`.

Temporary GitHub branches may remain when the connected GitHub interface does not provide branch deletion. This is reported as cleanup debt rather than hidden or falsely marked complete.
