import { createDefaultEnvironmentProfileRegistry } from '../../../map/EnvironmentMaterialProfile';
import { buildSceneSnapshot, type ExportedSceneData } from '../../../simulation/SceneSnapshot';
import type {
  CombatLabScenarioDefinitionV1,
  CombatLabScenarioId,
  CombatLabScriptCommandV1,
  CombatLabScriptStepV1,
} from '../CombatLabContracts';
import {
  buildCombatLabInitialState,
  getCombatLabScenarioDefinition,
  listCombatLabScenarioDefinitions,
} from '../CombatLabScenarioRegistry';
import type {
  CombatLabActionV1,
  CombatLabCompletionV1,
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
  CombatLabTrackV1,
} from './CombatLabExperimentContracts';

const BUILT_IN_EXPORTED_AT = '1970-01-01T00:00:00.000Z';
const DEFAULT_BATCH_RUN_COUNT = 100;
const DEFAULT_REPRESENTATIVE_RUN_COUNT = 5;

export function buildCombatLabBuiltInExperiment(
  scenarioId: CombatLabScenarioId,
  seed: number,
): CombatLabExperimentV1 {
  const definition = getCombatLabScenarioDefinition(scenarioId);
  const normalizedSeed = normalizeSeed(seed);
  const built = buildCombatLabInitialState(scenarioId, definition.revision, normalizedSeed);
  const sceneSnapshot = buildSceneSnapshot(built.state, {
    exportedAt: BUILT_IN_EXPORTED_AT,
    environmentProfiles: createDefaultEnvironmentProfileRegistry().toData(),
    staticTacticalPositionArtifact: null,
  });
  const roles: readonly CombatLabExperimentRoleV1[] = definition.roles.map((role) => ({
    roleId: role.roleId,
    unitId: role.unitId,
    titleRu: role.titleRu,
    parameters: { schemaVersion: 1, accuracy: null },
    selectableAs: [...role.selectableAs],
  }));
  const roleIdByUnitId = new Map(roles.map((role) => [role.unitId, role.roleId]));
  const markers: CombatLabMarkerV1[] = [];
  const trackSteps = new Map<string, CombatLabScenarioStepV1[]>();
  for (const role of roles) trackSteps.set(role.roleId, []);

  for (let index = 0; index < definition.defaultProgram.length; index += 1) {
    const sourceStep = definition.defaultProgram[index]!;
    const nextSourceStep = definition.defaultProgram[index + 1] ?? null;
    const converted = convertProgramStep(sourceStep, nextSourceStep, definition, sceneSnapshot, roleIdByUnitId, markers);
    if (!converted) {
      throw new Error(`Combat Lab built-in ${scenarioId} cannot convert program step ${sourceStep.stepId}.`);
    }
    let steps = trackSteps.get(converted.actorRoleId);
    if (!steps) {
      steps = [];
      trackSteps.set(converted.actorRoleId, steps);
    }
    steps.push(converted.step);
  }

  const tracks: readonly CombatLabTrackV1[] = roles.map((role) => ({
    trackId: `track:${role.roleId}`,
    titleRu: role.titleRu,
    actorRoleId: role.roleId,
    enabled: true,
    steps: trackSteps.get(role.roleId) ?? [],
  }));
  const maximumSimulationSeconds = Math.min(600, Math.max(0.1, definition.defaultStopCondition.maximumSimulationSeconds));
  const experiment: CombatLabExperimentV1 = {
    schemaVersion: 1,
    experimentId: `built-in:${scenarioId}`,
    revision: definition.revision,
    titleRu: definition.titleRu,
    descriptionRu: definition.descriptionRu,
    baseScenarioId: definition.scenarioId,
    sceneSnapshot,
    roles,
    markers,
    tracks,
    defaults: {
      seed: normalizedSeed,
      stepTimeoutSeconds: maximumSimulationSeconds,
      failurePolicy: 'stop_experiment',
      repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
      accuracyOverrides: null,
    },
    successCondition: { kind: 'always' },
    stopCondition: {
      kind: definition.defaultStopCondition.kind,
      maximumSimulationSeconds,
    },
    batchDefaults: {
      runCount: DEFAULT_BATCH_RUN_COUNT,
      seedStrategy: { kind: 'fixed', seed: normalizedSeed },
      maximumSimulationSeconds,
      workerCount: 1,
      representativeRunCount: DEFAULT_REPRESENTATIVE_RUN_COUNT,
      metricIds: [...definition.supportedMetrics],
    },
  };
  return deepFreeze(experiment);
}

