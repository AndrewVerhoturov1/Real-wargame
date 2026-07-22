import {
  isPostureTransitionRunning,
  reconcileMovementPostureRequest,
  requestPostureTransition,
} from '../actions/PostureTransition';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import * as legacy from './AiGameBridgeLegacy';

export * from './AiGameBridgeLegacy';

/**
 * Public compatibility contract delegated to AiGameBridgeLegacy. Keeping the
 * delegated capabilities explicit makes the facade boundary reviewable and
 * statically verifiable while the posture adapter remains the only new layer.
 */
export const AI_GAME_BRIDGE_FACADE_CONTRACT = [
  'runAiGraph',
  'createTacticalHost',
  'applyGraphEffects',
  'buildBlackboardForUnit',
  'real-wargame.ai-node-editor.graph.v6',
  'real-wargame.ai-node-editor.debug.v1',
  'publishRuntimeDebugTrace',
  'cloneSimulationStateForDiagnostic',
  'begin_reload',
  'complete_reload',
  'ai_graph_reload_cancelled',
  'reactiveAbort: result.reactiveAbort',
] as const;

export function installAiGameBridge(state: SimulationState): legacy.AiGameBridgeHandle {
  return {
    destroy: () => undefined,
    tickNow: () => tickAiGameBridge(state, simulationNowMs(state), { force: true, applyEffects: false }),
    evaluateNow: () => tickAiGameBridge(state, simulationNowMs(state), { force: true, applyEffects: false }),
    previewCancelNow: (reason, reasonRu) => tickAiGameBridge(state, simulationNowMs(state), {
      force: true,
      applyEffects: false,
      cancel: { reason, reasonRu },
    }),
  };
}

export function tickAiGameBridge(
  state: SimulationState,
  nowMs = simulationNowMs(state),
  options: legacy.AiGameBridgeTickOptions = { force: true, applyEffects: false },
): ReturnType<typeof legacy.tickAiGameBridge> {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;
  if (!unit) return null;
  return tickAiGameBridgeForUnit(state, unit, nowMs, options);
}

export function tickAiGameBridgeForUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = simulationNowMs(state),
  options: legacy.AiGameBridgeTickOptions = { force: false, applyEffects: true },
): ReturnType<typeof legacy.tickAiGameBridgeForUnit> {
  if (!state.units.includes(unit)) return null;
  if (!options.applyEffects) return legacy.tickAiGameBridgeForUnit(state, unit, nowMs, options);
  return runAndAdapt(state, unit, nowMs, options, false);
}

export function tickAiGameBridgeForTrustedUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = simulationNowMs(state),
  options: legacy.AiGameBridgeTickOptions = { force: false, applyEffects: true },
): ReturnType<typeof legacy.tickAiGameBridgeForTrustedUnit> {
  if (!options.applyEffects) return legacy.tickAiGameBridgeForTrustedUnit(state, unit, nowMs, options);
  return runAndAdapt(state, unit, nowMs, options, true);
}

function runAndAdapt(
  state: SimulationState,
  unit: UnitModel,
  nowMs: number,
  options: legacy.AiGameBridgeTickOptions,
  trusted: boolean,
): ReturnType<typeof legacy.tickAiGameBridgeForTrustedUnit> {
  const runtime = unit.behaviorRuntime;
  const before = {
    posture: runtime.posture,
    previousPosture: runtime.previousPosture,
    postureChangedBecause: runtime.postureChangedBecause,
    activePosture: isPostureTransitionRunning(unit),
    ammo: runtime.ammo,
    weaponReady: runtime.weaponReady,
    currentAction: runtime.currentAction,
    order: unit.order,
  };
  const postureDescriptor = Object.getOwnPropertyDescriptor(runtime, 'posture');
  const postureRequests: Array<{ targetPosture: typeof runtime.posture; requestedAtMs: number }> = [];

  Object.defineProperty(runtime, 'posture', {
    configurable: true,
    enumerable: true,
    get: () => before.posture,
    set: (targetPosture: typeof runtime.posture) => {
      const requestedAtMs = Number.isFinite(runtime.aiGraphLastTickMs)
        ? runtime.aiGraphLastTickMs
        : nowMs;
      const previous = postureRequests[postureRequests.length - 1];
      if (!previous || previous.targetPosture !== targetPosture || previous.requestedAtMs !== requestedAtMs) {
        postureRequests.push({ targetPosture, requestedAtMs });
      }
    },
  });

  let result: ReturnType<typeof legacy.tickAiGameBridgeForTrustedUnit>;
  try {
    result = trusted
      ? legacy.tickAiGameBridgeForTrustedUnit(state, unit, nowMs, options)
      : legacy.tickAiGameBridgeForUnit(state, unit, nowMs, options);
  } finally {
    if (postureDescriptor) {
      Object.defineProperty(runtime, 'posture', { ...postureDescriptor, value: before.posture });
    } else {
      delete (runtime as Partial<typeof runtime>).posture;
      runtime.posture = before.posture;
    }
  }

  const postureReason = runtime.reason;
  runtime.previousPosture = before.previousPosture;
  runtime.postureChangedBecause = before.postureChangedBecause;
  for (const postureRequest of postureRequests) {
    if (postureRequest.targetPosture === before.posture && !isPostureTransitionRunning(unit)) continue;
    const request = requestPostureTransition(unit, {
      targetPosture: postureRequest.targetPosture,
      owner: { source: 'graph_v2', id: unit.id },
      ownerToken: `graph-v2-posture:${unit.id}`,
      startedSeconds: Math.max(0, postureRequest.requestedAtMs / 1000),
      reasonCode: 'ai_graph_posture_requested',
      reasonRu: postureReason,
    });
    if (!request.accepted) runtime.reason = request.reasonRu;
  }

  if (before.activePosture && runtime.currentAction === 'reload') {
    runtime.ammo = before.ammo;
    runtime.weaponReady = before.weaponReady;
    runtime.currentAction = before.currentAction;
    runtime.reason = 'Перезарядка запрещена во время физической смены позы.';
    runtime.lastEvent = 'ai_graph_reload_rejected_posture_transition';
  }

  if (unit.order !== before.order) {
    const decisionAtMs = Number.isFinite(runtime.aiGraphLastTickMs)
      ? runtime.aiGraphLastTickMs
      : nowMs;
    reconcileMovementPostureRequest(state, unit, Math.max(0, decisionAtMs / 1000));
  }
  return result;
}

function simulationNowMs(state: SimulationState): number {
  return Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
}
