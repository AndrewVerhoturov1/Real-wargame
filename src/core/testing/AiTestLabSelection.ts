import { objectCenter } from '../cover/CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import type { MapObject } from '../map/MapModel';
import {
  isPositionInsidePressureZone,
  resolvePressureZoneSettings,
  type PressureZone,
} from '../pressure/PressureZone';
import { isInsideDirectionalThreat } from '../pressure/ThreatEvaluation';
import { selectUnit, type SimulationState } from '../simulation/SimulationState';
import { findUnitAtGridPosition } from '../units/UnitModel';

export type AiTestLabSelectionTarget = 'fighter' | 'threat' | 'cover' | null;

const selectionTargetByState = new WeakMap<SimulationState, AiTestLabSelectionTarget>();

export function getAiTestLabSelectionTarget(state: SimulationState): AiTestLabSelectionTarget {
  return selectionTargetByState.get(state) ?? null;
}

export function setAiTestLabSelectionTarget(
  state: SimulationState,
  target: AiTestLabSelectionTarget,
): void {
  selectionTargetByState.set(state, target);
}

export function selectAiTestLabTargetAtPosition(
  state: SimulationState,
  position: GridPosition,
): boolean {
  const target = getAiTestLabSelectionTarget(state);

  if (target === 'fighter') {
    const unit = findUnitAtGridPosition(state.units, position);
    selectUnit(state, unit?.id ?? null);
    state.editor.lastMessage = unit ? `Выбран боец полигона: ${unit.id}` : 'Боец в этой точке не найден.';
    return Boolean(unit);
  }

  if (target === 'threat') {
    const zone = findThreatAtPosition(state.pressureZones, position);
    state.editor.selectedZoneId = zone?.id ?? null;
    state.editor.lastMessage = zone ? `Выбрана угроза полигона: ${zone.id}` : 'Угроза в этой точке не найдена.';
    return Boolean(zone);
  }

  if (target === 'cover') {
    const object = findCoverAtPosition(state.map.objects, position);
    state.editor.selectedObjectId = object?.id ?? null;
    state.editor.lastMessage = object ? `Выбрано укрытие полигона: ${object.id}` : 'Укрытие в этой точке не найдено.';
    return Boolean(object);
  }

  return false;
}

function findThreatAtPosition(zones: PressureZone[], position: GridPosition): PressureZone | undefined {
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index];
    const settings = resolvePressureZoneSettings(zone);
    const sourceHit = distance(position, { x: zone.x, y: zone.y }) <= 0.8;
    const areaHit = settings.mode === 'directional_fire'
      ? isInsideDirectionalThreat(position, zone)
      : isPositionInsidePressureZone(position, zone);

    if (sourceHit || areaHit) return zone;
  }

  return undefined;
}

function findCoverAtPosition(objects: MapObject[], position: GridPosition): MapObject | undefined {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (isPositionInsideObject(position, object)) return object;
  }

  return undefined;
}

function isPositionInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = objectCenter(object);
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const hitPadding = 0.16;

  return Math.abs(localX) <= object.widthCells / 2 + hitPadding
    && Math.abs(localY) <= object.heightCells / 2 + hitPadding;
}
