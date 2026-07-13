import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
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

export function buildPerceptionStimuli(state: SimulationState): PerceptionStimulus[] {
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

  return stimuli;
}
