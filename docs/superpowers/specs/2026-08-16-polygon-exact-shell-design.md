# Polygon Exact Shell Design

## Goal

Replace the current reconstructed ARKA visual shell with a shell that matches the attached canonical HTML prototype `polygon-series-v1.1-memory-v3-interface-linkage(1).html` as closely as practical, while keeping product/runtime ownership intact.

## Approved visual direction

- The attached HTML prototype is the visual source of truth.
- Do not preserve the current dark/live-map visual treatment merely for compatibility.
- Keep only the new Polygon shell: top controls, 30 px history/status strip, left panel with tabs, right panel with tabs, and central workspace.
- Hide the live game map visually for this pass and replace it with a neutral static placeholder matching the prototype's light grey-beige map surface and fine grid.
- Do not copy prototype demo units, demo event counts, replay data, demo inspectors, or its standalone JS state model.
- Do not create runtime state, selected units, history data, or fake gameplay data in UI code.

## Geometry

- Top bar: `58px`.
- History/status strip: `30px` immediately below the top bar.
- Total top chrome: `88px`.
- Left floating panel: `372px` wide.
- Right floating panel: `336px` wide.
- Side panel gap from viewport edge: `14px`.
- Side panels begin below the 88 px top chrome.

## Visual language

- Top bar: olive `#344321` with darker olive `#273318`.
- Accent: muted yellow `#d8b941`.
- Panel/workspace surfaces: warm off-white / grey-beige family used by the prototype, including `#f6f5ee`-like panel surfaces and `#ebe9df`-like status strip surfaces.
- Borders are thin grey/olive lines; shadows are restrained and compact.
- Typography is small, dense and tool-like.
- Tabs live inside the left and right panels; there is no global workspace tab strip.
- Active tabs use the olive active state. Hover/focus must not turn active tabs yellow.

## Top chrome

- Preserve the product's real run controls if already available, but style/position them to match the prototype's compact control rhythm.
- Include prototype top-level menu labels such as `ФАЙЛ`, `РЕДАКТОРЫ`, and `ВИД ▾` only as shell controls; do not invent unavailable behavior.
- The 30 px history/status strip is visually present globally. It may show real runtime status, but must not show prototype demo event counts or fake replay/history state.

## Left panel

Visible workspace tabs:

- `Программа`
- `Лаборатория`
- `Редактор карты`
- `Редактор юнита`
- `Серия`
- `Метрики`
- `Журнал`

The body stays visually faithful but non-domain for this pass. Existing product hosts may remain hidden compatibility mounts so current initialization is not broken.

## Right panel

Visible tabs:

- `Юнит`
- `Инфо`
- `Внимание`
- `Память`

The body remains an honest empty/workspace surface until product owners are integrated. No fake selected unit or inspector values.

## Central workspace placeholder

- The existing live map/canvas remains in product architecture but is visually hidden in Polygon mode for this pass.
- The shell provides a non-interactive placeholder surface above/masking it.
- Placeholder appearance follows the prototype: light grey-beige field, fine 20 px grid plus subtle 80 px grid rhythm, no units, no terrain demo, no live canvas blur.
- Placeholder resizes with the viewport and panel collapse states.

## Responsive behavior

- Wide desktop: the 372/336 px floating panels remain visible above the central placeholder.
- Around 1080 px: the shell stays composed and dense; existing responsive overlay/collapse rules may be used, but old Combat Lab chrome must not appear.
- Collapse controls remain functional and the top run controls stay visible.

## Non-goals

- No runtime/history implementation.
- No Unit/Info/Attention/Memory data implementation.
- No Program/Lab/Metrics/Journal/Series functionality migration in this pass.
- No Save/Open experiment work.
- No context-menu migration.
- No production deployment.

## Acceptance

1. Full Preview verification passes with no skipped checks.
2. Fresh Chromium screenshots are captured from the exact deployed SHA at `1600×900` and `1080×800`.
3. Those screenshots are compared visually with the canonical HTML rendered at the same sizes.
4. The live game map is not visible; the center is the light prototype-style placeholder.
5. No old global Combat Lab tab bar, sidebars or HUD competes visually with the Polygon shell.
6. No demo counts, fake unit state, fake history or synthetic gameplay data appears.
