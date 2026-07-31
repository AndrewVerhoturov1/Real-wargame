import type { SimulationState } from '../../core/simulation/SimulationState';
import type { UnitModel } from '../../core/units/UnitModel';
import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
  CombatLabParticipantInitialDraftV1,
  CombatLabParticipantScenePatchV1,
} from '../../core/testing/combat-lab/experiment';

export interface CombatLabParticipantEditContextV1 {
  readonly experiment: CombatLabExperimentV1;
  readonly role: CombatLabExperimentRoleV1;
  readonly state: SimulationState;
  readonly unit: UnitModel;
  readonly initial: CombatLabParticipantInitialDraftV1;
}

export interface CombatLabParticipantEditMutationV1 {
  readonly scenePatch?: CombatLabParticipantScenePatchV1;
  readonly rolePatch?: Readonly<Partial<Omit<CombatLabExperimentRoleV1, 'roleId' | 'unitId'>>>;
}
