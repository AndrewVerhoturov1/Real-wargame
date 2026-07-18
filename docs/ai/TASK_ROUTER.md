# Task Router

Use this table after reading `docs/ai/WEB_CHAT_START.md` and creating the canonical feature branch from the exact current `real-wargame-preview` head.

Default implementation route:

```text
feature branch
→ focused non-browser checks
→ push and readiness report
→ one-time Codex branch-linked Vercel Preview
→ human live test
→ same-branch product revisions
→ optional visual verification after explicit user request
→ explicit user GO
→ transfer into real-wargame-preview
```

| User task | Subproject | Read skill first | Main files to inspect first | Minimum pre-live-test checks |
|---|---|---|---|---|
| Current project state or next work | active id from `docs/subprojects/index.json` | none | generated `STATUS.md`, then `subproject.json` | `npm run docs:check` when status changes |
| Soldier AI behavior or Utility scoring | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRunner.ts`, `AiBlackboard.ts`, graph data | TypeScript, focused runtime/graph smoke, build |
| Multi-tick action, wait, running, cancellation | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRuntime.ts`, `AiGameBridge.ts`, runtime tests | TypeScript, `runtime:smoke`, build; prepare visual scenario when visible |
| AI Node Editor authoring or selectors | `ai-single-unit-editor` | `real-wargame-ai-runtime`, local preview for preparation | editor modules, catalog, graph validation | TypeScript, editor/dictionary smoke, build; prepare PNG scenario |
| Blackboard or AI Dictionary | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiBlackboard.ts`, concept catalog, dictionary UI | TypeScript, dictionary/runtime smoke, build |
| Awareness, danger, cover or soldier memory | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for rendering | knowledge/cover core, awareness renderer | TypeScript, focused workspace/lab or perception smoke, build; prepare visual scenario |
| Front zones and territorial context | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for overlay | front state, controls and test | TypeScript, focused runtime/front smoke, build; prepare visual scenario |
| Map drawing, soldier visual, terrain or overlays | active domain plus maintenance context | `real-wargame-pixijs` | renderer and canonical data source | TypeScript, relevant smoke, build; prepare fresh-PNG scenario |
| Camera, pan, zoom, wheel or pointer input | maintenance context | `real-wargame-pixijs` | camera/input/Pixi app modules | TypeScript, focused input smoke, build; prepare camera scenario |
| Rendering performance or frame stalls | relevant subproject | `real-wargame-performance`, `real-wargame-pixijs` | renderer/ticker/camera path | justified profiling, TypeScript, build, prepared browser scenario |
| Scene editor or object placement | active domain plus maintenance context | `real-wargame-pixijs`, local preview for preparation | workbench, placement and input modules | TypeScript, editor smoke, build; prepare editor scenario |
| Local launch or direct-browser visual verification | relevant subproject | `real-wargame-local-preview` | launcher, Playwright config and scenario | exact feature SHA, real browser, fresh evidence, PNG inspection |
| Deployed Vercel visual verification when direct browser is unavailable | relevant subproject | **mandatory `vercel-deployment-playwright-e2e`** | Vercel URL, exact feature SHA, temporary workflow/config/scenario | exact product identity or explicit unproven status, real deployed URL, evidence JSON, screenshots, trace, artifact inspection |
| GitHub workflow, branch policy or Vercel delivery route | `github-collaboration` | GitHub plugin skill | `AGENTS.md`, repo context, delivery workflow, required rules | workflow syntax when changed, docs checks, stale-route scan |
| Agent documentation or navigation | `github-collaboration` | none | canonical JSON, generator and checker | `docs:smoke`, `docs:generate`, clean diff, `docs:check` |
| Product philosophy or future mechanics | no code subproject unless implementation starts | none | core game principles, relevant master-book chapter, `ideas/` | planning review; no code claim |

## Automatic visual skill rule

Rows that mention browser, screenshot, PNG or Playwright first mean **prepare** the scenario. Execution waits for explicit user intent.

The user does not need to name any skill. Clear intent such as `проверь визуально`, `сделай скриншоты`, `проверь через Playwright` or equivalent is enough.

At execution time:

```text
directly controlled browser can open target_url
→ use real-wargame-local-preview

directly controlled browser cannot open target_url
AND target is branch-linked Vercel Preview
→ MUST read and use vercel-deployment-playwright-e2e
```

Do not ask the user to repeat the skill name.

## Deployed Vercel CI ownership

When the mandatory CI skill is selected:

- canonical feature branch remains the only product branch;
- temporary `ci/**` branches contain only test harness changes;
- temporary PR is never merged;
- secrets are never committed;
- test-harness failures are fixed only in CI head;
- application failures are fixed only in canonical feature branch;
- each new product SHA gets fresh CI branches and fresh evidence;
- artifact is downloaded, inspected and shown conveniently;
- visual success does not authorize preview transfer.

## Expansion rule

The first files are orientation, not a fixed allow-list. Expand when imports, fixtures, data contracts, active status or project skills prove it necessary.

## Delivery ownership

- One Web Chat owns the canonical feature branch.
- Optional workers return research, files or patches.
- Codex only exposes the already-pushed branch through Vercel Preview.
- Product fixes stay on the feature branch.
- Temporary CI branches never receive product fixes.
- Transfer into preview requires explicit user GO.
- `main` requires separate explicit user GO.

## Do not read by default

- all `.agents/skills/`;
- complete journals;
- old handoffs;
- telemetry or local runtime folders;
- every Playwright scenario;
- the complete master project book;
- historical Q/R/X/W or r-init documents.