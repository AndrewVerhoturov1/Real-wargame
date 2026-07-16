# Physical Movement Profiles v1

## Status

This contract is implemented on draft PR #132 from exact `real-wargame-preview` base `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74`.

It is one isolated core/simulation result in a three-worker campaign. It does not include the profile editor or the final player-order/AI adapters.

## Boundary

Route planning and physical movement are different systems:

```text
NavigationProfile / NavigationMovementMode
  → where a path goes and how A* values candidate cells

MovementProfile / MovementGait / MovementRuntimeState
  → how a soldier physically travels along the already selected path
```

`SimulationTick.ts` remains the only coordinate integrator. The movement runtime never imports PixiJS, DOM, local storage or selected-unit UI state. It samples only the current core map cell and does not invoke A*.

## Core model

`MovementProfile` has a string ID. Built-in profiles are defaults, not a closed profile enum. The editor may add or replace registry entries through the pure registry contract.

```text
MovementProfile
├── movement
│   ├── preferred posture
│   ├── posture requirement
│   ├── speed multiplier
│   ├── start time
│   ├── stop time
│   └── automatic posture policy
├── stamina
├── signature
├── observation
├── weapon
└── restrictions
```

The fixed physical gaits are:

```text
crawl
crouch_walk
walk
run
sprint
```

A profile ID and a gait are separate values. For example, a custom profile `night_patrol` may request `walk` or `crouch_walk` without becoming a new gait.

## Runtime ownership

Every `UnitModel` owns one `MovementRuntimeState` with:

- requested and effective profile IDs;
- requested profile source and effective source;
- requested and actual gait;
- stamina;
- forced fallback reason;
- distance-based sound accumulator and sequence;
- moving/stopped state and current velocity;
- weapon-stop preparation state;
- speed, noise, visibility and observation diagnostics.

`currentAction` remains a coarse behavior/UI label and is not the source of physical gait.

## Physical speed

The movement step uses independent physical factors:

```text
base unit speed
× gait multiplier
× movement-profile multiplier
× posture multiplier
× physical ability
× wound multiplier
× integrated stamina multiplier
× current-cell physical surface multiplier
```

The current-cell multiplier is not an A* cost. Water remains impassable rather than becoming an extreme numeric slowdown. The implementation performs one bounded cell lookup per moving unit and does not rebuild route fields.

## Deterministic stamina

Run and sprint drain stamina. Slow movement has no drain and may recover a bounded amount. Stopped units recover according to the effective profile.

When a strenuous gait crosses its downgrade threshold inside a tick, the runtime analytically splits that tick into requested-gait and fallback-gait segments. Distance and stamina therefore remain equivalent for coarse and fine tick partitions, including a threshold crossing.

A fallback changes only effective execution:

```text
requested profile/gait → preserved
active MoveOrder       → preserved
actual gait            → safe fallback
source                  → fallback
```

The requested gait resumes only after its start threshold is available again. This avoids per-tick oscillation at the downgrade boundary.

## Posture arbitration

Hard physical relationships are enforced:

```text
crawl        → prone
crouch_walk  → crouched
sprint       → standing
```

For non-required posture, a manual or AI posture change is treated as an external decision and is not overwritten every tick. The movement runtime records the last posture it applied so that manual controls, AI graph posture effects and self-preservation logic remain separate authorities.

## Perception and observation

`PerceptionStimulus` reads actual movement, not the existence of an order:

```text
not moving                 → stationary
crawl / crouch_walk / walk → walking
run / sprint               → running
```

Target visibility includes the effective profile's movement signature and stealth-skill share. Lateral motion is derived from actual velocity relative to the observer rather than a constant value.

The moving observer keeps perception active. Its effective attention weights and check intervals are multiplied by the profile's focus, direct, peripheral and rear observation factors. Run and sprint reduce observation without setting any channel to zero.

## Movement sound

Movement uses the existing `PerceptionSound` system. Events are emitted when accumulated physical distance crosses the profile interval, not once per frame.

Each event has:

- a deterministic per-unit sequence ID;
- an interpolated point along the travelled segment;
- an interpolated simulation timestamp;
- profile loudness;
- the standard `movement` sound kind.

The same path creates the same number of movement events under different tick partitions.

## Weapon integration

There is no second weapon runtime.

A fire request queries the physical movement runtime before creating the existing `FireAction`:

```text
slow gait allowed by profile
  → existing FireAction may start

run / sprint or profile-disallowed moving fire
  → keep MoveOrder
  → request physical stop
  → wait profile/gait preparation delay
  → permit the existing FireAction
```

The active route remains paused while `FireAction` exists and can continue afterward. Starting a fire action no longer destroys the route merely to stop coordinate integration.

## Serialization and migration

Scene export v10 stores:

- the movement-profile registry;
- requested profile ID and gait per unit;
- movement runtime state.

Old scenes without these fields normalize to:

```text
profile: normal
gait: walk
stamina: 100
```

Custom profile definitions are serialized and restored. Unknown or malformed runtime fields use bounded safe defaults rather than silently removing the user's profile selection.

## Adapter for the profile-editor worker

The visual editor should use only core registry functions:

```text
createMovementProfileRegistry
resolveMovementProfile
upsertMovementProfile
serializeMovementProfileRegistry
```

It must not store a second browser-only profile schema. Human-facing labels use «Профили движения», «Способ движения» and «Фактическое движение».

## Adapter for the order/AI worker

The order and AI integration should call:

```text
setMovementProfileRequest(state, unit, profileId, source, optionalGait)
```

The adapter decides which command/graph policy selects the requested profile and gait. It must not write `actualGait`, stamina, diagnostics or coordinates directly.

## PR #130 integration note

PR #130 replaces legacy terrain/vegetation definitions with canonical environment material profiles and independent revisions. This branch intentionally does not import that isolated work.

The expected integration point is the single function that resolves the current-cell physical surface multiplier. During integration it should read PR #130's canonical movement material parameters while preserving these invariants:

- no A* call from physical movement;
- passability remains separate from numeric speed;
- `SimulationTick` remains the only coordinate integrator;
- material presentation settings never become simulation input.

`SimulationTick.ts`, `SceneExport.ts`, `SimulationState.ts` and map-profile imports are expected conflict files.

## Verification

The focused runner is:

```text
npm run physical-movement:smoke
```

It proves:

1. run is faster than walk;
2. sprint is faster than run;
3. stealth crouch movement is slower than walk;
4. crawl is the slowest primary gait;
5. coarse/fine tick partitions produce equivalent distance;
6. stamina drain and recovery are deterministic;
7. exhaustion falls back without deleting the order;
8. run and sprint become `running` stimuli;
9. stealth movement produces less visual evidence than run;
10. run has a stronger sound signature than stealth movement;
11. movement sound count is partition invariant;
12. sprint blocks immediate fire until stop preparation completes;
13. old scenes receive safe defaults and custom profiles round-trip;
14. selected-unit UI state cannot change physical results;
15. route replan preserves the active physical movement request.
