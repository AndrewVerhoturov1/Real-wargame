# Tactical Order Intent and Radial Menu v1

## Status

This document describes the isolated implementation in draft PR #129, branch `agent/tactical-order-radial-menu-v1`, based on `real-wargame-preview` after accepted PR #128.

The visible v1 slice provides three tactical orders:

- normal movement;
- reconnaissance;
- assault.

It does not add a new movement engine, danger field, visibility field, scheduler, formation model or preset-specific graph node.

## Ownership boundary

```text
PlayerCommand = what the player ordered and the immutable intent snapshot
AiPlan        = how the AI currently pursues that command
Graph/runtime = current low-level decisions and resumable actions
MoveOrder     = the concrete routed movement produced by the shared planner
```

The radial menu is input and presentation only. It never becomes a simulation source of truth.

```text
DOM radial menu
  → issueTacticalOrderToSelectedUnits
  → immutable TacticalOrderIntent snapshot
  → PlayerCommand on each UnitModel
  → existing routed MoveOrder planning
  → per-unit Blackboard memory
  → simulation-owned scheduler and ordinary SimulationTick
```

`selectedUnitIds` is used only at command issue time to identify recipients. The resulting command, intent, plan, route and Blackboard values belong to each `UnitModel`. Later UI selection changes do not change the order or decide which unit receives scheduler work.

## Intent format

```ts
type TacticalOrderPresetId = 'move' | 'recon' | 'assault';

type TacticalOrderIntent = {
  formatVersion: 1;
  presetId: TacticalOrderPresetId;
  navigationProfileId: string;
  attentionPolicy: 'automatic' | 'search' | 'engage';
  contactPolicy: 'continue_if_possible' | 'pause_and_observe' | 'press_attack';
  firePolicy: 'self_defense' | 'controlled' | 'fire_at_will';
  resumeAfterTemporaryInterruption: boolean;
};
```

The object is flat, JSON-compatible and frozen when created or normalized. A command stores its own snapshot. Editing a global profile later does not silently rewrite an existing command. An explicit player profile change creates a command revision and a new intent snapshot.

Unknown presets and legacy commands without an intent normalize to canonical normal movement. Unknown or malformed commands cannot crash scene loading; irrecoverable commands are ignored.

## Preset semantics

### Normal movement

```text
navigation: normal
attention: automatic
contact: continue_if_possible
fire: self_defense
resume: true
```

> Выполнить приказ обычным способом, реагируя на опасность по текущей логике самосохранения.

The compatibility `issueRoutedMoveOrderToSelectedUnits` entry point remains available. It produces normal intent while preserving an explicitly selected legacy navigation profile.

### Reconnaissance

```text
navigation: cautious
attention: search
contact: pause_and_observe
fire: self_defense
resume: true
```

> Осторожно двигаться, активно искать контакты и при обнаружении остановиться для наблюдения.

`cautious` is used instead of `stealth` because the current navigation catalog defines it as the strongest general-purpose danger/cover-aware route policy. V1 does not claim a complete stealth doctrine or a new concealment system.

### Assault

```text
navigation: attack
attention: engage
contact: press_attack
fire: fire_at_will
resume: true
```

> Решительно двигаться к цели и продолжать атаку, не игнорируя критические ограничения безопасности.

Assault changes tactical policy; it does not bypass suppression, impassable terrain, unavailable routes, collision rules or stronger self-preservation constraints.

## Input contract

```text
short RMB
  → existing quick routed movement

hold RMB for 240 ms
  → open radial menu at the pointer target
  → suppress the preliminary quick command

move into a sector
  → highlight Normal / Reconnaissance / Assault

release RMB in a sector
  → issue exactly one tactical command to the original world target

release in the neutral center
  → cancel without changing the live command
```

Additional cancellation paths are Escape, pointer cancellation, pointer capture loss, pointer leaving the canvas and application destruction.

The visual ring is clamped to the viewport, while `targetGrid` remains the world position captured at RMB press. The camera wheel and movement keys are blocked while the menu is open. Keys `1`, `2` and `3` select sectors. Russian `aria-label` values contain the full core-owned explanations; the visible sectors use concise core-owned hints.

