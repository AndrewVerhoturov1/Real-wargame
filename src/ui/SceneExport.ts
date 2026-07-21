import { buildAiRuntimeSceneSnapshot, serializeMoveOrder } from '../core/ai/runtime/AiRuntimeSnapshot';
import { saveMovementProfileRegistry } from '../ai-node-editor/MovementProfileBrowserStorage';
import { serializeUnitPhysicalAction } from '../core/actions/PostureTransition';
import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getWeaponRuntime } from '../core/combat/WeaponModel';
import { serializeMovementRuntime } from '../core/movement/MovementRuntime';
import { createMovementProfileRegistry, serializeMovementProfileRegistry, type MovementProfileRegistryData } from '../core/movement/MovementProfiles';
import {
  EnvironmentProfileRegistry,
  type EnvironmentProfileRegistryData,
} from '../core/map/EnvironmentMaterialProfile';
import {
  resolveObjectCoverProperties,
  type TacticalMapData,
} from '../core/map/MapModel';
import {
  resolvePressureZoneSettings,
  type PressureZoneData,
} from '../core/pressure/PressureZone';
import { replaceSceneAtRuntimeResolution } from '../core/simulation/ResolutionAwareScene';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';
import { serializeTacticalPositionSettings } from '../core/tactical/TacticalPositionSettings';
import { refreshAiTestLabSceneSnapshot } from '../core/testing/AiTestLabRuntime';
import { getEnvironmentProfileRegistry, saveEnvironmentProfileRegistry } from './EnvironmentProfileStorage';
import type { UnitData, UnitModel } from '../core/units/UnitModel';

export interface ExportedSceneData {
  version: string;
  exportedAt: string;
  noteRu: string;
  map: {
    width: number;
    height: number;
    cellSize: number;
    metersPerCell: number;
    defaultTerrain: string;
    defaultHeight: number;
    environmentProfileId: string;
    heightMap: number[][];
    forestMap: number[][];
    surfaceMaterialMap: string[][];
    vegetationMaterialMap: string[][];
    objects: Array<Record<string, unknown>>;
  };
  environmentProfiles: EnvironmentProfileRegistryData;
  movementProfiles: MovementProfileRegistryData;
  units: Array<Record<string, unknown>>;
  pressureZones: Array<Record<string, unknown>>;
}

export async function loadSceneJsonFromFile(state: SimulationState, file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Файл не похож на правильный JSON.');
  }

  const scene = normalizeImportedScene(parsed);
  const environmentRegistry = scene.environmentProfiles === undefined
    ? getEnvironmentProfileRegistry()
    : EnvironmentProfileRegistry.fromUnknown(scene.environmentProfiles);
  const requestedEnvironmentProfileId = scene.map.environmentProfileId?.trim();
  if (requestedEnvironmentProfileId && environmentRegistry.hasProfile(requestedEnvironmentProfileId)) {
    environmentRegistry.setActiveProfile(requestedEnvironmentProfileId);
  }
  saveEnvironmentProfileRegistry(environmentRegistry);
  const tacticalPositionSearchService = getTacticalPositionSearchService(state);
  for (const unit of state.units) tacticalPositionSearchService?.clearUnit(unit.id);
  replaceSceneAtRuntimeResolution(state, scene.map, scene.units, scene.pressureZones);
  state.movementProfiles = createMovementProfileRegistry(scene.movementProfiles);
  saveMovementProfileRegistry(state.movementProfiles);
  if (environmentRegistry.hasProfile(state.map.environmentProfileId)) {
    environmentRegistry.setActiveProfile(state.map.environmentProfileId);
    saveEnvironmentProfileRegistry(environmentRegistry);
  } else {
    state.map.environmentProfileId = environmentRegistry.activeProfileId;
  }
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  state.editor.tool = 'select';
  state.editor.nextObjectIndex = nextIndex(scene.map.objects ?? [], 'editor_object_');
  state.editor.nextUnitIndex = nextIndex(scene.units, 'editor_unit_');
  state.editor.nextZoneIndex = nextIndex(scene.pressureZones, 'editor_zone_');
  refreshAiTestLabSceneSnapshot(state);
  const restoredRuntimeCount = state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_restored').length;
  const resetRuntimeCount = state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_reset').length;
  const runtimeMessage = restoredRuntimeCount > 0
    ? ` Runtime восстановлен у бойцов: ${restoredRuntimeCount}.`
    : resetRuntimeCount > 0
      ? ` Runtime сброшен у бойцов: ${resetRuntimeCount}.`
      : ' Старый формат сцены загружен без активного действия ИИ.';
  state.editor.lastMessage = `JSON сцены загружен в сетку ${state.map.metersPerCell} м: карта ${state.map.width}×${state.map.height}, юнитов ${state.units.length}, зон ${state.pressureZones.length}.${runtimeMessage}`;
}

