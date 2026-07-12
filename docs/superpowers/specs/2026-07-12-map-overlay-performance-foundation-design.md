# 2 m Map Grid and Overlay Performance Design

## Status

Implemented on the isolated branch `perf/map-overlay-foundation-2026-07-12`.

The user explicitly required that this work must **not** be transferred to `real-wargame-preview` yet. `main` and `real-wargame-preview` remain untouched. Draft PR #59 exists only to run GitHub Actions and must not be merged without a new explicit user instruction.

## Goal

Replace the 10×10 m gameplay grid with a 2×2 m grid so one cell can represent the local space of one soldier, while keeping the battlefield at 640×400 m and preventing the 25× cell-count increase from reintroducing overlay/editor stalls.

## Final scale decision

- Global terrain, height and forest grid: **2 m per cell**.
- Runtime map: **320×200 cells** instead of 64×40.
- Physical map size: still **640×400 m**.
- Pixel size of the whole map: unchanged.
- Display grid uses level of detail: **10 m lines at overview**, with **2 m lines fading in after zoom**; the editor reveals them earlier than simulation.
- Unit positions: continuous floating-point coordinates; soldiers are not snapped to cell centres.
- Units, threat zones, view ranges, movement speed and uncertainty: converted so their real values in metres remain unchanged.
- Object coordinates: converted so objects remain in the same world location.
- Object dimensions: deliberately **not multiplied by five**. Their old cell counts are reinterpreted in the 2 m grid. This turns previously oversized objects into plausible local geometry, for example:
  - tree 0.75 cell → 1.5 m;
  - rock 0.45×0.35 → 0.9×0.7 m;
  - crates 0.75×0.65 → 1.5×1.3 m;
  - cover 2.5×0.45 → 5×0.9 m;
  - small structure 2×1.5 → 4×3 m.

A 1 m global grid remains rejected for now because it would produce 256,000 cells, four times more than the selected 2 m design and 100 times more than the original map.

## Compatibility model

Legacy JSON maps remain compact and valid. `TacticalMapData.runtimeMetersPerCell` allows a 10 m source map to expand to a finer runtime grid.

For a 10→2 m migration:

- width and height are multiplied by five;
- `cellSize` is divided by five;
- terrain/height/forest values are expanded over the corresponding 5×5 runtime cells;
- unit positions, speed and view range are converted by the coordinate scale;
- threat geometry and tactical-memory ranges are converted by the coordinate scale;
- object positions are converted, but object dimensions retain their numeric cell counts to gain realistic physical sizes.

New scene exports are native 2 m scenes. Old 10 m scene exports are automatically migrated when loaded.

## Performance architecture

### Map revisions and dirty regions

Map layers have monotonic revisions for terrain, height, forest, objects and combined visuals. Cache keys compare revisions instead of serialising all cells and objects every frame.

Height and forest painting records bounded dirty rectangles. Object mutations are observed and increment the object revision automatically.

### Smooth terrain cache

The smooth-height grid is cached by height revision. Repeated reads are constant-time cache hits. A local height edit updates only the dirty region plus the smoothing border; a full rebuild remains available for map loading or lost history.

### Spatial object index

A uniform bucket index provides point, rectangle, circle and segment candidate queries. Conservative rotated bounds prevent missed blockers; exact caller checks prevent false hits.

### Shared visibility probe

Pixi and HTML overlays consume one cached line-of-sight result. The result invalidates only when the selected unit, posture, target or relevant map revision changes. Sight sampling is specified in metres, not cells.

### Awareness fields

Static terrain/forest/object protection is cached separately from changing tactical threats. Typed arrays store the static numeric field. Search radius, route sampling, uncertainty growth and distance penalties are expressed in metres.

### Adaptive display grid

The underlying simulation remains 2 m at every zoom. The visual grid is separated into two levels so overview readability does not depend on simulation resolution:

- 10 m major lines are shown at the default overview scale;
- 2 m source-grid lines remain hidden while they would be closer than the readability threshold;
- the fine grid fades in during zoom rather than appearing abruptly;
- the editor uses a lower threshold because precise placement benefits from seeing cells earlier;
- zoom changes only switch visibility and alpha; they do not rebuild terrain textures or map data.

### Rendering lifecycle

Unit display objects are stored by id and updated in place. Pointer movement and camera zoom do not recreate them. Overlay keys no longer scan the full map. HTML labels are restricted to visible bounds, hidden below a zoom threshold where appropriate and reused rather than recreated.

## Implemented regression checks

- map revision and dirty-region smoke test;
- 10→2 m resolution migration smoke test;
- map-grid LOD smoke test for overview, zoom, editor and disabled states;
- incremental smooth-terrain cache smoke test;
- spatial-index query/invalidation smoke test;
- shared visibility-probe cache smoke test;
- static awareness-field cache smoke test;
- Playwright assertions for zero full-map overlay fingerprints during input bursts;
- Playwright assertions that pointer and wheel bursts do not create or remove unit views;
- Playwright validation that the 10 m overview grid changes to the 2 m grid only after zoom;
- production TypeScript/Vite build;
- existing editor, AI runtime, pathfinding and workspace smoke suites.

## Acceptance criteria

1. The main game reports 2 m per cell and uses a 320×200 runtime map.
2. Physical battlefield dimensions remain 640×400 m.
3. A soldier keeps the same real position, metres-per-second speed and view distance after migration.
4. Threat zones and remembered threats keep their real-world ranges.
5. Object footprints become realistically smaller instead of retaining legacy 10 m-cell dimensions.
6. Pointer movement and camera movement perform no full-map cache fingerprint scans.
7. Unit display objects are persistent across ordinary frames.
8. Current JSON scenes remain loadable and new scenes export at native 2 m resolution.
9. Overview uses readable 10 m lines; zoomed placement exposes the actual 2 m cells without rebuilding the map.
10. Core CI and production build pass on the isolated branch.
11. Browser screenshots and interaction tests are inspected before any transfer to preview.

## Deferred work

A 1 m global grid, Web Worker awareness calculations and a full chunk-texture terrain renderer remain optional follow-ups. They should only be added if profiling of the completed 2 m implementation proves they are necessary.
