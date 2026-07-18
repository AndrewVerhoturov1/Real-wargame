# Task Router

Use this table after reading `docs/ai/WEB_CHAT_START.md` and creating the canonical feature branch from the exact current `real-wargame-preview` head. Read only the row that matches the task, then expand context when code or tests prove it is necessary.

For every implementation row, the default delivery route is:

```text
feature branch
→ focused non-browser checks
→ push and readiness report
→ one-time Codex branch-linked Vercel Preview
→ human live test
→ same-branch revisions
→ optional visual GitHub Actions verification after explicit approval
→ explicit user GO
→ transfer into real-wargame-preview
```

| User task | Subproject | Read skill first | Main files to inspect first | Minimum pre-live-test checks |
|---|---|---|---|---|
| Current project state or next work | active id from `docs/subprojects/index.json` | none | generated `STATUS.md`, then `subproject.json` | `npm run docs:check` when status changes |
| Soldier AI behavior or Utility scoring | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRunner.ts`, `AiBlackboard.ts`, graph data | TypeScript, focused runtime/graph smoke, build |
| Multi-tick action, wait, running, cancellation | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRuntime.ts`, `AiGameBridge.ts`, runtime tests | TypeScript, `runtime:smoke`, build; prepare browser scenario |
| AI Node Editor authoring or selectors | `ai-single-unit-editor` | `real-wargame-ai-runtime`, local preview for UI | node editor modules, catalog, graph validation | TypeScript, editor/dictionary smoke, build; prepare PNG scenario |
| Blackboard or AI Dictionary | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiBlackboard.ts`, `AiConceptCatalog`, dictionary UI | TypeScript, dictionary/runtime smoke, build |
| Awareness, danger, cover or soldier memory | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for rendering | knowledge and cover core, awareness renderer | TypeScript, focused workspace/lab or perception smoke, build; prepare visual scenario |
| Front zones and territorial context | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for overlay | `FrontZoneState.ts`, `FrontZoneControls.ts`, front test | TypeScript, focused runtime/front smoke, build; prepare visual scenario |
| Map drawing, soldier visual, terrain or overlays | active domain plus `real-wargame-start` reference | `real-wargame-pixijs` | relevant Pixi renderer and its core data source | TypeScript, relevant smoke, build; prepare fresh-PNG scenario |
| Camera, pan, zoom, wheel or pointer input | `real-wargame-start` maintenance context | `real-wargame-pixijs` | `CameraController.ts`, `BoardInputController.ts`, `PixiApp.ts` | TypeScript, focused input smoke, build; prepare camera Playwright scenario |
| Rendering performance or frame stalls | relevant active subproject | `real-wargame-pixijs`, then Pixi performance skill | renderer that rebuilds objects, ticker/camera path | focused profiling evidence when justified, TypeScript, build, prepared browser scenario |
| Scene editor or object placement | active domain plus RTS maintenance context | `real-wargame-pixijs`, local preview | `GameEditorWorkbench.ts`, placement and input modules | TypeScript, game-editor smoke, build; prepare editor scenario |
| Local launch, screenshot or visual verification | relevant subproject | `real-wargame-local-preview` | launcher, workflow, Playwright config and scenario | exact feature SHA, manual-only browser workflow, fresh artifact, SHA match, PNG inspection |
| GitHub workflow, branch policy or Vercel delivery route | `github-collaboration` | GitHub plugin skill | `AGENTS.md`, `repo-context.json`, canonical delivery workflow, required rules, workflow, optional PR template | workflow syntax when changed, docs checks, repository-wide stale-route scan |
| Agent documentation or navigation | `github-collaboration` | none | canonical JSON, generator and checker | `docs:smoke`, `docs:generate`, clean diff, `docs:check` |
| Product philosophy, publisher pitch or checking a mechanic against game vision | no code subproject unless implementation starts | none | `docs/product/CORE_GAME_PRINCIPLES.md`, relevant master-book chapter and `ideas/` | planning review; no code or delivery claim |
| Product concept, commander AI or future mechanics | no code subproject unless implementation starts | none | `docs/product/CORE_GAME_PRINCIPLES.md`, relevant chapter routes and `ideas/` | planning review; no code or delivery claim |

## Browser execution rule

Rows that mention a browser or PNG mean **prepare the scenario before live testing**. Do not execute Chromium, Playwright or screenshot workflows until the user explicitly requests visual verification.

The human live test in the branch-linked Vercel Preview is separate from GitHub Actions visual verification.

## Expansion rule

The first files are orientation, not a fixed allow-list. Expand only when:

- an import leads to another module;
- a test fixture controls the behavior;
- a renderer depends on a core data contract;
- the active subproject `STATUS.md` names a required document;
- a project skill explicitly routes to a narrower reference.

## Delivery ownership rule

- The designated Web Chat owns the canonical feature branch.
- Optional worker chats return research, files or patches.
- Codex only exposes the already-pushed branch through Vercel Preview.
- All live-test fixes stay on the same feature branch.
- Transfer into `real-wargame-preview` requires explicit user GO.
- `main` requires a separate explicit user GO.

## Do not read by default

- all `.agents/skills/`;
- complete journals;
- old handoffs from completed stages;
- `_zworker_*`, `_opencode_reports`, telemetry or local runtime folders;
- every Playwright screenshot scenario;
- the complete master project book when a chapter route is enough;
- historical Q/R/X/W or r-init workflow documents unless the user explicitly asks about the legacy process.
