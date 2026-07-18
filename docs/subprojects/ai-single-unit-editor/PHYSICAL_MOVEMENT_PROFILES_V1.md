# Physical Movement Profiles v1

## Status

This contract is implemented in draft PR #132 and is designed to be the shared core contract for the visual movement-profile editor from PR #133 and the order/AI adapters from PR #134. Those branches are not merged or copied wholesale here.

`SimulationTick.ts` remains the only coordinate integrator. Navigation chooses the route; physical movement executes that route. The physical runtime does not import PixiJS, DOM, browser storage or selected-unit presentation state.

## Canonical profile IDs

The built-in physical profile IDs are:

```text
normal_walk
stealth_move
crouched_move
run
sprint
crawl
```

Legacy and parallel-worker IDs are normalized at the boundary:

```text
normal  → normal_walk
stealth → stealth_move
rapid   → run
fast    → run
assault → run
low     → crawl
```

`assault` remains a tactical preset name, not a physical profile. Its physical selection is `run`. `sprint` is a separate short-duration profile or an explicit AI override.

A profile ID and a gait are separate values. The fixed physical gaits are:

```text
crawl
crouch_walk
walk
run
sprint
```

A custom profile may choose any preferred gait without creating a new gait enum.

## One editor/runtime profile contract

The pure core contract is split by responsibility:

```text
MovementProfileTypes.ts
MovementProfileDefaults.ts
MovementProfileNormalization.ts
MovementProfileRegistry.ts
MovementProfiles.ts             # public barrel
```

The profile editor and runtime must use the same `MovementProfile` shape:

```text
MovementProfile
├── identity and labels
├── preferredGait
├── stancePolicy
├── fallbackProfileId
├── templateProfileId
├── category / sortOrder / revision
└── settings
    ├── speed
    ├── stamina
    ├── visibility
    ├── noise
    ├── attention
    ├── weapon
    ├── restrictions
    └── surface
```

Every user-tunable numeric coefficient used by physical movement is stored in `settings` and can be exposed by the visual editor.

### `settings.speed`

- `speedMultiplier`;
- `startDelaySeconds`;
- `stopDelaySeconds`;
- `stanceChangeSeconds`;
- `minimumSpeedMetersPerSecond`;
- `lowStaminaSpeedMultiplier`.

### `settings.stamina`

- `drainPerSecond`;
- `recoveryPerSecond`;
- `minimumToStart`;
- `fallbackThreshold`;
- `resumeThreshold`.

### `settings.visibility`

- `movementVisibilityMultiplier`;
- `usesStealthSkill`;
- `stealthSkillShare`;
- `lateralMovementMultiplier`;
- `openTerrainExposureBonus`.

### `settings.noise`

- `loudness`;
- `eventSpacingMeters`;
- `fatigueMultiplier`;
- `surfacePolicy`.

### `settings.attention`

- `focusMultiplier`;
- `directAttentionMultiplier`;
- `peripheralMultiplier`;
- `rearAwarenessMultiplier`;
- `stationaryTargetDetectionMultiplier`;
- `movingTargetDetectionMultiplier`;
- `scanSpeedMultiplier`.

### `settings.weapon`

- `allowFireWhileMoving`;
- `allowReloadWhileMoving`;
- `readyDelayAfterStopSeconds`;
- `aimPreparationMultiplier`;
- `weaponPreparationPenalty`.

### `settings.restrictions`

- `maximumWoundSeverity`;
- `allowedWhileSuppressed`;
- `maximumSuppressionPercent`;
- `minimumPhysicalCapability`;
- `minimumSoldierSpeedMetersPerSecond`;
- `fallbackRule`.

### `settings.surface`

- `materialSpeedMultiplier`;
- `materialNoiseMultiplier`.

The runtime contains no second numeric gait table. Gait code keeps only hard structural relationships that are not editor tuning:

```text
crawl        → prone
crouch_walk  → crouched
sprint       → standing
```

All speed, stamina, perception, visibility, noise and weapon-delay numbers come from the resolved profile. Runtime diagnostics retain `gaitMultiplier: 1` so an accidental hidden multiplier is visible to tests and tooling.

## Runtime ownership and authority

Every unit owns a `MovementRuntimeState` with separate requested and effective state:

- requested profile ID and requested gait;
- requested authority source;
- effective profile ID, actual gait and effective authority source;
- stamina and motion diagnostics;
- `forcedFallbackReason`;
- `migrationInfo`;
- distance-based sound accumulation;
- intent-owned weapon preparation.

Canonical authority sources are:

```text
hard_safety
ai_override
player_order
unit_role
default
```

`fallback` and `migration` are not authority sources. A physical restriction changes only effective execution:

```text
requestedProfileId / requestedGait / requestedProfileSource → preserved
effectiveProfileId / actualGait / effectiveProfileSource   → constrained
forcedFallbackReason                                        → explicit
active MoveOrder                                             → preserved
```

Legacy source names are migrated explicitly:

```text
ai        → ai_override
player    → player_order
unit      → unit_role
fallback  → hard_safety + migrationInfo
migration → default + migrationInfo
```

## Deterministic speed and stamina

Physical distance uses profile-owned factors:

```text
base unit speed
× profile speed multiplier
× posture
× physical capability
× wound factor
× integrated low-stamina multiplier
× material-provider speed
× profile surface multiplier
```

