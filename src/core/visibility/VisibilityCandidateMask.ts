import {
  normalizeSignedDegrees,
  radiansToDegrees,
  resolveAttentionSample,
  type AttentionZone,
} from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export const VISIBILITY_ZONE_CODE = {
  unseen: 0,
  focus: 1,
  direct: 2,
  peripheral: 3,
  rear: 4,
  near: 5,
} as const;

export type VisibilityZoneCode = typeof VISIBILITY_ZONE_CODE[keyof typeof VISIBILITY_ZONE_CODE];

export interface VisibilityCandidateMask {
  readonly minCellX: number;
  readonly minCellY: number;
  readonly width: number;
  readonly height: number;
  readonly candidate: Uint8Array;
  readonly attentionWeight: Uint8Array;
  readonly zone: Uint8Array;
  readonly distanceMeters: Float32Array;
  readonly candidateCellCount: number;
  readonly skippedOutsideAttentionCellCount: number;
  readonly key: string;
}

export function buildVisibilityCandidateMask(
  state: SimulationState,
  unit: UnitModel,
): VisibilityCandidateMask {
  const radiusCells = Math.max(
    1,
    Math.ceil(unit.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell)),
  );
  const originCellX = clampInt(Math.floor(unit.position.x), 0, state.map.width - 1);
  const originCellY = clampInt(Math.floor(unit.position.y), 0, state.map.height - 1);
  const minCellX = Math.max(0, originCellX - radiusCells);
  const minCellY = Math.max(0, originCellY - radiusCells);
  const maxCellX = Math.min(state.map.width - 1, originCellX + radiusCells);
  const maxCellY = Math.min(state.map.height - 1, originCellY + radiusCells);
  const width = maxCellX - minCellX + 1;
  const height = maxCellY - minCellY + 1;
  const candidate = new Uint8Array(width * height);
  const attentionWeight = new Uint8Array(width * height);
  const zone = new Uint8Array(width * height);
  const distanceMeters = new Float32Array(width * height);
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  const nearEnabled = unit.attentionSettings.nearAwarenessRangeMeters > 0;
  let candidateCellCount = 0;
  let skippedOutsideAttentionCellCount = 0;

  for (let y = minCellY; y <= maxCellY; y += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const localIndex = (y - minCellY) * width + (x - minCellX);
      const dx = x + 0.5 - unit.position.x;
      const dy = y + 0.5 - unit.position.y;
      const currentDistanceMeters = Math.hypot(dx, dy) * state.map.metersPerCell;
      distanceMeters[localIndex] = currentDistanceMeters;
      if (currentDistanceMeters > unit.attentionSettings.vision.maximumVisualRangeMeters) {
        skippedOutsideAttentionCellCount += 1;
        continue;
      }
      const bearing = Math.atan2(dy, dx);
      const angleDifferenceDegrees = normalizeSignedDegrees(
        radiansToDegrees(bearing - unit.attentionRuntime.focusDirectionRadians),
      );
      const attention = resolveAttentionSample(
        profile,
        angleDifferenceDegrees,
        currentDistanceMeters,
        unit.attentionSettings.nearAwarenessRangeMeters,
        unit.attentionSettings.nearMinimumVisibilityQuality,
      );
      const allowed = attention.zone !== 'outside'
        && attention.weight > 0
        && currentDistanceMeters <= attention.maximumRangeMeters
        && (attention.zone !== 'near' || nearEnabled);
      if (!allowed) {
        skippedOutsideAttentionCellCount += 1;
        continue;
      }
      candidate[localIndex] = 1;
      attentionWeight[localIndex] = Math.round(clamp01(attention.weight) * 255);
      zone[localIndex] = visibilityZoneCode(attention.zone);
      candidateCellCount += 1;
    }
  }

  return {
    minCellX,
    minCellY,
    width,
    height,
    candidate,
    attentionWeight,
    zone,
    distanceMeters,
    candidateCellCount,
    skippedOutsideAttentionCellCount,
    key: buildMaskKey(state, unit, minCellX, minCellY, width, height),
  };
}

export function visibilityMaskIndex(
  mask: Pick<VisibilityCandidateMask, 'minCellX' | 'minCellY' | 'width' | 'height'>,
  cellX: number,
  cellY: number,
): number {
  const x = cellX - mask.minCellX;
  const y = cellY - mask.minCellY;
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return -1;
  return y * mask.width + x;
}

export function visibilityZoneCode(zone: AttentionZone): VisibilityZoneCode {
  if (zone === 'focus') return VISIBILITY_ZONE_CODE.focus;
  if (zone === 'direct') return VISIBILITY_ZONE_CODE.direct;
  if (zone === 'peripheral') return VISIBILITY_ZONE_CODE.peripheral;
  if (zone === 'rear') return VISIBILITY_ZONE_CODE.rear;
  if (zone === 'near') return VISIBILITY_ZONE_CODE.near;
  return VISIBILITY_ZONE_CODE.unseen;
}

function buildMaskKey(
  state: SimulationState,
  unit: UnitModel,
  minCellX: number,
  minCellY: number,
  width: number,
  height: number,
): string {
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  return [
    'visibility-candidate-mask:v1',
    unit.id,
    exact(unit.position.x),
    exact(unit.position.y),
    unit.attentionRuntime.mode,
    exact(unit.attentionRuntime.focusDirectionRadians),
    profile.focusAngleDegrees,
    profile.directAngleDegrees,
    profile.peripheralAngleDegrees,
    profile.focusWeight,
    profile.directWeight,
    profile.peripheralWeight,
    profile.rearWeight,
    profile.rearMaximumRangeMeters,
    unit.attentionSettings.nearAwarenessRangeMeters,
    unit.attentionSettings.nearMinimumVisibilityQuality,
    unit.attentionSettings.vision.maximumVisualRangeMeters,
    state.map.metersPerCell,
    minCellX,
    minCellY,
    width,
    height,
  ].join(':');
}

function exact(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