export function listCombatLabBuiltInExperiments(
  seedOverride?: number,
): readonly CombatLabExperimentV1[] {
  return Object.freeze(listCombatLabScenarioDefinitions().map((definition) => (
    buildCombatLabBuiltInExperiment(definition.scenarioId, seedOverride ?? definition.defaultSeed)
  )));
}

function convertProgramStep(
  sourceStep: CombatLabScriptStepV1,
  nextSourceStep: CombatLabScriptStepV1 | null,
  definition: CombatLabScenarioDefinitionV1,
  scene: ExportedSceneData,
  roleIdByUnitId: ReadonlyMap<string, string>,
  markers: CombatLabMarkerV1[],
): { readonly actorRoleId: string; readonly step: CombatLabScenarioStepV1 } | null {
  const converted = convertCommand(sourceStep, scene, roleIdByUnitId, markers);
  if (!converted) return null;
  const step: CombatLabScenarioStepV1 = {
    stepId: sourceStep.stepId,
    titleRu: stepTitleRu(sourceStep.command),
    enabled: true,
    breakpointBefore: false,
    startCondition: {
      kind: 'elapsed',
      anchor: 'experiment_start',
      seconds: Math.max(0, sourceStep.atSimulationSeconds),
    },
    action: converted.action,
    completion: completionForAction(converted.action, sourceStep, nextSourceStep),
    repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    timeoutSeconds: Math.min(600, Math.max(0.1, definition.defaultStopCondition.maximumSimulationSeconds)),
    failurePolicy: 'stop_experiment',
    accuracyOverrides: sourceStep.command.kind === 'fire' ? sourceStep.command.accuracyOverrides ?? null : null,
  };
  return { actorRoleId: converted.actorRoleId, step };
}

