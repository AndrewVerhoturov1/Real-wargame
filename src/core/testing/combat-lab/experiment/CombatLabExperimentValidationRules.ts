import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabActionV1,
  type CombatLabBatchConfigV1,
  type CombatLabConditionV1,
  type CombatLabExperimentV1,
  type CombatLabRepeatPolicyV1,
  type CombatLabScenarioStepV1,
} from './CombatLabExperimentContracts';
import type { CombatLabExperimentIssueV1 } from './CombatLabExperimentValidation';
import {
  conditionsOfStep,
  error,
  finite,
  missingReference,
  validateFiniteRange,
  text,
  warning,
  asRecord,
  type SceneUnitSummary,
} from './CombatLabExperimentValidationSupport';

export function validateStep(
  step: CombatLabScenarioStepV1,
  path: string,
  roleIds: ReadonlySet<string>,
  markerIds: ReadonlySet<string>,
  _trackIds: ReadonlySet<string>,
  _knownStepIds: ReadonlySet<string>,
  issues: CombatLabExperimentIssueV1[],
): void {
  validateFiniteRange(step.timeoutSeconds, 0, COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds, `${path}.timeoutSeconds`, 'combat_lab_step_timeout_invalid', 'Timeout шага должен быть больше нуля и не превышать 600 секунд.', issues, false);
  validateRepeat(step.repeat, `${path}.repeat`, issues);
  validateActionReferences(step.action, `${path}.action`, roleIds, markerIds, issues);
  if (step.startCondition.kind === 'elapsed' && step.startCondition.anchor === 'step_start') {
    issues.push(error('combat_lab_start_condition_step_anchor_invalid', 'Условие начала не может отсчитывать время от ещё не начавшегося шага.', `${path}.startCondition.anchor`));
  }
  if (step.action.kind === 'wait' && step.action.durationSeconds === null && step.completion.kind !== 'condition') {
    issues.push(error('combat_lab_wait_completion_missing', 'Ожидание без длительности должно иметь условие завершения.', `${path}.completion`));
  }
  if (step.completion.kind === 'shot_resolved' && step.action.kind !== 'fire') {
    issues.push(error('combat_lab_shot_completion_action_invalid', 'shot_resolved допустим только для огневого действия.', `${path}.completion.kind`));
  }
}

function validateActionReferences(
  action: CombatLabActionV1,
  path: string,
  roleIds: ReadonlySet<string>,
  markerIds: ReadonlySet<string>,
  issues: CombatLabExperimentIssueV1[],
): void {
  const roleRef = (roleId: string | null, field: string): void => {
    if (roleId !== null && !roleIds.has(roleId)) missingReference(issues, 'combat_lab_action_role_missing', 'Ссылка действия ведёт на отсутствующую роль.', `${path}.${field}`);
  };
  switch (action.kind) {
    case 'fire':
      roleRef(action.actorRoleId, 'actorRoleId');
      if (action.target.kind === 'role') roleRef(action.target.roleId, 'target.roleId');
      else if (!markerIds.has(action.target.markerId)) missingReference(issues, 'combat_lab_action_marker_missing', 'Ссылка действия ведёт на отсутствующую метку.', `${path}.target.markerId`);
      if (!Number.isFinite(action.targetRadiusMetres) || action.targetRadiusMetres < 0) {
        issues.push(error('combat_lab_fire_radius_invalid', 'Радиус огня должен быть конечным неотрицательным числом.', `${path}.targetRadiusMetres`));
      }
      if (!Number.isFinite(action.minimumSolutionQuality) || action.minimumSolutionQuality < 0 || action.minimumSolutionQuality > 1) {
        issues.push(error('combat_lab_fire_solution_quality_invalid', 'Порог решения стрельбы должен находиться в диапазоне 0..1.', `${path}.minimumSolutionQuality`));
      }
      if (!Number.isFinite(action.minimumPerceptionQuality) || action.minimumPerceptionQuality < 0 || action.minimumPerceptionQuality > 1) {
        issues.push(error('combat_lab_fire_perception_quality_invalid', 'Порог качества контакта должен находиться в диапазоне 0..1.', `${path}.minimumPerceptionQuality`));
      }
      break;
    case 'stop_fire':
    case 'posture':
      roleRef(action.actorRoleId, 'actorRoleId');
      break;
    case 'move':
      roleRef(action.actorRoleId, 'actorRoleId');
      if (!markerIds.has(action.markerId)) missingReference(issues, 'combat_lab_action_marker_missing', 'Ссылка движения ведёт на отсутствующую метку.', `${path}.markerId`);
      break;
    case 'wait':
      if (action.durationSeconds !== null) validateFiniteRange(action.durationSeconds, 0, COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds, `${path}.durationSeconds`, 'combat_lab_wait_duration_invalid', 'Время ожидания должно быть больше нуля и не превышать 600 секунд.', issues, false);
      break;
    case 'reload':
    case 'deploy':
    case 'undeploy':
      roleRef(action.actorRoleId, 'actorRoleId');
      roleRef(action.helperRoleId, 'helperRoleId');
      break;
    case 'transfer':
      roleRef(action.sourceRoleId, 'sourceRoleId');
      roleRef(action.targetRoleId, 'targetRoleId');
      if (!Number.isInteger(action.requestedRounds) || action.requestedRounds < 1) issues.push(error('combat_lab_transfer_rounds_invalid', 'Количество передаваемых патронов должно быть целым числом больше нуля.', `${path}.requestedRounds`));
      break;
    case 'first_aid':
      roleRef(action.actorRoleId, 'actorRoleId');
      roleRef(action.targetRoleId, 'targetRoleId');
      break;
  }
}

