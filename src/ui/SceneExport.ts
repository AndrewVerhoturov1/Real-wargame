import { buildAiRuntimeSceneSnapshot } from '../core/ai/runtime/AiRuntimeSnapshot';
import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getWeaponRuntime } from '../core/combat/WeaponModel';
import { serializeMovementRuntime } from '../core/movement/MovementRuntime';
import { createMovementProfileRegistry, serializeMovementProfileRegistry, type MovementProfileRegistryData } from '../core/movement/MovementProfiles';
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
import { refreshAiTestLabSceneSnapshot } from '../core/testing/AiTestLabRuntime';
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
    heightMap: number[][];
    forestMap: number[][];
    objects: Array<Record<string, unknown>>;
  };
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
  replaceSceneAtRuntimeResolution(state, scene.map, scene.units, scene.pressureZones);
  state.movementProfiles = createMovementProfileRegistry(scene.movementProfiles);
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
  movementProfiles: unknown;
} {
  const scene = requireRecord(value, 'Файл должен содержать объект сцены.');
  const map = requireRecord(scene.map, 'В JSON сцены нет блока map.');

  return {
    map: map as unknown as TacticalMapData,
    units: readArray(scene.units) as unknown as UnitData[],
    pressureZones: readArray(scene.pressureZones) as unknown as PressureZoneData[],
    movementProfiles: scene.movementProfiles,
  };
}

export function buildExportedScene(state: SimulationState): ExportedSceneData {
  return {
    version: 'scene-export-v10-physical-movement-runtime-2m-grid',
    exportedAt: new Date().toISOString(),
    noteRu: 'Экспорт полигона ИИ с физическими профилями движения, выносливостью, фактическим способом движения, тактическим намерением PlayerCommand, слоем «Обзор и память», типом видимой цели у источников угроз, метрическими настройками зрения, навигационными профилями и активным runtime. Старые сцены без новых полей получают безопасные значения по умолчанию; сцены 10 м преобразуются в текущую сетку при загрузке.',
    map: {
      width: state.map.width,
      height: state.map.height,
      cellSize: state.map.cellSize,
      metersPerCell: state.map.metersPerCell,
      defaultTerrain: state.map.defaultTerrain,
      defaultHeight: state.map.defaultHeight,
      heightMap: buildHeightMap(state),
      forestMap: buildForestMap(state),
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

function exportUnit(unit: UnitModel): Record<string, unknown> {
  return {
    id: unit.id,
    label: unit.labels.en,
    labelRu: unit.labels.ru,
    type: unit.type,
    side: unit.side,
    aiControl: unit.aiControl,
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
    },
    initialState: { ...unit.initialState },
    tacticalKnowledge: JSON.parse(JSON.stringify(unit.tacticalKnowledge)),
    perceptionKnowledge: JSON.parse(JSON.stringify(unit.perceptionKnowledge)),
    movementProfileId: unit.movementRuntime.requestedProfileId,
    movementGait: unit.movementRuntime.requestedGait,
    movementProfileSource: unit.movementRuntime.requestedProfileSource,
    navigationProfileId: unit.unitRoleNavigationProfileId ?? undefined,
    navigationMovementMode: unit.navigationMovementMode ?? undefined,
    playerCommand: unit.playerCommand ? JSON.parse(JSON.stringify(unit.playerCommand)) : undefined,
    runtime: {
      stress: roundOne(unit.behaviorRuntime.stress),
      suppression: roundOne(unit.behaviorRuntime.suppression),
      ammo: Math.round(unit.behaviorRuntime.ammo),
      weaponReady: unit.behaviorRuntime.weaponReady,
      posture: unit.behaviorRuntime.posture,
      weapon: { ...getWeaponRuntime(unit) },
      combat: JSON.parse(JSON.stringify(getCombatRuntime(unit))),
      movement: serializeMovementRuntime(unit.movementRuntime),
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
