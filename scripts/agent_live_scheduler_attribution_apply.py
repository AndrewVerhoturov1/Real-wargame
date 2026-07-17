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


# Correct the generic readonly spelling in the scheduler source staged through the connector.
path = 'src/core/ai/AiSimulationScheduler.ts'
content = read(path)
content = replace_exact(
    content,
    "function describeEffects(effects: readonly Array<{ readonly type: string; readonly action?: string }>): string[] {",
    "function describeEffects(effects: ReadonlyArray<{ readonly type: string; readonly action?: string }>): string[] {",
    'scheduler effect array type',
)
write(path, content)


path = 'src/core/debug/PerformanceMonitor.ts'
content = read(path)
content = replace_exact(
    content,
    "import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';\n",
    "import { getAiSchedulerPerformanceDiagnostics } from '../ai/AiSchedulerPerformanceDiagnostics';\n"
    "import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';\n",
    'monitor scheduler import',
)
content = replace_exact(
    content,
    "import {\n  getPerformancePhaseRuntimeDiagnostics,\n  type PerformancePhaseRuntimeDiagnostic,\n} from './PerformancePhases';\n",
    "import {\n  getPerformancePhaseContextualEvents,\n  getPerformancePhaseRuntimeDiagnostics,\n  type PerformancePhaseContext,\n  type PerformancePhaseRuntimeDiagnostic,\n} from './PerformancePhases';\n",
    'monitor contextual phase imports',
)
content = replace_exact(
    content,
    "export interface ApplicationIntervalAttributionDiagnostic {\n  readonly startMs: number;\n  readonly durationMs: number;\n  readonly scenario: string | null;\n  readonly applicationAttributed: boolean;\n  readonly overlappingPhases: readonly string[];\n  readonly overlapDurationMs: number;\n}\n\nexport interface PerformanceReport {",
    "export interface ApplicationIntervalAttributionDiagnostic {\n  readonly startMs: number;\n  readonly durationMs: number;\n  readonly scenario: string | null;\n  readonly applicationAttributed: boolean;\n  readonly overlappingPhases: readonly string[];\n  readonly overlapDurationMs: number;\n}\n\nexport interface ContextualPerformancePhaseEventDiagnostic {\n  readonly name: string;\n  readonly startMs: number;\n  readonly durationMs: number;\n  readonly context: PerformancePhaseContext | null;\n}\n\nexport interface PerformanceReport {",
    'monitor contextual event interface',
)
content = replace_exact(
    content,
    "  performancePhaseAggregates: PerformancePhaseAggregateDiagnostic[];\n  applicationAttribution: {\n",
    "  performancePhaseAggregates: PerformancePhaseAggregateDiagnostic[];\n  contextualPerformancePhaseEvents: ContextualPerformancePhaseEventDiagnostic[];\n  applicationAttribution: {\n",
    'monitor report contextual events field',
)
content = replace_exact(
    content,
    "    const performancePhaseAggregates = buildPerformancePhaseAggregates(\n      getPerformancePhaseRuntimeDiagnostics(),\n      performancePhaseMeasures,\n      this.longTasks,\n      this.longAnimationFrames,\n    );\n",
    "    const performancePhaseAggregates = buildPerformancePhaseAggregates(\n      getPerformancePhaseRuntimeDiagnostics(),\n      performancePhaseMeasures,\n      this.longTasks,\n      this.longAnimationFrames,\n    );\n    const contextualPerformancePhaseEvents = getPerformancePhaseContextualEvents().map((event) => ({\n      name: event.name,\n      startMs: roundOne(event.startTimeMs - this.startedAt),\n      durationMs: roundTwo(event.durationMs),\n      context: event.context ? { ...event.context } : null,\n    }));\n",
    'monitor contextual event construction',
)
content = replace_exact(
    content,
    "      computation: {\n        threatRelativeCover: getThreatRelativeCoverFieldDiagnostics(state.map),\n",
    "      computation: {\n        aiScheduler: getAiSchedulerPerformanceDiagnostics(),\n        threatRelativeCover: getThreatRelativeCoverFieldDiagnostics(state.map),\n",
    'monitor scheduler diagnostics output',
)
content = replace_exact(
    content,
    "      performancePhaseMeasures,\n      performancePhaseAggregates,\n      applicationAttribution: {\n",
    "      performancePhaseMeasures,\n      performancePhaseAggregates,\n      contextualPerformancePhaseEvents,\n      applicationAttribution: {\n",
    'monitor contextual report output',
)
write(path, content)


path = 'scripts/performance_report_contract_smoke.mjs'
content = read(path)
content = replace_exact(
    content,
    "const pixi = readFileSync('src/rendering/PixiApp.ts', 'utf8');\n",
    "const pixi = readFileSync('src/rendering/PixiApp.ts', 'utf8');\n"
    "const scheduler = readFileSync('src/core/ai/AiSimulationScheduler.ts', 'utf8');\n"
    "const schedulerDiagnostics = readFileSync('src/core/ai/AiSchedulerPerformanceDiagnostics.ts', 'utf8');\n",
    'contract scheduler sources',
)
content = replace_exact(
    content,
    "  'p99Ms',\n]) assert.ok(phases.includes(token), `PerformancePhases missing ${token}`);\n",
    "  'p99Ms',\n  'withPerformancePhaseContext',\n  'getPerformancePhaseContextualEvents',\n]) assert.ok(phases.includes(token), `PerformancePhases missing ${token}`);\n",
    'contract phase context tokens',
)
content = replace_exact(
    content,
    "  'unattributedLongTaskCount',\n]) assert.ok(monitor.includes(token), `PerformanceMonitor missing ${token}`);\n",
    "  'unattributedLongTaskCount',\n  'contextualPerformancePhaseEvents',\n  'getAiSchedulerPerformanceDiagnostics',\n]) assert.ok(monitor.includes(token), `PerformanceMonitor missing ${token}`);\n",
    'contract monitor scheduler tokens',
)
content = replace_exact(
    content,
    "assert.ok(pixi.includes('recordSimulationUpdate(simulationUpdateMs)'), 'Pixi ticker must publish SimulationTick wall time');\n",
    "for (const token of ['recordAiSchedulerUnitPass', 'recordAiSchedulerCycle', 'simulation.ai-scheduler.unit-bridge']) {\n"
    "  assert.ok(scheduler.includes(token), `AiSimulationScheduler missing ${token}`);\n"
    "}\n"
    "for (const token of ['slowestUnitPasses', 'slowestCycles', 'p95Ms', 'MAX_DURATION_SAMPLES']) {\n"
    "  assert.ok(schedulerDiagnostics.includes(token), `AiSchedulerPerformanceDiagnostics missing ${token}`);\n"
    "}\n"
    "assert.ok(pixi.includes('recordSimulationUpdate(simulationUpdateMs)'), 'Pixi ticker must publish SimulationTick wall time');\n",
    'contract scheduler assertions',
)
content = replace_exact(
    content,
    "console.log('Performance report contract smoke passed: simulation timing, phase aggregates and nested application attribution are present.');",
    "console.log('Performance report contract smoke passed: simulation timing, phase aggregates, contextual field ownership and per-unit scheduler attribution are present.');",
    'contract completion text',
)
write(path, content)

print('Applied per-unit scheduler and contextual phase report attribution.')
