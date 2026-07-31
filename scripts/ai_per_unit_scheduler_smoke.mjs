import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-ai-per-unit-scheduler-smoke');
const sourceFile = path.join(repoRoot, 'scripts', 'ai_per_unit_scheduler_smoke.ts');
const adaptedSourceFile = path.join(repoRoot, 'scripts', '.tmp-ai-per-unit-scheduler-posture-smoke.ts');
const entryFile = path.join(outDir, 'ai-per-unit-scheduler-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  const source = await readFile(sourceFile, 'utf8');
  await writeFile(adaptedSourceFile, adaptForPhysicalPosture(source));
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: adaptedSourceFile,
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'ai-per-unit-scheduler-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
  await rm(adaptedSourceFile, { force: true });
}

function adaptForPhysicalPosture(source) {
  let result = source;
  result = replaceOnce(result,
    "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';\nimport { isPostureTransitionRunning, postureTransitionDurationSeconds } from '../src/core/actions/PostureTransition';",
  );
  result = replaceOnce(result,
    "import {\n  resetRuntimeGraphSnapshotCacheForTests,\n} from '../src/core/ai/AiGameBridge';",
    "import {\n  resetRuntimeGraphSnapshotCacheForTests,\n} from '../src/core/ai/AiGameBridge';\nimport { addGraphToInstalledCatalog, createAiGraphCatalog, installAiGraphCatalog } from '../src/core/ai/AiGraphCatalog';",
  );
  result = replaceOnce(result,
    "import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';",
    "import { createInitialState as createInitialStateBase, type SimulationState } from '../src/core/simulation/SimulationState';\nimport { installUnitAiBrainBinding, installUnitAiBrainBindingFromData } from '../src/core/units/UnitAiBrainBinding';",
  );
  result = replaceOnce(result,
    "import { tickSimulation } from '../src/core/simulation/SimulationTick';",
    "import { tickSimulation } from '../src/core/simulation/SimulationTick';\nimport { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';",
  );
  result = replaceOnce(result,
    "let storageReads = 0;",
    "let storageReads = 0;\nlet activeGraph: AiGraph | null = null;\nconst createdStates = new Set<SimulationState>();",
  );
  result = replaceOnce(result,
    "  const workspaceSource = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');",
    "  const workspaceSource = [readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8'), readFileSync('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8')].join('\\n');",
  );
  result = replaceOnce(result,
    "  const bridgeSource = readFileSync('src/core/ai/AiGameBridge.ts', 'utf8');",
    "  const bridgeSource = [readFileSync('src/core/ai/AiGameBridge.ts', 'utf8'), readFileSync('src/core/ai/AiGameBridgeLegacy.ts', 'utf8')].join('\\n');",
  );
  result = replaceOnce(result,
    "readFileSync('src/core/simulation/SimulationState.ts', 'utf8')",
    "[readFileSync('src/core/simulation/SimulationState.ts', 'utf8'), readFileSync('src/core/simulation/SimulationStateLegacy.ts', 'utf8')].join('\\n')",
  );
  result = replaceOnce(result,
    "console.log('AI per-unit scheduler smoke passed:",
    "for (const state of createdStates) clearStaticTacticalPositionService(state);\n\nconsole.log('AI per-unit scheduler smoke passed:",
  );
  result = replaceOnce(result,
    "  assert.equal(unit.behaviorRuntime.posture, 'crouched');\n\n  tickSimulation(state, 0.59);",
    "  assert.equal(unit.behaviorRuntime.posture, 'standing', 'a graph posture command must not change the effective posture instantly');\n  assert.equal(isPostureTransitionRunning(unit), true, 'the first graph decision must start the physical posture action');\n  assert.equal(unit.behaviorRuntime.physicalAction?.targetPosture, 'crouched');\n\n  tickSimulation(state, 0.59);\n  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'the graph-requested posture must apply after its physical duration');\n  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');",
  );
  result = replaceOnce(result,
    "  assert.equal(unit.behaviorRuntime.aiLastReactiveWakeAtMs, 360);\n  assert.equal(unit.behaviorRuntime.posture, 'prone');",
    "  assert.equal(unit.behaviorRuntime.aiLastReactiveWakeAtMs, 360);\n  assert.equal(unit.behaviorRuntime.posture, 'standing', 'reactive Graph v2 must request rather than instantly apply posture');\n  assert.equal(unit.behaviorRuntime.physicalAction?.targetPosture, 'prone');\n  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));\n  assert.equal(unit.behaviorRuntime.posture, 'prone');",
  );
  result = replaceOnce(result,
    "  assert.equal(fine.posture, 'prone');",
    "  assert.equal(fine.posture, 'crouched', 'the physical standing-to-prone action must have reached only its crouched stage by 610 ms');",
  );
  result = replaceOnce(result,
    "    posture: unit.behaviorRuntime.posture,\n    action: unit.behaviorRuntime.currentAction,",
    "    posture: unit.behaviorRuntime.posture,\n    physicalAction: unit.behaviorRuntime.physicalAction ? {\n      targetPosture: unit.behaviorRuntime.physicalAction.targetPosture,\n      progress: round(unit.behaviorRuntime.physicalAction.progress),\n      status: unit.behaviorRuntime.physicalAction.status,\n      startedSeconds: round(unit.behaviorRuntime.physicalAction.startedSeconds),\n    } : null,\n    action: unit.behaviorRuntime.currentAction,",
  );
  result = replaceOnce(result,
    "  assert.equal(threatened.behaviorRuntime.posture, 'prone', 'unselected graph must read current danger and react defensively on its first step');",
    "  assert.equal(threatened.behaviorRuntime.posture, 'standing', 'unselected graph must not bypass physical posture timing');\n  assert.equal(threatened.behaviorRuntime.physicalAction?.targetPosture, 'prone', 'unselected graph must react defensively on its first step');\n  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));\n  assert.equal(threatened.behaviorRuntime.posture, 'prone');",
  );
  result = replaceOnce(result,
    "  storageReads = 0;\n  const result = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 100 });\n  const eligible = units.filter((unit) => unit.aiControl !== 'manual').length;\n  assert.equal(result.unitVisits, units.length, 'one scheduler cycle must visit each unit exactly once');\n  assert.equal(result.trustedBridgeCalls, eligible);\n  assert.equal(result.membershipScans, 0, 'trusted scheduler path must perform no membership scans');\n  assert.equal(result.graphResolutionCount, 1);\n  assert.equal(result.graphSnapshotFrozen, true, 'all units in the cycle must receive an immutable graph snapshot');\n  assert.equal(storageReads, 1, 'the shared graph source must be read once per scheduler cycle');\n  assert.equal(new Set(result.processedUnitIds).size, eligible);\n  assert.equal(result.eligibleUnitIds.length, eligible);\n  assert.ok(state.units.filter((unit) => unit.aiControl === 'graph').every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === firstDecisionGraph.id));\n\n  storage.set(GRAPH_STORAGE_KEY, JSON.stringify(alternateGraph));\n  storageReads = 0;\n  state.simulationStep += 1;\n  state.simulationTimeSeconds = 0.2;\n  const changed = tickAiSimulationScheduler(state, { cycleStartMs: 100, cycleEndMs: 200 });\n  assert.equal(changed.graphResolutionCount, 1);\n  assert.equal(storageReads, 1, 'graph changes must still be detected with one source read in the next cycle');\n  assert.ok(state.units.filter((unit) => unit.aiControl === 'graph').every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === alternateGraph.id));",
    "  const result = tickAiSimulationScheduler(state, { cycleStartMs: 0, cycleEndMs: 100 });\n  const eligible = units.filter((unit) => unit.aiControl !== 'manual').length;\n  assert.equal(result.unitVisits, units.length, 'one scheduler cycle must visit each unit exactly once');\n  assert.equal(result.trustedBridgeCalls, eligible);\n  assert.equal(result.membershipScans, 0, 'trusted scheduler path must perform no membership scans');\n  assert.equal(result.graphResolutionCount, 1);\n  assert.equal(result.graphSnapshotFrozen, true, 'all units in the cycle must receive an immutable graph-catalog snapshot');\n  assert.equal(new Set(result.processedUnitIds).size, eligible);\n  assert.equal(result.eligibleUnitIds.length, eligible);\n  assert.ok(state.units.filter((unit) => unit.aiControl === 'graph').every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === firstDecisionGraph.id));\n\n  addGraphToInstalledCatalog(state, alternateGraph);\n  const switched = state.units.find((unit) => unit.aiControl === 'graph');\n  assert.ok(switched);\n  installUnitAiBrainBinding(switched, { schemaVersion: 1, kind: 'graph', graphId: alternateGraph.id });\n  state.simulationStep += 1;\n  state.simulationTimeSeconds = 0.2;\n  const changed = tickAiSimulationScheduler(state, { cycleStartMs: 100, cycleEndMs: 200 });\n  assert.equal(changed.graphResolutionCount, 1, 'the scheduler must resolve one catalog snapshot even when units use different graphs');\n  assert.notEqual(changed.graphSourceRevision, result.graphSourceRevision, 'adding a graph must invalidate the installed catalog snapshot');\n  assert.equal(switched.behaviorRuntime.aiRuntimeSession?.graphId, alternateGraph.id, 'the rebound unit must execute its exact graph');\n  assert.ok(state.units\n    .filter((unit) => unit.aiControl === 'graph' && unit.id !== switched.id)\n    .every((unit) => unit.behaviorRuntime.aiRuntimeSession?.graphId === firstDecisionGraph.id),\n  'other units must keep their own exact graph binding');",
  );
  result = replaceOnce(result,
    "function setGraph(graph: AiGraph): void {\n  storage.set(GRAPH_STORAGE_KEY, JSON.stringify(graph));",
    "function setGraph(graph: AiGraph): void {\n  activeGraph = graph;\n  storage.set(GRAPH_STORAGE_KEY, JSON.stringify(graph));",
  );
  result = replaceOnce(result,
    "    aiControl,\n    x,",
    "    aiControl,\n    aiBrain: aiControl === 'manual'\n      ? { schemaVersion: 1, kind: 'manual' }\n      : { schemaVersion: 1, kind: 'graph', graphId: activeGraph?.id ?? 'soldier_clean_workspace_graph' },\n    x,",
  );
  result = replaceOnce(result,
    "function findUnit(state: SimulationState, id: string): UnitModel {",
    "function createInitialState(...args: Parameters<typeof createInitialStateBase>): SimulationState {\n  const state = createInitialStateBase(...args);\n  installAiGraphCatalog(state, createAiGraphCatalog(activeGraph ? [activeGraph] : []));\n  const dataById = new Map(args[1].map((data) => [data.id, data]));\n  for (const unit of state.units) {\n    const data = dataById.get(unit.id);\n    if (data) installUnitAiBrainBindingFromData(unit, data);\n  }\n  createdStates.add(state);\n  return state;\n}\n\nfunction findUnit(state: SimulationState, id: string): UnitModel {",
  );
  return result;
}

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Scheduler posture adaptation marker not found: ${search.slice(0, 100)}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Scheduler posture adaptation marker is ambiguous: ${search.slice(0, 100)}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}
