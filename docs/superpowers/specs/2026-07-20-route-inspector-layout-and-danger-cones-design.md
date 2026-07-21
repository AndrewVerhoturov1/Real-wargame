# Route inspector layout and danger cones design

## Goal

Make the `Маршрут` inspector readable at the current 330–420 px sidebar width and restore an optional unit view-cone overlay that is controlled from the `Опасность` tab and is disabled by default.

## Route inspector

The inspector remains a single vertical column. Existing live DOM controls are reused so navigation profile selection, route diagnostics and their current event handlers remain canonical.

The content order is:

1. `Стоимость движения` heading and explanation.
2. Full-width cost-view selector.
3. Full-width movement-profile selector.
4. Full-width route execution summary containing command, plan, route, applied profile, cost and reason.

All migrated children explicitly reset the compact bottom-bar grid areas. Status rows wrap normally, occupy the complete panel width and use consistent spacing, border and typography. The bottom bar continues to contain attention controls and turn controls only.

## Danger cones

`Конусы угроз` means the existing unit view-cone visualization based on each unit's `viewRangeCells`, `viewAngleRadians` and `facingRadians`.

The existing `#vision-toggle` remains the canonical toggle and keeps the existing `PixiTacticalBoardApp` state. It is moved from the global `Вид` menu into the `Опасность` panel. The label is `Конусы угроз: вкл/выкл`.

The renderer is restored using one retained Pixi `Graphics` object and redraws only when its geometry key changes. Cones are rendered only when:

- the toggle is enabled;
- simulation mode is active;
- the selected workspace layer is `danger`;
- unit rendering is enabled.

Leaving the danger layer clears the cone graphics even if the toggle remains enabled. Initial state remains disabled.

## Performance and lifecycle

No worker, timer, full-map calculation or cache is added. The view-cone geometry is bounded by unit count and a fixed arc segment count. Hidden cones do no geometry work. Existing toggle listeners remain owned and removed by `PixiTacticalBoardApp`; the workspace only relocates the existing button.

## Verification

Focused source smoke checks cover:

- route inspector children reset compact grid areas and occupy one column;
- route details wrap and use full width;
- the canonical vision toggle is mounted in the danger panel and absent from the global display menu;
- the toggle is disabled by default;
- view cones render only in danger mode and are cleared otherwise;
- the renderer retains one graphics object and avoids per-frame child allocation.

TypeScript and production Vite build must also pass. Browser visual verification is desirable but is not claimed unless Chromium or Playwright is explicitly run.