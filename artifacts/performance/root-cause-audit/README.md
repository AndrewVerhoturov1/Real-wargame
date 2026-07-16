# Performance regression root-cause audit — initial evidence

Status: **in progress**. This document records evidence that can be proven from exact source state
`5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74`. It is deliberately not a substitute for the
required A/B/C browser measurements.

## Source states

| State | SHA | Role |
| --- | --- | --- |
| A | `4a9fd2292ee9ded682d34064a2b721feab21ec4a` | After PR #127, before shared visibility/vegetation |
| B | `4adb42650f0fb6ad61b31f9521cec4508a5a40ec` | After PR #128, before tactical orders |
| C | `5f097f79e2150764d5dc4ac8cb0c4db6ba90aa74` | Problematic preview |

The supplied task names `real-wargame-performance-2026-07-16_18-52-03-589.json`, but the raw
JSON was not present in the worker input or repository. Consequently, no reported timing, p95,
frequency, browser attribution, or A/B/C delta below is inferred from the task text.

## Proven source-level causes

| Rank | Cause | Regression / pre-existing | Trigger | Code path | Measured cost | Frequency | Status | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Tactical-order UI invalidated immutable map | Introduced by PR #129 | Open/close/confirm radial order | `TacticalOrderRadialInput.notifyChanged → main.refresh callback → PixiTacticalBoardApp.forceRender → renderEditableMapLayerIfNeeded` | Static map: 320×200 cells; each rebuild allocates/renders two 3072×1920 raster layers (about 45 MiB raw RGBA before GPU copies) and recreates Pixi textures | At least menu open and close/confirmation | PROVEN | Implemented: order refresh now calls `renderNow()`, retaining map cache |
| 2 | Moving directional threat causes full-map cover rebuilds | Introduced/exposed by PR #128 shared field path | Threat origin crosses 0.1-cell bucket | `getSoldierDangerField → buildThreatGeometry → getThreatRelativeCoverField → buildField` | 64,000 map cells × eligible object descriptors; one field retains 384,000 bytes plus temporary 256,000-byte forest density | One build per new 0.1-cell origin, cache limit 16 | PROVEN source-level work; runtime share not yet measured | Bound work by threat range/spatial geometry and stabilize/reuse origin fields without changing combat semantics |
| 3 | Moving directional threat causes line-of-fire geometry rebuilds | Introduced by PR #128 | Threat origin crosses 0.25-cell bucket or changes range | `getSoldierDangerField → getVisibilityGeometryField → buildField → perimeter supercover rays` | Four full-map typed arrays = 256,000 bytes/field; each rebuild traces every perimeter ray in range; cache limit 24 | One build per new geometry key | PROVEN source-level work; runtime share not yet measured | Instrument keys/rays/cells; reuse stable geometry or incrementally update only after semantic validation |
| 4 | Soldier danger geometry and scored fields use fine moving keys | Existing danger implementation, intensified by PR #128 inputs | Threat x/y quantized at 0.05 cells | `buildThreatGeometrySignature → buildThreatGeometry`; `buildGeometrySetKey → scoreDangerField` | Geometry: 576,000 bytes each × 24; score field: 384,000 bytes each × 12; every miss scans all 64,000 cells | Every newly quantized threat state | PROVEN source-level work; runtime share not yet measured | Separate immutable threat geometry from low-cost dynamic scoring; validate a coarser key only against tactical correctness |
| 5 | TacticalWorkspace repeats hidden/background work and is not disposable | Pre-existing | Every 300 ms, including editor mode | `installTacticalWorkspace → setInterval(update, 300) → updateBottom/renderSidebar` | `updateBottom` queries every unit/contact; danger/stealth sidebar can call `buildSoldierAwarenessReport`; no timer/listener cleanup exists | 3.33 callbacks/s for page lifetime | PROVEN lifecycle defect; timing not measured | Return teardown; stop timer when workspace hidden/editor; render only changed UI state |
| 6 | Grid toggle rebuilds whole static map | Pre-existing before A; PR #128 only changes vegetation presentation inputs | Grid toggle or any forced map refresh | `PixiApp.handleGridToggle → renderEditableMapLayerIfNeeded → PixiMapRenderer.renderStaticLayerIfNeeded` | Same two 3072×1920 rasters plus terrain/vector and grid reconstruction | Per toggle/forced refresh | PROVEN source-level work; A/B delta not measured | Split grid from terrain/raster caches; retain raster textures and toggle grid visibility |

## Explicitly not proven

| Suspect | Status | Why |
| --- | --- | --- |
| TacticalOrderStatusCard 250 ms interval | NOT MEASURABLE | Its key guard avoids DOM replacement when unchanged; raw CPU/LoAF data is required. |
| Per-unit AI scheduler | NOT MEASURABLE | The scheduler is simulation-time cadence controlled; exact unit controls, tick rate and CPU samples are missing. |
| PerformanceObserver/report collection | NOT MEASURABLE | Observer support and report overhead depend on the measured browser; no enabled/disabled A/B was supplied. |
| Pixi GPU submission, browser or dev-server effects | NOT MEASURABLE | Requires real-browser trace/LoAF attribution. |
| GC pauses | LIKELY allocation pressure | The typed-array/canvas churn above is concrete, but GC attribution needs a browser trace. |

## Required next evidence

1. Supply the original JSON report and provide a checkout/artifact that can execute the exact A/B/C browser scenario.
2. Add phase timing and cache-key instrumentation before interpreting `FrameRequestCallback` stalls.
3. Repeat each scenario, record median/p95/max, then classify the remaining long tasks by overlap with:
   `tickSimulation`, map rebuild, overlay renders, workspace interval, status-card interval, worker message application, and LoAF script/layout attribution.
4. Run the same scenario with diagnostics enabled and disabled, then with all units manual and graph-controlled.

## Change made during audit

The PR #129 tactical-order callback now refreshes dynamic order/UI layers without marking the
static map invalid. Map-mutating controls retain `forceRender()` and therefore still rebuild the
map when required.
