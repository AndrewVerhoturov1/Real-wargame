import { digestStableValue } from '../CombatLabDigest';
import type { CombatLabConditionV1, CombatLabExperimentV1 } from './CombatLabExperimentContracts';

export function digestCombatLabExperiment(experiment: CombatLabExperimentV1): string {
  return digestStableValue(semanticExperimentValue(experiment));
}

function semanticExperimentValue(experiment: CombatLabExperimentV1): unknown {
  return {
    schemaVersion: experiment.schemaVersion,
    experimentId: experiment.experimentId,
    revision: experiment.revision,
    baseScenarioId: experiment.baseScenarioId,
    sceneSnapshot: semanticSceneSnapshot(experiment.sceneSnapshot),
    roles: experiment.roles.map((role) => ({
      roleId: role.roleId,
      unitId: role.unitId,
      parameters: role.parameters ?? { schemaVersion: 1, accuracy: null },
    })),
    markers: experiment.markers.map((marker) => marker.kind === 'circle'
      ? {
          markerId: marker.markerId,
          kind: marker.kind,
          xMetres: marker.xMetres,
          yMetres: marker.yMetres,
          zMetres: marker.zMetres,
          radiusMetres: marker.radiusMetres,
        }
      : {
          markerId: marker.markerId,
          kind: marker.kind,
          xMetres: marker.xMetres,
          yMetres: marker.yMetres,
          zMetres: marker.zMetres,
        }),
    tracks: experiment.tracks.map((track) => ({
      trackId: track.trackId,
      actorRoleId: track.actorRoleId,
      enabled: track.enabled,
      steps: track.steps.map((step) => ({
        stepId: step.stepId,
        enabled: step.enabled,
        breakpointBefore: step.breakpointBefore,
        startCondition: semanticCondition(step.startCondition),
        action: step.action,
        completion: step.completion.kind === 'condition'
          ? { kind: 'condition', condition: semanticCondition(step.completion.condition) }
          : step.completion,
        repeat: step.repeat.kind === 'until_condition'
          ? {
              kind: step.repeat.kind,
              condition: semanticCondition(step.repeat.condition),
              maximumAttempts: step.repeat.maximumAttempts,
              retryDelaySeconds: step.repeat.retryDelaySeconds,
            }
          : step.repeat,
        timeoutSeconds: step.timeoutSeconds,
        failurePolicy: step.failurePolicy,
        accuracyOverrides: step.accuracyOverrides,
      })),
    })),
    defaults: experiment.defaults,
    successCondition: semanticCondition(experiment.successCondition),
    stopCondition: experiment.stopCondition.kind === 'condition'
      ? {
          kind: experiment.stopCondition.kind,
          maximumSimulationSeconds: experiment.stopCondition.maximumSimulationSeconds,
          condition: semanticCondition(experiment.stopCondition.condition),
        }
      : experiment.stopCondition,
    batchDefaults: experiment.batchDefaults,
  };
}

function semanticSceneSnapshot(scene: CombatLabExperimentV1['sceneSnapshot']): unknown {
  const { exportedAt: _exportedAt, noteRu: _noteRu, staticTacticalPositionArtifact, ...rest } = scene;
  return {
    ...rest,
    ...(staticTacticalPositionArtifact
      ? { staticTacticalPositionArtifact: stripVolatileArtifactMetadata(staticTacticalPositionArtifact) }
      : {}),
  };
}

function stripVolatileArtifactMetadata(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { builtAtMs: _builtAtMs, ...rest } = value;
  return rest;
}

function semanticCondition(condition: CombatLabConditionV1): CombatLabConditionV1 { return condition; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
