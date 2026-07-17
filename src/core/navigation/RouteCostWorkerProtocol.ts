import type { MapObject } from '../map/MapModel';
import type { NavigationProfile } from './NavigationProfiles';
import type { RouteCostFields, TacticalRouteContext } from './RouteCostField';

export interface RouteCostWorkerMapSnapshot {
  readonly mapKey: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly sourceToRuntimeCellScale: number;
  readonly defaultTerrainCode: number;
  readonly defaultHeight: number;
  readonly terrainCodes: Uint8Array;
  readonly heightLevels: Int8Array;
  readonly forestKinds: Uint8Array;
  readonly objects: MapObject[];
}

export interface RouteCostWorkerBuildSnapshot {
  readonly jobId: number;
  readonly requestKey: string;
  readonly mapKey: string;
  readonly profile: NavigationProfile;
  readonly tacticalContext: TacticalRouteContext;
}

export type RouteCostWorkerRequest =
  | { readonly type: 'configure'; readonly map: RouteCostWorkerMapSnapshot }
  | { readonly type: 'build'; readonly snapshot: RouteCostWorkerBuildSnapshot };

export type RouteCostWorkerResponse =
  | {
      readonly type: 'result';
      readonly jobId: number;
      readonly requestKey: string;
      readonly mapKey: string;
      readonly computeMs: number;
      readonly fields: RouteCostFields;
    }
  | {
      readonly type: 'error';
      readonly jobId: number;
      readonly requestKey: string;
      readonly mapKey: string;
      readonly message: string;
    };

export function routeCostWorkerTransferables(
  response: Extract<RouteCostWorkerResponse, { type: 'result' }>,
): Transferable[] {
  const fields = response.fields;
  const buffers = [
    fields.passable.buffer,
    fields.terrainCost.buffer,
    fields.slopeCost.buffer,
    fields.dangerCost.buffer,
    fields.exposureCost.buffer,
    fields.directionalTerrainCost.buffer,
    fields.directionalSlope.buffer,
    fields.crestStrength.buffer,
    fields.valleyStrength.buffer,
    fields.silhouettePotential.buffer,
    fields.threatSectorWeights.buffer,
    fields.coverAdjustment.buffer,
    fields.enemyDistanceCost.buffer,
    fields.territoryCost.buffer,
    fields.totalCost.buffer,
  ];
  return [...new Set(buffers)] as Transferable[];
}
