import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import { getMovementTargetVisibilityMultiplier } from '../movement/MovementRuntime';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';
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
  movementSignatureMultiplier: number;
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
    const concealment = resolveCellVegetationDefinition(cell).visibility.targetConcealment;
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
      movementSignatureMultiplier: 1,
      visibleSource: settings.sourceVisible,
      knownSource: settings.sourceKnown,
    });
  }

  for (const unit of state.units) {
    if (observer && (unit.id === observer.id || !areUnitsHostile(observer, unit))) continue;
    const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
    const terrainConcealment = resolveCellVegetationDefinition(cell).visibility.targetConcealment;
    const posture = unit.behaviorRuntime.posture;
    const targetType: PerceptionTargetType = 'soldier';
    const targetProfile = resolvePerceptionTargetProfile(targetType);
    const moving = unit.movementRuntime.isMoving;
    const gait = unit.movementRuntime.actualGait;
    const currentAction = unit.behaviorRuntime.currentAction;
    const relativeLateral = resolveRelativeLateralMotion(observer, unit);
    const stealthContribution = unit.soldier.condition.stealth
      * 0.12
      * (moving ? unit.movementRuntime.diagnostics.stealthSkillShare : 1);
    stimuli.push({
      id: `unit:${unit.id}`,
      sourceUnitId: unit.id,
      label: unit.labels.en,
      labelRu: unit.labels.ru,
      kind: 'unit',
      position: { ...unit.position },
      posture,
      movement: moving ? (gait === 'run' || gait === 'sprint' ? 'running' : 'walking') : 'stationary',
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
      concealment: Math.max(0, Math.min(92, terrainConcealment + stealthContribution)),
      lateralMotion: moving ? relativeLateral : 0,
      movementSignatureMultiplier: moving ? getMovementTargetVisibilityMultiplier(unit) : 1,
      visibleSource: true,
      knownSource: false,
    });
  }

  return stimuli;
}


function resolveRelativeLateralMotion(observer: UnitModel | undefined, target: UnitModel): number {
  const velocity = target.movementRuntime.velocityCellsPerSecond;
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= 0.0001) return 0;
  if (!observer) return Math.min(1, speed / 1.5) * target.movementRuntime.diagnostics.lateralVisibility;
  const lineX = target.position.x - observer.position.x;
  const lineY = target.position.y - observer.position.y;
  const lineLength = Math.max(0.0001, Math.hypot(lineX, lineY));
  const velocityLength = Math.max(0.0001, speed);
  const lateral = Math.abs((lineX / lineLength) * (velocity.y / velocityLength) - (lineY / lineLength) * (velocity.x / velocityLength));
  return Math.max(0, Math.min(1, lateral * Math.min(1, speed / 1.5) * target.movementRuntime.diagnostics.lateralVisibility));
}
