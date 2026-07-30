import type { CombatLabConditionV1, CombatLabExperimentV1, CombatLabScenarioStepV1 } from './CombatLabExperimentContracts';
import { validateCombatLabExperiment } from './CombatLabExperimentValidation';
import type { CombatLabParticipantProgramReferenceV1 } from './CombatLabParticipantSceneTypes';
import { CombatLabParticipantReferenceError, CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import { compareText, freezeExperiment, isRecord, requireRole } from './CombatLabParticipantSceneSupport';

export function collectCombatLabParticipantProgramReferences(
  experiment: CombatLabExperimentV1,
  roleId: string,
): readonly CombatLabParticipantProgramReferenceV1[] {
  const references: CombatLabParticipantProgramReferenceV1[] = [];
  for (const track of experiment.tracks) {
    if (track.actorRoleId === roleId) references.push(reference(`tracks.${track.trackId}`, 'Дорожка принадлежит бойцу.'));
    for (const step of track.steps) {
      const prefix = `tracks.${track.trackId}.steps.${step.stepId}`;
      if (actionReferencesRole(step, roleId)) references.push(reference(`${prefix}.action`, 'Действие использует бойца.'));
      if (conditionReferencesRole(step.startCondition, roleId)) references.push(reference(`${prefix}.startCondition`, 'Условие начала использует бойца.'));
      if (step.completion.kind === 'condition' && conditionReferencesRole(step.completion.condition, roleId)) references.push(reference(`${prefix}.completion`, 'Условие завершения использует бойца.'));
      if (step.repeat.kind === 'until_condition' && conditionReferencesRole(step.repeat.condition, roleId)) references.push(reference(`${prefix}.repeat`, 'Условие повтора использует бойца.'));
    }
  }
  if (experiment.defaults.repeat.kind === 'until_condition' && conditionReferencesRole(experiment.defaults.repeat.condition, roleId)) {
    references.push(reference('defaults.repeat.condition', 'Общее условие повтора использует бойца.'));
  }
  if (conditionReferencesRole(experiment.successCondition, roleId)) references.push(reference('successCondition', 'Условие успеха использует бойца.'));
  if (experiment.stopCondition.kind === 'condition' && conditionReferencesRole(experiment.stopCondition.condition, roleId)) references.push(reference('stopCondition', 'Условие остановки использует бойца.'));
  return Object.freeze(references.sort((left, right) => compareText(left.path, right.path)));
}

export function removeCombatLabParticipant(
  experiment: CombatLabExperimentV1,
  roleId: string,
  mode: 'block_if_referenced' | 'remove_with_program_references',
): CombatLabExperimentV1 {
  const role = requireRole(experiment, roleId);
  const references = collectCombatLabParticipantProgramReferences(experiment, roleId);
  if (mode === 'block_if_referenced' && references.length > 0) throw new CombatLabParticipantReferenceError(roleId, references);

  const removedTrackIds = new Set(experiment.tracks.filter((track) => track.actorRoleId === roleId).map((track) => track.trackId));
  const removedStepKeys = new Set<string>();
  let tracks = experiment.tracks.filter((track) => !removedTrackIds.has(track.trackId)).map((track) => {
    const steps = track.steps.filter((step) => {
      const remove = stepReferencesRole(step, roleId);
      if (remove) removedStepKeys.add(stepKey(track.trackId, step.stepId));
      return !remove;
    });
    return { ...track, steps };
  });
  for (const track of experiment.tracks) if (removedTrackIds.has(track.trackId)) for (const step of track.steps) removedStepKeys.add(stepKey(track.trackId, step.stepId));

  let changed = true;
  while (changed) {
    changed = false;
    tracks = tracks.map((track) => ({ ...track, steps: track.steps.filter((step) => {
      const remove = stepReferencesRemovedDependency(step, removedTrackIds, removedStepKeys);
      if (remove) { removedStepKeys.add(stepKey(track.trackId, step.stepId)); changed = true; }
      return !remove;
    }) }));
  }

  const defaults = experiment.defaults.repeat.kind === 'until_condition'
    && (conditionReferencesRole(experiment.defaults.repeat.condition, roleId)
      || conditionReferencesRemovedDependency(experiment.defaults.repeat.condition, removedTrackIds, removedStepKeys))
    ? { ...experiment.defaults, repeat: { kind: 'once' as const, maximumAttempts: 1 as const, retryDelaySeconds: 0 as const } }
    : experiment.defaults;
  const successCondition = conditionReferencesRole(experiment.successCondition, roleId)
    || conditionReferencesRemovedDependency(experiment.successCondition, removedTrackIds, removedStepKeys)
    ? { kind: 'always' as const }
    : experiment.successCondition;
  const stopCondition = experiment.stopCondition.kind === 'condition'
    && (conditionReferencesRole(experiment.stopCondition.condition, roleId)
      || conditionReferencesRemovedDependency(experiment.stopCondition.condition, removedTrackIds, removedStepKeys))
    ? { kind: 'program_complete' as const, maximumSimulationSeconds: experiment.stopCondition.maximumSimulationSeconds }
    : experiment.stopCondition;

  const next = freezeExperiment({
    ...experiment,
    revision: experiment.revision + 1,
    roles: experiment.roles.filter((candidate) => candidate.roleId !== roleId),
    tracks,
    defaults,
    successCondition,
    stopCondition,
    sceneSnapshot: { ...experiment.sceneSnapshot, units: experiment.sceneSnapshot.units.filter((candidate) => !isRecord(candidate) || candidate.id !== role.unitId) },
  });
  const errors = validateCombatLabExperiment(next).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) throw new CombatLabParticipantSceneError('combat_lab_participant_remove_invalid', `После удаления бойца эксперимент недействителен: ${errors.map((issue) => `${issue.path}: ${issue.messageRu}`).join('; ')}`);
  return next;
}

