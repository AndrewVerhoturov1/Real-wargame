---
name: real-wargame-pixijs
description: "Read first for any Real-Wargame PixiJS, canvas, rendering, camera, pointer-event, visual-layer or performance task. Guards the PixiJS 7 codebase from accidental PixiJS 8 API usage and routes to the relevant project files and general PixiJS references."
license: MIT
---

# Real-Wargame PixiJS 7 Guard

## Hard version rule

Real-Wargame currently uses:

```text
pixi.js ^7.4.3
```

Do not introduce PixiJS 8-only APIs unless the task explicitly requests and scopes a major-version migration.

Examples that require special caution:

- `await app.init(...)` instead of the existing v7 application construction;
- `GraphicsContext` or v8 chained `fill()` / `stroke()` assumptions;
- v8 event defaults and migration-specific property names;
- `DOMContainer`, WebGPU-first setup or v8 package layout;
- advice copied from the general v8 skill collection without checking the installed version.

## Read order

1. `docs/ai/WEB_CHAT_START.md`.
2. Active subproject `STATUS.md`.
3. `docs/architecture/OVERVIEW.md`.
4. The existing renderer/input module that owns the behavior.
5. This skill.
6. `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md` for visible work.
7. Only then the relevant general PixiJS skill as conceptual reference.

For a real v7/v8 API question, verify against PixiJS 7 documentation or the existing code pattern. Do not silently modernize the project.

## Routes

| Task | Read first |
|---|---|
| Shapes, zones, lines, overlays | renderer involved, then scene-graphics concepts with v7 translation |
| Unit visual or sprite | `PixiUnitRenderer.ts`, asset/sprite concepts |
| Camera, wheel, pointer or drag | `CameraController.ts`, `BoardInputController.ts`, events concepts |
| Frame stalls or too many objects | renderer lifecycle, performance concepts, browser evidence |
| Text readability | Pixi text or existing HTML overlay path |
| Major migration | `pixijs-migration-v8` plus a dedicated design and full-repository plan |

## Project rendering rules

- A renderer displays state; it does not own authoritative simulation data.
- Reuse long-lived containers, graphics and DOM controls.
- Do not rebuild static terrain because the mouse moved.
- Do not create thousands of independent cells for a broad overlay without profiling.
- Keep camera transforms consistent across Pixi objects, HTML overlays and Playwright coordinates.
- Keep simulation input and editor input distinguishable.
- Fix unstable application DOM instead of hiding it with Playwright retries.

## Performance investigation order

1. Reproduce through focused code/runtime evidence when possible.
2. Identify which layer changes when the stall occurs.
3. Check object counts, container rebuilds, texture creation, DOM replacement and cache invalidation.
4. Read the narrow renderer and its data source.
5. Make the smallest change.
6. Run build and focused smoke checks.
7. Prepare a fresh real-browser scenario and expected PNG list.
8. Ask the user whether to execute visual QA.
9. Run and inspect it only after explicit approval.

## Required verification

For non-visual pure refactors:

```text
npm run build
relevant smoke test
```

For visible rendering, camera or input changes, prepare:

```text
npm run build
relevant focused smoke test
relevant Playwright scenario
expected fresh PNG list
```

Then ask:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

Only after explicit approval run:

```text
real browser scenario
fresh PNG artifact
artifact SHA match
manual PNG inspection
```

A prior explicit visual-verification request already counts as approval.

If approval is declined, report the change as implemented but not visually verified.

Use `.agents/skills/real-wargame-local-preview/SKILL.md` for the execution workflow.
