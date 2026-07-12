import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/behavior/BehaviorModel.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiRouteStatusState } from '../ai/AiRouteStatus';\n",
    "import type { AiRouteStatusState } from '../ai/AiRouteStatus';\nimport type { SimulationAiFacts } from '../ai/events/SimulationAiEvents';\n",
    'import compact simulation event facts',
  );
  source = replaceOnce(
    source,
    "  aiRouteStatusState: AiRouteStatusState | null;\n}",
    "  aiRouteStatusState: AiRouteStatusState | null;\n  aiSimulationEventFacts: SimulationAiFacts | null;\n}",
    'store previous simulation event facts',
  );
  source = replaceOnce(
    source,
    "    aiRouteStatusState: null,\n  };",
    "    aiRouteStatusState: null,\n    aiSimulationEventFacts: null,\n  };",
    'initialize simulation event facts',
  );
  return source;
});

await patch('src/core/units/UnitModel.ts', (source) => {
  source = insertOnce(
    source,
    "import type { UnitPlanState } from '../ai/UnitPlan';\n",
    "import type { UnitPlanState } from '../ai/UnitPlan';\nimport { initializeSimulationAiEventFacts } from '../ai/events/SimulationAiEvents';\n",
    'import event fact initialization',
  );
  source = replaceOnce(
    source,
    "    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);\n    return model;",
    "    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);\n    initializeSimulationAiEventFacts(model);\n    return model;",
    'initialize facts after runtime restore',
  );
  source = replaceOnce(
    source,
    "  unit.behaviorRuntime.aiRouteStatusState = null;\n  unit.soldier.condition.fatigue",
    "  unit.behaviorRuntime.aiRouteStatusState = null;\n  unit.behaviorRuntime.aiSimulationEventFacts = null;\n  unit.soldier.condition.fatigue",
    'reset compact event facts with initial state',
  );
  return source;
});

await patch('src/core/simulation/SimulationTick.ts', (source) => {
  source = insertOnce(
    source,
    "import { createDirectPlayerMovePlan } from '../ai/UnitPlan';\n",
    "import { createDirectPlayerMovePlan } from '../ai/UnitPlan';\nimport { publishSimulationAiEvents } from '../ai/events/SimulationAiEvents';\n",
    'import simulation event publisher',
  );
  source = replaceOnce(
    source,
    "    updateStateLabels(unit);\n    moveUnit(unit, state, scaledDeltaSeconds);\n  }",
    "    updateStateLabels(unit);\n    moveUnit(unit, state, scaledDeltaSeconds);\n    publishSimulationAiEvents(\n      unit,\n      unit.behaviorRuntime.aiRuntimeSession?.simulationTimeMs\n        ?? Math.max(0, Math.round(state.simulationTimeSeconds * 1000)),\n    );\n  }",
    'publish events after simulation transitions',
  );
  return source;
});

await patch('src/core/ai/AiGameBridge.ts', (source) => {
  source = insertOnce(
    source,
    "import { readAiGraphRuntimeReloadEffect } from './runtime/actions/ReloadAction';\n",
    "import { readAiGraphRuntimeReloadEffect } from './runtime/actions/ReloadAction';\nimport { publishSimulationAiEvents } from './events/SimulationAiEvents';\n",
    'import bridge event publisher',
  );
  source = replaceOnce(
    source,
    "  const graph = readRuntimeGraph();\n  const session = ensureRuntimeSession(unit, graph.id);\n  const simulationNowMs = options.applyEffects\n    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS\n    : session.simulationTimeMs;",
    "  const graph = readRuntimeGraph();\n  let session = ensureRuntimeSession(unit, graph.id);\n  if (options.applyEffects) {\n    publishSimulationAiEvents(unit, session.simulationTimeMs);\n    session = unit.behaviorRuntime.aiRuntimeSession ?? session;\n  }\n  const simulationNowMs = options.applyEffects\n    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS\n    : session.simulationTimeMs;",
    'flush pending transitions after session creation',
  );
  source = replaceOnce(
    source,
    "  unit.behaviorRuntime.lastEvent = `ai_graph_runtime_${result.status}`;\n  return result;",
    "  unit.behaviorRuntime.lastEvent = `ai_graph_runtime_${result.status}`;\n  publishSimulationAiEvents(unit, nextSession.simulationTimeMs);\n  return result;",
    'publish bridge effects after runtime update',
  );
  return source;
});

await patch('src/core/ai/AiStatefulMoveGameBridge.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiBlackboardValue } from './AiBlackboard';\n",
    "import type { AiBlackboardValue } from './AiBlackboard';\nimport { publishSimulationAiEvents } from './events/SimulationAiEvents';\n",
    'import route event publisher',
  );
  source = replaceOnce(
    source,
    "    routeResult = updateSelectedRouteStatus(state, nowMs);\n    if (routeResult?.shouldForceRuntimeTick) runtimeOptions = buildReactiveRouteTickOptions(routeResult);",
    "    routeResult = updateSelectedRouteStatus(state, nowMs);\n    const unitBeforeRuntime = getSelectedUnit(state);\n    if (routeResult && unitBeforeRuntime) {\n      publishSimulationAiEvents(\n        unitBeforeRuntime,\n        unitBeforeRuntime.behaviorRuntime.aiRuntimeSession?.simulationTimeMs\n          ?? Math.max(0, Math.round(state.simulationTimeSeconds * 1000)),\n      );\n    }\n    if (routeResult?.shouldForceRuntimeTick) runtimeOptions = buildReactiveRouteTickOptions(routeResult);",
    'publish route abort before compatibility cancellation',
  );
  source = replaceOnce(
    source,
    "  if (result) publishMoveDebugDetails(state, result, routeResult);\n  else if (routeResult && selectedUnitId) publishRouteDebugDetails(state, routeResult, selectedUnitId);\n  return result;",
    "  const unitAfterRuntime = getSelectedUnit(state);\n  if (options.applyEffects && unitAfterRuntime) {\n    publishSimulationAiEvents(\n      unitAfterRuntime,\n      unitAfterRuntime.behaviorRuntime.aiRuntimeSession?.simulationTimeMs\n        ?? Math.max(0, Math.round(state.simulationTimeSeconds * 1000)),\n    );\n  }\n  if (result) publishMoveDebugDetails(state, result, routeResult);\n  else if (routeResult && selectedUnitId) publishRouteDebugDetails(state, routeResult, selectedUnitId);\n  return result;",
    'publish owned move and route transitions after effects',
  );
  return source;
});

console.log('Simulation event integration patch applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after);
}

function insertOnce(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, marker, replacement, label);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
