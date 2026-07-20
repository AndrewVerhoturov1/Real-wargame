# Cell Inspector Danger Explanation and Unit Magnet Design

## Goal

Make Ctrl-hover on the Danger layer explain why the inspected cell is dangerous, and make the inspector briefly snap to the cell occupied by a nearby visible soldier.

## Scope

- Danger explanations use only the already prepared awareness field and the selected soldier's tactical knowledge.
- Hovering must not trigger pathfinding, full-map scans, worker requests, visibility rebuilds, or threat-field rebuilds.
- The operating-system cursor does not move. Only the cell inspected by the popover changes.
- The selected soldier is excluded from snapping.
- Friendly soldiers are eligible. Enemy soldiers are eligible only when the selected soldier currently has an exact visible visual contact for that unit (`sourceUnitId` matches and `visibleNow` is true).
- Snap acquisition radius is short: 2.5 grid cells. Release radius is 3.25 grid cells to prevent edge jitter.
- If several eligible soldiers are in range, choose the nearest one.

## Architecture

### Hover target resolver

Create `src/ui/CellInspectorTarget.ts` with a small stateful resolver. It receives the current pointer grid position, simulation state, and previous snapped unit ID. It returns the target cell and optional snapped unit metadata. The resolver performs a single O(unit count + contact count) pass and allocates no per-unit arrays.

### Controller integration

`src/ui/CellInspector.ts` keeps the current snapped unit ID. Each refresh resolves the target before building layer content. The popover receives a `data-snapped-unit-id` attribute while snapped. Pointer leave, Ctrl release, blur, editor mode, and teardown clear the snap.

### Danger explanation

`src/ui/CellInspectorContent.ts` continues to read the prepared awareness snapshot. For Danger cells it derives an ordered explanation from:

- total danger;
- suppression;
- expected protection against known threats;
- forward-slope exposure;
- reverse-slope protection;
- uncertainty;
- protected threat index and known threat metadata.

The first reason states the dominant cause in plain Russian. Metrics expose the components needed to understand the score. Hidden threat coordinates are never disclosed; unidentified threats are described generically.

## Testing

Extend `scripts/cell_inspector_smoke.mjs` to require:

- a dedicated target resolver;
- separate acquire and release radii;
- nearest-unit selection;
- selected-unit exclusion;
- enemy eligibility guarded by current visible contact;
- no `filter` or `sort` in the hover target hot path;
- expanded danger contributor labels and protected-threat lookup;
- no pathfinding, worker request, or full-map loop in hover code.

The deployment build must pass TypeScript, `cell-inspector:smoke`, Vite production build, and deployment-page smoke checks.
