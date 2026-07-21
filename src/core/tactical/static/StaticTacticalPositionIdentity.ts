import type { TacticalMap } from '../../map/MapModel';
import { getEnvironmentProfileRuntimeSnapshot } from '../../map/EnvironmentProfileRuntime';
import { getMapRevisionSnapshot } from '../../map/MapRuntimeState';
import {
  STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
  staticTacticalPositionSettingsDigest,
  type StaticTacticalPositionSettings,
} from './StaticTacticalPositionSettings';

export const STATIC_TACTICAL_POSITION_ALGORITHM_VERSION = 2 as const;

export interface StaticTacticalPositionBasisIdentity {
  readonly algorithmVersion: typeof STATIC_TACTICAL_POSITION_ALGORITHM_VERSION;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly terrainRevision: number;
  readonly heightRevision: number;
  readonly vegetationRevision: number;
  readonly objectRevision: number;
  readonly visibilityKey: string;
  readonly fireKey: string;
  readonly movementKey: string;
  readonly settingsVersion: typeof STATIC_TACTICAL_POSITION_SETTINGS_VERSION;
  readonly settingsDigest: string;
  readonly sectorCount: number;
}

export function createStaticTacticalPositionBasisIdentity(
  map: TacticalMap,
  settings: StaticTacticalPositionSettings,
): StaticTacticalPositionBasisIdentity {
  const mapRevision = getMapRevisionSnapshot(map);
  const profile = getEnvironmentProfileRuntimeSnapshot();
  return Object.freeze({
    algorithmVersion: STATIC_TACTICAL_POSITION_ALGORITHM_VERSION,
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    terrainRevision: mapRevision.terrain,
    heightRevision: mapRevision.height,
    vegetationRevision: mapRevision.forest,
    objectRevision: mapRevision.objects,
    visibilityKey: profile.domainKeys.visibility,
    fireKey: profile.domainKeys.fire,
    movementKey: profile.domainKeys.movement,
    settingsVersion: STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
    settingsDigest: staticTacticalPositionSettingsDigest(settings),
    sectorCount: settings.sectors.count,
  });
}

export function staticTacticalPositionIdentityKey(identity: StaticTacticalPositionBasisIdentity): string {
  return [
    `algorithm:${identity.algorithmVersion}`,
    `size:${identity.width}x${identity.height}`,
    `scale:${quantize(identity.cellSize)}:${quantize(identity.metersPerCell)}`,
    `map:${identity.terrainRevision}:${identity.heightRevision}:${identity.vegetationRevision}:${identity.objectRevision}`,
    `profile:${identity.visibilityKey}:${identity.fireKey}:${identity.movementKey}`,
    `settings:${identity.settingsVersion}:${identity.settingsDigest}`,
    `sectors:${identity.sectorCount}`,
  ].join('|');
}

export function sameStaticTacticalPositionIdentity(
  left: StaticTacticalPositionBasisIdentity | null | undefined,
  right: StaticTacticalPositionBasisIdentity | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.algorithmVersion === right.algorithmVersion
    && left.width === right.width
    && left.height === right.height
    && left.cellSize === right.cellSize
    && left.metersPerCell === right.metersPerCell
    && left.terrainRevision === right.terrainRevision
    && left.heightRevision === right.heightRevision
    && left.vegetationRevision === right.vegetationRevision
    && left.objectRevision === right.objectRevision
    && left.visibilityKey === right.visibilityKey
    && left.fireKey === right.fireKey
    && left.movementKey === right.movementKey
    && left.settingsVersion === right.settingsVersion
    && left.settingsDigest === right.settingsDigest
    && left.sectorCount === right.sectorCount;
}

function quantize(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}
