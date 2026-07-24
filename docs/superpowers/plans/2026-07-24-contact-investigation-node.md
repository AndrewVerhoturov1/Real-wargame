# Contact Investigation Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one stateful Graph v2 node, `InvestigateContact`, that selects, holds, switches, and completes investigation of subjective contacts while driving the existing search-attention effect.

**Architecture:** The node reads a bounded read-only snapshot of `unit.perceptionKnowledge.contacts` through `AiGraphTacticalHost`. A focused core module owns deterministic candidate scoring and state transitions; the graph runner only adapts inputs/outputs. Runtime state remains in node-scoped reserved Blackboard keys, and the editor receives a dedicated human-readable panel.

**Tech Stack:** TypeScript, Graph v2 contracts/runtime, existing AI Blackboard/session persistence, Vite smoke scripts, Vercel Preview gate.

## Global Constraints

- Source of truth remains `unit.perceptionKnowledge.contacts`; no second perception or threat-memory system.
- Do not alter contact evidence accumulation, stages, combat targeting, movement, posture, firing, suppression, or routes.
- Use existing `set_search_sector` and `ClearAttentionOverride` behavior.
- Process at most 24 subjective contacts per node execution; complexity `O(C)`.
- Preserve saved-graph compatibility and do not modify `real-wargame-preview` or `main`.
- All user-facing labels and explanations are Russian-first and all parameters must persist after reopening the node and reloading the editor.

---

### Task 1: Core investigation selector and tests

**Files:**
- Create: `src/core/ai/ContactInvestigation.ts`
- Create: `scripts/contact_investigation_node_smoke.ts`
- Create: `scripts/contact_investigation_node_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `AiInvestigationContactSnapshot`, `ContactInvestigationSettings`, `ContactInvestigationState`, `ContactInvestigationResult`.
- Produces `resolveContactInvestigation(settings, contacts, previousState, nowSeconds)`.

- [ ] Write failing scenarios for first selection, minimum hold, deterministic tie-breaking, urgent closer switch, fresh-fire switch, completion, timeout/cooldown, stale contacts, and no candidates.
- [ ] Run `npm run contact-investigation:smoke`; expect failure because the module and script do not exist.
- [ ] Implement bounded deterministic selection, node-state serialization helpers, diagnostics, and score normalization.
- [ ] Run `npm run contact-investigation:smoke`; expect all scenarios to pass.
- [ ] Commit the core selector and smoke harness.

### Task 2: Graph contract and runtime host integration

**Files:**
- Modify: `src/core/ai/contracts/AiNodeContractRegistry.ts`
- Modify: `src/core/ai/AiGraphRunnerLegacy.ts`
- Modify: `src/core/ai/AiGameBridgeLegacy.ts`
- Modify: `src/core/ai/AiGraphValidation.ts` only if existing generic validation does not cover the new contract.
- Extend: `scripts/contact_investigation_node_smoke.ts`

**Interfaces:**
- Add `AiGraphTacticalHost.listInvestigationContacts?: () => readonly AiInvestigationContactSnapshot[]`.
- Register node type `InvestigateContact`, category `action`, child policy `none`, instant lifecycle.
- The node emits exactly one `set_search_sector` effect on success and returns failure without attention effects when there is no candidate.

- [ ] Add failing graph-runtime tests for node success, Blackboard diagnostics, state persistence across executions, identified-contact handoff, and Selector fallback.
- [ ] Add the contract with safe defaults and numeric bounds.
- [ ] Extend the runtime host to publish only subjective contact fields plus distance and urgency derived from the unit's existing tactical memory.
- [ ] Execute `InvestigateContact` in the graph runner, persist reserved node-scoped state, write public diagnostics, and add trace reasons.
- [ ] Run `npm run contact-investigation:smoke`, `npm run attention-ai-nodes:smoke`, `npm run graph-v2:smoke`, and `npm run typecheck`; expect success.
- [ ] Commit graph/runtime integration.

### Task 3: Human editor panel and catalog persistence

**Files:**
- Create: `src/ai-node-editor/ContactInvestigationNodeControls.ts`
- Modify: `ai-node-editor.html`
- Modify: `scripts/ai_node_contract_ui_smoke.ts`
- Reuse: `src/ai-node-editor/node-contract-ui.ts` and the existing authoritative-friendly-form save path.

**Interfaces:**
- Dedicated visible panel for `InvestigateContact`.
- Main fields: minimum/completion stage, confidence, arc, age, urgent fire reaction.
- Hold/switch fields: minimum/preferred/maximum time, revisit delay, score advantage, absolute/relative closer thresholds.
- Collapsible advanced weights and visible `Сохранить параметры` button.

- [ ] Add failing UI contract assertions for catalog name, every visible field, default values, advanced section, and save authority.
- [ ] Implement the panel with immediate JSON synchronization and the existing `#save-node` action.
- [ ] Load the new module in `ai-node-editor.html`.
- [ ] Run `npm run node-contract-ui:smoke`, `npm run editor:smoke`, and `npm run typecheck`; expect success.
- [ ] Commit editor support.

### Task 4: Importable example and regression coverage

**Files:**
- Create: `public/ai-examples/contact-investigation.json`
- Modify: `scripts/contact_investigation_node_smoke.ts`
- Modify: `scripts/attention_ai_nodes_smoke.ts` only for shared attention regression assertions.

**Interfaces:**
- Example graph: `Root -> Selector -> InvestigateContact | ClearAttentionOverride`.

- [ ] Add failing validation/import assertions for the example graph.
- [ ] Add the minimal Graph v2 example with empty user Blackboard schema and safe defaults.
- [ ] Verify fixed/dynamic `SetSearchSector`, stationary/moving facing ownership, and old graphs remain unchanged.
- [ ] Run focused smokes, TypeScript, and production build.
- [ ] Commit example and regressions.

### Task 5: Exact-head verification and Preview

**Files:**
- Modify PR #167 description with exact tested SHA and evidence.

- [ ] Run the repository `PR Risk CI` against the exact feature HEAD.
- [ ] Confirm TypeScript, focused AI/perception/UI contracts, and production build are green.
- [ ] Deploy the exact feature HEAD through the documented manual Vercel exact-source path.
- [ ] Confirm `READY`, 22-preview-check gate or its current complete replacement, `index.html`, `ai-node-editor.html`, the example JSON, and `deployment-source.json`.
- [ ] Record deployment ID, URL, branch, and exact SHA in PR #167.
