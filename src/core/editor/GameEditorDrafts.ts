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
  widthCells: number;
  heightCells: number;
  rotationDegrees: number;
  losHeightMeters: number;
  coverProtection: number;
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

const OBJECT_SIZE_PRESETS: Record<MapObjectKind, { widthCells: number; heightCells: number; losHeightMeters: number }> = {
  tree: { widthCells: 0.75, heightCells: 0.75, losHeightMeters: 6 },
  rock: { widthCells: 0.45, heightCells: 0.35, losHeightMeters: 1.2 },
  structure: { widthCells: 2, heightCells: 1.5, losHeightMeters: 5 },
  cover: { widthCells: 2.5, heightCells: 0.45, losHeightMeters: 1.1 },
  ditch: { widthCells: 4.5, heightCells: 0.55, losHeightMeters: 0.2 },
  crates: { widthCells: 0.75, heightCells: 0.65, losHeightMeters: 1.25 },
  fence: { widthCells: 4, heightCells: 0.25, losHeightMeters: 1.2 },
  post: { widthCells: 0.55, heightCells: 0.55, losHeightMeters: 1.35 },
  logs: { widthCells: 1.25, heightCells: 0.45, losHeightMeters: 0.8 },
  well: { widthCells: 0.7, heightCells: 0.7, losHeightMeters: 1.1 },
  bridge: { widthCells: 2.6, heightCells: 1.1, losHeightMeters: 0.8 },
};

export function getGameEditorDrafts(state: SimulationState): GameEditorDrafts {
  let drafts = draftsByState.get(state);
  if (!drafts) {
    drafts = createDefaultDrafts();
    draftsByState.set(state, drafts);
  }
  return drafts;
}

export function resetObjectDraftForKind(draft: ObjectCreationDraft, kind: MapObjectKind): void {
  const size = OBJECT_SIZE_PRESETS[kind];
  const cover = getDefaultObjectCoverProperties(kind);
  Object.assign(draft, {
    kind,
    name: objectNameForKind(kind),
    widthCells: size.widthCells,
    heightCells: size.heightCells,
    losHeightMeters: size.losHeightMeters,
    coverProtection: cover.coverProtection,
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

function createDefaultDrafts(): GameEditorDrafts {
  const object = {} as ObjectCreationDraft;
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
      speedCellsPerSecond: 0.5,
      facingDegrees: 0,
      viewAngleDegrees: 90,
      viewRangeCells: 7,
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
      radiusCells: 3,
      widthCells: 5,
      heightCells: 3,
      strength: 70,
      suppression: 85,
      stressPerSecond: 18,
      directionDegrees: 0,
      arcDegrees: 50,
      rangeCells: 14,
      minRangeCells: 0,
      falloffPercent: 40,
      enabled: true,
      sourceVisible: true,
      sourceKnown: true,
    },
    terrain: {
      brushShape: 'circle',
      brushSizeCells: 3,
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
