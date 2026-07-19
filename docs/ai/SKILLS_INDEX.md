# Skills Index

Project skill router for `Real-wargame`. Read only the skills required by the current task.

## Start route

1. Read `docs/ai/WEB_CHAT_START.md`.
2. Read the active subproject `STATUS.md`.
3. Match user intent to the table below.
4. Read every skill marked mandatory for that route.

For every runtime-affecting task, `real-wargame-performance` is mandatory in addition to the domain skill.

The user does not need to name a skill. Route by intent and current environment capabilities.

## Project skills

| Skill | Path | Read when |
|---|---|---|
| Real-Wargame performance contract | `.agents/skills/real-wargame-performance/SKILL.md` | Mandatory for simulation, AI, perception, navigation, tactical fields, map data, rendering, recurring UI, workers, queues, caches, revisions, lifecycle, diagnostics or browser-performance gates. |
| Real-Wargame local preview | `.agents/skills/real-wargame-local-preview/SKILL.md` | Visual-QA preparation, terminal-free local launch, or approved visual verification when the current Web Chat can directly control a real browser against the target. |
| Real-Wargame manual Vercel deploy | `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md` | **Mandatory** when the user explicitly asks to deploy, redeploy, create/update a Vercel Preview or check a manual Vercel deployment. |
| Real-Wargame GitHub Pages deploy | `.agents/skills/real-wargame-github-pages-deploy/SKILL.md` | **Mandatory** when the user explicitly asks to deploy, publish, redeploy or update a branch on GitHub Pages / Pages / «пайдж». |
| Vercel deployment Playwright E2E | `.agents/skills/vercel-deployment-playwright-e2e/SKILL.md` | **Mandatory automatically** when the user requests visual, screenshot, browser or Playwright verification of an already deployed Vercel Preview and the current Web Chat cannot directly control a real browser against that URL. |
| Real-Wargame PixiJS 8 guide | `.agents/skills/real-wargame-pixijs/SKILL.md` | Any PixiJS, canvas, renderer, camera, pointer event, visual layer or rendering-performance task. Read before general PixiJS skills. |
| Real-Wargame AI Runtime | `.agents/skills/real-wargame-ai-runtime/SKILL.md` | Soldier AI graph, Utility scoring, Blackboard, Runtime, lifecycle, cancellation, Bridge, AI Dictionary, node authoring or live trace. |

## Mandatory deployment routing

Git automatic Vercel deployments are disabled. A push never authorizes or triggers Vercel.

The following intent loads `real-wargame-manual-vercel-deploy`:

```text
деплой на Vercel
задеплой на Vercel
создай Preview
обнови Preview
проверь почему ручной Vercel-деплой упал
```

The following intent loads `real-wargame-github-pages-deploy`:

```text
задеплой на GitHub Pages
задеплой на Pages
задеплой на пайдж
обнови деплой на пайдж
опубликуй эту ветку на GitHub Pages
```

For GitHub Pages, the game and AI Node Editor are inseparable deployment targets. Success requires both:

```text
https://andrewverhoturov1.github.io/Real-wargame/
https://andrewverhoturov1.github.io/Real-wargame/ai-node-editor.html
```

Implementation, commit, push, transfer and merge requests do not imply deployment unless the user explicitly includes deployment.

One deployment request covers the exact current HEAD and necessary retries after build-failure fixes for the same task. A later product change requires a new request.

## Mandatory visual routing decision

When user intent includes visual verification, screenshots, browser verification or Playwright:

```text
Is a suitable Vercel deployment already available?

NO
→ do not deploy implicitly
→ report that explicit deployment is required

YES, and direct controlled browser is available
→ real-wargame-local-preview

YES, but direct controlled browser is unavailable
→ vercel-deployment-playwright-e2e
```

Visual verification permission is not deployment permission, and deployment permission is not Playwright/Chromium permission.

## Common routes

| User task | Skills |
|---|---|
| Deploy or redeploy exact branch HEAD to Vercel | `real-wargame-manual-vercel-deploy` mandatory |
| Deploy or update exact branch HEAD on GitHub Pages | `real-wargame-github-pages-deploy` mandatory |
| Run or show the local game | `real-wargame-local-preview` |
| Visually verify deployed Vercel Preview with direct browser available | `real-wargame-local-preview` |
| Visually verify deployed Vercel Preview without direct browser | `vercel-deployment-playwright-e2e` mandatory |
| Change simulation, AI, perception, navigation, map runtime, UI runtime or caches | `real-wargame-performance`, then relevant domain skill |
| Change map/unit/overlay visual | `real-wargame-performance`, `real-wargame-pixijs`; prepare visual verification separately |
| Diagnose FPS or overlay stalls | `real-wargame-performance`, `real-wargame-pixijs`, then narrow Pixi performance reference |
| Change GraphRunner or Utility score | `real-wargame-performance`, `real-wargame-ai-runtime` |
| Add a multi-tick action | `real-wargame-performance`, `real-wargame-ai-runtime` |
| Change AI Node Editor controls | `real-wargame-performance` when recurring/runtime work changes, then `real-wargame-ai-runtime` |
| Change documentation/navigation | no domain skill; use canonical JSON and `npm run docs:sync` |

## Vercel deployment invariants

When `real-wargame-manual-vercel-deploy` is selected:

- resolve exact remote branch HEAD before deployment;
- use only an authenticated route that can prove exact source identity;
- never enable Git automatic deployments;
- never create a dummy commit to trigger deployment;
- never commit Deploy Hook URLs, tokens or protected share URLs;
- verify status `READY` and both required pages;
- report deployed branch, commit and identity proof or `unproven`;
- do not deploy `main` without separate explicit approval.

## GitHub Pages deployment invariants

When `real-wargame-github-pages-deploy` is selected:

- resolve exact remote feature-branch HEAD before deployment;
- build with base path `/Real-wargame/`;
- require TypeScript, tactical-position, tactical-query, workspace, AI editor and deployment-page checks;
- publish the complete `dist` directory to `gh-pages`;
- confirm the system `pages build and deployment` workflow succeeds;
- verify both the game and `ai-node-editor.html`;
- never report success after checking only the game;
- do not use Vercel for a GitHub Pages request;
- do not modify `main` or `real-wargame-preview` without separate permission.

## Deployed-Vercel visual invariants

When `vercel-deployment-playwright-e2e` is selected:

- it tests an existing deployment and must not deploy the application;
- CI harness files exist only on temporary `ci/**` branches;
- temporary PR is never merged;
- secrets are never committed;
- application defects are fixed only on the canonical feature branch;
- every new product SHA requires fresh evidence;
- artifact ZIP and key screenshots are inspected;
- visual success does not grant preview-transfer approval.

## General PixiJS skills

Real-Wargame uses PixiJS 8.19.x.

```text
real-wargame-performance
→ real-wargame-pixijs
→ docs/ai/PIXIJS_SKILLS_INDEX.md
→ only the relevant general skill
```

Do not introduce deprecated v7 compatibility aliases.

## Required honesty

- GitHub Actions is not a local run on the user's PC.
- A Vercel deployment is not created by a push.
- A green build is not proof of correct visuals.
- Do not claim exact-SHA deployment when identity is unproven.
- Do not claim a skill was followed unless its required steps actually ran.
- Do not reuse evidence for a different product SHA.
- Do not read all `.agents/skills/` by default.

## Search limitation

GitHub code search may not immediately index new files on a non-default branch. When the exact path is known, fetch it directly with the explicit ref.
