import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabActionV1,
  type CombatLabCompletionV1,
  type CombatLabConditionV1,
  type CombatLabExperimentRoleV1,
  type CombatLabExperimentV1,
  type CombatLabMarkerV1,
  type CombatLabRepeatPolicyV1,
  type CombatLabScenarioStepV1,
  type CombatLabTrackV1,
} from '../../core/testing/combat-lab/experiment';

export class CombatLabDraftReferenceError extends Error {
  constructor(
    readonly entityKind: 'role' | 'marker' | 'track' | 'step',
    readonly entityId: string,
    readonly references: readonly string[],
  ) {
    super(`Нельзя удалить ${entityKind} «${entityId}»: объект используется (${references.join(', ')}).`);
    this.name = 'CombatLabDraftReferenceError';
  }
}

export class CombatLabDraftLimitError extends Error {
  constructor(readonly limitKind: 'tracks' | 'steps' | 'markers', readonly maximum: number) {
    super(`Достигнут предел: ${limitKind} — не больше ${maximum}.`);
    this.name = 'CombatLabDraftLimitError';
  }
}

export class CombatLabExperimentDraft {
  private experiment: CombatLabExperimentV1;

  constructor(experiment: CombatLabExperimentV1) {
    this.experiment = freezeExperiment(copyExperiment(experiment));
  }

  getExperiment(): CombatLabExperimentV1 {
    return this.experiment;
  }

  replaceExperiment(experiment: CombatLabExperimentV1): void {
    this.experiment = freezeExperiment(copyExperiment(experiment));
  }

  addTrack(actorRoleId: string): string {
    requireRole(this.experiment, actorRoleId);
    if (this.experiment.tracks.length >= COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumTracks) {
      throw new CombatLabDraftLimitError('tracks', COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumTracks);
    }
    const existing = this.experiment.tracks.find((track) => track.actorRoleId === actorRoleId);
    if (existing) return existing.trackId;
    const role = this.experiment.roles.find((candidate) => candidate.roleId === actorRoleId)!;
    const trackId = nextStableId('track', this.experiment.tracks.map((track) => track.trackId));
    this.commit((draft) => {
      draft.tracks.push({
        trackId,
        actorRoleId,
        titleRu: role.titleRu,
        enabled: true,
        steps: [],
      });
    });
    return trackId;
  }

  removeTrack(trackId: string): void {
    const track = requireTrack(this.experiment, trackId);
    const stepIds = new Set(track.steps.map((step) => step.stepId));
    const references = collectStepDependencyReferences(this.experiment, trackId, stepIds);
    if (references.length > 0) throw new CombatLabDraftReferenceError('track', trackId, references);
    this.commit((draft) => {
      draft.tracks = draft.tracks.filter((candidate) => candidate.trackId !== trackId);
    });
  }

  addStep(trackId: string, step: CombatLabScenarioStepV1): void {
    requireTrack(this.experiment, trackId);
    if (countSteps(this.experiment) >= COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps) {
      throw new CombatLabDraftLimitError('steps', COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps);
    }
    if (this.experiment.tracks.some((track) => track.steps.some((candidate) => candidate.stepId === step.stepId))) {
      throw new Error(`Шаг с ID «${step.stepId}» уже существует.`);
    }
    this.commit((draft) => {
      const track = requireMutableTrack(draft, trackId);
      track.steps.push(cloneValue(step));
    });
  }

  updateStep(trackId: string, stepId: string, patch: Partial<CombatLabScenarioStepV1>): void {
    requireStep(this.experiment, trackId, stepId);
    this.commit((draft) => {
      const track = requireMutableTrack(draft, trackId);
      const index = track.steps.findIndex((step) => step.stepId === stepId);
      const current = track.steps[index]!;
      track.steps[index] = cloneValue({ ...current, ...patch, stepId });
    });
  }

