# Visibility controls and final facing — 2026-07-13

## Scope

This package refines the already merged View and Memory Heatmap v1 without changing the core subjective-memory model.

Delivered behavior:

- unseen map cells receive a dark semi-transparent raster overlay while terrain remains readable;
- the «Обзор и память» panel contains a compact heatmap and contact-marker legend;
- diagnostics now separate «Полей в кеше: 1» from cumulative reuse hits;
- directional machine-gun fire keeps a stable base color while current visual confirmation uses a small separate marker;
- the bottom soldier card exposes manual attention modes: automatic, march, observe, search and engage;
- «Повернуть» is a one-shot tool: activate, right-click a direction, then return to the normal cursor;
- right-button dragging from a movement destination stores and previews the requested final facing;
- route replanning preserves final facing and SimulationTick applies it before completing the linked player command.

## Performance and memory

The visibility system still retains only one current field per SimulationState through a WeakMap runtime. A rebuild replaces the previous Uint8Array; old heatmaps are not stored. Historical knowledge remains only as contact and threat-memory markers.

The unseen mask reuses the existing one-texture PixiJS path. It does not create a Graphics or Sprite object per cell. Camera and cursor movement remain outside the visibility-field cache key.

## Root cause of directional-fire flicker

The remembered-threat renderer previously selected the whole threat color from the frequently changing visibleNow flag. Perception updates could therefore alternate the complete directional-fire graphic between two colors. The base directional-fire color is now stable; visibleNow only controls a small confirmation marker.

## Verification

Code SHA: `4bd7b3a4f52c1654c8e1440799e6a91059b55402`.

- focused core run `29213161725`: workspace contract, routed movement, one-field cache contract and production build succeeded;
- system-Chrome run `29213161725`: 3/3 focused Playwright scenarios passed;
- inspected screenshots:
  - `visibility-controls-dark-unseen-and-legend.png`;
  - `visibility-controls-manual-search-mode.png`;
  - `visibility-controls-one-shot-turn.png`;
  - `visibility-controls-route-facing-draft.png`;
  - `visibility-controls-route-facing-command.png`.

Visual QA found one real issue: the turn tool deactivated correctly but the shared normal-game cursor resolver returned crosshair. The resolver now returns the ordinary default cursor outside the editor and AI lab, and the repeated Chrome run passed.

## Honest limits

- final facing currently applies to movement orders issued by the player UI; there is no formation-facing command for groups yet;
- the manual engage mode selects the attention profile but does not create a new enemy target;
- the heatmap remains selected-soldier-only;
- the machine-gun representation is still a pressure/threat visualization rather than a full projectile simulation.