export function downloadCurrentSceneJson(state: SimulationState): void {
  const scene = buildExportedScene(state);
  const json = JSON.stringify(scene, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `real-wargame-scene-${buildTimestampForFileName()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.editor.lastMessage = `JSON испытательной сцены скачан: ${state.map.metersPerCell} м/клетка.`;
}

export function normalizeImportedScene(value: unknown): {
  map: TacticalMapData;
  units: UnitData[];
  pressureZones: PressureZoneData[];
  environmentProfiles: unknown;
  movementProfiles: unknown;
} {
  const scene = requireRecord(value, 'Файл должен содержать объект сцены.');
  const map = requireRecord(scene.map, 'В JSON сцены нет блока map.');

  return {
    map: map as unknown as TacticalMapData,
    units: readArray(scene.units) as unknown as UnitData[],
    pressureZones: readArray(scene.pressureZones) as unknown as PressureZoneData[],
    environmentProfiles: scene.environmentProfiles,
    movementProfiles: scene.movementProfiles,
  };
}

export function buildExportedScene(state: SimulationState): ExportedSceneData {
  return {
    version: 'scene-export-v10-physical-posture-action-2m-grid',
    exportedAt: new Date().toISOString(),
    noteRu: 'Экспорт полигона ИИ с тактическим намерением PlayerCommand, профилями физического движения, environment materials, выносливостью, фактическим способом движения, слоем «Обзор и память», навигационными профилями, настройками тактических позиций, активным runtime ИИ и сериализуемой физической сменой позы. Старые сцены без физического действия получают безопасное значение по умолчанию.',
    map: {
      width: state.map.width,
      height: state.map.height,
      cellSize: state.map.cellSize,
      metersPerCell: state.map.metersPerCell,
      defaultTerrain: state.map.defaultTerrain,
      defaultHeight: state.map.defaultHeight,
      environmentProfileId: state.map.environmentProfileId,
      heightMap: buildHeightMap(state),
      forestMap: buildForestMap(state),
      surfaceMaterialMap: buildMaterialMap(state, 'surfaceMaterialId'),
      vegetationMaterialMap: buildMaterialMap(state, 'vegetationMaterialId'),
      objects: state.map.objects.map((object) => {
        const cover = resolveObjectCoverProperties(object);
        return {
          id: object.id,
          kind: object.kind,
          x: roundThree(object.x),
          y: roundThree(object.y),
          widthCells: roundThree(object.widthCells),
          heightCells: roundThree(object.heightCells),
          losHeightMeters: roundOne(object.losHeightMeters ?? 1),
          coverProtection: roundOne(cover.coverProtection),
          coverReliability: roundOne(cover.coverReliability),
          concealment: roundOne(cover.concealment),
          penetrable: cover.penetrable,
          coverPosture: cover.coverPosture,
          rotationDegrees: roundOne(radiansToDegrees(object.rotationRadians)),
          label: object.labels?.en,
          labelRu: object.labels?.ru,
        };
      }),
    },
    environmentProfiles: getEnvironmentProfileRegistry().toData(),
    movementProfiles: serializeMovementProfileRegistry(state.movementProfiles),
    units: state.units.map(exportUnit),
    pressureZones: state.pressureZones.map((zone) => {
      const settings = resolvePressureZoneSettings(zone);
      return {
        id: zone.id,
        label: zone.labels.en,
        labelRu: zone.labels.ru,
        type: zone.type,
        shape: zone.shape,
        mode: settings.mode,
        x: roundThree(zone.x),
        y: roundThree(zone.y),
        radiusCells: roundThree(zone.radiusCells),
        widthCells: roundThree(zone.widthCells),
        heightCells: roundThree(zone.heightCells),
        rotationDegrees: roundOne(zone.rotationDegrees ?? 0),
        strength: roundOne(zone.strength),
        suppression: roundOne(settings.suppression),
        stressPerSecond: roundOne(zone.stressPerSecond),
        directionDegrees: roundOne(settings.directionDegrees),
        arcDegrees: roundOne(settings.arcDegrees),
        rangeCells: roundThree(settings.rangeCells),
        minRangeCells: roundThree(settings.minRangeCells),
        falloffPercent: roundOne(settings.falloffPercent),
        enabled: settings.enabled,
        sourceVisible: settings.sourceVisible,
        sourceKnown: settings.sourceKnown,
        sourceTargetType: zone.sourceTargetType,
        knowledgeConfidence: roundOne(zone.knowledgeConfidence ?? 100),
        uncertaintyCells: roundThree(zone.uncertaintyCells ?? 0.15),
        knowledgeSource: zone.knowledgeSource,
        reason: zone.reasons.en,
        reasonRu: zone.reasons.ru,
      };
    }),
  };
}

function buildHeightMap(state: SimulationState): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < state.map.width; x += 1) {
      row.push(state.map.cells[y * state.map.width + x]?.height ?? state.map.defaultHeight);
    }
    rows.push(row);
  }
  return rows;
}

function buildForestMap(state: SimulationState): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < state.map.width; x += 1) {
      row.push(state.map.cells[y * state.map.width + x]?.forest ?? 0);
    }
    rows.push(row);
  }
  return rows;
}

function buildMaterialMap(state: SimulationState, field: 'surfaceMaterialId' | 'vegetationMaterialId'): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < state.map.width; x += 1) row.push(state.map.cells[y * state.map.width + x]?.[field] ?? (field === 'surfaceMaterialId' ? 'field' : 'none'));
    rows.push(row);
  }
  return rows;
}

function exportUnit(unit: UnitModel): Record<string, unknown> {
  return {
    id: unit.id,
    label: unit.labels.en,
    labelRu: unit.labels.ru,
    type: unit.type,
    side: unit.side,
    x: roundThree(unit.position.x - 0.5),
    y: roundThree(unit.position.y - 0.5),
    speedCellsPerSecond: roundThree(unit.speedCellsPerSecond),
    heldItem: unit.heldItem,
    facingDegrees: roundOne(radiansToDegrees(unit.facingRadians)),
    viewAngleDegrees: roundOne(unit.attentionSettings.profiles.observe.directAngleDegrees),
    viewRangeCells: roundThree(unit.viewRangeCells),
    behaviorProfile: unit.behaviorProfile,
    behavior: { ...unit.behaviorSettings },
    soldier: {
      traits: { ...unit.soldier.traits },
      condition: { ...unit.soldier.condition },
    },
    attentionProfileId: unit.playerAttentionProfileId ?? undefined,
    attention: {
      defaultMode: unit.attentionSettings.defaultMode,
      profiles: Object.fromEntries(
        Object.entries(unit.attentionSettings.profiles).map(([mode, profile]) => [mode, { ...profile }]),
      ),
      vision: { ...unit.attentionSettings.vision },
      nearAwarenessRangeMeters: unit.attentionSettings.nearAwarenessRangeMeters,
      nearMinimumVisibilityQuality: unit.attentionSettings.nearMinimumVisibilityQuality,
    },
    tacticalPositionSettings: serializeTacticalPositionSettings(unit),
    initialState: { ...unit.initialState },
    tacticalKnowledge: JSON.parse(JSON.stringify(unit.tacticalKnowledge)),
    perceptionKnowledge: JSON.parse(JSON.stringify(unit.perceptionKnowledge)),
    navigationProfileId: unit.unitRoleNavigationProfileId ?? undefined,
    navigationMovementMode: unit.navigationMovementMode ?? undefined,
    movementProfileId: unit.unitRoleMovementProfileId ?? undefined,
    playerCommand: unit.playerCommand ? JSON.parse(JSON.stringify(unit.playerCommand)) : undefined,
    runtime: {
      stress: roundOne(unit.behaviorRuntime.stress),
      suppression: roundOne(unit.behaviorRuntime.suppression),
      ammo: Math.round(unit.behaviorRuntime.ammo),
      weaponReady: unit.behaviorRuntime.weaponReady,
      posture: unit.behaviorRuntime.posture,
      physicalAction: serializeUnitPhysicalAction(unit.behaviorRuntime.physicalAction),
      weapon: { ...getWeaponRuntime(unit) },
      combat: JSON.parse(JSON.stringify(getCombatRuntime(unit))),
      movement: serializeMovementRuntime(unit.movementRuntime),
      moveOrder: unit.order ? serializeMoveOrder(unit.order) : undefined,
      aiRuntime: buildAiRuntimeSceneSnapshot(
        unit.behaviorRuntime.aiRuntimeSession,
        unit.order,
        unit.behaviorRuntime.aiRouteStatusState,
      ),
    },
  };
}

function nextIndex(items: Array<{ id?: string }>, prefix: string): number {
  let maxIndex = 0;
  for (const item of items) {
    if (!item.id?.startsWith(prefix)) continue;
    const suffix = Number.parseInt(item.id.slice(prefix.length), 10);
    if (Number.isFinite(suffix)) maxIndex = Math.max(maxIndex, suffix);
  }
  return maxIndex + 1;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function buildTimestampForFileName(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
    .replace('T', '_')
    .replace('Z', '');
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
