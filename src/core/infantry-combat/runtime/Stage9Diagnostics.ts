import type { UnitModel } from '../../units/UnitModel';
import { getPortableMachineGunSustainedFireFactor } from './MachineGunFireModifiers';

export interface Stage9UnitDiagnosticsV1 {
  readonly schemaVersion: 1;
  readonly unitId: string;
  readonly role: UnitModel['infantryCombatRuntime']['ammoInventory']['role'];
  readonly weapon: null | {
    readonly weaponInstanceId: string;
    readonly weaponDefinitionId: string;
    readonly roundsInWeapon: number;
    readonly deploymentMode: string;
    readonly deploymentAnchor: unknown;
    readonly traverseCenterRadians: number | null;
    readonly deployedAtSeconds: number | null;
    readonly deploymentRevision: number;
    readonly deploymentInvalidationReason: string | null;
    readonly activeDeploymentAction: unknown;
    readonly lastDeploymentResult: unknown;
    readonly portableSustainedFireFactor: number;
  };
  readonly ammo: {
    readonly reserves: readonly { readonly ammoDefinitionId: string; readonly rounds: number; readonly maximumRounds: number }[];
    readonly activeReload: unknown;
    readonly activeTransfer: unknown;
    readonly lastActionResult: unknown;
    readonly appliedReloadStageCount: number;
    readonly appliedTransferCount: number;
  };
}

/** Read-only Stage 9 projection. It never advances simulation or validates helpers. */
export function getStage9UnitDiagnostics(unit: UnitModel): Stage9UnitDiagnosticsV1 {
  const runtime = unit.infantryCombatRuntime;
  const weapon = runtime.primaryWeapon;
  const activeMode = runtime.activeFireTask?.mode ?? 'long_burst';
  return {
    schemaVersion: 1,
    unitId: unit.id,
    role: runtime.ammoInventory.role,
    weapon: weapon ? {
      weaponInstanceId: weapon.weaponInstanceId,
      weaponDefinitionId: weapon.resolved.weaponDefinitionRef.definitionId,
      roundsInWeapon: weapon.roundsInWeapon,
      deploymentMode: weapon.deployment.mode,
      deploymentAnchor: weapon.deployment.anchor ? structuredClone(weapon.deployment.anchor) : null,
      traverseCenterRadians: weapon.deployment.traverseCenterRadians,
      deployedAtSeconds: weapon.deployment.deployedAtSeconds,
      deploymentRevision: weapon.deployment.revision,
      deploymentInvalidationReason: weapon.deployment.invalidationReason,
      activeDeploymentAction: weapon.deployment.activeAction ? structuredClone(weapon.deployment.activeAction) : null,
      lastDeploymentResult: weapon.deployment.lastActionResult ? structuredClone(weapon.deployment.lastActionResult) : null,
      portableSustainedFireFactor: getPortableMachineGunSustainedFireFactor(weapon, activeMode),
    } : null,
    ammo: {
      reserves: runtime.ammoInventory.reserves.map((entry) => ({ ...entry })),
      activeReload: runtime.ammoInventory.activeReload ? structuredClone(runtime.ammoInventory.activeReload) : null,
      activeTransfer: runtime.ammoInventory.activeTransfer ? structuredClone(runtime.ammoInventory.activeTransfer) : null,
      lastActionResult: runtime.ammoInventory.lastActionResult ? structuredClone(runtime.ammoInventory.lastActionResult) : null,
      appliedReloadStageCount: runtime.ammoInventory.appliedReloadLoadIds.length,
      appliedTransferCount: runtime.ammoInventory.appliedTransferIds.length,
    },
  };
}
