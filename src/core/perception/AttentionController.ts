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
  runtime.scanDirection = 1;
  runtime.scanProgress01 = 0.5;
  if (mode === 'search' && runtime.searchArcRadians <= 0) {
    runtime.searchArcRadians = degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees);
  }
  resolveStableFocusDirection(unit);
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
  runtime.scanProgress01 = 0.5;
  runtime.focusTargetId = null;
  runtime.focusDirectionRadians = runtime.searchCenterRadians;
}

export function clearAttentionOverride(unit: UnitModel): void {
  const next = resolveAutomaticAttentionMode(unit);
  unit.attentionRuntime.modeSource = 'automatic';
  unit.attentionRuntime.mode = next;
  unit.attentionRuntime.focusTargetId = null;
  resolveStableFocusDirection(unit);
}

export function updateAttentionController(unit: UnitModel, _deltaSeconds: number): void {
  const runtime = unit.attentionRuntime;
  if (runtime.modeSource === 'automatic') runtime.mode = resolveAutomaticAttentionMode(unit);
  runtime.scanDirection = 1;
  runtime.scanProgress01 = 0.5;
  resolveStableFocusDirection(unit);
}

export function setFocusTarget(unit: UnitModel, targetId: string | null, directionRadians?: number): void {
  unit.attentionRuntime.focusTargetId = targetId;
  if (typeof directionRadians === 'number' && Number.isFinite(directionRadians)) {
    unit.attentionRuntime.focusDirectionRadians = normalizeRadians(directionRadians);
  } else if (targetId === null) {
    resolveStableFocusDirection(unit);
  }
}

function resolveStableFocusDirection(unit: UnitModel): void {
  const runtime = unit.attentionRuntime;
  if (runtime.mode === 'engage' && runtime.focusTargetId !== null) return;
  runtime.focusDirectionRadians = runtime.mode === 'search'
    ? normalizeRadians(runtime.searchCenterRadians)
    : normalizeRadians(unit.facingRadians);
}