export function validateConditionReferences(
  condition: CombatLabConditionV1,
  path: string,
  roleIds: ReadonlySet<string>,
  trackIds: ReadonlySet<string>,
  stepKeys: ReadonlySet<string>,
  issues: CombatLabExperimentIssueV1[],
): void {
  if (condition.kind === 'elapsed') {
    validateFiniteRange(condition.seconds, 0, COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds, `${path}.seconds`, 'combat_lab_condition_elapsed_invalid', 'Задержка условия должна быть неотрицательной и не превышать 600 секунд.', issues, true);
    return;
  }
  if (condition.kind === 'step_state') {
    if (!trackIds.has(condition.trackId)) missingReference(issues, 'combat_lab_condition_track_missing', 'Условие ссылается на отсутствующую дорожку.', `${path}.trackId`);
    if (!stepKeys.has(`${condition.trackId}/${condition.stepId}`)) missingReference(issues, 'combat_lab_condition_step_missing', 'Условие ссылается на отсутствующий шаг.', `${path}.stepId`);
    return;
  }
  const roleRefs = condition.kind === 'contact'
    ? [condition.observerRoleId, condition.targetRoleId]
    : condition.kind === 'role_state' || condition.kind === 'ammo' || condition.kind === 'suppression'
      ? [condition.roleId]
      : [];
  roleRefs.forEach((roleId) => {
    if (!roleIds.has(roleId)) missingReference(issues, 'combat_lab_condition_role_missing', 'Условие ссылается на отсутствующую роль.', path);
  });
  if (condition.kind === 'ammo' && condition.comparison !== 'empty' && (!Number.isInteger(condition.rounds) || condition.rounds < 0)) {
    issues.push(error('combat_lab_condition_ammo_invalid', 'Порог боеприпасов должен быть целым неотрицательным числом.', `${path}.rounds`));
  }
  if (condition.kind === 'suppression' && (!Number.isFinite(condition.value) || condition.value < 0 || condition.value > 1)) {
    issues.push(error('combat_lab_condition_suppression_invalid', 'Порог подавления должен находиться в диапазоне 0..1.', `${path}.value`));
  }
}

export function validateRepeat(repeat: CombatLabRepeatPolicyV1 | undefined, path: string, issues: CombatLabExperimentIssueV1[]): void {
  if (!repeat) {
    issues.push(error('combat_lab_repeat_missing', 'Для шага или настроек должна быть задана ограниченная политика повтора.', path));
    return;
  }
  if (!Number.isInteger(repeat.maximumAttempts)
    || repeat.maximumAttempts < COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumRepeatAttempts
    || repeat.maximumAttempts > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumRepeatAttempts) {
    issues.push(error('combat_lab_repeat_attempts_invalid', 'maximumAttempts должен находиться в диапазоне 1..1000.', `${path}.maximumAttempts`));
  }
  if (!Number.isFinite(repeat.retryDelaySeconds) || repeat.retryDelaySeconds < 0 || repeat.retryDelaySeconds > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds) {
    issues.push(error('combat_lab_repeat_delay_invalid', 'retryDelaySeconds должен находиться в диапазоне 0..600 секунд.', `${path}.retryDelaySeconds`));
  }
  if (repeat.kind === 'once' && (repeat.maximumAttempts !== 1 || repeat.retryDelaySeconds !== 0)) {
    issues.push(error('combat_lab_repeat_once_invalid', 'Политика once должна иметь maximumAttempts: 1 и retryDelaySeconds: 0.', path));
  }
}

