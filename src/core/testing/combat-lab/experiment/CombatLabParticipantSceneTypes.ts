import type { DefinitionRef } from '../../../infantry-combat/catalogs/CombatCatalogTypes';
import type { SimulationState } from '../../../simulation/SimulationState';
import type { UnitModel, UnitSideInput, UnitType } from '../../../units/UnitModel';
import type { CombatLabParticipantParametersV1 } from './CombatLabExperimentContracts';

export interface CombatLabInitialWoundV1 {
  readonly zone: 'head' | 'torso' | 'arms' | 'legs';
  readonly severity: 'light' | 'severe' | 'critical';
  readonly hitCount: number;
}

export type CombatLabInitialHealthV1 =
  | { readonly mode: 'healthy' }
  | { readonly mode: 'preserve_current' }
  | { readonly mode: 'wound_set'; readonly wounds: readonly CombatLabInitialWoundV1[]; readonly bloodLoss: number };

export interface CombatLabParticipantScenePatchV1 {
  readonly titleRu?: string;
  readonly side?: UnitSideInput;
  readonly unitType?: UnitType;
  readonly x?: number;
  readonly y?: number;
  readonly facingDegrees?: number;
  readonly posture?: 'standing' | 'crouched' | 'prone';
  readonly loadoutRef?: DefinitionRef;
  readonly loadedRounds?: number;
  readonly reserveRoundsByAmmoDefinitionId?: Readonly<Record<string, number>>;
  readonly firstAidCharges?: number;
  readonly initialHealth?: CombatLabInitialHealthV1;
}

export interface CombatLabCreateParticipantInputV1 extends CombatLabParticipantScenePatchV1 {
  readonly roleId?: string;
  readonly unitId?: string;
  readonly titleRu: string;
  readonly side: UnitSideInput;
  readonly unitType: UnitType;
  readonly x: number;
  readonly y: number;
  readonly parameters?: CombatLabParticipantParametersV1;
}

export interface CombatLabParticipantProgramReferenceV1 {
  readonly path: string;
  readonly descriptionRu: string;
}

export interface CombatLabParticipantInitialContextV1 {
  readonly state: SimulationState;
  readonly unit: UnitModel;
}

export class CombatLabParticipantReferenceError extends Error {
  constructor(
    readonly roleId: string,
    readonly references: readonly CombatLabParticipantProgramReferenceV1[],
  ) {
    super(`Нельзя удалить бойца «${roleId}»: он используется в программе (${references.map((item) => item.path).join(', ')}).`);
    this.name = 'CombatLabParticipantReferenceError';
  }
}

export class CombatLabParticipantSceneError extends Error {
  constructor(readonly code: string, messageRu: string) {
    super(messageRu);
    this.name = 'CombatLabParticipantSceneError';
  }
}
