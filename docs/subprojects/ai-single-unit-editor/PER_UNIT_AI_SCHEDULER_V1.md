# Per-Unit AI Scheduler v1

Status: implemented only in draft PR #127 on `agent/per-unit-ai-scheduler-v1`; not yet accepted into `real-wargame-preview`.

## Canonical contract

```text
UI selection controls inspection only.
SimulationTick owns gameplay advancement.
AiSimulationScheduler owns graph-controlled unit execution.
```

`selectedUnitId`, `selectedUnitIds`, camera state, cursor state, visible layers and open panels do not decide which soldier receives gameplay AI updates.

Pause belongs to the outer application loop:

```text
paused Pixi ticker → does not call tickSimulation
explicit tickSimulation call → advances every simulation-owned subsystem
```

Therefore the UI actions `Один шаг` and `Рассчитать и выполнить` remain coherent while the board is paused: perception, subjective memory, graph runtime, route lifecycle, combat timers and movement all advance through the same explicit simulation step.

## Canonical phase order

`tickSimulation` owns the only normal gameplay path:

```text
capture cycle start in simulation time
→ increment simulationStep and simulation time
→ physical metrics and state labels
→ perception for all units
→ subjective threat-memory synchronization for all units
→ resolve one immutable graph snapshot
→ one stable AiSimulationScheduler pass
→ automatic combat and active fire actions
→ movement/order integration
→ simulation event publication
→ collision resolution
```

This order lets graph Blackboard reads observe current personal contacts and threat memory, while graph effects can influence combat and movement in the same explicit simulation step.

## Eligibility and ownership policy

`UnitModel.aiControl` is a serialized explicit contract:

- `graph` — eligible for autonomous low-level graph behavior;
- `manual` — never mutated by the scheduler.

Missing legacy values normalize to `graph` for scene compatibility. Canonical scene units and editor-created units explicitly declare `graph`. Externally scripted performance fixtures explicitly declare `manual`.

A high-level player command may coexist with graph-owned low-level execution. The scheduler must not erase that command arbitrarily, and stale graph cleanup may clear only an order with the matching action owner token.

## First decision, ordinary cadence and reactive cadence

A new or reset graph-controlled unit receives its first decision on the first explicit `tickSimulation` call, including a zero-duration step.

After that:

- ordinary graph decisions are due every 600 ms of simulation time;
- Blackboard observers are polled every 60 ms of simulation time;
- an observer event may wake the runtime immediately at that poll timestamp;
- ordinary and reactive work at one timestamp are coalesced into one decision;
- overdue work is processed chronologically inside the simulation interval;
- work limits are independent, so observer polling cannot starve ordinary decisions and ordinary decisions cannot starve observer polling.

The outcome depends on the simulation interval, not renderer FPS. Splitting 600 ms into `60 × 0.01`, `6 × 0.1` or `1 × 0.6` produces the same gameplay state, event queue, observer registry, counters and runtime state.

## Scheduler complexity and graph resolution

`AiSimulationScheduler` performs one stable O(n) traversal of `SimulationState.units`.

- External per-unit facades validate membership once.
- Trusted scheduler bridge functions do not call `state.units.includes(unit)`.
- One immutable graph snapshot is resolved for the whole scheduler cycle.
- Local storage is read once per cycle; parse/normalization is reused while the raw graph revision is unchanged.
- Every eligible unit in the cycle receives the same frozen graph object.
- A changed raw graph is detected on the next simulation step and follows the existing runtime migration/normalization path.

`aiLastSimulationStep` prevents the same mutable unit runtime from being processed twice in one simulation step.

## Read-only diagnostics

The selected-unit bridge APIs are diagnostic facades only:

- `evaluateNow()`;
- `tickNow()`;
- `previewCancelNow()`.

They execute against a detached JSON-compatible clone of `SimulationState`. They may return a diagnostic result and publish diagnostic trace output, but they do not mutate the original:

- `UnitModel` or `behaviorRuntime`;
- `AiRuntimeSession`, Blackboard memory, event queue or observer registry;
- orders, plans, route state or cooldowns;
- gameplay ownership or simulation timers.

There is no selected-unit gameplay cancellation entry point. Gameplay cancellation remains simulation-owned and follows normal owner-token rules.

## Threat-memory scope

The scheduler PR does not perform post-movement tactical-memory refreshes.

Observer-relative `directionDegrees` and `rangeCells` for remembered `unit:*` contacts may be derived when subjective memory is synchronized, but they are excluded from the semantic `tacticalKnowledge.revision` fingerprint. Moving the observer alone therefore does not look like new danger knowledge and cannot trigger a navigation replan.

Canonical world-unit danger identity remains based on world contact data; observer-relative direction/range do not enter the canonical danger-field identity.

## Runtime ownership

Each graph-controlled unit keeps its own:

- `AiRuntimeSession` and Blackboard memory;
- graph execution state, cooldowns and state/plan timers;
- observer registry and event queue;
- route status state;
- graph-owned `MoveOrder.ownerToken`;
- active plan and cancellation lifecycle.

Movement cleanup clears only matching owner tokens. A replacement player order or another soldier's action cannot be removed by stale graph cleanup.

## UI semantics

The Pixi ticker checks the outer pause state before calling `tickSimulation`. Rendering continues while paused.

The UI gameplay buttons call `tickSimulation(state, 0.1)` and therefore advance all eligible units through the canonical scheduler. They do not force only the selected soldier. The selected-unit button is named `Диагностика ИИ (без изменений)` and uses the read-only diagnostic facade.

## Permanent CI

`Combat Foundation Core` includes a blocking step:

```bash
npm run ai-scheduler:smoke
```

The workflow path matrix explicitly includes scheduler, bridge, simulation, behavior, unit-model, smoke and package files. A red scheduler smoke makes the workflow red, and its log is uploaded with the other combat-foundation artifacts.

## Verification

`npm run ai-scheduler:smoke` proves:

- paused explicit simulation-step coherence and outer Pixi pause gating;
- deep diagnostic immutability for evaluate, tick and cancel preview;
- one O(n) unit pass without trusted membership scans;
- one frozen graph resolution per scheduler cycle and next-step graph revision detection;
- partition invariance for `60 × 0.01`, `6 × 0.1` and `1 × 0.6`;
- first-step decision and inclusive 600 ms ordinary cadence;
- 60 ms observer polling and deterministic reactive wake-up;
- identical gameplay for selected A, selected B, no selection and both group-selection orders;
- independent concurrent runtime sessions;
- graph-owned movement continues after deselection and advances to the next node;
- an unselected unit reacts to danger through normal simulation ticks;
- exactly-once processing inside one simulation step;
- observer movement does not churn semantic tactical-knowledge revision;
- explicit `graph`/`manual` ownership and preservation of a high-level player command;
- permanent blocking CI coverage.
