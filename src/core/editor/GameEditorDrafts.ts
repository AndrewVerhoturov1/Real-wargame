import {
  createSoldierParameters,
  type BehaviorProfileId,
  type SoldierCondition,
  type SoldierTraits,
  type UnitPosture,
} from '../behavior/BehaviorModel';
import {
  getDefaultObjectCoverProperties,
  type CoverPosture,
  type MapObjectKind,
} from '../map/MapModel';
import type { PressureZoneMode, PressureZoneShape } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitHeldItem, UnitType } from '../units/UnitModel';

export type EditorBrushShape = 'circle' | 'square';

export interface ObjectCreationDraft {
  name: string;
  kind: MapObjectKind;
  metersPerCell: number;
  widthCells: number;
  heightCells: number;
  rotationDegrees: number;
  losHeightMeters: number;
  coverProtection: number;
  coverReliability: number;
  concealment: number;
  penetrable: boolean;
  coverPosture: CoverPosture;
}

export interface UnitCreationDraft {
  name: string;
  type: UnitType;
  heldItem: UnitHeldItem;
  profile: BehaviorProfileId;
  speedCellsPerSecond: number;
  facingDegrees: number;
  viewAngleDegrees: number;
  viewRangeCells: number;
  posture: UnitPosture;
  stress: number;
  suppression: number;
  ammo: number;
  weaponReady: boolean;
  traits: SoldierTraits;
  condition: SoldierCondition;
}

export interface ThreatCreationDraft {
  name: string;
  shape: PressureZoneShape;
  mode: PressureZoneMode;
  radiusCells: number;
  widthCells: number;
  heightCells: number;
  rotationDegrees: number;
  strength: number;
  suppression: number;
  stressPerSecond: number;
  directionDegrees: number;
  arcDegrees: number;
  rangeCells: number;
  minRangeCells: number;
  falloffPercent: number;
  enabled: boolean;
  sourceVisible: boolean;
  sourceKnown: boolean;
  knowledgeConfidence: number;
  uncertaintyCells: number;
}

export interface TerrainCreationDraft {
  brushShape: EditorBrushShape;
  brushSizeCells: number;
  heightBrushLevel: number;
  forestBrushKind: number;
}

export interface GameEditorDrafts {
  object: ObjectCreationDraft;
  unit: UnitCreationDraft;
  threat: ThreatCreationDraft;
  terrain: TerrainCreationDraft;
}

const draftsByState = new WeakMap<SimulationState, GameEditorDrafts>();

const OBJECT_SIZE_PRESETS_METERS: Record<MapObjectKind, { widthMeters: number; heightMeters: number; losHeightMeters: number }> = {
  tree: { widthMeters: 7.5, heightMeters: 7.5, losHeightMeters: 6 },
  rock: { widthMeters: 4.5, heightMeters: 3.5, losHeightMeters: 1.2 },
  structure: { widthMeters: 20, heightMeters: 15, losHeightMeters: 5 },
  cover: { widthMeters: 25, heightMeters: 4.5, losHeightMeters: 1.1 },
  ditch: { widthMeters: 45, heightMeters: 5.5, losHeightMeters: 0.2 },
  crates: { widthMeters: 7.5, heightMeters: 6.5, losHeightMeters: 1.25 },
  fence: { widthMeters: 40, heightMeters: 2.5, losHeightMeters: 1.2 },
  post: { widthMeters: 5.5, heightMeters: 5.5, losHeightMeters: 1.35 },
  logs: { widthMeters: 12.5, heightMeters: 4.5, losHeightMeters: 0.8 },
  well: { widthMeters: 7, heightMeters: 7, losHeightMeters: 1.1 },
  bridge: { widthMeters: 26, heightMeters: 11, losHeightMeters: 0.8 },
};

export function getGameEditorDrafts(state: SimulationState): GameEditorDrafts {
  let drafts = draftsByState.get(state);
  if (!drafts) {
    drafts = createDefaultDrafts(state);
    draftsByState.set(state, drafts);
  }
  return drafts;
}