There is no independent numeric gait multiplier.

When stamina crosses `fallbackThreshold` inside a tick, the runtime analytically divides that tick between the requested and fallback profiles. Coarse and fine tick partitions therefore produce equivalent stamina and distance. The requested profile resumes only at `resumeThreshold`, which prevents oscillation at the fallback boundary.

Wound, suppression, physical-capability and minimum-speed restrictions are evaluated before translation. Their values come from `settings.restrictions`; the runtime only enforces bounded hard-safety behavior.

## Perception and movement sound

Perception reads actual movement rather than the mere existence of an order:

```text
not moving                 → stationary
crawl / crouch_walk / walk → walking
run / sprint               → running
```

Target movement visibility, stealth-skill contribution and lateral visibility use the effective profile. Observer attention channels and check cadence use `settings.attention`, including `scanSpeedMultiplier`.

Movement sound uses the existing perception-sound system. Events are accumulated by physical distance, not frames. The event interval and loudness are profile values. The same path produces the same sound count under different tick partitions.

When visual and movement-sound evidence identify the same unit in one simulation tick, the current visual contact has precedence. Sound cannot clear `visibleNow` or replace the exact visual position with an acoustic estimate.

## Weapon preparation lifecycle

There is no second weapon state machine. The existing `FireAction` remains authoritative for firing.

A moving-fire request that requires stopping creates a pending preparation owned by one concrete fire intent:

```text
ownerToken
contactId
orderIssuedAtMs
remainingSeconds
revision
```

The pending preparation:

- preserves the active move order;
- pauses translation only for its remaining duration;
- clears deterministically when the duration reaches zero, even without a repeated fire request;
- is cancelled when the target disappears;
- is cancelled when fire intent or fire permission is cancelled;
- is cancelled when a newer movement order replaces the order it was created for;
- cannot be removed by stale cleanup if owner, contact or revision no longer match;
- does not delete the route or active order.

If preparation completes partway through a simulation tick, movement may resume during the unblocked remainder of that tick.

## Serialization and migration

Scene export stores:

- the canonical movement-profile registry;
- requested profile ID, requested source and requested gait;
- effective runtime state;
- weapon preparation as `remainingSeconds`.

Absolute `weaponReadyAtSeconds` is never serialized because scene simulation time is not serialized as an equivalent clock origin. A save/load cycle continues only the remaining preparation duration.

Legacy unfinished preparation fields are normalized safely:

```text
weaponStopRequested
weaponReadyAtSeconds
```

They do not recreate an indefinite stop. The old absolute state is discarded and recorded through `migrationInfo.reason = runtime_normalization`.

Legacy profile IDs and legacy authority sources are migrated through explicit aliases. Custom profiles retain every unaffected settings group during normalization, registry updates and scene round trips.

## Material-profile boundary

Physical movement does not own a permanent terrain coefficient table. `MovementMaterialAdapter.ts` defines a pure provider boundary:

```text
MovementMaterialProfileProvider
  input: state, unit, position, profile
  output: passable, speedMultiplier, noiseMultiplier, visibilityMultiplier
```

`SimulationState.movementMaterialProfileProvider` is `null` until an integrator connects the canonical material profiles from PR #130.

An explicit `resolveLegacyMovementMaterialFactors` fallback preserves current road/rough/swamp/water and vegetation behavior only for compatibility. New coefficients must not be added to this fallback. Tests distinguish `material_profile_provider` from `legacy_fallback`.

The boundary preserves these invariants:

- no A* call from physical movement;
- passability remains separate from numeric speed;
- `SimulationTick.ts` remains the only coordinate integrator;
- renderer and presentation settings never become simulation inputs.

## Editor and order adapters

The visual editor should import the pure core registry/types rather than maintain a second schema. Browser persistence remains outside `src/core`.

Order and AI integration should call:

```text
setMovementProfileRequest(state, unit, profileId, source, optionalGait)
```

Adapters may set requested profile/gait/source. They must not write `actualGait`, effective hard-safety state, stamina, diagnostics, weapon-preparation revisions or coordinates directly.

## Verification

The focused runner `npm run physical-movement:smoke` proves:

1. canonical IDs and every migration alias;
2. profile-owned speed ordering with no hidden gait multiplier;
3. custom numeric settings alter runtime behavior;
4. deterministic stamina, recovery and threshold crossing;
5. hard-safety fallback preserves requested state and active order;
6. distance-based sound partition invariance;
7. profile-owned visibility and attention, including scan cadence;
8. visual contact precedence over movement sound;
9. target disappearance and explicit fire cancellation clear preparation;
10. newer orders invalidate stale preparation;
11. stale cleanup cannot cancel newer intent-owned preparation;
12. preparation self-clears and movement resumes without another fire request;
13. save/load preserves remaining duration and never absolute readiness time;
14. legacy absolute preparation state is safely normalized;
15. all custom profile settings round-trip;
16. material provider and explicit legacy fallback are distinct;
17. UI selection cannot change physical results;
18. route replanning preserves the requested physical profile.

`Physical Movement Core` also runs tactical-order, routed-movement, route-status, AI movement bridge, perception, combat, scene/runtime serialization, production build and documentation checks when relevant order/AI/profile files change.

Visual QA is intentionally not part of this core follow-up.
