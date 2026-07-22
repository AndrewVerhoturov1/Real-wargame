import type { UnitPosture } from '../../behavior/BehaviorModel';
import type { StaticTacticalCandidateIndexSnapshot } from './StaticTacticalCandidateIndex';
import type { StaticTacticalPositionBasisIdentity } from './StaticTacticalPositionIdentity';
import type { StaticTacticalPositionSettings } from './StaticTacticalPositionSettings';

export { readStaticTacticalCandidatesInBounds } from './StaticTacticalCandidateIndex';
export type { StaticTacticalCandidateView } from './StaticTacticalCandidateIndex';

export const STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION = 1 as const;
export type StaticTacticalPositionKind = 'observation' | 'defense' | 'firing';

export const STATIC_TACTICAL_POSTURE_STANDING = 1;
export const STATIC_TACTICAL_POSTURE_CROUCHED = 2;
export const STATIC_TACTICAL_POSTURE_PRONE = 4;
export const STATIC_TACTICAL_POSTURE_ALL = 7;

export interface StaticTacticalPositionBuildDiagnostics {
  readonly buildMs: number;
  readonly cellsProcessed: number;
  readonly observationRays: number;
  readonly firingRays: number;
  readonly blockedCells: number;
  readonly observationCandidates: number;
  readonly defenseCandidates: number;
  readonly firingCandidates: number;
}

export interface StaticTacticalPositionBasisSnapshot {
  readonly version: typeof STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION;
  readonly identity: StaticTacticalPositionBasisIdentity;
  readonly identityKey: string;
  readonly width: number;
  readonly height: number;
  readonly metersPerCell: number;
  readonly sectorCount: number;
  readonly observationPotential: Uint8Array;
  readonly defensePotential: Uint8Array;
  readonly firingPotential: Uint8Array;
  readonly observationByDirection: Uint8Array;
  readonly protectionByDirection: Uint8Array;
  readonly firingByDirection: Uint8Array;
  readonly availablePostureMask: Uint8Array;
  readonly concealment: Uint8Array;
  readonly staticProtectionByPosture: Uint8Array;
  readonly observationByPosture: Uint8Array;
  readonly firingByPosture: Uint8Array;
  readonly surfaceSuitability: Uint8Array;
  readonly reverseSlopeByDirection: Uint8Array;
  readonly immediateFireClearanceByDirection: Uint8Array;
  readonly candidateIndex: StaticTacticalCandidateIndexSnapshot;
  readonly settings: StaticTacticalPositionSettings;
  readonly diagnostics: StaticTacticalPositionBuildDiagnostics;
  readonly builtAtMs: number;
}

export interface MutableStaticTacticalPositionBasisArrays {
  readonly observationPotential: Uint8Array;
  readonly defensePotential: Uint8Array;
  readonly firingPotential: Uint8Array;
  readonly observationByDirection: Uint8Array;
  readonly protectionByDirection: Uint8Array;
  readonly firingByDirection: Uint8Array;
  readonly availablePostureMask: Uint8Array;
  readonly concealment: Uint8Array;
  readonly staticProtectionByPosture: Uint8Array;
  readonly observationByPosture: Uint8Array;
  readonly firingByPosture: Uint8Array;
  readonly surfaceSuitability: Uint8Array;
  readonly reverseSlopeByDirection: Uint8Array;
  readonly immediateFireClearanceByDirection: Uint8Array;
}

export function createStaticTacticalPositionBasisArrays(
  width: number,
  height: number,
  sectorCount: number,
): MutableStaticTacticalPositionBasisArrays {
  const cellCount = checkedCellCount(width, height);
  const directionalCount = cellCount * checkedPositiveInteger(sectorCount, 'sectorCount');
  const postureCount = cellCount * 3;
  return {
    observationPotential: new Uint8Array(cellCount),
    defensePotential: new Uint8Array(cellCount),
    firingPotential: new Uint8Array(cellCount),
    observationByDirection: new Uint8Array(directionalCount),
    protectionByDirection: new Uint8Array(directionalCount),
    firingByDirection: new Uint8Array(directionalCount),
    availablePostureMask: new Uint8Array(cellCount),
    concealment: new Uint8Array(cellCount),
    staticProtectionByPosture: new Uint8Array(postureCount),
    observationByPosture: new Uint8Array(postureCount),
    firingByPosture: new Uint8Array(postureCount),
    surfaceSuitability: new Uint8Array(cellCount),
    reverseSlopeByDirection: new Uint8Array(directionalCount),
    immediateFireClearanceByDirection: new Uint8Array(directionalCount),
  };
}