export function resetObjectDraftForKind(draft: ObjectCreationDraft, kind: MapObjectKind): void {
  const size = OBJECT_SIZE_PRESETS_METERS[kind];
  const cover = getDefaultObjectCoverProperties(kind);
  const metersPerCell = Math.max(0.001, draft.metersPerCell || 10);
  Object.assign(draft, {
    kind,
    name: objectNameForKind(kind),
    widthCells: size.widthMeters / metersPerCell,
    heightCells: size.heightMeters / metersPerCell,
    losHeightMeters: size.losHeightMeters,
    coverProtection: cover.coverProtection,
    coverReliability: cover.coverReliability,
    concealment: cover.concealment,
    penetrable: cover.penetrable,
    coverPosture: cover.coverPosture,
  });
}

export function resetUnitDraftForProfile(draft: UnitCreationDraft, profile: BehaviorProfileId): void {
  const soldier = createSoldierParameters(profile);
  draft.profile = profile;
  draft.traits = { ...soldier.traits };
  draft.condition = { ...soldier.condition };
}

export function syncLegacyEditorFields(state: SimulationState): void {
  const drafts = getGameEditorDrafts(state);
  const editor = state.editor as typeof state.editor & {
    brushShape?: EditorBrushShape;
    brushSizeCells?: number;
    heightBrushLevel?: number;
    forestBrushKind?: number;
  };

  state.editor.objectKind = drafts.object.kind;
  state.editor.objectWidthCells = drafts.object.widthCells;
  state.editor.objectHeightCells = drafts.object.heightCells;
  state.editor.objectRotationDegrees = drafts.object.rotationDegrees;
  state.editor.unitType = drafts.unit.type;
  state.editor.zoneShape = drafts.threat.shape;
  state.editor.zoneRadiusCells = drafts.threat.radiusCells;
  state.editor.zoneWidthCells = drafts.threat.widthCells;
  state.editor.zoneHeightCells = drafts.threat.heightCells;
  state.editor.zoneStrength = drafts.threat.strength;
  state.editor.zoneStressPerSecond = drafts.threat.stressPerSecond;
  editor.brushShape = drafts.terrain.brushShape;
  editor.brushSizeCells = drafts.terrain.brushSizeCells;
  editor.heightBrushLevel = drafts.terrain.heightBrushLevel;
  editor.forestBrushKind = drafts.terrain.forestBrushKind;
}

function createDefaultDrafts(state: SimulationState): GameEditorDrafts {
  const metersPerCell = Math.max(0.001, state.map.metersPerCell);
  const object = { metersPerCell } as ObjectCreationDraft;
  resetObjectDraftForKind(object, 'cover');
  object.rotationDegrees = 0;

  const soldier = createSoldierParameters('regular');
  return {
    object,
    unit: {
      name: 'Боец',
      type: 'infantry_squad',
      heldItem: 'long_item',
      profile: 'regular',
      speedCellsPerSecond: 5 / metersPerCell,
      facingDegrees: 0,
      viewAngleDegrees: 90,
      viewRangeCells: 70 / metersPerCell,
      posture: 'standing',
      stress: 0,
      suppression: 0,
      ammo: 30,
      weaponReady: true,
      traits: { ...soldier.traits },
      condition: { ...soldier.condition },
    },
    threat: {
      name: 'Источник угрозы',
      shape: 'circle',
      mode: 'directional_fire',
      radiusCells: 30 / metersPerCell,
      widthCells: 50 / metersPerCell,
      heightCells: 30 / metersPerCell,
      rotationDegrees: 0,
      strength: 70,
      suppression: 85,
      stressPerSecond: 18,
      directionDegrees: 0,
      arcDegrees: 50,
      rangeCells: 140 / metersPerCell,
      minRangeCells: 0,
      falloffPercent: 40,
      enabled: true,
      sourceVisible: true,
      sourceKnown: true,
      knowledgeConfidence: 100,
      uncertaintyCells: 1.5 / metersPerCell,
    },
    terrain: {
      brushShape: 'circle',
      brushSizeCells: 30 / metersPerCell,
      heightBrushLevel: 2,
      forestBrushKind: 1,
    },
  };
}

function objectNameForKind(kind: MapObjectKind): string {
  const names: Record<MapObjectKind, string> = {
    tree: 'Дерево',
    rock: 'Камень',
    structure: 'Здание',
    cover: 'Укрытие',
    ditch: 'Канава',
    crates: 'Ящики',
    fence: 'Забор',
    post: 'Пост',
    logs: 'Брёвна',
    well: 'Колодец',
    bridge: 'Мост',
  };
  return names[kind];
}
