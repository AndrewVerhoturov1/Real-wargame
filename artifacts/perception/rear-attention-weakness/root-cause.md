# Rear attention weakness — root cause and optimized integration

## Exact integration base

```text
real-wargame-preview: ad4f35535425aef11db6f27ca959bbd3696d36dc
performance contract: docs/performance/PERFORMANCE_PRINCIPLES.md
```

This result is rebuilt from the optimized preview that merged PR #138. It does not restore the older full-field point-perception implementation and does not replace the bounded point-LOS cache, scheduler budgets, LongTask classification, route-danger semantics or enforced browser gate.

## Root cause

The previous directional model distinguished the rear mainly by scheduling:

- angles at or beyond 135° used `rearCheckIntervalSeconds`;
- the target still inherited ordinary peripheral attention strength;
- visibility quality still used the full `maximumVisualRangeMeters`;
- when a rear check became due, perception integrated evidence across the full rear interval.

A rear target was therefore checked less often, but each check could compensate for the delay. On open terrain it retained non-zero quality across almost the complete visual range. The selected-unit heatmap also filled unseen map cells with a translucent overlay, so the objective map remained visible even where current machine visual quality was zero.

## New semantics

The existing attention profile, optimized point-LOS pipeline and selected-unit raster are retained.

- A smooth rear transition runs from 123° to 147°.
- The canonical direct rear sector starts at 135° and remains centred at 180°.
- Direct rear attention is capped at `0.06`.
- A due rear check represents a one-second glimpse inside the existing rear interval. In default `observe`, the evidence factor is `1 / 5 = 0.20`.
- Effective visual range is derived from the same directional attention weight consumed by gameplay and the current-view raster.

Default `observe` contract for a soldier with 600 m base vision:

| Direction | Angle | Attention weight | Range factor | Effective range | Evidence sampling |
| --- | ---: | ---: | ---: | ---: | ---: |
| front | 0° | 1.000 | 1.000 | 600 m | 1.000 |
| side | 90° | 0.309 | 0.719 | 431 m | 1.000 |
| direct rear | 180° | 0.060 | 0.250 | 150 m | 0.200 |

A neutral 60 m benchmark reaches the `contact` threshold in approximately:

- front: `1.54 s`;
- side: `5.04 s`;
- direct rear: `230.90 s`.

Target posture, movement, firing, size, concealment, vegetation, observer condition and stable detection variance remain active. A running or firing target behind the observer remains easier to notice than a stationary concealed target.

## Black means no current visual information

The current-view raster initializes every map pixel as fully opaque black. A cell receives the existing yellow/green/cyan/blue heatmap colour only when its machine-owned current visual quality is positive.

The same `sampleAttentionWeight()` and `evaluateCellVisibilityQuality()` functions are consumed by:

- optimized gameplay point visibility through `PointVisibility` and `PerceptionSystem`;
- the selected-unit current-view raster through `SelectedUnitVisibilityField` and `PixiVisibilityHeatmapRenderer`.

A cell that is black because it is outside directional range or behind a hard blocker contributes zero visual quality. The renderer does not become gameplay truth.

This remains an explicit selected-unit current-view layer, not a new global team fog-of-war or memory architecture.

## Mandatory performance review

```text
hot path:
  sampleAttentionWeight, evaluateCellVisibilityQuality,
  due point-perception checks, revision-driven raster upload

worst-case complexity:
  unchanged O(candidate stimuli) for perception;
  unchanged O(cells in an explicitly requested selected-unit raster)

main-thread work:
  bounded scalar arithmetic only; no new query, allocation domain or traversal

full-map builds:
  0 added; hidden current-view layer still performs zero field work

shared prepared data:
  AttentionSample and CellVisibilityQuality remain the canonical shared values

worker and queue budget:
  unchanged; no worker or queue added

cache owner/key/limit:
  no cache added; optimized point-LOS cache remains state-owned and capped at 512;
  point preparation remains capped at 2 per simulation step

invalidation revisions:
  unchanged map revisions, observer state, profile, direction and selected-field key

memory estimate:
  no persistent runtime structure added; existing raster, typed arrays and caches reused

stale-result rejection:
  no asynchronous path added

teardown:
  unchanged; existing renderer destroy remains symmetric and idempotent
```

## Why a global rewrite is unnecessary

The optimized preview already has the correct ownership boundaries: bounded point LOS for gameplay, a revision-driven raster only for the explicitly enabled current-view layer, machine-owned visibility quality and renderer-only presentation. The defect is directional semantics above those boundaries. Correcting weight, range and sampling preserves the optimized architecture instead of replacing it.