  moveStep(trackId: string, stepId: string, targetIndex: number): void {
    const track = requireTrack(this.experiment, trackId);
    const sourceIndex = track.steps.findIndex((step) => step.stepId === stepId);
    if (sourceIndex < 0) throw new Error(`Шаг «${stepId}» не найден в дорожке «${trackId}».`);
    const boundedTarget = clampIndex(targetIndex, track.steps.length - 1);
    if (sourceIndex === boundedTarget) return;
    this.commit((draft) => {
      const mutableTrack = requireMutableTrack(draft, trackId);
      const [step] = mutableTrack.steps.splice(sourceIndex, 1);
      mutableTrack.steps.splice(boundedTarget, 0, step!);
    });
  }

  duplicateStep(trackId: string, stepId: string): string {
    const track = requireTrack(this.experiment, trackId);
    const sourceIndex = track.steps.findIndex((step) => step.stepId === stepId);
    if (sourceIndex < 0) throw new Error(`Шаг «${stepId}» не найден в дорожке «${trackId}».`);
    if (countSteps(this.experiment) >= COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps) {
      throw new CombatLabDraftLimitError('steps', COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumSteps);
    }
    const duplicateId = nextStableId('step', allStepIds(this.experiment));
    this.commit((draft) => {
      const mutableTrack = requireMutableTrack(draft, trackId);
      const source = mutableTrack.steps[sourceIndex]!;
      mutableTrack.steps.splice(sourceIndex + 1, 0, cloneValue({
        ...source,
        stepId: duplicateId,
        titleRu: `${source.titleRu} — копия`,
      }));
    });
    return duplicateId;
  }

  removeStep(trackId: string, stepId: string): void {
    requireStep(this.experiment, trackId, stepId);
    const references = collectStepDependencyReferences(this.experiment, trackId, new Set([stepId]));
    if (references.length > 0) throw new CombatLabDraftReferenceError('step', stepId, references);
    this.commit((draft) => {
      const track = requireMutableTrack(draft, trackId);
      track.steps = track.steps.filter((step) => step.stepId !== stepId);
    });
  }

  addMarker(marker: CombatLabMarkerV1): void {
    if (this.experiment.markers.length >= COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumMarkers) {
      throw new CombatLabDraftLimitError('markers', COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumMarkers);
    }
    if (this.experiment.markers.some((candidate) => candidate.markerId === marker.markerId)) {
      throw new Error(`Метка с ID «${marker.markerId}» уже существует.`);
    }
    this.commit((draft) => {
      draft.markers.push(cloneValue(marker));
    });
  }

  updateMarker(markerId: string, marker: CombatLabMarkerV1): void {
    requireMarker(this.experiment, markerId);
    if (marker.markerId !== markerId) throw new Error('ID метки нельзя менять при обновлении.');
    this.commit((draft) => {
      const index = draft.markers.findIndex((candidate) => candidate.markerId === markerId);
      draft.markers[index] = cloneValue(marker);
    });
  }

  removeMarker(markerId: string): void {
    requireMarker(this.experiment, markerId);
    const references = collectMarkerReferences(this.experiment, markerId);
    if (references.length > 0) throw new CombatLabDraftReferenceError('marker', markerId, references);
    this.commit((draft) => {
      draft.markers = draft.markers.filter((marker) => marker.markerId !== markerId);
    });
  }

  assignRole(role: CombatLabExperimentRoleV1): void {
    const existing = this.experiment.roles.find((candidate) => candidate.roleId === role.roleId);
    this.commit((draft) => {
      if (!existing) {
        draft.roles.push(cloneValue(role) as Mutable<CombatLabExperimentRoleV1>);
        return;
      }
      const index = draft.roles.findIndex((candidate) => candidate.roleId === role.roleId);
      draft.roles[index] = cloneValue(role) as Mutable<CombatLabExperimentRoleV1>;
      for (const track of draft.tracks) {
        if (track.actorRoleId === role.roleId && track.titleRu === existing.titleRu) track.titleRu = role.titleRu;
      }
    });
  }

