import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import { areUnitsHostile } from '../units/SideRelations';
import type { UnitModel } from '../units/UnitModel';
import {
  getPerceptionTargetHeightMeters,
  resolvePerceptionTargetProfile,
  type PerceptionTargetType,
} from './PerceptionTargetProfile';

export type PerceptionStimulusKind = 'threat_source' | 'unit';
export type PerceptionStimulusMovement = 'stationary' | 'walking' | 'running';
export type PerceptionStimulusAction = 'observe' | 'move' | 'fire' | 'suppress' | 'reload';

export interface PerceptionStimulus {
  id: string;
  sourceUnitId: string | null;
  label: string;
  labelRu: string;
  kind: PerceptionStimulusKind;
  position: GridPosition;
  posture: UnitPosture;
  movement: PerceptionStimulusMovement;
  action: PerceptionStimulusAction;
  targetType: PerceptionTargetType;
  targetHeightMeters: number;
  baseSize: number;
  concealment: number;
  lateralMotion: number;
  visibleSource: boolean;
  knownSource: boolean;
}

export function buildPerceptionStimuli(state: SimulationState, observer?: UnitModel): PerceptionStimulus[] {
  const stimuli: PerceptionStimulus[] = [];

  for (const zone of state.pressureZones) {
    const settings = resolvePressureZoneSettings(zone);
    if (!settings.enabled) continue;
    const position = { x: zone.x, y: zone.y };
    const cell = getCell(state.map, Math.floor(position.x), Math.floor(position.y));
    const concealment = cell?.forest === 2 ? 65 : cell?.forest === 1 ? 35 : 0;
    const targetType = zone.sourceTargetType ?? 'soldier';
    const targetProfile = resolvePerceptionTargetProfile(targetType);
    const posture: UnitPosture = 'standing';
    const modeSizeMultiplier = settings.mode === 'directional_fire' ? 1.1 : 0.9;
    stimuli.push({
      id: `threat:${zone.id}`,
      sourceUnitId: null,
      label: zone.labels.en,
      labelRu: zone.labels.ru,
      kind: 'threat_source',
      position,
      posture,
      movement: 'stationary',
      action: settings.mode === 'directional_fire' ? 'suppress' : 'observe',
      targetType,
      targetHeightMeters: getPerceptionTargetHeightMeters(targetType, posture),
      baseSize: targetProfile.baseSize * modeSizeMultiplier,
      concealment,
      lateralMotion: 0,
      visibleSource: settings.sourceVisible,
      knownSource: settings.sourceKnown,
    });
  }

  for (const unit of state.units) {
    if (observer && (unit.id === observer.id || !areUnitsHostile(observer, unit))) continue;
    const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
    const terrainConcealment = cell?.forest === 2 ? 65 : cell?.forest === 1 ? 35 : 0;
    const posture = unit.behaviorRuntime.posture;
    const targetType: PerceptionTargetType = 'soldier';
    const targetProfile = resolvePerceptionTargetProfile(targetType);
    const moving = Boolean(unit.order);
    const currentAction = unit.behaviorRuntime.currentAction;
    stimuli.push({
      id: `unit:${unit.id}`,
      sourceUnitId: unit.id,
      label: unit.labels.en,
      labelRu: unit.labels.ru,
      kind: 'unit',
      position: { ...unit.position },
      posture,
      movement: moving ? 'walking' : 'stationary',
      action: currentAction === 'fire'
        ? 'fire'
        : currentAction === 'suppress'
          ? 'suppress'
          : currentAction === 'reload'
            ? 'reload'
            : moving
              ? 'move'
              : 'observe',
      targetType,
      targetHeightMeters: getPerceptionTargetHeightMeters(targetType, posture),
      baseSize: targetProfile.baseSize,
      concealment: Math.max(0, Math.min(92, terrainConcealment + unit.soldier.condition.stealth * 0.12)),
      lateralMotion: moving ? 0.35 : 0,
      visibleSource: true,
      knownSource: false,
    });
  }

  return stimuli;
}
