# PixiJS Skills Index

## Mandatory Real-Wargame guard

Real-Wargame uses PixiJS **7.4.x**. The installed general PixiJS skill collection is primarily written for PixiJS 8.

For every PixiJS task, read first:

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

Then use this index to choose a conceptual reference. Do not introduce v8-only APIs unless the task explicitly scopes a major migration.

## General skill locations

```text
.agents/skills/<skill-name>/SKILL.md
.agents/skills/<skill-name>/references/
```

## Route by task

| Situation | General skill reference | Real-Wargame caution |
|---|---|---|
| Application or renderer setup | `pixijs`, `pixijs-application` | Existing project is v7; do not switch to `app.init()` implicitly. |
| Scene graph and containers | `pixijs-scene-core-concepts`, `pixijs-scene-container` | Verify v7 names and lifecycle against current code. |
| Vector shapes, lines and zones | `pixijs-scene-graphics` | v8 `GraphicsContext` and chained fill/stroke APIs may not apply. |
| Unit sprites and animation | `pixijs-scene-sprite`, `pixijs-assets` | Follow existing texture and renderer patterns. |
| Text and labels | `pixijs-scene-text` | Compare Pixi text with the existing HTML overlay path. |
| Pointer, mouse, wheel and drag | `pixijs-events` | Verify v7 event mode and propagation behavior. |
| Camera math and coordinates | `pixijs-math`, `pixijs-events` | Keep Pixi, HTML overlay and Playwright coordinates aligned. |
| FPS, stalls and too many objects | `pixijs-performance`, `pixijs-scene-container`, optionally particle concepts | Profile first; do not migrate API as a performance fix. |
| Custom shaders or filters | `pixijs-custom-rendering`, `pixijs-filters` | Confirm support in installed v7 before coding. |
| Actual v7 → v8 migration | `pixijs-migration-v8`, `pixijs`, application and event skills | Requires a separate design, full compatibility plan and broad tests. |

## Most common Real-Wargame routes

### Map, terrain, front zones or overlays

```text
real-wargame-pixijs
→ current renderer and data source
→ pixijs-scene-graphics concepts
→ pixijs-performance only when evidence shows a performance issue
```

### Soldier visual

```text
real-wargame-pixijs
→ src/rendering/PixiUnitRenderer.ts
→ sprite or graphics concepts
→ real browser and fresh PNG
```

### Camera or input

```text
real-wargame-pixijs
→ CameraController.ts / BoardInputController.ts
→ events and math concepts
→ focused Playwright scenario
```

### Rendering performance

```text
real-wargame-pixijs
→ reproduce in real browser
→ identify rebuilding layer and object count
→ performance reference
→ smallest v7-compatible fix
→ rerun and inspect
```

## Rules

- Do not read every PixiJS skill.
- Do not assume the latest PixiJS API matches the installed version.
- Do not use Godot commands or architecture.
- Do not claim visual success from source inspection.
- Use `.agents/skills/real-wargame-local-preview/SKILL.md` for screenshots and visual evidence.
