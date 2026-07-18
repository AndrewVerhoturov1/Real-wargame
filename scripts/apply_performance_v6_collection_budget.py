from pathlib import Path


def replace_or_assert(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}: {old[:100]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


capture = 'src/core/debug/PerformanceCaptureV6.ts'
replace_or_assert(
    capture,
    """const DEFAULT_CLOCK: PerformanceCaptureClockV6 = {
  now: () => performance.now(), wallNow: () => Date.now(), random: () => Math.random(),
};
""",
    """const DEFAULT_CLOCK: PerformanceCaptureClockV6 = {
  now: () => performance.now(), wallNow: () => Date.now(), random: () => Math.random(),
};
const FALLBACK_DEEP_SCAN_INTERVAL_MS = 15_000;
""",
)
replace_or_assert(
    capture,
    """  recordFrame(state: SceneStateLikeV6, input: PerformanceFrameInputV6): void {
    const costStart = this.clock.now();
    const tMs = this.elapsed();
""",
    """  recordFrame(state: SceneStateLikeV6, input: PerformanceFrameInputV6): void {
    const costStart = this.clock.now();
    const initializing = !this.initial;
    const tMs = this.elapsed();
""",
)
replace_or_assert(
    capture,
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
)
replace_or_assert(
    capture,
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
)
replace_or_assert(
    capture,
    """      this.pushTimeline({
        ...population,
        reason: changed ? 'population-change' : queueSpike ? 'queue-spike' : slow ? 'slow-frame' : 'periodic',
""",
    """      this.pushTimeline({
        ...population,
        tMs: r1(tMs),
        reason: changed ? 'population-change' : queueSpike ? 'queue-spike' : slow ? 'slow-frame' : 'periodic',
""",
)
replace_or_assert(
    capture,
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
)

selector_old = """    const button = document.querySelector<HTMLElement>('[data-workspace-file-action=\"performance\"]');
    if (!button) throw new Error('Performance report control is missing.');
"""
selector_fallback = """    const button = document.querySelector<HTMLElement>('[data-performance-export=\"v6\"]')
      ?? document.querySelector<HTMLElement>('[data-workspace-file-action=\"performance\"]');
    if (!button) throw new Error('Performance report control is missing.');
"""
for path in (
    'tests/danger-layer-browser-performance.spec.ts',
    'tests/danger-layer-movement-performance.spec.ts',
    'tests/danger-layer-long-task-attribution.spec.ts',
):
    replace_or_assert(path, selector_old, selector_fallback)

replace_or_assert(
    'scripts/assert_danger_layer_movement_evidence.mjs',
    """if (evidence.build?.performanceContractVersion !== 'performance-report-v5') {
  failures.push(`unexpected performance contract: ${evidence.build?.performanceContractVersion ?? 'missing'}`);
}
""",
    """if (evidence.build?.performanceContractVersion !== 'performance-report-v6') {
  failures.push(`unexpected performance contract: ${evidence.build?.performanceContractVersion ?? 'missing'}`);
}
""",
)

contract = Path('scripts/performance_report_contract_smoke.mjs')
contract_text = contract.read_text(encoding='utf-8')
old_contract = """  'recordQueueTransition', 'recordOperation',
]) assert.ok(capture.includes(token), `PerformanceCaptureV6 missing ${token}`);
"""
new_contract = """  'recordQueueTransition', 'recordOperation', 'FALLBACK_DEEP_SCAN_INTERVAL_MS',
]) assert.ok(capture.includes(token), `PerformanceCaptureV6 missing ${token}`);
assert.ok(!capture.includes('sceneShapeChanged || slow'), 'Slow renderer frames must not amplify deep telemetry scans.');
assert.ok(!capture.includes('tMs - this.lastOrderScanAt >= 100'), 'Per-frame order fallback must remain bounded.');
"""
if new_contract not in contract_text:
    if contract_text.count(old_contract) != 1:
        raise SystemExit('performance_report_contract_smoke.mjs: collection-budget anchor missing')
    contract.write_text(contract_text.replace(old_contract, new_contract, 1), encoding='utf-8')

capture_text = Path(capture).read_text(encoding='utf-8')
if 'sceneShapeChanged || slow' in capture_text:
    raise SystemExit('slow-frame amplification remains in deep scene scans')
if 'tMs - this.lastOrderScanAt >= 100' in capture_text:
    raise SystemExit('per-frame order fallback remains')
for path in (
    'tests/danger-layer-browser-performance.spec.ts',
    'tests/danger-layer-movement-performance.spec.ts',
    'tests/danger-layer-long-task-attribution.spec.ts',
):
    text = Path(path).read_text(encoding='utf-8')
    if '[data-performance-export=\"v6\"]' not in text:
        raise SystemExit(f'{path}: v6 export selector missing')
assertion = Path('scripts/assert_danger_layer_movement_evidence.mjs').read_text(encoding='utf-8')
if "performanceContractVersion !== 'performance-report-v5'" in assertion:
    raise SystemExit('Danger movement assertion still expects report v5')
