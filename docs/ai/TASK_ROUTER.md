# Task Router

Use this table after reading `docs/ai/WEB_CHAT_START.md`. Read only the row that matches the task, then expand context when the code or test proves it is necessary.

| User task | Subproject | Read skill first | Main files to inspect first | Minimum checks |
|---|---|---|---|---|
| Current project state or next work | active id from `docs/subprojects/index.json` | none | generated `STATUS.md`, then `subproject.json` | `npm run docs:check` when status changes |
| Soldier AI behavior or Utility scoring | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRunner.ts`, `AiBlackboard.ts`, graph data | `runtime:smoke`, graph validation, build |
| Multi-tick action, wait, running, cancellation | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRuntime.ts`, `AiGameBridge.ts`, runtime tests | `runtime:smoke`, browser runtime scenario, build |
| AI Node Editor authoring or selectors | `ai-single-unit-editor` | `real-wargame-ai-runtime`, local preview for UI | node editor modules, catalog, graph validation | `editor:smoke`, dictionary smoke, browser PNG, build |
| Blackboard or AI Dictionary | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiBlackboard.ts`, `AiConceptCatalog`, dictionary UI | dictionary smoke, runtime smoke, build |
| Awareness, danger, cover or soldier memory | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for rendering | knowledge and cover core, awareness renderer | workspace/lab smoke, browser PNG, build |
| Front zones and territorial context | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for overlay | `FrontZoneState.ts`, `FrontZoneControls.ts`, front test | front Playwright test, runtime smoke, build |
| Map drawing, soldier visual, terrain or overlays | active domain plus `real-wargame-start` reference | `real-wargame-pixijs` | relevant Pixi renderer and its core data source | build, relevant smoke, fresh PNG |
| Camera, pan, zoom, wheel or pointer input | `real-wargame-start` maintenance context | `real-wargame-pixijs` | `CameraController.ts`, `BoardInputController.ts`, `PixiApp.ts` | build, camera Playwright, performance check |
| Rendering performance or frame stalls | relevant active subproject | `real-wargame-pixijs`, then Pixi performance skill | renderer that rebuilds objects, ticker/camera path | profiling evidence, build, browser scenario |
| Scene editor or object placement | active domain plus RTS maintenance context | `real-wargame-pixijs`, local preview | `GameEditorWorkbench.ts`, placement and input modules | game-editor smoke, browser editor scenario, build |
| Local launch, screenshot or visual verification | relevant subproject | `real-wargame-local-preview` | launcher, workflow, Playwright config and scenario | real browser, fresh artifact, SHA match, PNG inspection |
| GitHub workflow or branch policy | `github-collaboration` | GitHub plugin skill | required rules, workflow, PR template | workflow syntax, policy run, docs check |
| Agent documentation or navigation | `github-collaboration` | none | canonical JSON, generator and checker | `docs:smoke`, `docs:generate`, clean diff, `docs:check` |
| Product concept, commander AI or future mechanics | no code subproject unless implementation starts | none | relevant chapter routes in master project book and `ideas/` | planning review; no code claim |

## Expansion rule

The first files are orientation, not a fixed allow-list. Expand only when:

- an import leads to another module;
- a test fixture controls the behavior;
- a renderer depends on a core data contract;
- the active subproject `STATUS.md` names a required document;
- a project skill explicitly routes to a narrower reference.

## Do not read by default

- all `.agents/skills/`;
- complete journals;
- old handoffs from completed stages;
- `_zworker_*`, `_opencode_reports`, telemetry or local runtime folders;
- every Playwright screenshot scenario;
- the complete master project book when a chapter route is enough.
