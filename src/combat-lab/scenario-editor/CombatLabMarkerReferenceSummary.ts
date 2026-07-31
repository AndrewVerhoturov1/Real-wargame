import type {
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
  CombatLabTrackV1,
} from '../../core/testing/combat-lab/experiment';

export type CombatLabMarkerReferenceLocationV1 =
  | 'action_target'
  | 'start_condition'
  | 'completion_condition'
  | 'repeat_condition'
  | 'success_condition'
  | 'stop_condition';

export interface CombatLabMarkerReferenceV1 {
  readonly location: CombatLabMarkerReferenceLocationV1;
  readonly trackId: string | null;
  readonly trackTitleRu: string | null;
  readonly stepId: string | null;
  readonly stepTitleRu: string | null;
  readonly descriptionRu: string;
}

export interface CombatLabMarkerReferenceSummaryV1 {
  readonly markerId: string;
  readonly markerTitleRu: string;
  readonly references: readonly CombatLabMarkerReferenceV1[];
  readonly messageRu: string;
}

export function buildCombatLabMarkerReferenceSummary(
  experiment: Pick<CombatLabExperimentV1, 'markers' | 'tracks' | 'successCondition' | 'stopCondition'>,
  markerId: string,
): CombatLabMarkerReferenceSummaryV1 {
  const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
  const references: CombatLabMarkerReferenceV1[] = [];

  for (const track of experiment.tracks) {
    for (const step of track.steps) {
      if (actionReferencesMarker(step, markerId)) {
        references.push(reference('action_target', track, step, 'цель или параметр действия'));
      }
      if (objectReferencesMarker(step.startCondition, markerId)) {
        references.push(reference('start_condition', track, step, 'условие начала'));
      }
      if (step.completion.kind === 'condition' && objectReferencesMarker(step.completion.condition, markerId)) {
        references.push(reference('completion_condition', track, step, 'условие завершения'));
      }
      if (step.repeat.kind === 'until_condition' && objectReferencesMarker(step.repeat.condition, markerId)) {
        references.push(reference('repeat_condition', track, step, 'условие повтора'));
      }
    }
  }
  if (objectReferencesMarker(experiment.successCondition, markerId)) {
    references.push({
      location: 'success_condition', trackId: null, trackTitleRu: null, stepId: null, stepTitleRu: null,
      descriptionRu: 'условие успеха эксперимента',
    });
  }
  if (experiment.stopCondition.kind === 'condition' && objectReferencesMarker(experiment.stopCondition.condition, markerId)) {
    references.push({
      location: 'stop_condition', trackId: null, trackTitleRu: null, stepId: null, stepTitleRu: null,
      descriptionRu: 'условие остановки эксперимента',
    });
  }

  const markerTitleRu = marker?.titleRu ?? markerId;
  const lines = references.map((item) => item.trackTitleRu && item.stepTitleRu
    ? `${item.trackTitleRu} → ${item.stepTitleRu}: ${item.descriptionRu}`
    : item.descriptionRu);
  return {
    markerId,
    markerTitleRu,
    references,
    messageRu: references.length === 0
      ? `Метка «${markerTitleRu}» нигде не используется.`
      : `Метка «${markerTitleRu}» используется:\n${lines.map((line) => `• ${line}`).join('\n')}`,
  };
}

export function createCombatLabMarkerCascadeResult<T extends Pick<
  CombatLabExperimentV1,
  'revision' | 'markers' | 'tracks' | 'successCondition' | 'stopCondition'
>>(experiment: T, markerId: string): T {
  const removedByTrack = new Map<string, Set<string>>();
  for (const track of experiment.tracks) {
    const removed = new Set(track.steps.filter((step) => actionReferencesMarker(step, markerId)).map((step) => step.stepId));
    if (removed.size > 0) removedByTrack.set(track.trackId, removed);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const track of experiment.tracks) {
      const removed = removedByTrack.get(track.trackId) ?? new Set<string>();
      for (const step of track.steps) {
        if (removed.has(step.stepId)) continue;
        if (stepDependsOnRemovedStep(step, removedByTrack)) {
          removed.add(step.stepId);
          changed = true;
        }
      }
      if (removed.size > 0) removedByTrack.set(track.trackId, removed);
    }
  }

  const tracks = experiment.tracks.map((track) => ({
    ...track,
    steps: track.steps.filter((step) => !removedByTrack.get(track.trackId)?.has(step.stepId)),
  }));
  const successCondition = conditionDependsOnRemovedStep(experiment.successCondition, removedByTrack)
    ? { kind: 'always' as const }
    : experiment.successCondition;
  const stopCondition = experiment.stopCondition.kind === 'condition'
    && conditionDependsOnRemovedStep(experiment.stopCondition.condition, removedByTrack)
    ? { kind: 'program_complete' as const, maximumSimulationSeconds: experiment.stopCondition.maximumSimulationSeconds }
    : experiment.stopCondition;

  return {
    ...experiment,
    revision: experiment.revision + 1,
    markers: experiment.markers.filter((marker) => marker.markerId !== markerId),
    tracks,
    successCondition,
    stopCondition,
  } as T;
}

export function nextCombatLabMarkerId(markers: readonly Pick<CombatLabMarkerV1, 'markerId'>[], prefix = 'marker'): string {
  const used = new Set(markers.map((marker) => marker.markerId));
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Не удалось создать свободный идентификатор метки.');
}

function reference(
  location: CombatLabMarkerReferenceLocationV1,
  track: Pick<CombatLabTrackV1, 'trackId' | 'titleRu'>,
  step: Pick<CombatLabScenarioStepV1, 'stepId' | 'titleRu'>,
  descriptionRu: string,
): CombatLabMarkerReferenceV1 {
  return {
    location,
    trackId: track.trackId,
    trackTitleRu: track.titleRu,
    stepId: step.stepId,
    stepTitleRu: step.titleRu,
    descriptionRu,
  };
}

function actionReferencesMarker(step: Pick<CombatLabScenarioStepV1, 'action'>, markerId: string): boolean {
  const action = step.action;
  if (action.kind === 'move') return action.markerId === markerId || action.finalFacingMarkerId === markerId;
  if (action.kind === 'face') return action.markerId === markerId;
  return action.kind === 'fire' && action.target.kind === 'marker' && action.target.markerId === markerId;
}

function objectReferencesMarker(value: unknown, markerId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => objectReferencesMarker(item, markerId));
  const record = value as Record<string, unknown>;
  if (record.markerId === markerId || record.finalFacingMarkerId === markerId) return true;
  return Object.values(record).some((item) => objectReferencesMarker(item, markerId));
}

function stepDependsOnRemovedStep(
  step: Pick<CombatLabScenarioStepV1, 'startCondition' | 'completion' | 'repeat'>,
  removedByTrack: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (conditionDependsOnRemovedStep(step.startCondition, removedByTrack)) return true;
  if (step.completion.kind === 'condition' && conditionDependsOnRemovedStep(step.completion.condition, removedByTrack)) return true;
  return step.repeat.kind === 'until_condition' && conditionDependsOnRemovedStep(step.repeat.condition, removedByTrack);
}

function conditionDependsOnRemovedStep(
  condition: CombatLabConditionV1,
  removedByTrack: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  return condition.kind === 'step_state'
    && removedByTrack.get(condition.trackId)?.has(condition.stepId) === true;
}
