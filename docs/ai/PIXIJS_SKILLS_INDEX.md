# PixiJS Skills Index

## Mandatory Real-Wargame route

Real-Wargame uses PixiJS **8.19.x**. The installed general PixiJS skill collection is the applicable API guidance.

For every PixiJS task, read first:

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

Then use this index to choose the narrowest applicable v8 reference. Do not retain v7 compatibility aliases in active production code.

## General skill locations

```text
.agents/skills/<skill-name>/SKILL.md
.agents/skills/<skill-name>/references/
```

## Route by task

| Situation | General skill reference | Real-Wargame caution |
|---|---|---|
| Application or renderer setup | `pixijs`, `pixijs-application` | Await `app.init()`; use `app.canvas`. |
| Scene graph and containers | `pixijs-scene-core-concepts`, `pixijs-scene-container` | Preserve ownership and destroy lifecycle. |
| Vector shapes, lines and zones | `pixijs-scene-graphics` | Use shape/path then `fill()` / `stroke()`. |
| Unit sprites and animation | `pixijs-scene-sprite`, `pixijs-assets` | Follow existing texture and renderer patterns. |
| Text and labels | `pixijs-scene-text` | Use options objects and v8 stroke styles. |
| Pointer, mouse, wheel and drag | `pixijs-events` | Preserve DOM input unless Federated Events are required. |
| Camera math and coordinates | `pixijs-math`, `pixijs-events` | Keep Pixi, HTML overlay and Playwright coordinates aligned. |
| FPS, stalls and too many objects | `pixijs-performance`, `pixijs-scene-container`, optionally particle concepts | Profile first; keep bounded textures and caches. |
| Custom shaders or filters | `pixijs-custom-rendering`, `pixijs-filters` | Confirm the current v8 API before coding. |
| Legacy compatibility cleanup | `pixijs-migration-v8`, `pixijs`, application and event skills | Keep code free of v7 aliases. |

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
→ smallest v8-compatible fix
→ rerun and inspect
```

## Rules

- Do not read every PixiJS skill.
- Verify the installed v8 API before using a less common surface.
- Do not use Godot commands or architecture.
- Do not claim visual success from source inspection.
- Use `.agents/skills/real-wargame-local-preview/SKILL.md` for screenshots and visual evidence.
