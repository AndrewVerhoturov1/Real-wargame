import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { MapObject } from '../map/MapModel';
import type { KnownThreatMemory } from '../units/UnitModel';

export interface AwarenessWorkerMapSnapshot {
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

export interface AwarenessWorkerBuildSnapshot {
  readonly jobId: number;
  readonly rasterKey: string;
  readonly mapKey: string;
  readonly unitId: string;
  readonly posture: UnitPosture;
  readonly stableWorldOrigin: GridPosition;
  readonly threats: KnownThreatMemory[];
  readonly knowledgeRevision: number;
  readonly orderTarget: GridPosition | null;
  readonly finalExact: boolean;
}

export type AwarenessWorkerRequest =
  | { readonly type: 'configure'; readonly map: AwarenessWorkerMapSnapshot }
  | { readonly type: 'build'; readonly snapshot: AwarenessWorkerBuildSnapshot };

export interface AwarenessWorkerFieldPayload {
  readonly width: number;
  readonly height: number;
  readonly danger: Uint8Array;
  readonly concealment: Uint8Array;
  readonly safety: Uint8Array;
  readonly expectedProtection: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly protectedThreatIndex: Int16Array;
  readonly dangerPixels: Uint32Array;
  readonly stealthPixels: Uint32Array;
  readonly threatIds: string[];
  readonly threatConfidence: number;
}

export interface AwarenessWorkerComputationDelta {
  readonly threatRelativeGeometryBuilds: number;
  readonly directionalFieldBuilds: number;
  readonly directionalBasisBuilds: number;
  readonly awarenessGeometryBuilds: number;
  readonly awarenessRescores: number;
}

export type AwarenessWorkerResponse =
  | {
      readonly type: 'result';
      readonly jobId: number;
      readonly rasterKey: string;
      readonly mapKey: string;
      readonly finalExact: boolean;
      readonly computeMs: number;
      readonly field: AwarenessWorkerFieldPayload;
      readonly computation: AwarenessWorkerComputationDelta;
    }
  | {
      readonly type: 'error';
      readonly jobId: number;
      readonly rasterKey: string;
      readonly mapKey: string;
      readonly message: string;
    };

export function awarenessWorkerTransferables(response: Extract<AwarenessWorkerResponse, { type: 'result' }>): Transferable[] {
  return [
    response.field.danger.buffer,
    response.field.concealment.buffer,
    response.field.safety.buffer,
    response.field.expectedProtection.buffer,
    response.field.expectedProtectionAgainstThreat.buffer,
    response.field.protectedThreatIndex.buffer,
    response.field.dangerPixels.buffer,
    response.field.stealthPixels.buffer,
  ];
}
