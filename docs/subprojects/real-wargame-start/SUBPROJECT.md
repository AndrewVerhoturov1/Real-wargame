# 2D Tactical Command Game — RTS Foundation

This file describes the stable tactical foundation. Current maintenance status is generated in:

```text
docs/subprojects/real-wargame-start/STATUS.md
```

Active AI development continues in `ai-single-unit-editor`.

## Goal

Provide a reliable 2D tactical map and editor on Vite + TypeScript + PixiJS 8 for experimenting with soldier behavior.

The foundation includes:

- tactical map and camera;
- units and orders;
- scene editing;
- height and forest layers;
- line of sight;
- physical object height;
- cover and unit knowledge;
- scene import/export;
- terminal-free launch;
- real-browser visual verification.

It is a laboratory foundation, not the final combat simulation.

## Stable architecture

```text
JSON data
→ core map and simulation
→ visibility, sensors and knowledge
→ input commands
→ PixiJS renderers
→ HTML controls and diagnostics
```

Core models and calculations remain independent of PixiJS.

## Stable decisions

- The project is Vite + TypeScript + PixiJS 8, not Godot.
- Base map scale is 1 cell = 10 metres.
- Important distances are shown in metres.
- Height levels are `-2..+4` and are visualized as physical-map zones/lines rather than permanent numbers on every cell.
- Line of sight uses smoothed terrain; contour lines are not vertical walls.
- The real-relief layer is cached and must not rebuild because the pointer moved.
- Forest is a map layer with `0/1/2`: none, sparse and dense.
- Objects have physical LOS height.
- Near cover supports immediate action; distant known cover supports planning.
- Simulation and editing are distinct modes.
- Scene JSON compatibility is preserved through explicit migration.
- View cones and height numbers are diagnostic options rather than default visual noise.
- Main user launch is `Run-Real-Wargame-Lab.bat`.

## Primary modules

```text
src/core/map/MapModel.ts
src/core/simulation/SimulationState.ts
src/core/simulation/SimulationTick.ts
src/core/visibility/LineOfSight.ts
src/core/terrain/SmoothTerrain.ts
src/core/knowledge/UnitKnowledge.ts
src/input/CameraController.ts
src/input/BoardInputController.ts
src/rendering/PixiApp.ts
src/rendering/PixiMapRenderer.ts
src/rendering/PixiUnitRenderer.ts
src/rendering/PixiOverlayRenderer.ts
src/rendering/HtmlOverlayRenderer.ts
src/ui/TacticalWorkspace.ts
src/ui/GameEditorWorkbench.ts
src/ui/SceneExport.ts
```

Use `docs/architecture/MODULE_MAP.md` for task-oriented navigation.

## Boundaries

Do not:

- replace the project with another engine;
- import PixiJS into core simulation;
- make contour lines act as vertical LOS walls;
- rebuild static relief or broad overlays on every hover/frame;
- break scene import/export silently;
- merge simulation and editor input into an ambiguous mode;
- ask the user to run Git or terminal commands for normal launch;
- present planned ballistics, pathfinding, communication, morale or army AI as implemented;
- change `main` without explicit human GO.

## Verification

The exact checks depend on the changed module. Typical foundation checks include:

```text
npm run workspace:smoke
npm run game-editor:smoke
npm run lab:smoke
npm run build
```

Camera, rendering, editor and visible-map changes also require the real-browser workflow from:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

PixiJS tasks read first:

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```