export function validateSeed(seed: unknown, path: string, issues: CombatLabExperimentIssueV1[]): void {
  if (!Number.isInteger(seed) || (seed as number) < 1 || (seed as number) > 0xffff_ffff) {
    issues.push(error('combat_lab_seed_invalid', 'Seed должен быть целым числом в диапазоне 1..4294967295.', path));
  }
}

export function validateBatchConfig(config: CombatLabBatchConfigV1 | undefined, path: string, issues: CombatLabExperimentIssueV1[]): void {
  if (!config) {
    issues.push(error('combat_lab_batch_missing', 'Отсутствуют настройки серии прогонов.', path));
    return;
  }
  const limits = COMBAT_LAB_EXPERIMENT_LIMITS_V1;
  if (!Number.isInteger(config.runCount) || config.runCount < limits.minimumRunCount || config.runCount > limits.maximumRunCount) issues.push(error('combat_lab_batch_run_count_invalid', 'Число прогонов должно находиться в диапазоне 1..10000.', `${path}.runCount`));
  if (!Number.isInteger(config.workerCount) || config.workerCount < limits.minimumWorkerCount || config.workerCount > limits.maximumWorkerCount) issues.push(error('combat_lab_batch_worker_count_invalid', 'Число workers должно находиться в диапазоне 1..4.', `${path}.workerCount`));
  if (!Number.isInteger(config.representativeRunCount) || config.representativeRunCount < limits.minimumRepresentativeRuns || config.representativeRunCount > limits.maximumRepresentativeRuns) issues.push(error('combat_lab_batch_representative_count_invalid', 'Число характерных прогонов должно находиться в диапазоне 1..20.', `${path}.representativeRunCount`));
  if (Number.isInteger(config.runCount) && Number.isInteger(config.representativeRunCount) && config.representativeRunCount > config.runCount) {
    issues.push(error('combat_lab_batch_representative_exceeds_runs', 'Число характерных прогонов не может превышать общее число прогонов.', `${path}.representativeRunCount`));
  }
  validateFiniteRange(config.maximumSimulationSeconds, limits.minimumSimulationSeconds, limits.maximumSimulationSeconds, `${path}.maximumSimulationSeconds`, 'combat_lab_batch_duration_invalid', 'Максимальное время серии должно находиться в диапазоне 0,1..600 секунд.', issues, true);
  if (config.seedStrategy.kind === 'fixed') validateSeed(config.seedStrategy.seed, `${path}.seedStrategy.seed`, issues);
  if (config.seedStrategy.kind === 'sequential') validateSeed(config.seedStrategy.firstSeed, `${path}.seedStrategy.firstSeed`, issues);
  if (config.seedStrategy.kind === 'explicit') {
    if (config.seedStrategy.seeds.length !== config.runCount) issues.push(error('combat_lab_batch_explicit_seed_count_invalid', 'Для explicit Seed strategy число Seed должно совпадать с числом прогонов.', `${path}.seedStrategy.seeds`));
    config.seedStrategy.seeds.forEach((seed, index) => validateSeed(seed, `${path}.seedStrategy.seeds[${index}]`, issues));
  }
}

export function validateStopCondition(experiment: CombatLabExperimentV1, issues: CombatLabExperimentIssueV1[]): void {
  validateFiniteRange(experiment.stopCondition?.maximumSimulationSeconds, COMBAT_LAB_EXPERIMENT_LIMITS_V1.minimumSimulationSeconds, COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSimulationSeconds, '$.stopCondition.maximumSimulationSeconds', 'combat_lab_stop_duration_invalid', 'Максимальное время эксперимента должно находиться в диапазоне 0,1..600 секунд.', issues, true);
}

export function validateMarkers(experiment: CombatLabExperimentV1, issues: CombatLabExperimentIssueV1[]): void {
  const map = asRecord(experiment.sceneSnapshot?.map);
  const widthMetres = finite(map?.width) * Math.max(0, finite(map?.metersPerCell, 1));
  const heightMetres = finite(map?.height) * Math.max(0, finite(map?.metersPerCell, 1));
  experiment.markers.forEach((marker, index) => {
    const path = `$.markers[${index}]`;
    if (!Number.isFinite(marker.xMetres) || !Number.isFinite(marker.yMetres) || marker.xMetres < 0 || marker.yMetres < 0 || marker.xMetres > widthMetres || marker.yMetres > heightMetres) {
      issues.push(error('combat_lab_marker_out_of_bounds', 'Метка находится за пределами карты.', path));
    }
    if (!Number.isFinite(marker.zMetres)) issues.push(error('combat_lab_marker_height_invalid', 'Высота метки должна быть конечным числом.', `${path}.zMetres`));
    if (marker.kind === 'circle' && (!Number.isFinite(marker.radiusMetres) || marker.radiusMetres <= 0)) issues.push(error('combat_lab_marker_radius_invalid', 'Радиус круглой области должен быть больше нуля.', `${path}.radiusMetres`));
  });
}

