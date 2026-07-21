import type { EnvironmentMaterialProfile } from '../map/EnvironmentMaterialProfile';
import type { TacticalMap } from '../map/MapModel';
import type {
  GeneralizedTacticalPositionSearchRequest,
} from './GeneralizedTacticalPositionSearch';
import type {
  TacticalPositionSearchDiagnostics,
  TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import type { StaticTacticalPositionBasisSnapshot } from './static/StaticTacticalPositionBasis';
import type { StaticTacticalPositionWorkerMapSnapshot } from './static/StaticTacticalPositionWorkerProtocol';

export interface TacticalPositionQuerySubjectiveFieldSnapshot {
  readonly width: number;
  readonly height: number;
  readonly metersPerCell: number;
  readonly passable: Uint8Array;
  readonly movementCost: Float32Array;
  readonly danger: Uint8Array;
  readonly suppression: Uint8Array;
  readonly concealment: Uint8Array;
  readonly safety: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly uncertainty: Uint8Array;
  readonly reverseSlopeQuality: Uint8Array;
  readonly forwardSlopeRisk: Uint8Array;
  readonly staticProtectionStanding: Uint8Array;
  readonly staticProtectionCrouched: Uint8Array;
  readonly staticProtectionProne: Uint8Array;
}

export interface TacticalPositionQueryWorkerConfiguration {
  readonly basisIdentityKey: string;
  readonly map: StaticTacticalPositionWorkerMapSnapshot;
  readonly environmentProfile: EnvironmentMaterialProfile;
  readonly basis: StaticTacticalPositionBasisSnapshot;
}

export type TacticalPositionQueryWorkerRequest =
  | {
      readonly type: 'configure';
      readonly configuration: TacticalPositionQueryWorkerConfiguration;
    }
  | {
      readonly type: 'search';
      readonly jobId: number;
      readonly basisIdentityKey: string;
      readonly fieldIdentity: string;
      readonly field: TacticalPositionQuerySubjectiveFieldSnapshot;
      readonly request: GeneralizedTacticalPositionSearchRequest;
    };

export type TacticalPositionQueryWorkerResponse =
  | {
      readonly type: 'configured';
      readonly basisIdentityKey: string;
    }
  | {
      readonly type: 'result';
      readonly jobId: number;
      readonly basisIdentityKey: string;
      readonly fieldIdentity: string;
      readonly result: TacticalPositionSearchResult;
    }
  | {
      readonly type: 'error';
      readonly jobId: number | null;
      readonly basisIdentityKey: string;
      readonly message: string;
    };

export function cloneTacticalPositionQueryField(
  field: TacticalPositionQuerySubjectiveFieldSnapshot,
): TacticalPositionQuerySubjectiveFieldSnapshot {
  return {
    width: field.width,
    height: field.height,
    metersPerCell: field.metersPerCell,
    passable: field.passable.slice(),
    movementCost: field.movementCost.slice(),
    danger: field.danger.slice(),
    suppression: field.suppression.slice(),
    concealment: field.concealment.slice(),
    safety: field.safety.slice(),
    expectedProtectionAgainstThreat: field.expectedProtectionAgainstThreat.slice(),
    uncertainty: field.uncertainty.slice(),
    reverseSlopeQuality: field.reverseSlopeQuality.slice(),
    forwardSlopeRisk: field.forwardSlopeRisk.slice(),
    staticProtectionStanding: field.staticProtectionStanding.slice(),
    staticProtectionCrouched: field.staticProtectionCrouched.slice(),
    staticProtectionProne: field.staticProtectionProne.slice(),
  };
}

export function buildTacticalPositionQueryField(
  field: {
    readonly width: number;
    readonly height: number;
    readonly metersPerCell: number;
    readonly passable: Uint8Array;
    readonly movementCost: Float32Array;
    readonly danger: Uint8Array;
    readonly suppression: Uint8Array;
    readonly concealment: Uint8Array;
    readonly safety: Uint8Array;
    readonly expectedProtectionAgainstThreat: Uint8Array;
    readonly uncertainty: Uint8Array;
    readonly reverseSlopeQuality: Uint8Array;
    readonly forwardSlopeRisk: Uint8Array;
    readonly staticProtectionStanding: Uint8Array;
    readonly staticProtectionCrouched: Uint8Array;
    readonly staticProtectionProne: Uint8Array;
  },
): TacticalPositionQuerySubjectiveFieldSnapshot {
  return cloneTacticalPositionQueryField(field);
}

export type TacticalPositionQueryWorkerMap = TacticalMap;
export type TacticalPositionQueryWorkerDiagnostics = TacticalPositionSearchDiagnostics;
