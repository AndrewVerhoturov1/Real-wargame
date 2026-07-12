# Route Cost Overlay v1

Status: implemented and disabled by default on the temporary branch.

## User controls

In the game display panel:

```text
Приказ · план · маршрут: вкл / выкл
Стоимость маршрута: вкл / выкл
Вид стоимости: Базовая местность / Итоговая стоимость
Профиль для проверки: Автоматически / выбранный профиль
```

The profile selector is a diagnostic override. Automatic resolution resumes when `Автоматически` is selected.

The selected-unit bar displays:

```text
movement mode
profile id and source
route total cost
route length in metres
detour percent and limit status
route reason
replan count
```

## Layer order

```text
map
→ route-cost raster background
→ other tactical overlays
→ yellow player command
→ blue unit plan
→ green actual route
→ units and selection UI
```

The route-cost layer is independent from the command/plan/route overlay.

## Raster architecture

`PixiRouteCostOverlayRenderer` owns long-lived resources:

- one static canvas/texture/sprite;
- one final/dynamic canvas/texture/sprite;
- one legend text object;
- one reusable hover tooltip.

Each cell uses a small 4×4 raster block. This allows dark cross-hatching for impassable cells without one Pixi `Graphics` per cell. Sprites are scaled to map cell size with nearest-neighbour sampling.

The renderer never creates HTML or Pixi objects per map cell. It never runs A*.

## Invalidation

Static texture rebuilds only when one of these changes:

```text
map dimensions or cell size
terrain / height / forest / object revisions
profile id / revision
```

Final texture rebuilds when the combined route-cost cache key changes, including selected unit and soldier knowledge revision.

When disabled:

```text
container.visible = false
```

Resources, cache entries and textures remain available. Re-enabling an unchanged layer does not recreate them.

## Hover behavior

Pointer movement converts the current grid coordinate to one typed-array index. A repeated cell does nothing. Moving to a new cell increments only `hoverReadCount` and updates the reusable tooltip.

The tooltip shows:

```text
profile
total cell cost
terrain
slope
known danger
exposure availability
cover adjustment
enemy-distance availability
territory availability
```

Unknown or unavailable soldier-relative data is stated explicitly.

## Color bands

The scale is stable around neutral cost `1.0`:

```text
≤ 0.85    green   preferred
≤ 1.25    yellow  normal
≤ 2.00    orange  expensive
> 2.00    red     extremely expensive
impassable dark + cross-hatch
```

Color is not the only indicator because impassability uses a separate hatch pattern and tooltip text.

## Diagnostics

Published as:

```text
window.__realWargameRouteCostDebug
```

Counters:

```text
staticCostBuildCount
dynamicCostBuildCount
textureUploadCount
hoverReadCount
fullMapScanCount
profileRevision
knowledgeRevision
staticTextureBuildCount
dynamicTextureBuildCount
displayObjectCount
```

The smoke contract proves that two hover reads increase only `hoverReadCount`, not static/dynamic build counts. It also verifies that the renderer source has no `GridPathfinder`, `findGridPath` or `runAStar` dependency.

## Visual QA policy

A focused Playwright scenario is prepared separately. It must not be executed until the user explicitly approves visual QA. Passing Playwright alone is not enough: every key PNG must be opened and inspected.