A capture-phase controller prevents the legacy bubble-phase RMB handler from receiving the same gesture. Therefore a held RMB cannot create a normal command before the tactical command.

## Routed movement and final facing

```text
resolve command intent navigation profile
  → buildUnitTacticalRouteContext
  → planMoveOrder
  → MoveOrder with playerCommandId
  → ordinary replan and SimulationTick movement
```

No second A* implementation exists. Hovering sectors does not call the planner or mutate a command. A* runs only after confirmation or through the existing permitted replan lifecycle.

Short RMB keeps the existing final-facing drag threshold. Tactical sector direction is not overloaded as final facing in v1.

## AI visibility

The confirmed or restored intent is copied into per-unit AI runtime memory:

```text
player_order_preset
player_order_navigation_profile
player_order_attention_policy
player_order_contact_policy
player_order_fire_policy
player_order_resume_after_interruption
```

These keys are registered in the canonical Blackboard schema. Existing compare, condition, Utility and universal Blackboard operations can read them without adding `DoRecon` or `DoAssault` nodes.

The values come from `UnitModel.playerCommand`, not from the open menu and not from selected-unit diagnostics. The accepted PR #127 scheduler remains the sole normal gameplay scheduler.

## Visible diagnostics

After confirmation, a fixed Russian status card appears above the lower board controls and reads core command data:

- order name and full explanation;
- target coordinates;
- navigation profile;
- attention policy;
- contact policy;
- fire policy;
- execution status.

The card is hidden before an order is issued and does not display raw enum keys.

## Serialization

The compatible `scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid` format now includes an optional `playerCommand` field with intent snapshot, target, status, revision and final facing. The version identifier remains v9 because the new field is optional and old readers/scenes remain compatible.

`normalizeUnits` restores the command, scales its target during map-resolution conversion and republishes its intent into per-unit Blackboard memory after runtime restoration.

Compatibility rules:

- no `playerCommand`: no restored player command;
- command without `intent`: canonical normal movement;
- unknown preset: canonical normal movement;
- malformed target or missing unit identity: command ignored;
- known command: normalized immutable intent and cloned target.

The concrete active `MoveOrder` remains in the existing AI runtime snapshot contract. Player command and active route remain separate serialized concepts.

## Interaction with accepted PRs

### PR #126

No danger evaluator is added. `normal`, `cautious` and `attack` consume the canonical renderer-independent `SoldierDangerField` through the existing route-cost pipeline.

### PR #127

The command is stored on each unit. The simulation-owned per-unit scheduler and stable phase order are unchanged. UI selection is not a runtime scheduling input.

### PR #128

The branch is based on the merged shared visibility/vegetation foundation. No visibility, vegetation, LOS, fire-transmission or concealment constants are duplicated. Profiles continue to consume the shared physical fields.

## Tests and visual artifacts

Focused coverage:

```text
scripts/tactical_order_radial_menu_smoke.ts
scripts/tactical_order_radial_menu_smoke.mjs
npm run tactical-order:smoke
```

The smoke covers preset normalization, legacy migration, immutable snapshots, command linkage, route profiles, final facing, selection-independent AI data, restored AI data, scene round-trip and pure gesture decisions.

The approved real-browser scenario is:

```text
tests/tactical-order-radial-menu.spec.ts
.github/workflows/tactical-order-visual-qa-approved.yml
```

Expected PNG files:

```text
01-radial-menu-normal.png
02-radial-menu-recon-hover.png
03-radial-menu-assault-hover.png
04-radial-menu-near-screen-edge.png
05-recon-order-issued.png
06-assault-order-issued.png
```

The exact non-browser matrix is owned by `.github/workflows/tactical-order-core-verification.yml`.

## Current limitations

- Contact and fire policies are durable Blackboard inputs; the default graph is not yet a complete doctrine for every policy.
- Group orders keep the existing relative target-offset behavior; formations and command delay are out of scope.
- No command queue, radio model, smoke order, dedicated stop order or squad commander is introduced.
- Tactical orders apply current universal attention operations immediately; longer-lived policy-specific graph behavior remains future work.
- The radial menu has three presets only; future presets must extend the same intent contract rather than bypass it with direct UI mutations.
