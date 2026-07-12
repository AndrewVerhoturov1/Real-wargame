# Navigation Profiles and Tactical Route Cost Design

Date: 2026-07-12

## Goal

Build a complete vertical slice in which a non-programmer can edit a persistent infantry navigation profile, the active profile is resolved in one place, shared A* uses the profile and the selected soldier's known tactical information, and an optional cached map layer explains the resulting route without rebuilding on pointer movement.

## Branch and delivery constraints

- Base branch: `real-wargame-preview`.
- Base commit: `dc46706ade1af4c60ab6e2ca82f8b83c95f1da27`.
- Implementation branch: `tmp/navigation-profiles-route-cost-20260712`.
- Do not modify `main`.
- Do not merge or transfer to `real-wargame-preview` without explicit user approval.
- Canonical code, serialized keys, tests and technical comments are English.
- Russian is the complete default interface language.

## Existing boundaries retained

```text
PlayerCommand
→ player intent

UnitPlanState
→ behavior-selected plan

MoveOrder
→ technical route and waypoints
```

`SimulationTick` remains the only coordinate integrator. `GridPathfinder` remains pure and imports no PixiJS, DOM, localStorage or simulation singleton. A* runs only when an order is created or when an explicit replanning rule allows it. Renderers display cached state and never run A*.

## Profile data contract

`NavigationProfileRegistry` stores format version 1 and seven built-in profiles:

```text
normal
fast
stealth
attack
cautious
retreat
direct
```

Each profile contains bilingual labels and descriptions, terrain costs, slope/danger/exposure/cover/enemy-distance weights, territory weights, route limits, goal-adjustment policy, replanning rules, built-in/custom ownership and a monotonically increasing revision.

Terrain cost keys are independent from raw map terrain so forest density and passable objects remain explicit:

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

Passability is separate. No numeric weight can make water without a bridge or a hard blocking object passable.

Built-in profiles can be edited and reset but not deleted. Custom profiles can be created, copied, renamed and deleted. JSON import is normalized and migrated before replacing stored data. JSON export includes the format version.

## Persistence boundary

Pure registry code has no browser imports. `NavigationProfileStorage` is the browser adapter and stores one normalized registry in:

```text
real-wargame.navigation-profiles.v1
```

The adapter keeps an in-memory snapshot for the current page, listens for the browser `storage` event, and exposes an explicit revision. This lets the editor and game share settings without putting navigation parameters into an AI graph.

## Active profile resolution

A single function `resolveActiveNavigationProfile` applies this priority:

```text
debug override
→ explicit player command mode
→ behavior movement mode
→ unit-role profile
→ normal
```

The result includes both `profileId` and source:

```text
debugOverride
playerCommand
behaviorMode
unitRole
default
```

Nodes may emit a semantic movement mode but never copy numeric weights. Player commands default to `normal`. Existing AI movement remains compatible and defaults to `normal` until a semantic mode is supplied.

## Static and dynamic route cost

The cost model returns diagnostic components for every passable cell:

```text
terrainCost
slopeCost
dangerCost
exposureCost
coverAdjustment
enemyDistanceCost
territoryCost
totalCost
```

The route step cost is based on step length, average cell terrain multiplier and additive tactical components. Exact implementation constants are documented with the code and tested for determinism.

### Static field

Static cost depends on:

- terrain and forest density;
- bridge and ditch footprints;
- elevation/slope;
- hard object passability;
- profile terrain and slope weights.

It is cached by map terrain/height/forest/object revisions plus profile id/revision. A static build produces typed arrays and increments diagnostics exactly once.

### Dynamic field

Dynamic cost depends only on data honestly available to the selected soldier. Version 1 implements known danger from `UnitTacticalKnowledge.threats` using confidence and uncertainty. Forest concealment is a map-known cover adjustment. Exposure to an enemy, exact enemy distance and territory cost remain zero with an explicit `unavailable` diagnostic until a truthful subjective contract exists.

Dynamic cache keys include unit id, tactical-knowledge revision, profile id/revision and optional future territory/exposure revisions.

## Maximum detour

The tactical route is compared with a cached shortest passable route that ignores tactical preferences but retains passability and geometry. The baseline is calculated only on order creation/replan and cached by map passability revisions plus endpoints.

If the tactical route exceeds `maximumDetourRatio`, version 1 selects the shortest passable baseline as the safe bounded fallback and reports that a preferred tactical route existed but exceeded the allowed detour. This is deterministic, cannot violate the length limit and avoids an uncontrolled second search every frame. A future multi-objective compromise search may replace the fallback without changing public contracts.

## A* result contract

Successful paths retain legacy `cost` and add:

```text
totalCost
distanceMeters
visitedCells
profileId
profileRevision
costBreakdown
routeReason
routeReasonRu
baselineDistanceMeters
detourRatio
detourLimited
```

`MoveOrder` stores only route-level summaries, profile metadata and replan metadata. Per-cell diagnostic arrays stay in the route-cost cache and are produced only when the overlay is requested.

## Replanning

Profile rules include:

```text
replanOnBlocked
replanOnProfileChange
replanOnDangerChange
minimumCostImprovement
minimumDangerRevisionInterval
replanCooldownSeconds
```

Blocked lookahead remains the immediate safety reason. Profile or knowledge changes are checked only after the configured revision interval and cooldown. A candidate route replaces the active route only when its cost improvement reaches the profile threshold. The original `PlayerCommand` and AI `ownerToken` are preserved. The order records the last replan reason and count.

## Editor

The AI editor gains persistent top-level tabs:

```text
Граф поведения
Чёрная доска
Профили движения
Диагностика
```

The movement-profile tab is not a graph node. It uses a profile list on the left and a draft form on the right. Number controls have Russian name, plain-language help, range input, exact numeric input, unit, default value, reset button and extreme-value warning. Changes apply only after `Сохранить изменения`; cancel restores the saved snapshot.

## Route-cost overlay

`PixiRouteCostOverlayRenderer` owns long-lived Pixi resources:

- one cached canvas/texture for static cost;
- one cached canvas/texture for dynamic cost;
- reusable sprites and legend container;
- a small hover tooltip that reads typed arrays by cell index.

The container is hidden with `visible = false`; disabling the layer does not destroy resources. Pointer movement only increments `hoverReadCount`. It never increments build counters or starts A*.

Modes:

```text
baseTerrain
finalCost
```

Hover always provides component reasons and states unavailable subjective data explicitly. The visual scale is normalized around cost 1.0 with fixed semantic bands, so colors are stable between camera movements. Impassable cells use dark cross-hatching in addition to color.

## Diagnostics

The cache/renderer exposes:

```text
staticCostBuildCount
dynamicCostBuildCount
textureUploadCount
hoverReadCount
fullMapScanCount
profileRevision
knowledgeRevision
```

The debug panel also shows active movement mode/profile/source, route cost, length, detour, strongest route reason and replan count.

## Verification policy

Development follows red-green-refactor with focused Node smoke scripts. The final non-browser gate includes navigation/profile, pathfinding, routed movement, AI bridge, route status, runtime, command-plan-route, performance-cache, build and docs checks.

A real Playwright scenario is prepared but not executed until the user explicitly approves visual QA. Required frames are normal, fast, stealth, retreat, overlay off/on, profile switch, zoom, pan and pointer movement with unchanged build counters.