# Task Router

Use this table after reading `docs/ai/WEB_CHAT_START.md` and creating the canonical feature branch from the exact current `real-wargame-preview` head.

## Default implementation route

```text
feature branch
→ focused non-browser checks
→ commit and push
→ readiness report without deployment
→ explicit user deployment request when Preview is needed
→ manual Vercel deployment of exact HEAD
→ human live test
→ same-branch product revisions
→ optional visual verification after separate explicit request
→ explicit user GO
→ transfer into real-wargame-preview
→ separate manual preview deployment when requested
```

A push does not deploy. Do not create a dummy commit or enable automatic deployment.

## Task routes

| User task | Subproject | Read skill first | Main files to inspect first | Minimum checks |
|---|---|---|---|---|
| Deploy, redeploy or create/update Preview | `github-collaboration` | **mandatory `real-wargame-manual-vercel-deploy`** | exact branch HEAD, `vercel.json`, manual deployment workflow | existing focused checks, deployment status/logs, both pages |
| Current project state or next work | active id from `docs/subprojects/index.json` | none | generated `STATUS.md`, then `subproject.json` | `npm run docs:check` when status changes |
| Soldier AI behavior or Utility scoring | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRunner.ts`, `AiBlackboard.ts`, graph data | TypeScript, focused runtime/graph smoke, build |
| Multi-tick action, wait, running, cancellation | `ai-single-unit-editor` | `real-wargame-ai-runtime` | `AiGraphRuntime.ts`, `AiGameBridge.ts`, runtime tests | TypeScript, runtime smoke, build |
| AI Node Editor authoring or selectors | `ai-single-unit-editor` | `real-wargame-ai-runtime` | editor modules, catalog, graph validation | TypeScript, editor/dictionary smoke, build |
| Blackboard or AI Dictionary | `ai-single-unit-editor` | `real-wargame-ai-runtime` | blackboard, concept catalog, dictionary UI | TypeScript, dictionary/runtime smoke, build |
| Awareness, danger, cover or soldier memory | `ai-single-unit-editor` | `real-wargame-ai-runtime`; Pixi guard for rendering | tactical core and awareness renderer | TypeScript, focused workspace/perception smoke, build |
| Map drawing, soldier visual, terrain or overlays | active domain | `real-wargame-pixijs` | renderer and canonical data source | TypeScript, relevant smoke, build |
| Camera, pan, zoom, wheel or pointer input | maintenance | `real-wargame-pixijs` | camera/input/Pixi app modules | TypeScript, focused input smoke, build |
| Rendering performance or frame stalls | relevant subproject | `real-wargame-performance`, `real-wargame-pixijs` | renderer/ticker/camera path | justified profiling, TypeScript, build |
| Local launch or direct-browser verification | relevant subproject | `real-wargame-local-preview` | launcher, target and scenario | exact source identity, real browser evidence |
| Visual verification of existing deployed Preview without direct browser | relevant subproject | **mandatory `vercel-deployment-playwright-e2e`** | existing Vercel URL, exact product SHA, temporary CI harness | evidence JSON, screenshots, trace, artifact inspection |
| GitHub workflow, branch policy or Vercel delivery route | `github-collaboration` | GitHub plugin skill; manual deploy skill when deploying | `AGENTS.md`, repo context, delivery workflows | docs checks, stale-route scan |
| Agent documentation or navigation | `github-collaboration` | none | canonical JSON, generator and checker | `docs:smoke`, `docs:generate`, clean diff, `docs:check` when available |

## Deployment authorization rule

These phrases authorize manual deployment:

```text
деплой
задеплой
создай Preview
обнови Preview
```

These actions alone do not authorize deployment:

```text
implement
commit
push
transfer
merge
visual preparation
```

Transfer into preview and deployment of preview are separate permissions unless the user explicitly requests both.

## Visual routing rule

Visual execution also requires explicit intent.

```text
existing deployment + direct browser
→ real-wargame-local-preview

existing deployment + no direct browser
→ vercel-deployment-playwright-e2e

no deployment
→ do not deploy implicitly
→ report that explicit deployment is required
```

The Playwright skill must not deploy the application.

## Deployment ownership

- One Web Chat owns the canonical product branch.
- Manual deployment uses the exact branch and remote HEAD.
- Build failures are fixed on the same authorized branch.
- Intermediate pushes remain deployment-free.
- No empty deployment commits.
- No committed Vercel secrets.
- `main` requires separate explicit approval.

## Expansion rule

The first files are orientation, not a fixed allow-list. Expand when imports, fixtures, data contracts, active status or project skills prove it necessary.

## Do not read by default

- all `.agents/skills/`;
- complete journals;
- old handoffs;
- telemetry or local runtime folders;
- every Playwright scenario;
- the complete master project book;
- historical Q/R/X/W or r-init documents.
