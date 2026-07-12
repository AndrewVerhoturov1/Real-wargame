# Navigation Profiles v1

Status: implemented on `tmp/navigation-profiles-route-cost-20260712`; not transferred to `real-wargame-preview`.

## Purpose

Navigation profiles are persistent route-evaluation settings for infantry. They are not behavior-tree or Utility AI nodes.

```text
behavior graph chooses an action and target
→ active profile resolver chooses route semantics
→ A* chooses exact cells
→ route-cost overlay explains the result
```

The graph may emit a semantic movement mode such as `retreat`. Numeric terrain and tactical weights remain in the shared profile registry.

## Built-in profiles

The registry always contains, in this order:

| id | Russian name | Intent |
|---|---|---|
| `normal` | Обычный | balanced routine movement |
| `fast` | Быстрый | short path, roads and open ground preferred |
| `stealth` | Скрытный | concealment and known-danger avoidance |
| `attack` | Атака | decisive advance with moderate risk control |
| `cautious` | Осторожный | safer, better-covered route |
| `retreat` | Отступление | strongest avoidance of known danger |
| `direct` | Прямой маршрут | practically shortest passable diagnostic route |

Built-in profiles can be edited and reset but cannot be deleted. Custom profiles can be created, copied, renamed, reset and deleted.

## Data format

Current format version: `1`.

Each profile stores:

```text
id
nameEn / nameRu
descriptionEn / descriptionRu
terrainCosts
slopeWeight
dangerWeight
exposureWeight
coverWeight
enemyDistanceWeight
territoryWeights
maximumDetourRatio
maximumRouteCost
allowGoalAdjustment
replanRules
revision
builtIn
```

Terrain keys:

```text
road
field
sparseForest
denseForest
rough
swamp
bridge
ditch
```

Passability is independent. A low cost never makes water without a bridge or a blocking object passable.

## Storage and migration

Browser storage key:

```text
real-wargame.navigation-profiles.v1
```

The pure registry has no browser dependency. `NavigationProfileStorage.ts` is the adapter for localStorage and cross-tab storage events.

Import accepts versioned v1 data and older profile-like objects. Missing fields receive normalized defaults. Values are clamped to documented safe ranges. Export writes indented JSON with the current format version.

## Active profile resolution

One resolver owns the priority:

```text
debug override
→ explicit player command movement mode
→ behavior movement mode
→ unit-role profile
→ normal
```

The result includes both the profile and source:

```text
debugOverride
playerCommand
behaviorMode
unitRole
default
```

The resolver is used by both player and AI-owned movement. The technical route stores the resolved id, profile revision and source for diagnostics.

## Editor workflow

Open the AI editor and choose:

```text
Профили движения
```

The left column lists built-in and custom profiles. The right column edits a draft. Changes do not apply while each character is typed; use:

```text
Сохранить изменения
Отменить изменения
Сбросить
```

Each numeric field has a slider, exact number input, unit, standard value, range and extreme-value warning. Russian is the default complete interface. English labels remain in serialized data and code.

## Revisions and invalidation

Every saved profile update increments the profile revision. The registry revision also increments for create/update/delete/reset operations. Static route-cost cache keys include profile id and revision; therefore a saved change invalidates only matching route-cost data.

## Important limits

- A player command currently defaults to semantic mode `normal`; the diagnostic override can force another profile in the game UI.
- Behavior nodes do not yet expose a dedicated movement-mode selector in every action node. AI routes still use the centralized resolver and can use unit/behavior defaults.
- Profiles include exposure, territory and exact enemy-distance weights, but those factors remain zero until honest soldier-relative inputs exist.
