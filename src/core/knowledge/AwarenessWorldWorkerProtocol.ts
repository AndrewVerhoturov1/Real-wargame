import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { MapObject } from '../map/MapModel';
import type { EnvironmentMaterialProfile } from '../map/EnvironmentMaterialProfile';
import type {
  TacticalPositionCandidateSeedV2,
  TacticalPositionSearchDiagnostics,
} from '../tactical/TacticalPositionSearch';
import type { CanonicalWorldThreatSnapshot } from './CanonicalWorldThreat';

export interface AwarenessWorkerMapSnapshot {
  readonly mapKey: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly sourceToRuntimeCellScale: number;
  readonly environmentProfile: EnvironmentMaterialProfile;
  readonly defaultSurfaceMaterialId: string;
  readonly defaultVegetationMaterialId: string;
  readonly defaultHeight: number;
  readonly surfaceMaterialIds: readonly string[];
  readonly vegetationMaterialIds: readonly string[];
  readonly surfaceMaterialCodes: Uint16Array;
  readonly vegetationMaterialCodes: Uint16Array;
  readonly heightLevels: Int8Array;
  readonly objects: MapObject[];
}

export interface AwarenessWorkerTacticalSearchBudget {
  readonly searchRadiusMeters: number;
  readonly maxSampledCells: number;
  readonly maxRouteExpansions: number;
  readonly maxCandidates: number;
  readonly minimumSeparationMeters: number;
}

export interface AwarenessWorkerBuildSnapshot {
  readonly jobId: number;
  readonly rasterKey: string;
  readonly canonicalThreatKey: string;
  readonly mapKey: string;
  readonly unitId: string;
  readonly posture: UnitPosture;
  /**
   * The local origin is not part of canonical danger-raster identity. It is used
   * only by the bounded tactical-position extractor and current-cell diagnostics.
   */
  readonly compatibilityOrigin: GridPosition;
  readonly threats: readonly CanonicalWorldThreatSnapshot[];
  readonly knowledgeRevision: number;
  readonly orderTarget: GridPosition | null;
  readonly finalExact: boolean;
  readonly tacticalSearch?: AwarenessWorkerTacticalSearchBudget;
}

export type AwarenessWorkerRequest =
  | { readonly type: 'configure'; readonly map: AwarenessWorkerMapSnapshot }
  | { readonly type: 'build'; readonly snapshot: AwarenessWorkerBuildSnapshot };

export interface AwarenessWorkerFieldPayload {
  readonly width: number;
  readonly height: number;
  readonly danger: Uint8Array;
  readonly suppression: Uint8Array;
  readonly concealment: Uint8Array;
  readonly safety: Uint8Array;
  readonly uncertainty: Uint8Array;
  readonly expectedProtection: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly reverseSlopeQuality: Uint8Array;
  readonly forwardSlopeRisk: Uint8Array;
  readonly protectedThreatIndex: Int16Array;
  readonly dangerPixels: Uint32Array;
  readonly stealthPixels: Uint32Array;
  readonly threatIds: string[];
  readonly threatConfidence: number;
  readonly tacticalPositions: readonly TacticalPositionCandidateSeedV2[];
  readonly tacticalPositionDiagnostics: TacticalPositionSearchDiagnostics;
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
      readonly canonicalThreatKey: string;
      readonly mapKey: string;
      readonly finalExact: boolean;
      readonly computeMs: number;
      readonly fieldIdentity: string;
      readonly rasterDigest: string;
      readonly field: AwarenessWorkerFieldPayload;
      readonly computation: AwarenessWorkerComputationDelta;
    }
  | {
      readonly type: 'error';
      readonly jobId: number;
      readonly rasterKey: string;
      readonly canonicalThreatKey: string;
      readonly mapKey: string;
      readonly message: string;
    };

export function awarenessWorkerTransferables(response: Extract<AwarenessWorkerResponse, { type: 'result' }>): Transferable[] {
  return [
    response.field.danger.buffer,
    response.field.suppression.buffer,
    response.field.concealment.buffer,
    response.field.safety.buffer,
    response.field.uncertainty.buffer,
    response.field.expectedProtection.buffer,
    response.field.expectedProtectionAgainstThreat.buffer,
    response.field.reverseSlopeQuality.buffer,
    response.field.forwardSlopeRisk.buffer,
    response.field.protectedThreatIndex.buffer,
    response.field.dangerPixels.buffer,
    response.field.stealthPixels.buffer,
  ];
}
