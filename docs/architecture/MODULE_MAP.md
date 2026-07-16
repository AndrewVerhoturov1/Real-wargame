# Module Map

Open this file after `docs/ai/TASK_ROUTER.md` when the task needs code-level orientation.

| Concern | Primary modules | Important neighbors |
|---|---|---|
| Application assembly | `src/main.ts` | shared menu, workspace, renderers, bridges |
| Main render loop | `src/rendering/PixiApp.ts` | simulation tick, camera, renderers |
| Camera movement and zoom | `src/input/CameraController.ts` | `PixiApp.ts`, board input, viewport layout |
| Board selection and commands | `src/input/BoardInputController.ts` | camera, simulation state, editor placement |
| Map and terrain rendering | `src/rendering/PixiMapRenderer.ts` | map model, terrain style, smooth terrain |
| Unit rendering | `src/rendering/PixiUnitRenderer.ts` | unit model, posture/action state |
| Orders | `src/rendering/PixiOrderRenderer.ts` | move order, simulation state |
| Tactical overlays | `src/rendering/PixiOverlayRenderer.ts` | knowledge, cover, line of sight, front context |
| Awareness heatmaps | `src/rendering/PixiAwarenessHeatmapRenderer.ts` | `SoldierAwarenessGrid.ts`, UI mode |
| Threat editing | `src/rendering/PixiThreatEditorRenderer.ts` | pressure zones, editor workbench, input |
| HTML map labels | `src/rendering/HtmlOverlayRenderer.ts` | camera transforms, selection, LOS labels |
| Simulation state | `src/core/simulation/SimulationState.ts` | unit model, orders, scene export |
| Simulation update and movement integration | `src/core/simulation/SimulationTick.ts` | token-owned move orders, behavior runtime, pause state |
| Physical movement profiles | `src/core/movement/MovementProfileTypes.ts`, `MovementProfileDefaults.ts`, `MovementProfileNormalization.ts`, `MovementProfileRegistry.ts` | canonical IDs, editable settings, aliases, registry serialization |
| Physical movement runtime | `src/core/movement/MovementRuntime.ts`, `MovementMaterialAdapter.ts` | requested/effective authority, stamina fallback, material provider, movement sound, intent-owned weapon preparation |
| Move order ownership | `src/core/orders/MoveOrder.ts` | player orders, stateful AI movement bridge, SimulationTick |
| Map model | `src/core/map/MapModel.ts` | terrain, forest, JSON data |
| Smooth terrain | `src/core/terrain/SmoothTerrain.ts` | line of sight, map renderer |
| Visibility | `src/core/visibility/LineOfSight.ts` | terrain, forest, object height |
| Unit knowledge | `src/core/knowledge/UnitKnowledge.ts` | sensors, cover, overlays |
| Threat memory | `src/core/knowledge/SoldierThreatMemory.ts` | pressure zones, awareness grid |
| Awareness grid | `src/core/knowledge/SoldierAwarenessGrid.ts` | cover evaluation, memory, heatmap renderer |
| Cover evaluation | `src/core/cover/SmallArmsCoverEvaluation.ts` | objects, forest, threat direction |
| Pressure and danger | `src/core/pressure/PressureZone.ts`, `ThreatEvaluation.ts` | threat renderer, Blackboard |
| Immediate AI evaluation | `src/core/ai/AiGraphRunner.ts` | graph, nodes, Blackboard, validation |
| Multi-tick AI lifecycle | `src/core/ai/AiGraphRuntime.ts` | Runner, frozen targets, execution state, runtime smoke |
| General game/AI adapter | `src/core/ai/AiGameBridge.ts` | SimulationState, awareness, trace storage |
| Stateful movement adapter | `src/core/ai/AiStatefulMoveGameBridge.ts` | `MoveOrder.ts`, `SimulationTick.ts`, owner tokens, route observations |
| AI data contract | `src/core/ai/AiGraph.ts`, `AiNodeTypes.ts` | validation, editor, bundled graph |
| Blackboard | `src/core/ai/AiBlackboard.ts` | dictionary/catalog, Bridge, Runner |
| Node editor | `src/ai-node-editor/main.ts` | human UI modules, graph storage, runtime overlay |
| Stateful node UI | `src/ai-node-editor/stateful-node-ui.ts` | wait/movement parameters, graph persistence |
| Runtime diagnostics | `src/ai-node-editor/runtime-debug-overlay.ts` | Bridge trace storage, selected soldier |
| Movement diagnostics | `src/ai-node-editor/stateful-move-debug.ts` | frozen target, remaining distance, action token |
| Runtime smoke | `scripts/ai_graph_runtime_smoke.ts` | Runner/Runtime compatibility and lifecycle |
| Movement bridge smoke | `scripts/ai_stateful_move_bridge_smoke.ts`, `scripts/ai_stateful_move_bridge_smoke.mjs` | token ownership, replacement order, arrival/cancel |
| Runtime browser coverage | `tests/ai-running-runtime.spec.ts` | waiting state and node diagnostics |
| Movement browser coverage | `tests/ai-running-move.spec.ts` | running state, human controls and movement diagnostics |
| Tactical workspace | `src/ui/TacticalWorkspace.ts` | simulation/editor modes, docks, runtime UI state |
| Scene editor | `src/ui/GameEditorWorkbench.ts` | drafts, placement, input, scene export |
| Front zones | `src/core/front/FrontZoneState.ts`, `src/ui/FrontZoneControls.ts` | CSS overlay, Blackboard, front Playwright test |
| Scene serialization | `src/ui/SceneExport.ts` | simulation state, map and object data |
| Local lab launch | `Run-Real-Wargame-Lab.bat` | lab manager, launch page, shared menu |
| Visual CI | `.github/workflows/preview-screenshots.yml` | Playwright config and tests |
| Agent context | `docs/ai/repo-context.json` | subproject metadata, generator, checker |

## Dependency reading rule

Start from the primary module. Follow only imports, tests and data fixtures that directly control the requested behavior. Do not load every neighboring module pre-emptively.
