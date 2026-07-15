# Danger-layer browser long-task attribution contract

## Purpose

The hosted Chromium performance workflow must distinguish a real danger-layer main-thread stall from browser, software-rendering, Playwright or hosted-runner time. A global `PerformanceObserver` long task is never deleted or silently ignored. Every observed task remains in the uploaded artifact with its start time, duration, scenario, overlapping phases, classified script time, unaccounted time, classification and reason.

This contract supplements `DANGER_LAYER_PERFORMANCE_CONTRACT.md`. It does not change `performance-report-v4` build identity and does not claim hardware FPS from GitHub-hosted Chromium.

## Evidence pipeline

The permanent read-only workflow performs the following exact-head sequence:

```text
exact base Chromium measurement
→ exact head Chromium measurement
→ strict CPU A/B comparison
→ five live routed-movement scenarios
→ separate wall-crossing raw attribution capture
→ deterministic Node attribution finalizer
→ semantic movement evidence assertion
→ artifact upload
```

The raw wall capture stores:

```text
performance-report-v4
build branch / exact commit SHA / build id
PerformanceObserver supported entry types
global long tasks and attribution entries
Long Animation Frame entries and script attribution
User Timing phase measures
Playwright page.evaluate durations
production awareness movement diagnostics
renderer-local winner and applied worker identities
```

The finalizer writes the structured result into `browser-artifacts/movement.json`. The semantic assertion must run successfully against that file; a skipped gate is not an accepted result.

## Blocking production phases

GitHub-hosted CPU acceptance blocks on these post-warmup phases:

```text
sceneUpdate p95 <= 10 ms
sceneUpdate max <= 50 ms
main-thread raster apply max <= 5 ms
renderer-local safe-position and route evaluation max <= 10 ms
worker-response main-thread handling max <= 5 ms
pending worker queue depth <= 1
requested world key == applied world key
requested canonical key == applied canonical key
last applied job == last completed final-exact job
no worker error
```

`worker-response main-thread handling` is measured from named Long Animation Frame worker-response scripts when available. When Chromium does not expose such a named script, the conservative upper bound is:

```text
maxMainThreadApplyMs + maxLocalUpdateMs
```

The first renderer-local scan after initial field installation is retained as `rawMaxLocalUpdateMs` but excluded from the post-warmup movement gate. The blocking `maxLocalUpdateMs` and `postWarmupLocalUpdateP95Ms` describe subsequent movement updates. This prevents JIT/cold initialization from being mislabeled as a steady movement stall while preserving the raw value for independent review.

## Long-task classification

A global task over 100 ms is **blocking** when any of the following is true:

- explicit danger/awareness or worker-response script time exceeds its limit;
- explicit named application phase time exceeds 50 ms;
- measured production overlap exceeds 50 ms;
- attribution is insufficient to prove that production work stayed bounded;
- the task remains unattributed.

A global task is **diagnostic-only** only when all of the following are machine-proven:

- explicit danger script time remains within the blocking limits;
- explicit named application work remains within the blocking limits;
- instrumented production phases remain within their phase-specific limits;
- at least 80% of the task duration lies outside measured production work;
- raw Long Animation Frame scripts and the classification reason remain in the artifact.

Generic Pixi ticker, render, requestAnimationFrame and bundled software-rendering script time is not automatically treated as production danger work. It is separately reported as rendering infrastructure. Named danger and application functions always take precedence over that generic classification.

The final structured evidence contains:

```json
{
  "longTaskAttribution": {
    "globalLongTasks": [],
    "dangerAttributedLongTasks": [],
    "applicationAttributedLongTasks": [],
    "diagnosticOnlyLongTasks": [],
    "unattributedLongTasks": [],
    "productionPhases": {},
    "productionPhaseMaxMs": {},
    "longAnimationFrames": [],
    "rawPerformancePhaseMeasures": [],
    "blockingContractPassed": true,
    "blockingFailures": []
  }
}
```

Each classified task includes at least:

```text
startMs
durationMs
scenario
overlappingProductionPhases
productionOverlapDurationMs
applicationScriptDurationMs
renderingInfrastructureScriptDurationMs
dangerScriptDurationMs
workerResponseScriptDurationMs
unaccountedDurationMs
classification
reason
```

## Semantic movement evidence

The attribution decision does not weaken tactical proof. The same exact-head artifact must prove:

- selected-only movement changes observer-relative memory but starts no worker jobs and performs no world-raster, raster-swap or worker-geometry work after warm-up;
- visible hostile movement changes canonical geometry through the bounded worker queue;
- six simultaneous routed movers keep one in-flight plus one latest pending bound;
- hidden objective movement does not alter subjective position, canonical key or applied raster;
- wall crossing moves the subjective threat across the wall, changes the renderer-local winner to the protected side, preserves `protectedAgainstThreatId`, and applies the final requested world/canonical keys and final job identity;
- stale worker results never overwrite the final applied field.

The browser harness must read the winner and identities from production renderer diagnostics:

```text
window.__realWargameAwarenessDebug
rendererLocalBestWinner
lastAppliedFieldIdentity
lastAppliedRasterDigest
lastAppliedJobId
lastAppliedCanonicalThreatKey
```

It must not call synchronous `buildSoldierAwarenessReport` or recompute an independent winner.

## Interpretation limits

GitHub-hosted Chromium uses headless/software rendering and shared hosted compute. Global RAF, FPS, worker cold latency and diagnostic-only rendering/runner long tasks do not establish Windows WebGL performance. The workflow gates structural CPU behavior, bounded production phases, canonical/applied identity, queue correctness and semantic movement behavior.

A fresh local `performance-report-v4` from the exact validated head is still required before claiming the user-visible 50–60 FPS target on real hardware.
