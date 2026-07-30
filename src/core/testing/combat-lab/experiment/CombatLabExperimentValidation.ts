import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabExperimentRoleV1,
  type CombatLabExperimentV1,
  type CombatLabMarkerV1,
  type CombatLabTrackV1,
} from './CombatLabExperimentContracts';
import {
  conditionsOfStep,
  collectUniqueIds,
  detectDependencyCycles,
  error,
  missingReference,
  readSceneUnits,
  text,
  finite,
  validateFiniteRange,
  warning,
  asRecord,
  type StepLocation,
} from './CombatLabExperimentValidationSupport';
import {
  isConditionInitiallyTrue,
  validateActionWarnings,
  validateBatchConfig,
  validateConditionReferences,
  validateMarkers,
  validateRepeat,
  validateSeed,
  validateStep,
  validateStopCondition,
} from './CombatLabExperimentValidationRules';

export interface CombatLabExperimentIssueV1 {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly messageRu: string;
  readonly path: string;
}

export function validateCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): readonly CombatLabExperimentIssueV1[] {
  const issues: CombatLabExperimentIssueV1[] = [];
  const root = asRecord(experiment);
  if (!root) {
    issues.push(error('combat_lab_experiment_not_object', 'Эксперимент должен быть объектом.', '$'));
    return issues;
  }
  if (root.schemaVersion !== 1) {
    issues.push(error('combat_lab_experiment_schema_unsupported', 'Поддерживается только schemaVersion: 1.', '$.schemaVersion'));
  }
  if (!text(root.experimentId).trim()) {
    issues.push(error('combat_lab_experiment_id_invalid', 'experimentId должен быть непустой строкой.', '$.experimentId'));
  }
  if (!Number.isInteger(root.revision) || finite(root.revision) < 1) {
    issues.push(error('combat_lab_experiment_revision_invalid', 'revision должен быть целым числом больше нуля.', '$.revision'));
  }

  const roles: readonly CombatLabExperimentRoleV1[] = Array.isArray(experiment.roles) ? experiment.roles : [];
  const markers: readonly CombatLabMarkerV1[] = Array.isArray(experiment.markers) ? experiment.markers : [];
  const tracks: readonly CombatLabTrackV1[] = Array.isArray(experiment.tracks) ? experiment.tracks : [];
  const allSteps = tracks.flatMap((track) => Array.isArray(track.steps) ? track.steps : []);

  if (tracks.length > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumTracks) {
    issues.push(error('combat_lab_track_limit_exceeded', `Число дорожек превышает предел ${COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumTracks}.`, '$.tracks'));
  }
  if (allSteps.length > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps) {
    issues.push(error('combat_lab_step_limit_exceeded', `Число шагов превышает предел ${COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps}.`, '$.tracks'));
  }
  if (markers.length > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumMarkers) {
    issues.push(error('combat_lab_marker_limit_exceeded', `Число меток превышает предел ${COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumMarkers}.`, '$.markers'));
  }

  const roleIds = collectUniqueIds(roles, 'roleId', '$.roles', 'combat_lab_role_id_duplicate', 'Участник', issues);
  const markerIds = collectUniqueIds(markers, 'markerId', '$.markers', 'combat_lab_marker_id_duplicate', 'Метка', issues);
  const trackIds = collectUniqueIds(tracks, 'trackId', '$.tracks', 'combat_lab_track_id_duplicate', 'Дорожка', issues);
  validateParticipantRecords(roles, issues);

  const stepLocations: StepLocation[] = [];
  tracks.forEach((track, trackIndex) => {
    const trackPath = `$.tracks[${trackIndex}]`;
    if (!roleIds.has(track.actorRoleId)) missingReference(issues, 'combat_lab_track_actor_missing', 'Исполнитель дорожки не найден среди участников.', `${trackPath}.actorRoleId`);
    if (track.enabled === false) {
      issues.push(warning('combat_lab_track_disabled', 'Отключённая дорожка статически недостижима при запуске.', trackPath));
    }
    const stepIds = new Set<string>();
    track.steps.forEach((step, stepIndex) => {
      const path = `${trackPath}.steps[${stepIndex}]`;
      if (!step.stepId || stepIds.has(step.stepId)) {
        issues.push(error('combat_lab_step_id_duplicate', `ID шага «${step.stepId || 'пустой'}» должен быть непустым и уникальным.`, `${path}.stepId`));
      } else {
        stepIds.add(step.stepId);
      }
      stepLocations.push({ key: `${track.trackId}/${step.stepId}`, trackId: track.trackId, step, path });
      if (step.enabled === false) issues.push(warning('combat_lab_step_disabled', 'Отключённый шаг статически недостижим при запуске.', path));
      validateStep(step, path, roleIds, markerIds, trackIds, stepIds, issues);
    });
  });

  const sceneUnits = readSceneUnits(experiment);
  const sceneUnitIds = new Set(sceneUnits.map((unit) => unit.id));
  roles.forEach((role, index) => {
    if (!sceneUnitIds.has(role.unitId)) {
      issues.push(error('combat_lab_role_unit_missing', `Боец участника «${role.roleId}» отсутствует в снимке сцены.`, `$.roles[${index}].unitId`));
    }
  });

  validateMarkers(experiment, issues);
  validateSeed(experiment.defaults?.seed, '$.defaults.seed', issues);
  validateBatchConfig(experiment.batchDefaults, '$.batchDefaults', issues);
  validateFiniteRange(experiment.defaults?.stepTimeoutSeconds, 0, COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds, '$.defaults.stepTimeoutSeconds', 'combat_lab_default_timeout_invalid', 'Общий timeout шага должен быть больше нуля и не превышать 600 секунд.', issues, false);
  validateRepeat(experiment.defaults?.repeat, '$.defaults.repeat', issues);
  validateStopCondition(experiment, issues);

  const stepKeys = new Set(stepLocations.map((item) => item.key));
  for (const location of stepLocations) {
    validateConditionReferences(location.step.startCondition, `${location.path}.startCondition`, roleIds, trackIds, stepKeys, issues);
    if (location.step.completion.kind === 'condition') {
      validateConditionReferences(location.step.completion.condition, `${location.path}.completion.condition`, roleIds, trackIds, stepKeys, issues);
    }
    if (location.step.repeat.kind === 'until_condition') {
      validateConditionReferences(location.step.repeat.condition, `${location.path}.repeat.condition`, roleIds, trackIds, stepKeys, issues);
    }
    validateActionWarnings(location.step, location.path, experiment, sceneUnits, issues);
    for (const [condition, path] of conditionsOfStep(location.step, location.path)) {
      if (isConditionInitiallyTrue(condition, experiment, sceneUnits)) {
        issues.push(warning('combat_lab_condition_already_true', 'Условие уже истинно в исходной сцене.', path));
      }
    }
  }
  validateConditionReferences(experiment.successCondition, '$.successCondition', roleIds, trackIds, stepKeys, issues);
  if (experiment.stopCondition.kind === 'condition') {
    validateConditionReferences(experiment.stopCondition.condition, '$.stopCondition.condition', roleIds, trackIds, stepKeys, issues);
  }
  detectDependencyCycles(stepLocations, issues);

  return issues;
}