export function validateActionWarnings(
  step: CombatLabScenarioStepV1,
  path: string,
  experiment: CombatLabExperimentV1,
  sceneUnits: readonly SceneUnitSummary[],
  issues: CombatLabExperimentIssueV1[],
): void {
  const roleToUnit = new Map(experiment.roles.map((role) => [role.roleId, role.unitId]));
  const unitById = new Map(sceneUnits.map((unit) => [unit.id, unit]));
  const action = step.action;
  if (action.kind === 'fire') {
    const actor = unitById.get(roleToUnit.get(action.actorRoleId) ?? '');
    if (actor && !actor.primaryWeapon) issues.push(warning('combat_lab_fire_weapon_missing', 'У исполнителя огневого шага нет primary weapon.', `${path}.action.actorRoleId`));
    if (actor?.primaryWeapon && !actor.availableFireModes.includes(action.mode)) issues.push(warning('combat_lab_fire_mode_unsupported', 'Выбранный режим огня не поддерживается оружием исполнителя.', `${path}.action.mode`));
    if (step.repeat.maximumAttempts > 1 && actor && actor.totalRounds < step.repeat.maximumAttempts) issues.push(warning('combat_lab_repeat_ammo_insufficient', 'Исходного боекомплекта может не хватить для ожидаемого числа повторов.', `${path}.repeat.maximumAttempts`));
  }
  if ((action.kind === 'reload' || action.kind === 'deploy' || action.kind === 'undeploy') && action.helperRoleId === action.actorRoleId) {
    issues.push(warning('combat_lab_helper_matches_actor', 'Помощник совпадает с исполнителем действия.', `${path}.action.helperRoleId`));
  }
  if (action.kind === 'first_aid' && action.actorRoleId === action.targetRoleId) {
    issues.push(warning('combat_lab_helper_matches_actor', 'Оказывающий помощь совпадает с целью помощи.', `${path}.action.targetRoleId`));
  }
  if (action.kind === 'transfer' && action.sourceRoleId === action.targetRoleId) {
    issues.push(warning('combat_lab_helper_matches_actor', 'Источник и получатель боеприпасов совпадают.', `${path}.action.targetRoleId`));
  }
}
export function isConditionInitiallyTrue(condition: CombatLabConditionV1, experiment: CombatLabExperimentV1, units: readonly SceneUnitSummary[]): boolean {
  if (condition.kind === 'always') return false;
  if (condition.kind === 'elapsed') return condition.seconds <= 0;
  if (condition.kind === 'step_state') return false;
  const roleToUnit = new Map(experiment.roles.map((role) => [role.roleId, role.unitId]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  if (condition.kind === 'contact') {
    const observer = unitById.get(roleToUnit.get(condition.observerRoleId) ?? '');
    const targetId = roleToUnit.get(condition.targetRoleId) ?? '';
    const present = observer?.contacts.includes(targetId) ?? false;
    return present === condition.present;
  }
  const unit = unitById.get(roleToUnit.get(condition.roleId) ?? '');
  if (!unit) return false;
  if (condition.kind === 'role_state') {
    const capable = unit.capabilities.alive && unit.capabilities.conscious;
    const canFire = capable && unit.capabilities.canUseWeapon && finite(unit.primaryWeapon?.roundsInWeapon) > 0;
    const map: Record<typeof condition.state, boolean> = {
      capable,
      incapacitated: !capable,
      can_fire: canFire,
      cannot_fire: !canFire,
      can_move: unit.capabilities.canMove,
      cannot_move: !unit.capabilities.canMove,
    };
    return map[condition.state];
  }
  if (condition.kind === 'ammo') {
    if (condition.comparison === 'empty') return unit.totalRounds <= 0;
    return condition.comparison === 'at_most' ? unit.totalRounds <= condition.rounds : unit.totalRounds >= condition.rounds;
  }
  return condition.comparison === 'at_most' ? unit.suppression <= condition.value : unit.suppression >= condition.value;
}
