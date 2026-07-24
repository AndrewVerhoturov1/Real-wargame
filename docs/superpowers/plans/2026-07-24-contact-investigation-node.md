# Contact Investigation Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one stateful Graph v2 node, `InvestigateContact`, that selects, holds, switches, and completes investigation of subjective contacts while driving the existing search-attention effect.

**Architecture:** The node reads a bounded read-only snapshot of `unit.perceptionKnowledge.contacts` through the synchronous exact-unit `AiSimulationExecutionContext`. A focused core module owns deterministic candidate scoring and state transitions; `AiGraphRunner` adapts a successful choice to the existing `set_search_sector` effect. Runtime state remains in node-scoped reserved Blackboard keys, and the editor receives a dedicated human-readable panel.

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

- [x] Cover first selection, minimum hold, deterministic tie-breaking, urgent closer switch, fresh-fire switch, completion, timeout/cooldown, stale contacts, and no candidates.
- [x] Implement bounded deterministic selection, node-state serialization, diagnostics, and score normalization.
- [x] Add `npm run contact-investigation:smoke`.
- [x] Require the smoke in the complete Preview gate.
- [x] Pass intermediate exact-head TypeScript, AI/perception and production build checks in PR Risk CI #441.

### Task 2: Graph contract and runtime integration

- [x] Register `InvestigateContact`, category `action`, child policy `none`, instant lifecycle.
- [x] Read a subjective contact snapshot from the exact simulation context without global lookup or real-enemy access.
- [x] Derive distance and urgency only from existing subjective perception/tactical memory.
- [x] Adapt success to one `set_search_sector` effect.
- [x] Return failure without an attention effect when no contact is eligible.
- [x] Persist compact node-scoped state and public diagnostics.
- [x] Explain hold/switch/fallback decisions in trace.
- [x] Cover identified-contact handoff and Selector fallback in the runtime smoke.

### Task 3: Human editor panel and catalog persistence

- [x] Add catalog name «Доразведать контакт».
- [x] Add the dedicated visible panel with main, hold/switch and collapsible advanced settings.
- [x] Synchronize every field immediately with the node JSON.
- [x] Use the authoritative friendly-panel save path and visible `Сохранить параметры` button.
- [x] Load the module in `ai-node-editor.html`.
- [x] Extend UI contract smoke for labels, defaults, catalog registration and save authority.
- [ ] Pass final exact-head UI/editor and TypeScript checks.

### Task 4: Importable example and regression coverage

- [x] Add `public/ai-examples/contact-investigation.json`.
- [x] Use `Root -> Selector -> InvestigateContact | ClearAttentionOverride`.
- [x] Keep the user Blackboard schema empty; internal state is automatic.
- [x] Add strict Graph v2 validation to the contact-investigation smoke.
- [ ] Pass final exact-head attention/Graph v2 regressions and production build.

### Task 5: Exact-head verification and Preview

- [ ] Run final `PR Risk CI` against the exact feature HEAD.
- [ ] Confirm TypeScript, contact-investigation, AI/perception/UI contracts and production build are green.
- [ ] Deploy the exact HEAD through the documented Vercel exact-source path.
- [ ] Confirm `READY`, complete Preview gate, `index.html`, `ai-node-editor.html`, example JSON and `deployment-source.json`.
- [ ] Record deployment ID, URL, branch and exact SHA in PR #167.
