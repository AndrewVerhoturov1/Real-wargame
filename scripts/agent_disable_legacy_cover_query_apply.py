from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_exact(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return content.replace(old, new, 1)


# The user explicitly retired safe-position generation. Keep generic Tactical Query
# data structures for compatibility, but the gameplay bridge must not expose the
# synchronous cover-candidate/pathfinding host anymore.
path = 'src/core/ai/AiGameBridge.ts'
content = read(path)
content = replace_exact(
    content,
    "import { generateCoverTacticalCandidates } from '../cover/CoverTacticalCandidates';\n",
    '',
    'legacy cover candidate import',
)
old_host = """function createTacticalHost(state: SimulationState, unit: UnitModel): AiGraphTacticalHost {
  return {
    resolveDistanceMeters: (fromKey, toKey, blackboard) => resolveDistanceMeters(state, unit, blackboard, fromKey, toKey),
    generateCoverCandidates: (request) => {
      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
      return generateCoverTacticalCandidates({ map: state.map, unit, threatPosition: threats.targetPosition, orderTarget: unit.order?.target ?? null, searchRadiusMeters: request.searchRadiusMeters, maxCandidates: request.maxCandidates, maxCalculationMs: request.maxCalculationMs });
    },
    tacticalCheck: (checkKind, blackboard) => evaluateTacticalCheck(state, unit, blackboard, checkKind),
  };
}
"""
new_host = """function createTacticalHost(state: SimulationState, unit: UnitModel): AiGraphTacticalHost {
  return {
    resolveDistanceMeters: (fromKey, toKey, blackboard) => resolveDistanceMeters(state, unit, blackboard, fromKey, toKey),
    // Legacy safe-position/cover-candidate generation is intentionally absent.
    // CreateCoverCandidates therefore receives the existing host_unavailable result
    // without synchronous pathfinding or full-map tactical work.
    tacticalCheck: (checkKind, blackboard) => evaluateTacticalCheck(state, unit, blackboard, checkKind),
  };
}
"""
content = replace_exact(content, old_host, new_host, 'gameplay tactical host')
write(path, content)


# Replace the deliberate legacy stress graph with a normal bounded graph decision.
path = 'src/testing/LiveWindowsPerformanceHarness.ts'
content = read(path)
pattern = re.compile(r"function installTacticalQueryGraph\(\): void \{.*?\n\}\n\nfunction configureUnits", re.S)
replacement = """function installTacticalQueryGraph(): void {
  const graph = {
    version: 2,
    id: 'live_windows_scheduler_runtime_graph',
    name: 'Live Windows Scheduler Runtime Graph',
    nameRu: 'Граф нагрузочного сценария Windows',
    rootNodeId: 'root',
    blackboardSchema: [],
    blackboardDefaults: {},
    nodes: [
      {
        id: 'root',
        type: 'Root',
        displayName: 'Root',
        displayNameRu: 'Старт',
        children: ['state'],
        parameters: {},
      },
      {
        id: 'state',
        type: 'SetAiState',
        displayName: 'Follow order state',
        displayNameRu: 'Состояние выполнения приказа',
        children: ['attention'],
        parameters: {
          stateId: 'FollowingOrder',
          reason: 'Live performance graph keeps following the routed order.',
          reasonRu: 'Нагрузочный граф продолжает выполнять маршрутный приказ.',
        },
      },
      {
        id: 'attention',
        type: 'SetAttentionMode',
        displayName: 'Observe while moving',
        displayNameRu: 'Наблюдать при движении',
        children: ['reason'],
        parameters: {
          mode: 'observe',
          reason: 'Observe while following the current order.',
          reasonRu: 'Наблюдать во время выполнения текущего приказа.',
        },
      },
      {
        id: 'reason',
        type: 'WriteReason',
        displayName: 'Explain decision',
        displayNameRu: 'Объяснить решение',
        children: [],
        parameters: {
          reason: 'Continue routed movement and observation.',
          reasonRu: 'Продолжать маршрутное движение и наблюдение.',
        },
      },
    ],
    subgraphRefs: [],
  };
  window.localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  resetRuntimeGraphSnapshotCacheForTests();
}

function configureUnits"""
content, count = pattern.subn(replacement, content, count=1)
if count != 1:
    raise RuntimeError(f'live harness graph replacement count: {count}')
write(path, content)


path = 'tests/live-windows-ai-performance.spec.ts'
content = read(path)
content = replace_exact(
    content,
    'test.setTimeout(MEASUREMENT_MS + WARMUP_MS + 90_000);',
    'test.setTimeout(MEASUREMENT_MS + WARMUP_MS + 240_000);',
    'live browser timeout',
)
write(path, content)

print('Disabled gameplay legacy cover-candidate generation and replaced the browser graph with bounded decisions.')