function stepReferencesRole(step: CombatLabScenarioStepV1, roleId: string): boolean {
  return actionReferencesRole(step, roleId)
    || conditionReferencesRole(step.startCondition, roleId)
    || (step.completion.kind === 'condition' && conditionReferencesRole(step.completion.condition, roleId))
    || (step.repeat.kind === 'until_condition' && conditionReferencesRole(step.repeat.condition, roleId));
}

function actionReferencesRole(step: CombatLabScenarioStepV1, roleId: string): boolean {
  const action = step.action;
  switch (action.kind) {
    case 'fire': return action.actorRoleId === roleId || (action.target.kind === 'role' && action.target.roleId === roleId);
    case 'stop_fire':
    case 'move':
    case 'face':
    case 'cancel_action':
    case 'posture': return action.actorRoleId === roleId;
    case 'reload':
    case 'deploy':
    case 'undeploy': return action.actorRoleId === roleId || action.helperRoleId === roleId;
    case 'transfer': return action.sourceRoleId === roleId || action.targetRoleId === roleId;
    case 'first_aid': return action.actorRoleId === roleId || action.targetRoleId === roleId;
    case 'wait': return false;
  }
}

function conditionReferencesRole(condition: CombatLabConditionV1, roleId: string): boolean {
  switch (condition.kind) {
    case 'role_state':
    case 'ammo':
    case 'suppression': return condition.roleId === roleId;
    case 'contact': return condition.observerRoleId === roleId || condition.targetRoleId === roleId;
    default: return false;
  }
}

function stepReferencesRemovedDependency(step: CombatLabScenarioStepV1, trackIds: ReadonlySet<string>, stepKeys: ReadonlySet<string>): boolean {
  return conditionReferencesRemovedDependency(step.startCondition, trackIds, stepKeys)
    || (step.completion.kind === 'condition' && conditionReferencesRemovedDependency(step.completion.condition, trackIds, stepKeys))
    || (step.repeat.kind === 'until_condition' && conditionReferencesRemovedDependency(step.repeat.condition, trackIds, stepKeys));
}

function conditionReferencesRemovedDependency(condition: CombatLabConditionV1, trackIds: ReadonlySet<string>, stepKeys: ReadonlySet<string>): boolean {
  return condition.kind === 'step_state' && (trackIds.has(condition.trackId) || stepKeys.has(stepKey(condition.trackId, condition.stepId)));
}
function reference(path: string, descriptionRu: string): CombatLabParticipantProgramReferenceV1 { return Object.freeze({ path, descriptionRu }); }
function stepKey(trackId: string, stepId: string): string { return `${trackId}/${stepId}`; }
