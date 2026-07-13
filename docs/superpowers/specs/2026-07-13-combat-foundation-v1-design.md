# Combat Foundation v1 — Design

## Goal

Create the smallest complete infantry firefight loop in Real-Wargame without bypassing the existing subjective perception, stateful AI runtime, terrain, cover, route, and attention systems.

The finished slice must support two hostile sides, independent perception for every active soldier, one minimal rifle and ammunition model, a stateful fire action, a ballistic ray separate from visual LOS, posture-aware hit shapes, and a minimal incapacitation result.

## Scope

Included:

- blue and red sides with explicit friendly/hostile relations;
- real units as perception stimuli;
- lightweight perception ticks for every active unit while the selected-unit heatmap remains selected-only;
- one bolt-action rifle definition and per-unit weapon runtime;
- stateful target acquisition, turning, weapon preparation, aiming, safety check, firing, and recovery;
- deterministic angular dispersion rather than a hidden hit percentage;
- ballistic tracing against terrain, map objects, and unit hit shapes;
- friendly-fire blocking before AI fire;
- hit zones: head, torso, limbs;
- combat capability: effective, wounded, severely wounded, incapacitated, dead;
- shot sound and flash feeding back into perception;
- deterministic tests and diagnostics.

Excluded from v1:

- squad attack planning;
- communication and shared contacts;
- automatic fire and machine-gun bursts;
- penetration, ricochet, destructible cover, armor;
- detailed organs, bleeding, treatment, evacuation;
- grenades, artillery, vehicles;
- physical projectile entities updated every frame.

## Architecture

### Ownership boundaries

- `PerceptionSystem` owns what each soldier knows. It never applies damage.
- `CombatDecision` validates whether a contact is a legal target and whether fire is permitted.
- `FireAction` owns the timed weapon action and stores a contact ID, never hidden objective target coordinates.
- `BallisticRaycast` owns projectile geometry and returns the first physical intersection.
- `CombatDamage` owns hit consequences and combat capability.
- `CombatEvents` owns deterministic shot, impact, near-miss, hit, and incapacitation events.
- `SimulationTick` remains the single simulation-time owner and advances perception, combat actions, events, and movement.
- Renderers display prepared state only and never decide hits.

### Data flow

```text
real hostile unit
→ unit perception stimulus
→ observer-specific contact
→ fire request against contact
→ stateful turning and aiming
→ final safety check
→ shot event
→ deterministic ballistic ray
→ first terrain/object/unit intersection
→ hit-zone result
→ combat capability change
→ sound/flash stimulus and AI reaction
```

## Sides

`UnitSide` becomes `blue | red`. `getSideRelation(observer, subject)` returns `friendly` or `hostile`; neutral and unknown are deliberately postponed.

The editor stores the side on every unit. Side color is presentation only and is never used as game logic.

## Perception

Every active unit receives a lightweight perception tick. Candidate order is distance, hostility/relevance, attention sector, then LOS. The full selected-unit visibility heatmap remains selected-only.

Real units produce stimuli with posture, movement, current action, size, concealment, and a stable `sourceUnitId`. A contact stores the real source ID but only exposes current objective position while it is visually identified. Lost contacts retain only last-known position and uncertainty.

Incapacitated and dead units may remain visible objects but are not active threats.

## Weapon model

One v1 rifle definition is enough:

- internal magazine capacity;
- rounds loaded and reserve;
- muzzle velocity;
- effective and maximum range;
- base angular dispersion;
- ready, aim, shot-cycle, reload, and recovery times;
- recoil and recovery;
- sound and flash strengths.

Legacy `ammo` and `weaponReady` remain synchronized compatibility fields until a later migration removes them.

## Fire action

Phases:

```text
acquire_target
→ turning
→ readying_weapon
→ aiming
→ final_safety_check
→ firing
→ recovering
→ completed / failed / cancelled
```

The action stores a perception contact ID and an intended aim point derived from that contact. Aim error combines contact uncertainty, weapon dispersion, weapon skill, posture, movement, suppression, stress, and recoil. Randomness is deterministic by shot ID.

AI `fire` starts the action; it no longer directly subtracts ammunition or emits a sound.

## Ballistics

A hitscan-style ballistic trace is calculated at shot time, with flight time stored on the event. The system returns the nearest intersection among terrain, blocking objects, friendly units, hostile units, or maximum range.

Visual LOS and ballistic LOS are separate. Forest reduces visibility but does not stop a v1 rifle bullet. Non-penetrable and penetrable objects both stop v1 bullets; penetration is a future extension point.

## Hit shapes and damage

Each posture yields simple oriented 3D-ish hit volumes projected onto the top-down map:

- head;
- torso;
- limbs.

Standing and crouched use compact shapes. Prone uses a long shape aligned with facing and a low vertical profile.

Damage produces deterministic minimum outcomes. Head and torso hits usually incapacitate; limb hits wound and reduce movement/aim stability. Incapacitated and dead units cannot move, aim, fire, or start new AI actions.

## Friendly-fire safety

Before firing, the action checks the same ballistic corridor without applying effects. A friendly unit intersecting the corridor before the intended target blocks AI fire with a human-readable reason.

## Performance

- no per-unit visibility textures;
- no projectile entity per bullet;
- broad-phase candidate filtering before LOS;
- unit spatial checks are bounded by active combatants in v1 and can be indexed later;
- deterministic events are plain data;
- camera and cursor movement never trigger combat calculations.

## Verification

Automated contracts must cover:

- side relations and target legality;
- independent perception without selection;
- weapon timing and ammunition conservation;
- posture-aware hit shapes;
- terrain/object/unit first-hit ordering;
- friendly-fire blocking;
- deterministic aim and hit outcome;
- incapacitated units stopping combat;
- shot sound creating a subjective contact;
- build and existing core smoke suites.

A later visual QA run must show two hostile units, aim progression, ballistic trace, an object-blocked shot, a prone hit shape, and an incapacitated unit. Visual QA is not run automatically without the user's explicit request.
