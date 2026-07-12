import type { UnitModel } from '../units/UnitModel';
import {
  degreesToRadians,
  normalizeRadians,
  type AttentionMode,
  type AttentionModeSource,
} from './AttentionModel';

export function resolveAutomaticAttentionMode(unit: UnitModel): AttentionMode {
  const action = unit.behaviorRuntime.currentAction;
  if (action === 'fire' || action === 'suppress') return 'engage';
  if (unit.order) return 'march';
  return unit.attentionSettings.defaultMode;
}

export function setAttentionMode(
  unit: UnitModel,
  mode: AttentionMode,
  source: AttentionModeSource,
): void {
  const runtime = unit.attentionRuntime;
  runtime.mode = mode;
  runtime.modeSource = source;
  runtime.focusTargetId = mode === 'engage' ? runtime.focusTargetId : null;
  if (mode === 'search' && runtime.searchArcRadians <= 0) {
    runtime.searchArcRadians = degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees);
  }
}

export function setSearchSector(
  unit: UnitModel,
  centerRadians: number,
  arcRadians: number,
  source: AttentionModeSource,
): void {
  const runtime = unit.attentionRuntime;
  runtime.mode = 'search';
  runtime.modeSource = source;
  runtime.searchCenterRadians = normalizeRadians(centerRadians);
  runtime.searchArcRadians = Math.max(degreesToRadians(1), Math.min(Math.PI * 2, arcRadians));
  runtime.scanDirection = 1;
  runtime.scanProgress01 = 0;
  runtime.focusTargetId = null;
  runtime.focusDirectionRadians = normalizeRadians(runtime.searchCenterRadians - runtime.searchArcRadians / 2);
}

export function clearAttentionOverride(unit: UnitModel): void {
  const next = resolveAutomaticAttentionMode(unit);
  unit.attentionRuntime.modeSource = 'automatic';
  unit.attentionRuntime.mode = next;
  unit.attentionRuntime.focusTargetId = null;
}

export function updateAttentionController(unit: UnitModel, deltaSeconds: number): void {
  const runtime = unit.attentionRuntime;
  if (runtime.modeSource === 'automatic') runtime.mode = resolveAutomaticAttentionMode(unit);
  const delta = Math.max(0, deltaSeconds);
  const profile = unit.attentionSettings.profiles[runtime.mode];

  if (runtime.mode === 'engage') {
    if (runtime.focusTargetId === null) runtime.focusDirectionRadians = normalizeRadians(unit.facingRadians);
    return;
  }

  if (runtime.mode === 'march') {
    runtime.focusDirectionRadians = normalizeRadians(unit.facingRadians);
    runtime.scanProgress01 = 0.5;
    return;
  }

  const center = runtime.mode === 'search' ? runtime.searchCenterRadians : unit.facingRadians;
  const arc = runtime.mode === 'search'
    ? runtime.searchArcRadians
    : degreesToRadians(Math.min(220, profile.defaultSearchArcDegrees));
  const speed = degreesToRadians(profile.scanSpeedDegreesPerSecond);
  if (speed <= 0 || arc <= 0 || delta <= 0) {
    runtime.focusDirectionRadians = normalizeRadians(center);
    return;
  }

  const progressDelta = (speed * delta) / arc;
  let nextProgress = runtime.scanProgress01 + progressDelta * runtime.scanDirection;
  if (nextProgress >= 1) {
    nextProgress = 2 - nextProgress;
    runtime.scanDirection = -1;
  } else if (nextProgress <= 0) {
    nextProgress = -nextProgress;
    runtime.scanDirection = 1;
  }
  runtime.scanProgress01 = Math.max(0, Math.min(1, nextProgress));
  runtime.focusDirectionRadians = normalizeRadians(center - arc / 2 + arc * runtime.scanProgress01);
}

export function setFocusTarget(unit: UnitModel, targetId: string | null, directionRadians?: number): void {
  unit.attentionRuntime.focusTargetId = targetId;
  if (typeof directionRadians === 'number' && Number.isFinite(directionRadians)) {
    unit.attentionRuntime.focusDirectionRadians = normalizeRadians(directionRadians);
  }
}
