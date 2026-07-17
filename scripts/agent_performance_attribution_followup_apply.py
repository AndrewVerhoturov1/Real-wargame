from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_exact(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one exact match, found {count}')
    return content.replace(old, new, 1)


def replace_regex(content: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match, found {count}')
    return updated


# Export bounded point-probe diagnostics and distinguish any overlap from dominant application work.
path = 'src/core/debug/PerformanceMonitor.ts'
content = read(path)
content = replace_exact(
    content,
    "import { getVisibilityGeometryFieldDiagnostics } from '../visibility/VisibilityGeometryField';\n",
    "import { getVisibilityGeometryFieldDiagnostics } from '../visibility/VisibilityGeometryField';\n"
    "import { getPerceptionGeometryPreparationDiagnostics } from '../visibility/PointVisibility';\n",
    'performance monitor point-probe import',
)
content = replace_exact(
    content,
    "  readonly applicationAttributed: boolean;\n"
    "  readonly overlappingPhases: readonly string[];\n"
    "  readonly overlapDurationMs: number;\n",
    "  /** True when any measured application phase overlaps the browser window. */\n"
    "  readonly applicationAttributed: boolean;\n"
    "  /** True only when measured application phases occupy at least half of the browser window. */\n"
    "  readonly applicationDominated: boolean;\n"
    "  readonly applicationOverlapRatio: number;\n"
    "  readonly overlappingPhases: readonly string[];\n"
    "  readonly overlapDurationMs: number;\n",
    'application interval attribution interface',
)
content = replace_exact(
    content,
    "    applicationAttributedLongTaskCount: number;\n"
    "    unattributedLongTaskCount: number;\n"
    "    applicationAttributedLongAnimationFrameCount: number;\n",
    "    applicationAttributedLongTaskCount: number;\n"
    "    applicationDominatedLongTaskCount: number;\n"
    "    partiallyAttributedLongTaskCount: number;\n"
    "    unattributedLongTaskCount: number;\n"
    "    applicationAttributedLongAnimationFrameCount: number;\n"
    "    applicationDominatedLongAnimationFrameCount: number;\n"
    "    partiallyAttributedLongAnimationFrameCount: number;\n",
    'performance report attribution counts',
)
content = replace_exact(
    content,
    "        visibilityGeometry: getVisibilityGeometryFieldDiagnostics(state.map),\n"
    "        routeCostFields: getRouteCostFieldDiagnostics(getSharedRouteCostFieldCache(state.map)),\n",
    "        visibilityGeometry: getVisibilityGeometryFieldDiagnostics(state.map),\n"
    "        perceptionPointProbes: getPerceptionGeometryPreparationDiagnostics(state),\n"
    "        routeCostFields: getRouteCostFieldDiagnostics(getSharedRouteCostFieldCache(state.map)),\n",
    'performance report point-probe computation section',
)
content = replace_exact(
    content,
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\n",
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\n"
    "        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,\n"
    "        partiallyAttributedLongTaskCount: applicationLongTasks\n"
    "          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\n",
    'performance summary attribution counts',
)
content = replace_exact(
    content,
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\n"
    "        applicationAttributedLongAnimationFrameCount: applicationLongAnimationFrames\n"
    "          .filter((item) => item.applicationAttributed).length,\n",
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\n"
    "        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,\n"
    "        partiallyAttributedLongTaskCount: applicationLongTasks\n"
    "          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\n"
    "        applicationAttributedLongAnimationFrameCount: applicationLongAnimationFrames\n"
    "          .filter((item) => item.applicationAttributed).length,\n"
    "        applicationDominatedLongAnimationFrameCount: applicationLongAnimationFrames\n"
    "          .filter((item) => item.applicationDominated).length,\n"
    "        partiallyAttributedLongAnimationFrameCount: applicationLongAnimationFrames\n"
    "          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,\n",
    'performance report attribution object counts',
)
content = replace_regex(
    content,
    r"function buildApplicationIntervalAttribution\(.*?\n\}\n\nfunction phaseWindowOverlap",
    """function buildApplicationIntervalAttribution(
  windows: ReadonlyArray<{ startMs: number; durationMs: number; scenario: string | null }>,
  measures: readonly PerformancePhaseMeasureDiagnostic[],
): ApplicationIntervalAttributionDiagnostic[] {
  const applicationMeasures = measures.filter((measure) => isApplicationPhase(shortPhaseName(measure.name)));
  return windows.map((window) => {
    const windowEnd = window.startMs + window.durationMs;
    const overlaps = applicationMeasures
      .map((measure) => ({
        name: shortPhaseName(measure.name),
        startMs: Math.max(window.startMs, measure.startMs),
        endMs: Math.min(windowEnd, measure.startMs + measure.durationMs),
      }))
      .filter((item) => item.endMs > item.startMs);
    const overlapDurationMs = unionDuration(overlaps.map((item) => [item.startMs, item.endMs]));
    const applicationOverlapRatio = window.durationMs > 0
      ? Math.min(1, overlapDurationMs / window.durationMs)
      : 0;
    return {
      startMs: window.startMs,
      durationMs: window.durationMs,
      scenario: window.scenario,
      applicationAttributed: overlapDurationMs > 0,
      applicationDominated: applicationOverlapRatio >= 0.5,
      applicationOverlapRatio: roundThree(applicationOverlapRatio),
      overlappingPhases: [...new Set(overlaps.map((item) => item.name))].sort(),
      overlapDurationMs: roundTwo(overlapDurationMs),
    };
  });
}

function phaseWindowOverlap""",
    'application interval overlap ratio implementation',
)
write(path, content)


# Align the report source contract with dominant attribution and point probes.
path = 'scripts/performance_report_contract_smoke.mjs'
content = read(path)
content = replace_exact(
    content,
    "  'applicationAttributedLongTaskCount',\n"
    "  'unattributedLongTaskCount',\n"
    "  'contextualPerformancePhaseEvents',\n",
    "  'applicationAttributedLongTaskCount',\n"
    "  'applicationDominatedLongTaskCount',\n"
    "  'applicationDominated',\n"
    "  'applicationOverlapRatio',\n"
    "  'unattributedLongTaskCount',\n"
    "  'contextualPerformancePhaseEvents',\n"
    "  'getPerceptionGeometryPreparationDiagnostics',\n"
    "  'perceptionPointProbes',\n",
    'performance report contract tokens',
)
content = replace_exact(
    content,
    "console.log('Performance report contract smoke passed: simulation timing, phase aggregates, contextual field ownership and per-unit scheduler attribution are present.');",
    "console.log('Performance report contract smoke passed: simulation timing, dominant application attribution, bounded point probes, contextual field ownership and per-unit scheduler attribution are present.');",
    'performance report contract completion',
)
write(path, content)


# Browser evidence must distinguish dominant, partial, and external long tasks.
path = 'tests/live-windows-ai-performance.spec.ts'
content = read(path)
content = replace_exact(
    content,
    "    readonly visibilityGeometry?: Record<string, unknown>;\n"
    "    readonly soldierDangerField?: Record<string, unknown>;\n",
    "    readonly visibilityGeometry?: Record<string, unknown>;\n"
    "    readonly perceptionPointProbes?: Record<string, unknown>;\n"
    "    readonly soldierDangerField?: Record<string, unknown>;\n",
    'browser report point-probe diagnostics',
)
content = replace_exact(
    content,
    "      readonly applicationAttributed: boolean;\n"
    "      readonly overlappingPhases: readonly string[];\n"
    "      readonly overlapDurationMs: number;\n",
    "      readonly applicationAttributed: boolean;\n"
    "      readonly applicationDominated: boolean;\n"
    "      readonly applicationOverlapRatio: number;\n"
    "      readonly overlappingPhases: readonly string[];\n"
    "      readonly overlapDurationMs: number;\n",
    'browser attribution interface',
)
content = replace_exact(
    content,
    "  const applicationLongTasks = longTasks.filter((task) => task.applicationAttributed);\n"
    "  const unattributedLongTasks = longTasks.filter((task) => !task.applicationAttributed);\n",
    "  const applicationDominatedLongTasks = longTasks.filter((task) => task.applicationDominated);\n"
    "  const partiallyAttributedLongTasks = longTasks\n"
    "    .filter((task) => task.applicationAttributed && !task.applicationDominated);\n"
    "  const unattributedLongTasks = longTasks.filter((task) => !task.applicationAttributed);\n",
    'browser attribution classification',
)
content = replace_exact(
    content,
    "    applicationAttribution: {\n"
    "      totalLongTasks: longTasks.length,\n"
    "      applicationAttributedLongTasks: applicationLongTasks,\n"
    "      unattributedLongTasks,\n"
    "    },\n",
    "    applicationAttribution: {\n"
    "      totalLongTasks: longTasks.length,\n"
    "      applicationDominatedLongTasks,\n"
    "      partiallyAttributedLongTasks,\n"
    "      unattributedLongTasks,\n"
    "    },\n",
    'browser attribution evidence object',
)
content = replace_exact(
    content,
    "      visibilityGeometry: diagnosticDelta(warmup, final, 'visibilityGeometry', 'geometryBuildCount'),\n"
    "      soldierDangerGeometry: diagnosticDelta(warmup, final, 'soldierDangerField', 'geometryBuildCount'),\n",
    "      visibilityGeometry: diagnosticDelta(warmup, final, 'visibilityGeometry', 'geometryBuildCount'),\n"
    "      perceptionPointProbePreparations: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'preparationCount'),\n"
    "      perceptionPointProbeCacheHits: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'cacheHitCount'),\n"
    "      perceptionPointProbeDeferred: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'deferredCount'),\n"
    "      soldierDangerGeometry: diagnosticDelta(warmup, final, 'soldierDangerField', 'geometryBuildCount'),\n",
    'browser point-probe evidence deltas',
)
content = replace_exact(
    content,
    "  expect(evidence.applicationAttribution.applicationAttributedLongTasks).toHaveLength(0);\n"
    "  expect(evidence.applicationAttribution.unattributedLongTasks).toHaveLength(0);\n",
    "  expect(evidence.applicationAttribution.applicationDominatedLongTasks).toHaveLength(0);\n",
    'browser dominant long-task acceptance',
)
content = replace_exact(
    content,
    "  section: 'directionalTactical' | 'visibilityGeometry' | 'soldierDangerField' | 'threatRelativeCover',\n",
    "  section: 'directionalTactical' | 'visibilityGeometry' | 'perceptionPointProbes' | 'soldierDangerField' | 'threatRelativeCover',\n",
    'browser diagnostic delta section union',
)
write(path, content)


# Label the exact browser scenario so raw LongTask/LoAF entries retain test context.
path = 'src/testing/LiveWindowsPerformanceHarness.ts'
content = read(path)
content = replace_exact(
    content,
    "declare global {\n  interface Window {\n    __realWargameLiveWindowsPerformance?: LiveWindowsPerformanceApi;\n  }\n}\n",
    "declare global {\n  interface Window {\n    __realWargameLiveWindowsPerformance?: LiveWindowsPerformanceApi;\n    __realWargamePerformanceScenario?: string | null;\n  }\n}\n",
    'live performance scenario window contract',
)
content = replace_exact(
    content,
    "    start(): LiveWindowsPerformanceSnapshot {\n"
    "      refreshContacts(state);\n",
    "    start(): LiveWindowsPerformanceSnapshot {\n"
    "      window.__realWargamePerformanceScenario = 'live-windows-six-unit-ai';\n"
    "      refreshContacts(state);\n",
    'live performance scenario start',
)
content = replace_exact(
    content,
    "    stop(): LiveWindowsPerformanceSnapshot {\n"
    "      setAiTestPaused(state, true);\n"
    "      return snapshot(state);\n",
    "    stop(): LiveWindowsPerformanceSnapshot {\n"
    "      setAiTestPaused(state, true);\n"
    "      const stopped = snapshot(state);\n"
    "      window.__realWargamePerformanceScenario = null;\n"
    "      return stopped;\n",
    'live performance scenario stop',
)
write(path, content)


# Align danger geometry movement quantization with the existing LOS geometry key.
path = 'src/core/knowledge/SoldierDangerField.ts'
content = read(path)
content = replace_exact(
    content,
    "const THREAT_ORIGIN_HEIGHT_METERS = 1.4;\n",
    "const THREAT_ORIGIN_HEIGHT_METERS = 1.4;\nconst THREAT_POSITION_QUANTUM_CELLS = 0.25;\n",
    'danger threat position quantum constant',
)
content = replace_exact(content, "    quantize(threat.x, 0.05),\n", "    quantize(threat.x, THREAT_POSITION_QUANTUM_CELLS),\n", 'danger threat x quantum')
content = replace_exact(content, "    quantize(threat.y, 0.05),\n", "    quantize(threat.y, THREAT_POSITION_QUANTUM_CELLS),\n", 'danger threat y quantum')
write(path, content)


# Prove sub-cell subjective movement does not rebuild full-map danger geometry.
path = 'scripts/danger_layer_performance_smoke.ts'
content = read(path)
content = replace_exact(
    content,
    "import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';\n",
    "import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';\n"
    "import { getSoldierDangerFieldDiagnostics } from '../src/core/knowledge/SoldierDangerField';\n",
    'danger performance soldier diagnostics import',
)
content = replace_exact(
    content,
    "const directionalBuildsAfterFirstThreat = directionalDiagnostics.buildCount;\n",
    "const directionalBuildsAfterFirstThreat = directionalDiagnostics.buildCount;\n"
    "const soldierDangerGeometryBuildsAfterFirstThreat = getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount;\n",
    'danger performance first soldier geometry count',
)
content = replace_exact(
    content,
    "threat.x += 2;\n"
    "blue.tacticalKnowledge.revision += 1;\n"
    "buildSoldierAwarenessReport(state, blue);\n",
    "threat.x += 0.1;\n"
    "blue.tacticalKnowledge.revision += 1;\n"
    "buildSoldierAwarenessReport(state, blue);\n"
    "assert.equal(\n"
    "  getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount,\n"
    "  soldierDangerGeometryBuildsAfterFirstThreat,\n"
    "  'sub-quarter-cell subjective movement must reuse full-map danger geometry',\n"
    ");\n"
    "assert.equal(\n"
    "  getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount,\n"
    "  1,\n"
    "  'sub-quarter-cell movement must not rebuild threat-relative cover geometry',\n"
    ");\n"
    "\n"
    "threat.x += 1.9;\n"
    "blue.tacticalKnowledge.revision += 1;\n"
    "buildSoldierAwarenessReport(state, blue);\n",
    'danger performance sub-cell movement scenario',
)
write(path, content)

print('Applied dominant attribution, point-probe diagnostics, scenario labels, and quarter-cell danger geometry reuse.')
