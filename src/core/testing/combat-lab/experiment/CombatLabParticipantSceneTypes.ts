import type { AiGraph } from '../../../ai/AiGraph';
import type { DefinitionRef } from '../../../infantry-combat/catalogs/CombatCatalogTypes';
import type { CombatCatalogRegistry } from '../../../infantry-combat/catalogs/CombatCatalogRegistry';
import type { UnitAiBrainBindingV1 } from '../../../units/UnitAiBrainBinding';
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
  /** Omitted means preserve; null means explicitly clear the published loadout and all weapon/ammo runtime. */
  readonly loadoutRef?: DefinitionRef | null;
  readonly loadedRounds?: number;
  readonly reserveRoundsByAmmoDefinitionId?: Readonly<Record<string, number>>;
  readonly firstAidCharges?: number;
  readonly initialHealth?: CombatLabInitialHealthV1;
  readonly aiBrain?: UnitAiBrainBindingV1;
  /** Graph data is stored once in the scene catalog, never inside the participant record. */
  readonly aiGraphDefinition?: AiGraph;
}

export interface CombatLabParticipantMutationOptionsV1 {
  readonly catalogRegistry?: CombatCatalogRegistry;
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

export interface CombatLabParticipantInitialSummaryV1 {
  readonly roleId: string;
  readonly unitId: string;
  readonly titleRu: string;
  readonly side: 'blue' | 'red';
  readonly posture: 'standing' | 'crouched' | 'prone';
  readonly weaponNameRu: string | null;
  readonly loadedRounds: number;
  readonly reserveRounds: number;
  readonly healthRu: string;
}

export interface CombatLabParticipantInitialDraftV1 {
  readonly roleId: string;
  readonly unitId: string;
  readonly titleRu: string;
  readonly side: 'blue' | 'red';
  readonly unitType: UnitType;
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: number;
  readonly runtimeMetersPerCell: number;
  readonly posture: 'standing' | 'crouched' | 'prone';
  readonly loadoutRef: DefinitionRef | null;
  readonly loadedRounds: number;
  readonly reserves: readonly { readonly ammoDefinitionId: string; readonly rounds: number; readonly maximumRounds: number }[];
  readonly firstAidCharges: number;
  readonly bloodLoss: number;
  readonly wounds: readonly CombatLabInitialWoundV1[];
  readonly aiBrain: UnitAiBrainBindingV1;
  readonly unit: UnitModel;
}

export interface CombatLabParticipantReadObserverV1 {
  readonly onUnitRecordRead?: (unitId: string) => void;
  readonly onUnitNormalized?: (unitId: string) => void;
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