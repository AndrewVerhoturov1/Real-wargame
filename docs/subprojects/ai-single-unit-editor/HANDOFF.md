# HANDOFF — AI Single-Unit Runtime

Updated: 2026-07-12  
Repository: `AndrewVerhoturov1/Real-wargame`  
Normal working branch: `real-wargame-preview`  
Current isolated implementation: draft PR `#54` / `feature/ai-running-move-v1`

## Purpose

This file contains only the immediate continuation context. Canonical current status is generated from:

```text
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/STATUS.md
```

Do not use older handoff text as the source of current project state.

## Verified baseline

Stateful AI Runtime v1 is present in the preview baseline:

- `AiGraphRunner` remains the pure immediate Utility evaluator;
- `AiGraphRuntime` stores serializable execution state across ticks;
- lifecycle supports `start / update / complete / cancel`;
- `SequenceWithMemory` resumes the active child;
- `Wait` is the first resumable duration node;
- selected-soldier runtime state and live Russian diagnostics work;
- legacy immediate graphs remain compatible.

Last fully verified application commit recorded for this baseline:

```text
1dcf0a15d59cc8f4fe9d4c8435474c4612a63b6f
```

Recorded verification:

```text
Preview Core Checks: success
Preview Policy: success
Preview screenshots: success
Playwright: 13/13
PNG: 20
inspected: 26-ai-running-waiting-node.png
```

## Active next slice

Draft PR `#54` implements the first real multi-tick action:

```text
MoveToBlackboardPosition
```

Required behavior:

- freeze the Blackboard target when the action starts;
- emit movement start only once;
- return `running` across ticks without duplicating orders;
- identify AI-owned movement with an execution token;
- complete when the unit arrives;
- fail safely when target/route is invalid;
- cancel and clean only state owned by that execution;
- never delete a newer replacement order from the player or commander;
- expose Russian authoring controls and live diagnostics;
- preserve old graph behavior.

PR `#54` is not part of `real-wargame-preview` until separately reviewed and transferred.

## Read now for that task

1. `docs/subprojects/ai-single-unit-editor/STATUS.md`
2. `.agents/skills/real-wargame-ai-runtime/SKILL.md`
3. `docs/superpowers/specs/2026-07-11-ai-running-runtime-v1-design.md`
4. `docs/superpowers/plans/2026-07-11-ai-running-runtime-v1.md`
5. PR `#54` diff and its focused tests
6. `.agents/skills/real-wargame-local-preview/SKILL.md` before browser verification

## Core boundaries

- `AiGraphRunner.ts` does not import PixiJS, DOM, localStorage or `SimulationState`.
- `AiGraphRuntime.ts` owns resumable lifecycle, not game rendering or input.
- `AiGameBridge.ts` adapts pure AI to the selected live soldier.
- Execution state is separate from Blackboard.
- Soldier knowledge remains subjective.
- Territory safety is context, not enemy detection or current danger.
- Automatic AI execution remains limited to the selected soldier.
- No squad-level AI or army-wide runtime yet.

## Required checks for MoveToBlackboardPosition

```text
npm run runtime:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Browser verification must demonstrate:

- movement begins once;
- the node remains visibly `running` across ticks;
- the unit reaches the frozen target;
- complete/cancel clears only AI-owned movement;
- a replacement player order survives cancellation;
- fresh PNG belongs to the exact tested commit and is inspected.

## Do not do during continuation

- do not merge or write to `main`;
- do not claim PR `#54` is already in preview;
- do not replace Runtime with logic inside the Bridge;
- do not clear movement by action type alone;
- do not add squad AI, pathfinding rewrite or cover reservation to this slice;
- do not declare visual success from source inspection or workflow status alone.