  removeRole(roleId: string): void {
    requireRole(this.experiment, roleId);
    const references = collectRoleReferences(this.experiment, roleId);
    if (references.length > 0) throw new CombatLabDraftReferenceError('role', roleId, references);
    this.commit((draft) => {
      draft.roles = draft.roles.filter((role) => role.roleId !== roleId);
    });
  }

  private commit(mutator: (draft: MutableExperiment) => void): void {
    const next = copyExperiment(this.experiment) as MutableExperiment;
    mutator(next);
    next.revision = this.experiment.revision + 1;
    this.experiment = freezeExperiment(next);
  }
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type MutableExperiment = Mutable<CombatLabExperimentV1>;
type MutableTrack = Mutable<CombatLabTrackV1>;

function copyExperiment(experiment: CombatLabExperimentV1): CombatLabExperimentV1 {
  return {
    ...experiment,
    // The initial scene can contain full-map matrices. Editor mutations never modify it,
    // so keep the immutable snapshot by reference instead of cloning the whole map.
    sceneSnapshot: experiment.sceneSnapshot,
    roles: experiment.roles.map((role) => cloneValue(role)),
    markers: experiment.markers.map((marker) => cloneValue(marker)),
    tracks: experiment.tracks.map((track) => ({
      ...track,
      steps: track.steps.map((step) => cloneValue(step)),
    })),
    defaults: cloneValue(experiment.defaults),
    successCondition: cloneValue(experiment.successCondition),
    stopCondition: cloneValue(experiment.stopCondition),
    batchDefaults: cloneValue(experiment.batchDefaults),
  };
}

function freezeExperiment(experiment: CombatLabExperimentV1): CombatLabExperimentV1 {
  for (const role of experiment.roles) deepFreeze(role);
  for (const marker of experiment.markers) deepFreeze(marker);
  for (const track of experiment.tracks) deepFreeze(track);
  deepFreeze(experiment.defaults);
  deepFreeze(experiment.successCondition);
  deepFreeze(experiment.stopCondition);
  deepFreeze(experiment.batchDefaults);
  Object.freeze(experiment.roles);
  Object.freeze(experiment.markers);
  Object.freeze(experiment.tracks);
  return Object.freeze(experiment);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function countSteps(experiment: CombatLabExperimentV1): number {
  return experiment.tracks.reduce((total, track) => total + track.steps.length, 0);
}

function allStepIds(experiment: CombatLabExperimentV1): string[] {
  return experiment.tracks.flatMap((track) => track.steps.map((step) => step.stepId));
}

function nextStableId(prefix: string, ids: readonly string[]): string {
  const used = new Set(ids);
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Не удалось создать свободный ID с префиксом «${prefix}».`);
}

function clampIndex(index: number, maximum: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(maximum, Math.trunc(index)));
}

function requireRole(experiment: CombatLabExperimentV1, roleId: string): CombatLabExperimentRoleV1 {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  if (!role) throw new Error(`Роль «${roleId}» не найдена.`);
  return role;
}

function requireMarker(experiment: CombatLabExperimentV1, markerId: string): CombatLabMarkerV1 {
  const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
  if (!marker) throw new Error(`Метка «${markerId}» не найдена.`);
  return marker;
}

function requireTrack(experiment: CombatLabExperimentV1, trackId: string): CombatLabTrackV1 {
  const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
  if (!track) throw new Error(`Дорожка «${trackId}» не найдена.`);
  return track;
}

function requireMutableTrack(experiment: MutableExperiment, trackId: string): MutableTrack {
  const track = experiment.tracks.find((candidate) => candidate.trackId === trackId);
  if (!track) throw new Error(`Дорожка «${trackId}» не найдена.`);
  return track;
}

function requireStep(experiment: CombatLabExperimentV1, trackId: string, stepId: string): CombatLabScenarioStepV1 {
  const step = requireTrack(experiment, trackId).steps.find((candidate) => candidate.stepId === stepId);
  if (!step) throw new Error(`Шаг «${stepId}» не найден в дорожке «${trackId}».`);
  return step;
}

function collectMarkerReferences(experiment: CombatLabExperimentV1, markerId: string): string[] {
  const references: string[] = [];
  visitSteps(experiment, (track, step) => {
    if (actionReferencesMarker(step.action, markerId)) references.push(`${track.trackId}/${step.stepId}:action`);
  });
  return references;
}

function collectRoleReferences(experiment: CombatLabExperimentV1, roleId: string): string[] {
  const references: string[] = [];
  for (const track of experiment.tracks) {
    if (track.actorRoleId === roleId) references.push(`${track.trackId}:actor`);
    for (const step of track.steps) {
      if (actionReferencesRole(step.action, roleId)) references.push(`${track.trackId}/${step.stepId}:action`);
      if (conditionReferencesRole(step.startCondition, roleId)) references.push(`${track.trackId}/${step.stepId}:start`);
      if (completionReferencesRole(step.completion, roleId)) references.push(`${track.trackId}/${step.stepId}:completion`);
      if (repeatReferencesRole(step.repeat, roleId)) references.push(`${track.trackId}/${step.stepId}:repeat`);
    }
  }
  if (conditionReferencesRole(experiment.successCondition, roleId)) references.push('successCondition');
  if (experiment.stopCondition.kind === 'condition' && conditionReferencesRole(experiment.stopCondition.condition, roleId)) {
    references.push('stopCondition');
  }
  return references;
}

function collectStepDependencyReferences(
  experiment: CombatLabExperimentV1,
  trackId: string,
  stepIds: ReadonlySet<string>,
): string[] {
  const references: string[] = [];
  visitSteps(experiment, (track, step) => {
    if (track.trackId === trackId && stepIds.has(step.stepId)) return;
    const prefix = `${track.trackId}/${step.stepId}`;
    if (conditionReferencesStep(step.startCondition, trackId, stepIds)) references.push(`${prefix}:start`);
    if (step.completion.kind === 'condition' && conditionReferencesStep(step.completion.condition, trackId, stepIds)) {
      references.push(`${prefix}:completion`);
    }
    if (step.repeat.kind === 'until_condition' && conditionReferencesStep(step.repeat.condition, trackId, stepIds)) {
      references.push(`${prefix}:repeat`);
    }
  });
  if (conditionReferencesStep(experiment.successCondition, trackId, stepIds)) references.push('successCondition');
  if (experiment.stopCondition.kind === 'condition' && conditionReferencesStep(experiment.stopCondition.condition, trackId, stepIds)) {
    references.push('stopCondition');
  }
  return references;
}

function visitSteps(
  experiment: CombatLabExperimentV1,
  visitor: (track: CombatLabTrackV1, step: CombatLabScenarioStepV1) => void,
): void {
  for (const track of experiment.tracks) for (const step of track.steps) visitor(track, step);
}

function actionReferencesMarker(action: CombatLabActionV1, markerId: string): boolean {
  if (action.kind === 'move') return action.markerId === markerId;
  return action.kind === 'fire' && action.target.kind === 'marker' && action.target.markerId === markerId;
}

function actionReferencesRole(action: CombatLabActionV1, roleId: string): boolean {
  switch (action.kind) {
    case 'fire': return action.actorRoleId === roleId || (action.target.kind === 'role' && action.target.roleId === roleId);
    case 'stop_fire':
    case 'move':
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

function completionReferencesRole(completion: CombatLabCompletionV1, roleId: string): boolean {
  return completion.kind === 'condition' && conditionReferencesRole(completion.condition, roleId);
}

function repeatReferencesRole(repeat: CombatLabRepeatPolicyV1, roleId: string): boolean {
  return repeat.kind === 'until_condition' && conditionReferencesRole(repeat.condition, roleId);
}

function conditionReferencesStep(
  condition: CombatLabConditionV1,
  trackId: string,
  stepIds: ReadonlySet<string>,
): boolean {
  return condition.kind === 'step_state' && condition.trackId === trackId && stepIds.has(condition.stepId);
}
