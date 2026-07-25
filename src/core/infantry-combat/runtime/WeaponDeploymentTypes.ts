import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { UnitPosture } from '../../behavior/BehaviorModel';

export const WEAPON_DEPLOYMENT_SCHEMA_VERSION = 1 as const;
export const MAX_DEPLOYMENT_ACTION_RESULTS = 16;

export type WeaponDeploymentMode = 'portable' | 'deploying' | 'deployed' | 'undeploying';
export type WeaponDeploymentActionKind = 'deploy' | 'undeploy';

export interface WeaponDeploymentAnchorV1 {
  readonly xMetres: number;
  readonly yMetres: number;
  readonly zMetres: number;
  readonly facingRadians: number;
  readonly posture: UnitPosture;
}

export interface WeaponDeploymentActionResultV1 {
  readonly actionId: string;
  readonly kind: WeaponDeploymentActionKind;
  readonly status: 'completed' | 'cancelled' | 'failed';
  readonly resultCode: string;
  readonly resultRu: string;
  readonly endedSeconds: number;
}

export interface WeaponDeploymentActionV1 {
  readonly schemaVersion: typeof WEAPON_DEPLOYMENT_SCHEMA_VERSION;
  readonly actionId: string;
  readonly sequence: number;
  readonly kind: WeaponDeploymentActionKind;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  actionHandle: PhysicalActionHandleV1;
  helperUnitId: string | null;
  helperActionHandle: PhysicalActionHandleV1 | null;
  helperValidationCode: string | null;
  readonly requiredBaseWorkSeconds: number;
  completedBaseWorkSeconds: number;
  readonly startedSeconds: number;
  lastAdvancedSeconds: number;
  readonly anchorBeforeAction: WeaponDeploymentAnchorV1 | null;
}

export interface WeaponDeploymentRuntimeV1 {
  readonly schemaVersion: typeof WEAPON_DEPLOYMENT_SCHEMA_VERSION;
  mode: WeaponDeploymentMode;
  anchor: WeaponDeploymentAnchorV1 | null;
  traverseCenterRadians: number | null;
  deployedAtSeconds: number | null;
  nextActionSequence: number;
  activeAction: WeaponDeploymentActionV1 | null;
  lastActionResult: WeaponDeploymentActionResultV1 | null;
  actionResults: WeaponDeploymentActionResultV1[];
  revision: number;
  invalidationReason: string | null;
}
