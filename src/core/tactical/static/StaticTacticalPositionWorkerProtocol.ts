import type { EnvironmentMaterialProfile } from '../../map/EnvironmentMaterialProfile';
import type { TacticalMap } from '../../map/MapModel';
import type { StaticTacticalPositionBasisSnapshot } from './StaticTacticalPositionBasis';
import type { StaticTacticalPositionBasisIdentity } from './StaticTacticalPositionIdentity';
import type { StaticTacticalPositionSettings } from './StaticTacticalPositionSettings';

export interface StaticTacticalPositionWorkerMapSnapshot extends TacticalMap {
  readonly cells: TacticalMap['cells'];
  readonly objects: TacticalMap['objects'];
}

export interface StaticTacticalPositionWorkerBuildRequest {
  readonly type: 'build';
  readonly jobId: number;
  readonly identity: StaticTacticalPositionBasisIdentity;
  readonly settings: StaticTacticalPositionSettings;
  readonly map: StaticTacticalPositionWorkerMapSnapshot;
  readonly environmentProfile: EnvironmentMaterialProfile;
}

export type StaticTacticalPositionWorkerRequest = StaticTacticalPositionWorkerBuildRequest;

export type StaticTacticalPositionWorkerResponse =
  | {
      readonly type: 'result';
      readonly jobId: number;
      readonly identity: StaticTacticalPositionBasisIdentity;
      readonly snapshot: StaticTacticalPositionBasisSnapshot;
    }
  | {
      readonly type: 'error';
      readonly jobId: number;
      readonly identity: StaticTacticalPositionBasisIdentity;
      readonly message: string;
    };

export function buildStaticTacticalPositionWorkerMapSnapshot(
  map: TacticalMap,
): StaticTacticalPositionWorkerMapSnapshot {
  return {
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    sourceToRuntimeCellScale: map.sourceToRuntimeCellScale,
    environmentProfileId: map.environmentProfileId,
    defaultTerrain: map.defaultTerrain,
    defaultHeight: map.defaultHeight,
    cells: map.cells.map((cell) => ({ ...cell })),
    objects: map.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

export function staticTacticalPositionWorkerTransferables(
  response: Extract<StaticTacticalPositionWorkerResponse, { type: 'result' }>,
): Transferable[] {
  const snapshot = response.snapshot;
  const index = snapshot.candidateIndex;
  return [
    snapshot.observationPotential.buffer,
    snapshot.defensePotential.buffer,
    snapshot.firingPotential.buffer,
    snapshot.observationByDirection.buffer,
    snapshot.protectionByDirection.buffer,
    snapshot.firingByDirection.buffer,
    snapshot.availablePostureMask.buffer,
    snapshot.concealment.buffer,
    snapshot.staticProtectionByPosture.buffer,
    snapshot.observationByPosture.buffer,
    snapshot.firingByPosture.buffer,
    snapshot.surfaceSuitability.buffer,
    snapshot.reverseSlopeByDirection.buffer,
    snapshot.immediateFireClearanceByDirection.buffer,
    ...candidateListTransferables(index.observation),
    ...candidateListTransferables(index.defense),
    ...candidateListTransferables(index.firing),
  ];
}

function candidateListTransferables(list: StaticTacticalPositionBasisSnapshot['candidateIndex']['observation']): Transferable[] {
  return [
    list.chunkOffsets.buffer,
    list.chunkCounts.buffer,
    list.cellIndices.buffer,
    list.scores.buffer,
    list.postureMasks.buffer,
    list.dominantSectorMasks.buffer,
  ];
}
