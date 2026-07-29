import { buildAiRuntimeSceneSnapshot, serializeMoveOrder } from '../ai/runtime/AiRuntimeSnapshot';
import { serializePhysicalActionCoordinatorState } from '../actions/PhysicalActionCoordinatorSerialization';
import { serializeUnitPhysicalAction } from '../actions/PostureTransition';
import { getCombatRuntime } from '../combat/CombatDamage';
import { getWeaponRuntime } from '../combat/WeaponModel';
import {
  normalizeReferenceProjectileRuntimeState,
  reconcileInfantryCombatRuntimeAfterLoad,
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
  type ProjectileRuntimeSnapshotV2,
} from '../infantry-combat/runtime';
import {
  EnvironmentProfileRegistry,
  createDefaultEnvironmentProfileRegistry,
  type EnvironmentProfileRegistryData,
} from '../map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../map/EnvironmentProfileRuntime';
import { resolveObjectCoverProperties, type TacticalMapData } from '../map/MapModel';
import { serializeMovementRuntime } from '../movement/MovementRuntime';
import {
  createMovementProfileRegistry,
  serializeMovementProfileRegistry,
  type MovementProfileRegistry,
  type MovementProfileRegistryData,
} from '../movement/MovementProfiles';
import { resolvePressureZoneSettings, type PressureZoneData } from '../pressure/PressureZone';
import {
  getStaticTacticalPositionService,
  hydrateStaticTacticalPositionArtifact,
} from '../tactical/static/StaticTacticalPositionService';
import type {
  StaticTacticalPositionArtifact,
  StaticTacticalPositionArtifactDecodeResult,
} from '../tactical/static/StaticTacticalPositionArtifact';
import { getTacticalPositionSearchService } from '../tactical/TacticalPositionSearchService';
import { serializeTacticalPositionSettings } from '../tactical/TacticalPositionSettings';
import { refreshAiTestLabSceneSnapshot } from '../testing/AiTestLabRuntime';
import type { UnitData, UnitModel } from '../units/UnitModel';
import { replaceSceneAtRuntimeResolution } from './ResolutionAwareScene';
import type { SimulationState } from './SimulationState';

export interface ExportedSceneData {
  version: string;
  exportedAt: string;
  noteRu: string;
  simulationTimeSeconds: number;
  infantryCombatRuntime: ProjectileRuntimeSnapshotV2;
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
  staticTacticalPositionArtifact?: StaticTacticalPositionArtifact;
}

export type SceneSnapshotData = ExportedSceneData;

export interface SceneSnapshotBuildOptions {
  readonly exportedAt: string;
  readonly environmentProfiles?: EnvironmentProfileRegistryData;
  readonly staticTacticalPositionArtifact?: StaticTacticalPositionArtifact | null;
}

export interface NormalizedSceneSnapshot {
  readonly map: TacticalMapData;
  readonly units: UnitData[];
  readonly pressureZones: PressureZoneData[];
  readonly environmentProfiles: unknown;
  readonly movementProfiles: unknown;
  readonly staticTacticalPositionArtifact: unknown;
  readonly simulationTimeSeconds: number;
  readonly infantryCombatRuntime: unknown;
}

export interface SceneSnapshotRestoreOptions {
  readonly fallbackEnvironmentProfiles?: EnvironmentProfileRegistryData;
}

export interface SceneSnapshotRestoreResult {
  readonly scene: NormalizedSceneSnapshot;
  readonly environmentProfileRegistry: EnvironmentProfileRegistry;
  readonly movementProfileRegistry: MovementProfileRegistry;
  readonly persistentBasis: StaticTacticalPositionArtifactDecodeResult;
  readonly restoredRuntimeCount: number;
  readonly resetRuntimeCount: number;
}

const SCENE_SNAPSHOT_VERSION = 'scene-export-v10-physical-posture-action-2m-grid';
const SCENE_SNAPSHOT_NOTE_RU = 'Экспорт полигона ИИ с тактическим намерением PlayerCommand, профилями физического движения, environment materials, выносливостью, фактическим способом движения, слоем «Обзор и память», навигационными профилями, настройками тактических позиций, необязательным предрасчётом статической тактической основы и активным runtime. Новые поля добавляются совместимо в envelope v10; старые сцены без них получают безопасные значения по умолчанию, а сцены 10 м преобразуются в текущую сетку при загрузке.';

export function buildSceneSnapshot(
  state: SimulationState,
  options: SceneSnapshotBuildOptions,
): ExportedSceneData {
  const environmentProfiles = options.environmentProfiles ?? createDefaultEnvironmentProfileRegistry().toData();
  const staticTacticalPositionArtifact = options.staticTacticalPositionArtifact ?? null;
  return {
    version: SCENE_SNAPSHOT_VERSION,
    exportedAt: options.exportedAt,
    simulationTimeSeconds: canonicalSeconds(state.simulationTimeSeconds),
    infantryCombatRuntime: serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles),
    noteRu: SCENE_SNAPSHOT_NOTE_RU,
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
    environmentProfiles,
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
    ...(staticTacticalPositionArtifact ? { staticTacticalPositionArtifact } : {}),
  };
}

