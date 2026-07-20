from pathlib import Path

path = Path('scripts/tactical_workspace_smoke_incremental_directional.mjs')
source = path.read_text()
old = """function verifyGraphRuntimeConnection() {
  const runtime = readFileSync('src/core/ai/AiGraphRuntime.ts', 'utf8');
  const provider = readFileSync('src/core/tactical/TacticalPositionProvider.ts', 'utf8');
  const adapter = readFileSync('src/runtime/AwarenessTacticalPositionAdapter.ts', 'utf8');
  assert.ok(runtime.includes('generateRegisteredTacticalPositions'));
  assert.ok(runtime.includes("export * from './AiGraphRuntimeLegacy'"));
  assert.ok(provider.includes('MAX_ACTIVE_PROVIDER_STATES'));
  assert.ok(provider.includes('generateRegisteredTacticalPositions'));
  assert.ok(adapter.includes('MAX_LOCAL_SAMPLE_CELLS'));
  assert.ok(adapter.includes('MAX_LOCAL_ROUTE_EXPANSIONS'));
  assert.ok(adapter.includes('no synchronous full-map fallback'));
}
"""
new = """function verifyGraphRuntimeConnection() {
  const runtime = readFileSync('src/core/ai/AiGraphRuntime.ts', 'utf8');
  const runner = readFileSync('src/core/ai/AiGraphRunner.ts', 'utf8');
  const service = readFileSync('src/core/tactical/TacticalPositionSearchService.ts', 'utf8');
  const objective = readFileSync('src/core/tactical/TacticalPositionObjective.ts', 'utf8');
  assert.ok(runtime.includes("export * from './AiGraphRuntimeLegacy'"));
  assert.ok(runner.includes('wrapStatefulTacticalHost'));
  assert.ok(runner.includes('tacticalRequestMemoryKey'));
  assert.ok(service.includes('enqueueCoverSearch'));
  assert.ok(service.includes('searchTacticalPositionsForObjective'));
  assert.ok(service.includes('evaluatedOrigin'));
  assert.ok(service.includes('evaluatedPosture'));
  assert.ok(objective.includes('distanceToThreatMeters'));
  assert.ok(objective.includes('threatDistanceDeltaMeters'));
  assert.ok(objective.includes('distanceToOrderTargetMeters'));
}
"""
if old not in source:
    raise RuntimeError('Legacy tactical graph contract block was not found')
path.write_text(source.replace(old, new, 1))
