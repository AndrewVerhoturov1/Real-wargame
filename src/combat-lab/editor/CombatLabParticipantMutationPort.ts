import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  readCombatLabParticipantInitialDraft,
  updateCombatLabParticipantInitialState,
  type CombatLabExperimentV1,
  type CombatLabParticipantInitialDraftV1,
  type CombatLabParticipantScenePatchV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from '../scenario-editor/CombatLabExperimentDraft';
import type {
  CombatLabParticipantEditContextV1,
  CombatLabParticipantEditMutationV1,
} from './CombatLabParticipantEditContext';

export interface CombatLabParticipantMutationPortV1 {
  get(roleId: string): CombatLabParticipantEditContextV1;
  update(
    roleId: string,
    mutation: (context: CombatLabParticipantEditContextV1) => CombatLabParticipantEditMutationV1 | void,
  ): CombatLabExperimentV1;
}

export interface CombatLabParticipantMutationPortOptionsV1 {
  readonly state: SimulationState;
  readonly draft: Pick<CombatLabExperimentDraft, 'getExperiment' | 'replaceExperiment'>;
  readonly onExperimentChanged?: (experiment: CombatLabExperimentV1) => void;
  readonly readParticipant?: (
    experiment: CombatLabExperimentV1,
    roleId: string,
  ) => CombatLabParticipantInitialDraftV1;
  readonly updateParticipant?: (
    experiment: CombatLabExperimentV1,
    roleId: string,
    patch: CombatLabParticipantScenePatchV1,
  ) => CombatLabExperimentV1;
}

export class CombatLabParticipantMutationPort implements CombatLabParticipantMutationPortV1 {
  private readonly readParticipant: NonNullable<CombatLabParticipantMutationPortOptionsV1['readParticipant']>;
  private readonly updateParticipant: NonNullable<CombatLabParticipantMutationPortOptionsV1['updateParticipant']>;

  private constructor(private readonly options: CombatLabParticipantMutationPortOptionsV1) {
    this.readParticipant = options.readParticipant ?? readCombatLabParticipantInitialDraft;
    this.updateParticipant = options.updateParticipant ?? updateCombatLabParticipantInitialState;
  }

  static create(options: CombatLabParticipantMutationPortOptionsV1): CombatLabParticipantMutationPort {
    return new CombatLabParticipantMutationPort(options);
  }

  get(roleId: string): CombatLabParticipantEditContextV1 {
    const experiment = this.options.draft.getExperiment();
    const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
    if (!role) throw new Error(`Участник «${roleId}» не найден.`);
    const initial = this.readParticipant(experiment, roleId);
    return Object.freeze({ experiment, role, state: this.options.state, unit: initial.unit, initial });
  }

  update(
    roleId: string,
    mutation: (context: CombatLabParticipantEditContextV1) => CombatLabParticipantEditMutationV1 | void,
  ): CombatLabExperimentV1 {
    const before = this.options.draft.getExperiment();
    const context = this.get(roleId);
    const requested = mutation(context);
    if (!requested) return before;

    let rolePatch = requested.rolePatch;
    let scenePatch = requested.scenePatch;
    if (rolePatch?.titleRu !== undefined && scenePatch?.titleRu === undefined) {
      scenePatch = { ...scenePatch, titleRu: rolePatch.titleRu };
    }
    if (scenePatch?.titleRu !== undefined && rolePatch?.titleRu === undefined) {
      rolePatch = { ...rolePatch, titleRu: scenePatch.titleRu };
    }
    if (!hasOwnKeys(scenePatch) && !hasOwnKeys(rolePatch)) return before;

    let next = scenePatch
      ? this.updateParticipant(before, roleId, scenePatch)
      : before;
    if (rolePatch) {
      next = {
        ...next,
        roles: next.roles.map((role) => role.roleId === roleId
          ? Object.freeze({ ...role, ...rolePatch, roleId: role.roleId, unitId: role.unitId })
          : role),
      };
    }
    next = Object.freeze({ ...next, revision: before.revision + 1 });
    this.options.draft.replaceExperiment(next);
    const published = this.options.draft.getExperiment();
    this.options.onExperimentChanged?.(published);
    return published;
  }
}

function hasOwnKeys(value: object | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
}
