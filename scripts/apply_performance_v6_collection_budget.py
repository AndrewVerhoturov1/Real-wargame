from pathlib import Path

path = Path('src/core/debug/PerformanceCaptureV6.ts')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        """const DEFAULT_CLOCK: PerformanceCaptureClockV6 = {
  now: () => performance.now(), wallNow: () => Date.now(), random: () => Math.random(),
};
""",
        """const DEFAULT_CLOCK: PerformanceCaptureClockV6 = {
  now: () => performance.now(), wallNow: () => Date.now(), random: () => Math.random(),
};
const FALLBACK_DEEP_SCAN_INTERVAL_MS = 15_000;
""",
    ),
    (
        """  recordFrame(state: SceneStateLikeV6, input: PerformanceFrameInputV6): void {
    const costStart = this.clock.now();
    const tMs = this.elapsed();
""",
        """  recordFrame(state: SceneStateLikeV6, input: PerformanceFrameInputV6): void {
    const costStart = this.clock.now();
    const initializing = !this.initial;
    const tMs = this.elapsed();
""",
    ),
    (
        """    const shouldScanPopulation = !this.initial || sceneShapeChanged || slow
      || tMs - this.lastPopulationScanAt >= this.limits.sceneSampleIntervalMs;
    const population = shouldScanPopulation
      ? populationOf(state, tMs)
      : { ...(this.final ?? emptyPopulation(tMs)), tMs: r1(tMs) };
""",
        """    const shouldScanPopulation = !this.initial || sceneShapeChanged
      || tMs - this.lastPopulationScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS;
    const population = shouldScanPopulation
      ? populationOf(state, tMs)
      : (this.final ?? emptyPopulation(tMs));
""",
    ),
    (
        """    if (tMs - this.lastOrderScanAt >= 100 || sceneShapeChanged || slow) {
      this.observeOrders(state, tMs);
      this.lastOrderScanAt = tMs;
    }
    if (tMs - this.lastSemanticScanAt >= this.limits.sceneSampleIntervalMs || sceneShapeChanged || slow) {
      this.scanSemantic(state);
      this.lastSemanticScanAt = tMs;
    }
""",
        """    if (tMs - this.lastOrderScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS || sceneShapeChanged) {
      this.observeOrders(state, tMs);
      this.lastOrderScanAt = tMs;
    }
    if (tMs - this.lastSemanticScanAt >= FALLBACK_DEEP_SCAN_INTERVAL_MS || sceneShapeChanged) {
      this.scanSemantic(state);
      this.lastSemanticScanAt = tMs;
    }
""",
    ),
    (
        """      this.pushTimeline({
        ...population,
        reason: changed ? 'population-change' : queueSpike ? 'queue-spike' : slow ? 'slow-frame' : 'periodic',
""",
        """      this.pushTimeline({
        ...population,
        tMs: r1(tMs),
        reason: changed ? 'population-change' : queueSpike ? 'queue-spike' : slow ? 'slow-frame' : 'periodic',
""",
    ),
    (
        """    this.pushCost('collection', this.clock.now() - costStart);
  }
""",
        """    const collectionDurationMs = this.clock.now() - costStart;
    if (initializing) {
      this.recordOperation({
        phase: 'telemetry.capture-initialization',
        durationMs: collectionDurationMs,
        startedAtMs: tMs,
        cause: { source: 'performance-monitor' },
        result: 'initialized',
      });
    } else {
      this.pushCost('collection', collectionDurationMs);
    }
  }
""",
    ),
]

for old, new in replacements:
    if new in text:
        continue
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'PerformanceCaptureV6 replacement expected once, found {count}: {old[:90]!r}')
    text = text.replace(old, new, 1)

if "sceneShapeChanged || slow" in text:
    raise SystemExit('slow-frame amplification remains in deep scene scans')
if "tMs - this.lastOrderScanAt >= 100" in text:
    raise SystemExit('per-frame order fallback remains')
path.write_text(text, encoding='utf-8')