export function normalizeSceneSnapshot(value: unknown): NormalizedSceneSnapshot {
  const scene = requireRecord(value, 'Файл должен содержать объект сцены.');
  const map = requireRecord(scene.map, 'В JSON сцены нет блока map.');
  return {
    map: map as unknown as TacticalMapData,
    units: readArray(scene.units) as unknown as UnitData[],
    pressureZones: readArray(scene.pressureZones) as unknown as PressureZoneData[],
    environmentProfiles: scene.environmentProfiles,
    movementProfiles: scene.movementProfiles,
    staticTacticalPositionArtifact: scene.staticTacticalPositionArtifact,
    simulationTimeSeconds: finiteNonNegative(scene.simulationTimeSeconds),
    infantryCombatRuntime: scene.infantryCombatRuntime,
  };
}

export function restoreSceneSnapshotCombatState(
  state: SimulationState,
  scene: Pick<NormalizedSceneSnapshot, 'simulationTimeSeconds' | 'infantryCombatRuntime'>,
): void {
  state.simulationTimeSeconds = canonicalSeconds(scene.simulationTimeSeconds);
  state.infantryCombatProjectiles = normalizeReferenceProjectileRuntimeState(scene.infantryCombatRuntime);
  reconcileInfantryCombatRuntimeAfterLoad(state);
}

export function restoreSimulationStateFromSceneSnapshot(
  state: SimulationState,
  value: unknown,
  options: SceneSnapshotRestoreOptions = {},
): SceneSnapshotRestoreResult {
  const scene = normalizeSceneSnapshot(value);
  const environmentProfileRegistry = scene.environmentProfiles === undefined
    ? EnvironmentProfileRegistry.fromUnknown(
        options.fallbackEnvironmentProfiles ?? createDefaultEnvironmentProfileRegistry().toData(),
      )
    : EnvironmentProfileRegistry.fromUnknown(scene.environmentProfiles);
  const requestedEnvironmentProfileId = scene.map.environmentProfileId?.trim();
  if (requestedEnvironmentProfileId && environmentProfileRegistry.hasProfile(requestedEnvironmentProfileId)) {
    environmentProfileRegistry.setActiveProfile(requestedEnvironmentProfileId);
  }
  installEnvironmentProfileRegistry(environmentProfileRegistry);

  const tacticalPositionSearchService = getTacticalPositionSearchService(state);
  for (const unit of state.units) tacticalPositionSearchService?.clearUnit(unit.id);
  replaceSceneAtRuntimeResolution(state, scene.map, scene.units, scene.pressureZones);
  restoreSceneSnapshotCombatState(state, scene);

  const movementProfileRegistry = createMovementProfileRegistry(scene.movementProfiles);
  state.movementProfiles = movementProfileRegistry;
  if (environmentProfileRegistry.hasProfile(state.map.environmentProfileId)) {
    environmentProfileRegistry.setActiveProfile(state.map.environmentProfileId);
    installEnvironmentProfileRegistry(environmentProfileRegistry);
  } else {
    state.map.environmentProfileId = environmentProfileRegistry.activeProfileId;
  }

  const persistentBasis = hydrateStaticTacticalPositionArtifact(state, scene.staticTacticalPositionArtifact);
  if (!persistentBasis.ok) getStaticTacticalPositionService(state).request();
  resetEditorAfterSceneRestore(state, scene);
  refreshAiTestLabSceneSnapshot(state);

  return {
    scene,
    environmentProfileRegistry,
    movementProfileRegistry,
    persistentBasis,
    restoredRuntimeCount: state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_restored').length,
    resetRuntimeCount: state.units.filter((unit) => unit.behaviorRuntime.lastEvent === 'ai_runtime_scene_reset').length,
  };
}

function resetEditorAfterSceneRestore(state: SimulationState, scene: NormalizedSceneSnapshot): void {
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  state.editor.tool = 'select';
  state.editor.nextObjectIndex = nextIndex(scene.map.objects ?? [], 'editor_object_');
  state.editor.nextUnitIndex = nextIndex(scene.units, 'editor_unit_');
  state.editor.nextZoneIndex = nextIndex(scene.pressureZones, 'editor_zone_');
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

function buildMaterialMap(
  state: SimulationState,
  field: 'surfaceMaterialId' | 'vegetationMaterialId',
): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < state.map.width; x += 1) {
      row.push(state.map.cells[y * state.map.width + x]?.[field] ?? (field === 'surfaceMaterialId' ? 'field' : 'none'));
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
      weapon: { ...getWeaponRuntime(unit) },
      combat: JSON.parse(JSON.stringify(getCombatRuntime(unit))),
      movement: serializeMovementRuntime(unit.movementRuntime),
      physicalActionCoordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
      physicalAction: serializeUnitPhysicalAction(unit.behaviorRuntime.physicalAction),
      infantryCombat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
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

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
