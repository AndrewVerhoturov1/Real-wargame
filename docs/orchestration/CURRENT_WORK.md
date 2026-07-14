# Current Chat-Orchestration Work

## System status

Chat-only orchestration v1 is installed.

The active route is:

```text
orchestrator
→ parallel ordinary ChatGPT workers
→ orchestrator comparison
→ one integrator
→ real-wargame-preview
```

Codex and Q/R/X/W modes are not part of this route.

## Current campaign

No implementation campaign has been started through this workflow yet.

## Recommended pilot

### Goal

Prove live replanning of an active route through the normal `SimulationTick` flow while preserving order ownership, target, navigation profile and final facing, and while respecting replan hysteresis.

This follows the current active subproject status after completion of the danger/suppression and unknown-fire slice.

### Suggested parallel workers

#### Worker 1 — primary implementation

Implement the complete live route-replan chain through the real simulation flow and provide reproducible changes.

Status: `ready`

#### Worker 2 — independent architecture

Independently inspect the current navigation/replan lifecycle, identify weaknesses in the obvious implementation and provide an alternative implementation or architecture-backed patch.

Status: `ready`

#### Worker 3 — end-to-end proof

Create or improve an end-to-end scenario that proves route replacement, preserved `ownerToken`, target, profile and final facing, accepted/rejected hysteresis, and no per-frame A* churn. Production changes are allowed when required for a valid test.

Status: `ready`

## Received results

None.

## Orchestrator decision

Not started.

## Integration

Not started.

## Final verification

Not started.

## Usage

1. Start a permanent orchestrator chat with `ORCHESTRATOR_PROMPT.md`.
2. Ask it to start the pilot or replace the pilot with another large goal.
3. Create separate worker chats from the prompts it returns.
4. Return worker results to the orchestrator.
5. Start a separate integrator chat with `INTEGRATOR_PROMPT.md` after the orchestrator compares the results.
