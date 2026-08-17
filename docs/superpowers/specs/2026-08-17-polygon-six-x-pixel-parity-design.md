# Polygon six-X pixel-parity correction design

Date: 2026-08-17
Branch: `feature/20260817-polygon-six-x-integration`
Accepted source reference: `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`

## Goal

Correct only the visible product surfaces touched by the six-X integration so that they follow the accepted HTML prototype pixel-for-pixel in layout and visual language while preserving existing product ownership and live data paths.

In scope:

1. live map surface geometry and existing product overlays;
2. live unit tokens on that map;
3. `Редактор карты`, `Редактор юнита`, and the shared `Редакторы` surface;
4. right-panel `Инфо` presentation.

Out of scope for this correction:

- filling `Программа`, `Лаборатория`, `Серия`, `Метрики`, `Журнал`;
- implementing `Внимание`, `Память`, `Опасность`, `Скрытность`, `Позиции`, `Оружие` beyond preserving existing hooks;
- replacing simulation owners with HTML-demo state;
- fake units, fake map data, fake editor data, or a second renderer/selection/runtime.

## Reference geometry

The prototype defines these shell values and they remain the visual contract:

```text
--topbar-h: 58px
--left-w: 372px
--right-w: 336px
--panel-gap: 14px
history strip: 30px
panel radius: 7px
```

The live product canvas must fill the complete map viewport below the top chrome. The left and right panels float above/along the map surface with the prototype offsets. The product must not constrain the live canvas to a centered square and must not introduce letterboxing that is absent from the prototype.

## Architecture

### 1. Map surface

Keep the existing owner chain:

```text
GameApplication
→ PixiTacticalBoardApp
→ PixiMapRenderer
```

`polygon-map-surface.css` is presentation only. Remove the current `min(width,height)` square sizing contract. Position `#app` over the full `polygon-shell-viewport` instead, allowing the existing renderer/camera resize path to receive the real rectangular viewport.

Do not copy the HTML prototype map as an image or independent DOM map. Existing product overlays and HTML map overlays remain attached to `#app` and follow its new geometry.

### 2. Unit tokens

Keep `PixiUnitRenderer` as the only unit renderer and keep authoritative positions in simulation state. No new token store or demo layer is introduced.

The correction may adjust only presentation constants/styles that are needed for parity after the viewport fix. Unit selection and context-menu hit behavior must still resolve the real unit ID.

### 3. Embedded map and unit editors

Keep existing product editor hosts and domain logic. The correction changes their presentation shell instead of creating new editor implementations.

`CombatLabEditorShellBridge` continues to reparent existing editor hosts. `Редактор карты` and `Редактор юнита` are shown inside the accepted left panel, but legacy dark cards/controls are restyled to the prototype panel language: light surfaces, thin neutral borders, compact rows, prototype typography, button and field geometry.

No second editor state, registry, or write path is allowed.

### 4. Shared `Редакторы` surface

Keep `CombatLabGameEditors` and `GameEditorRegistry` as the product owners. Replace the current card-catalog presentation with a prototype-like editor workspace shell: light header, narrow navigation/list column, main work area, and existing editor host mounted in that work area.

Where the product lacks a corresponding editor capability, the shell may show an unavailable/empty state, but must not invent data or a functional editor.

### 5. Right-panel `Инфо`

Keep `preparePolygonInfoLiveOwners` and `PolygonRightPanelLiveView` as the live owner seam. Change only the DOM/CSS presentation to follow the prototype inspector: compact light sections, key/value rows, separators, prototype spacing and typography.

`Инфо` continues to read real map point/state data. The correction must not compute gameplay truth in the UI.

## Data flow

```text
SimulationState / map owners
→ existing renderer/editor/right-panel adapters
→ existing hosts
→ corrected prototype-matching presentation
```

There is no HTML-prototype runtime state in the product path.

## Performance impact

Hot path: renderer resize/render and existing right-panel refresh.

Worst-case complexity introduced by this correction: `O(1)` layout/style work per resize or panel state change. No new map scan, per-cell DOM/Pixi objects, unit×map work, polling loop, worker, queue, or cache is added.

The live map uses the existing renderer and existing prepared map data. The UI remains a consumer. Teardown remains owned by the current `GameApplication`, editor bridge, and right-panel view lifecycles.

## Verification

### Focused non-browser contracts

Add/update focused smoke checks that assert:

- `polygon-map-surface.css` no longer uses square `min(width,height)` sizing and fills the shell viewport;
- editor surfaces are presented through the existing hosts/registry, not duplicated;
- right-panel `Инфо` still mounts through the existing LINZA owner seam;
- unit renderer remains the existing `PixiUnitRenderer` owner.

Run TypeScript and one production build through the repository risk-selected CI route.

### Visual acceptance

Use `real-wargame-screenshots` and the deployed-Vercel Playwright fallback against the exact corrected SHA.

At `1600×900`, capture and manually inspect paired screenshots for:

1. base map + panels;
2. selected live unit on map;
3. `Редактор карты`;
4. `Редактор юнита`;
5. shared `Редакторы`;
6. right-panel `Инфо`.

Acceptance ignores the empty content of left-panel tabs outside this scope. Success requires geometry and styling of the six states to match the accepted prototype closely enough that the product no longer reads as the old dark UI embedded in a new shell.

## Safety boundaries

- No merge or transfer to `real-wargame-preview` without a separate explicit user GO.
- No `main` changes.
- Deployment is only for the exact corrected feature SHA and only because the user approved execution of the plan that includes fresh Preview visual verification.
- No new gameplay truth, selection store, map renderer, editor registry, fake data, or HTML-demo runtime.
