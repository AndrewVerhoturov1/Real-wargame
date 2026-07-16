# Skills Index

Project skill router for `Real-wargame`. Read only the skills required by the current task.

## Start route

1. Read `docs/ai/WEB_CHAT_START.md`.
2. Read the active subproject `STATUS.md`.
3. Choose a skill from the table below.
4. Read narrower references only when the project skill routes to them.

## Project skills

| Skill | Path | Read when |
|---|---|---|
| Real-Wargame local preview | `.agents/skills/real-wargame-local-preview/SKILL.md` | Local launch, terminal-free preview, GitHub Actions screenshots, Playwright, visual QA, artifacts or showing the real game in chat. |
| Real-Wargame PixiJS 8 guide | `.agents/skills/real-wargame-pixijs/SKILL.md` | Any PixiJS, canvas, renderer, camera, pointer event, visual layer or rendering-performance task. Read before general PixiJS skills. |
| Real-Wargame AI Runtime | `.agents/skills/real-wargame-ai-runtime/SKILL.md` | Soldier AI graph, Utility scoring, Blackboard, Runtime, lifecycle, cancellation, Bridge, AI Dictionary, node authoring or live trace. |

## Common routes

| User task | Skills |
|---|---|
| Run or show the game | `real-wargame-local-preview` |
| Change map/unit/overlay visual | `real-wargame-pixijs`, then local preview for visual verification |
| Diagnose FPS or overlay stalls | `real-wargame-pixijs`, then the narrow Pixi performance reference |
| Change GraphRunner or Utility score | `real-wargame-ai-runtime` |
| Add a multi-tick action | `real-wargame-ai-runtime`, then local preview for visible runtime behavior |
| Change AI Node Editor controls | `real-wargame-ai-runtime`, local preview |
| Change documentation/navigation | no domain skill; use canonical JSON and `npm run docs:sync` |

## General PixiJS skills

Real-Wargame uses PixiJS 8.19.x; the installed general collection is the canonical API route.

For any PixiJS task:

```text
real-wargame-pixijs
→ docs/ai/PIXIJS_SKILLS_INDEX.md
→ only the relevant general skill
```

Do not introduce deprecated v7 compatibility aliases into active production code.

## Required honesty

- A GitHub Actions browser run is not a local run on the user's PC.
- A green workflow is not proof of good visuals until fresh PNGs are inspected.
- Do not claim a skill was followed unless its required checks were actually performed.
- Do not read all `.agents/skills/` by default.

## Search limitation

GitHub code search may not immediately index new files on a non-default branch. When the exact path is known, fetch it directly with the explicit ref.