export function readStaticTacticalPotential(
  basis: StaticTacticalPositionBasisSnapshot,
  kind: StaticTacticalPositionKind,
  cellIndex: number,
): number {
  const values = kind === 'observation'
    ? basis.observationPotential
    : kind === 'defense'
      ? basis.defensePotential
      : basis.firingPotential;
  return values[cellIndex] ?? 0;
}

export function readStaticTacticalDirectionalValue(
  values: Uint8Array,
  basis: Pick<StaticTacticalPositionBasisSnapshot, 'sectorCount'>,
  cellIndex: number,
  sector: number,
): number {
  const safeSector = normalizeSector(sector, basis.sectorCount);
  return values[cellIndex * basis.sectorCount + safeSector] ?? 0;
}

export function readStaticTacticalPostureValue(
  values: Uint8Array,
  cellIndex: number,
  posture: UnitPosture,
): number {
  return values[cellIndex * 3 + postureIndex(posture)] ?? 0;
}

export function postureMaskIncludes(mask: number, posture: UnitPosture): boolean {
  return (mask & postureBit(posture)) !== 0;
}

export function postureBit(posture: UnitPosture): number {
  if (posture === 'standing') return STATIC_TACTICAL_POSTURE_STANDING;
  if (posture === 'crouched') return STATIC_TACTICAL_POSTURE_CROUCHED;
  return STATIC_TACTICAL_POSTURE_PRONE;
}

export function postureIndex(posture: UnitPosture): number {
  if (posture === 'standing') return 0;
  if (posture === 'crouched') return 1;
  return 2;
}

export function normalizeSector(sector: number, sectorCount: number): number {
  const count = checkedPositiveInteger(sectorCount, 'sectorCount');
  const rounded = Number.isFinite(sector) ? Math.floor(sector) : 0;
  return ((rounded % count) + count) % count;
}

export function assertStaticTacticalPositionBasisShape(
  basis: StaticTacticalPositionBasisSnapshot,
): void {
  const cellCount = checkedCellCount(basis.width, basis.height);
  const directionalCount = cellCount * basis.sectorCount;
  const postureCount = cellCount * 3;
  const cells: readonly Uint8Array[] = [
    basis.observationPotential,
    basis.defensePotential,
    basis.firingPotential,
    basis.availablePostureMask,
    basis.concealment,
    basis.surfaceSuitability,
  ];
  const directional: readonly Uint8Array[] = [
    basis.observationByDirection,
    basis.protectionByDirection,
    basis.firingByDirection,
    basis.reverseSlopeByDirection,
    basis.immediateFireClearanceByDirection,
  ];
  const postures: readonly Uint8Array[] = [
    basis.staticProtectionByPosture,
    basis.observationByPosture,
    basis.firingByPosture,
  ];
  if (cells.some((array) => array.length !== cellCount)) {
    throw new Error(`Static tactical cell array length mismatch; expected ${cellCount}.`);
  }
  if (directional.some((array) => array.length !== directionalCount)) {
    throw new Error(`Static tactical directional array length mismatch; expected ${directionalCount}.`);
  }
  if (postures.some((array) => array.length !== postureCount)) {
    throw new Error(`Static tactical posture array length mismatch; expected ${postureCount}.`);
  }
}

function checkedCellCount(width: number, height: number): number {
  return checkedPositiveInteger(width, 'width') * checkedPositiveInteger(height, 'height');
}

function checkedPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return value;
}