function convertCommand(
  sourceStep: CombatLabScriptStepV1,
  scene: ExportedSceneData,
  roleIdByUnitId: ReadonlyMap<string, string>,
  markers: CombatLabMarkerV1[],
): { readonly actorRoleId: string; readonly action: CombatLabActionV1 } | null {
  const command = sourceStep.command;
  const role = (unitId: string): string | null => roleIdByUnitId.get(unitId) ?? null;
  if (command.kind === 'fire') {
    const actorRoleId = role(command.shooterUnitId);
    if (!actorRoleId) return null;
    let target: Extract<CombatLabActionV1, { readonly kind: 'fire' }>['target'];
    if (command.targetUnitId) {
      const targetRoleId = role(command.targetUnitId);
      if (!targetRoleId) return null;
      target = { kind: 'role', roleId: targetRoleId };
    } else if (command.targetPointMetres) {
      const markerId = `marker:${sourceStep.stepId}:target`;
      const marker: CombatLabMarkerV1 = command.targetRadiusMetres > 0
        ? {
            markerId,
            kind: 'circle',
            titleRu: `Область шага ${sourceStep.stepId}`,
            ...command.targetPointMetres,
            radiusMetres: command.targetRadiusMetres,
          }
        : {
            markerId,
            kind: 'point',
            titleRu: `Точка шага ${sourceStep.stepId}`,
            ...command.targetPointMetres,
          };
      markers.push(marker);
      target = { kind: 'marker', markerId };
    } else {
      return null;
    }
    return {
      actorRoleId,
      action: {
        kind: 'fire',
        actorRoleId,
        target,
        mode: command.mode,
        targetRadiusMetres: command.targetRadiusMetres,
        minimumSolutionQuality: command.minimumSolutionQuality,
        minimumPerceptionQuality: command.minimumPerceptionQuality ?? 0,
        forceFire: command.forceFire === true,
      },
    };
  }
  if (command.kind === 'cancel_fire') {
    const actorRoleId = role(command.unitId);
    return actorRoleId ? { actorRoleId, action: { kind: 'stop_fire', actorRoleId } } : null;
  }
  if (command.kind === 'posture') {
    const actorRoleId = role(command.unitId);
    return actorRoleId ? { actorRoleId, action: { kind: 'posture', actorRoleId, targetPosture: command.targetPosture } } : null;
  }
  if (command.kind === 'move') {
    const actorRoleId = role(command.unitId);
    if (!actorRoleId) return null;
    const markerId = `marker:${sourceStep.stepId}:destination`;
    markers.push({
      markerId,
      kind: 'point',
      titleRu: `Позиция шага ${sourceStep.stepId}`,
      xMetres: command.targetGrid.x * scene.map.metersPerCell,
      yMetres: command.targetGrid.y * scene.map.metersPerCell,
      zMetres: 0,
    });
    return { actorRoleId, action: { kind: 'move', actorRoleId, markerId } };
  }
  if (command.kind === 'reload' || command.kind === 'deploy' || command.kind === 'undeploy') {
    const actorRoleId = role(command.unitId);
    const helperRoleId = command.helperUnitId ? role(command.helperUnitId) : null;
    if (!actorRoleId || (command.helperUnitId && !helperRoleId)) return null;
    return { actorRoleId, action: { kind: command.kind, actorRoleId, helperRoleId } };
  }
  if (command.kind === 'transfer') {
    const sourceRoleId = role(command.sourceUnitId);
    const targetRoleId = role(command.targetUnitId);
    return sourceRoleId && targetRoleId
      ? { actorRoleId: sourceRoleId, action: { kind: 'transfer', sourceRoleId, targetRoleId, requestedRounds: command.requestedRounds } }
      : null;
  }
  if (command.kind !== 'first_aid') return null;
  const actorRoleId = role(command.actorUnitId);
  const targetRoleId = role(command.targetUnitId);
  return actorRoleId && targetRoleId
    ? { actorRoleId, action: { kind: 'first_aid', actorRoleId, targetRoleId, zone: command.zone } }
    : null;
}

function completionForAction(
  action: CombatLabActionV1,
  sourceStep: CombatLabScriptStepV1,
  nextSourceStep: CombatLabScriptStepV1 | null,
): CombatLabCompletionV1 {
  if (
    action.kind === 'fire'
    && nextSourceStep?.command.kind === 'cancel_fire'
    && sourceStep.command.kind === 'fire'
    && nextSourceStep.command.unitId === sourceStep.command.shooterUnitId
    && nextSourceStep.atSimulationSeconds > sourceStep.atSimulationSeconds
  ) {
    return {
      kind: 'condition',
      condition: {
        kind: 'elapsed',
        anchor: 'step_start',
        seconds: nextSourceStep.atSimulationSeconds - sourceStep.atSimulationSeconds,
      },
    };
  }
  return action.kind === 'fire' && action.mode === 'single'
    ? { kind: 'shot_resolved' }
    : { kind: 'production_action' };
}

function stepTitleRu(command: CombatLabScriptCommandV1): string {
  switch (command.kind) {
    case 'fire': return 'Открыть огонь';
    case 'cancel_fire': return 'Остановить огонь';
    case 'move': return 'Двигаться к позиции';
    case 'face': return 'Повернуться к точке';
    case 'cancel_action': return 'Отменить действие';
    case 'posture': return 'Изменить позу';
    case 'reload': return 'Перезарядить оружие';
    case 'deploy': return 'Установить оружие';
    case 'undeploy': return 'Снять оружие';
    case 'transfer': return 'Передать боеприпасы';
    case 'first_aid': return 'Оказать первую помощь';
  }
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