function validateParticipantRecords(
  roles: readonly CombatLabExperimentRoleV1[],
  issues: CombatLabExperimentIssueV1[],
): void {
  const unitOwners = new Map<string, number>();
  roles.forEach((role, index) => {
    const path = `$.roles[${index}]`;
    if (!role.unitId?.trim()) issues.push(error('combat_lab_participant_unit_id_invalid', 'Идентификатор бойца должен быть непустой строкой.', `${path}.unitId`));
    if (!role.titleRu?.trim()) issues.push(error('combat_lab_participant_title_invalid', 'Имя бойца должно быть непустой строкой.', `${path}.titleRu`));
    const previous = unitOwners.get(role.unitId);
    if (previous !== undefined) {
      issues.push(error('combat_lab_participant_unit_duplicate', `Один боец начальной сцены назначен участникам ${previous + 1} и ${index + 1}.`, `${path}.unitId`));
    } else if (role.unitId) {
      unitOwners.set(role.unitId, index);
    }
    validateParticipantParameters(role, path, issues);
  });
}

function validateParticipantParameters(
  role: CombatLabExperimentRoleV1,
  path: string,
  issues: CombatLabExperimentIssueV1[],
): void {
  if (role.parameters === undefined) {
    issues.push(error('combat_lab_participant_parameters_missing', 'Обязательное поле parameters отсутствует.', `${path}.parameters`));
    return;
  }
  const parameters = asRecord(role.parameters);
  if (!parameters || parameters.schemaVersion !== 1) {
    issues.push(error('combat_lab_participant_parameters_invalid', 'Параметры бойца должны иметь schemaVersion: 1.', `${path}.parameters`));
    return;
  }
  if (parameters.accuracy === null) return;
  const accuracy = asRecord(parameters.accuracy);
  if (!accuracy) {
    issues.push(error('combat_lab_participant_accuracy_invalid', 'Параметры точности бойца должны быть объектом или null.', `${path}.parameters.accuracy`));
    return;
  }
  finiteRange(accuracy.dispersionMultiplier, 0.25, 4, `${path}.parameters.accuracy.dispersionMultiplier`, issues);
  finiteRange(accuracy.aimTimeSeconds, 0.1, 10, `${path}.parameters.accuracy.aimTimeSeconds`, issues);
  finiteRange(accuracy.shootingSkill, 0, 1, `${path}.parameters.accuracy.shootingSkill`, issues);
  finiteRange(accuracy.randomnessMultiplier, 0, 2, `${path}.parameters.accuracy.randomnessMultiplier`, issues);
  if (accuracy.physicalAimThreshold !== undefined) finiteRange(accuracy.physicalAimThreshold, 0, 1, `${path}.parameters.accuracy.physicalAimThreshold`, issues);
  if (accuracy.weaponProficiency !== 'untrained' && accuracy.weaponProficiency !== 'trained' && accuracy.weaponProficiency !== 'specialist') {
    issues.push(error('combat_lab_participant_proficiency_invalid', 'Неизвестный уровень владения оружием.', `${path}.parameters.accuracy.weaponProficiency`));
  }
  if (!Number.isInteger(accuracy.randomSeed) || finite(accuracy.randomSeed) < 1 || finite(accuracy.randomSeed) > 0xffff_ffff) {
    issues.push(error('combat_lab_participant_random_seed_invalid', 'Seed параметров бойца должен быть целым числом в диапазоне 1..4294967295.', `${path}.parameters.accuracy.randomSeed`));
  }
  if (accuracy.usePhysicalAimThreshold !== true) {
    issues.push(error('combat_lab_participant_aim_mode_invalid', 'Параметры бойца должны использовать физический порог прицеливания.', `${path}.parameters.accuracy.usePhysicalAimThreshold`));
  }
}

function finiteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  issues: CombatLabExperimentIssueV1[],
): void {
  const numeric = finite(value, Number.NaN);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    issues.push(error('combat_lab_participant_accuracy_range_invalid', `Значение должно находиться в диапазоне ${minimum}..${maximum}.`, path));
  }
}
