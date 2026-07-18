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
| Vercel deployment Playwright E2E | `.agents/skills/vercel-deployment-playwright-e2e/SKILL.md` | **Mandatory automatically** when the user requests visual, screenshot, browser or Playwright verification of a branch-linked Vercel Preview and the current Web Chat cannot directly control a real browser against that URL. The user does not need to name this skill. |
| Real-Wargame PixiJS 8 guide | `.agents/skills/real-wargame-pixijs/SKILL.md` | Any PixiJS, canvas, renderer, camera, pointer event, visual layer or rendering-performance task. Read before general PixiJS skills. |
| Real-Wargame AI Runtime | `.agents/skills/real-wargame-ai-runtime/SKILL.md` | Soldier AI graph, Utility scoring, Blackboard, Runtime, lifecycle, cancellation, Bridge, AI Dictionary, node authoring or live trace. |

## Mandatory visual routing decision

When user intent includes visual verification, screenshots, browser verification or Playwright:

```text
Can the current Web Chat directly control a real browser against target_url?

YES
→ real-wargame-local-preview

NO, and target is a branch-linked Vercel Preview
→ MUST read vercel-deployment-playwright-e2e
```

Examples that trigger this decision without naming any skill:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

Do not ask the user to repeat the skill name. If the user already requested visual verification, approval is already present.

## Common routes

| User task | Skills |
|---|---|
| Run or show the local game | `real-wargame-local-preview` |
| Visually verify deployed Vercel Preview with direct browser available | `real-wargame-local-preview` |
| Visually verify deployed Vercel Preview without direct browser | `vercel-deployment-playwright-e2e` mandatory |
| Change simulation, AI, perception, navigation, map runtime, UI runtime or caches | `real-wargame-performance`, then relevant domain skill |
| Change map/unit/overlay visual | `real-wargame-performance`, `real-wargame-pixijs`, then prepare visual verification; select direct-browser or deployed-Vercel skill at execution time |
| Diagnose FPS or overlay stalls | `real-wargame-performance`, `real-wargame-pixijs`, then narrow Pixi performance reference |
| Change GraphRunner or Utility score | `real-wargame-performance`, `real-wargame-ai-runtime` |
| Add a multi-tick action | `real-wargame-performance`, `real-wargame-ai-runtime`, then prepare visual verification when visible behavior changes |
| Change AI Node Editor controls | `real-wargame-performance` when recurring/runtime work changes, then `real-wargame-ai-runtime`; select visual skill at execution time |
| Change documentation/navigation | no domain skill; use canonical JSON and `npm run docs:sync` |

## Deployed-Vercel skill invariants

When `vercel-deployment-playwright-e2e` is selected:

- CI harness files exist only on temporary `ci/**` branches;
- temporary PR is never merged;
- share tokens and bypass secrets are never committed;
- test-harness defects are fixed only on the temporary CI head branch;
- application defects are fixed only on the canonical feature branch;
- every new product SHA requires fresh CI branches and fresh evidence;
- artifact ZIP is downloaded, extracted and inspected;
- key screenshots are shown to the user;
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
- A green workflow is not proof of correct visuals until fresh evidence is inspected.
- A diagnostic performance capture without enforcement is not an acceptance gate.
- Do not claim a skill was followed unless its required steps actually ran.
- Do not reuse evidence for a different product SHA.
- Do not read all `.agents/skills/` by default.

## Search limitation

GitHub code search may not immediately index new files on a non-default branch. When the exact path is known, fetch it directly with the explicit ref.