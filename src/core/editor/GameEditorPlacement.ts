import type { GridPosition } from '../geometry';
import { clampGridPositionToMap, type MapObject } from '../map/MapModel';
import { normalizePressureZones } from '../pressure/PressureZone';
import { selectUnit, type SimulationState } from '../simulation/SimulationState';
import { rememberSelectedUnitForTest } from '../testing/AiTestLabRuntime';
import { normalizeUnits } from '../units/UnitModel';
import { cloneAttentionSettings, getGameEditorDrafts, syncLegacyEditorFields } from './GameEditorDrafts';

export function placeConfiguredEditorEntity(state: SimulationState, rawGrid: GridPosition): boolean {
  const tool = String(state.editor.tool);
  if (tool !== 'spawn_object' && tool !== 'spawn_unit' && tool !== 'spawn_zone') return false;

  const grid = clampGridPositionToMap(state.map, rawGrid);
  const drafts = getGameEditorDrafts(state);
  syncLegacyEditorFields(state);

  if (tool === 'spawn_object') {
    const draft = drafts.object;
    const allocation = allocateUniqueEditorId(
      'editor_object_',
      state.editor.nextObjectIndex,
      state.map.objects.map((object) => object.id),
    );
    const id = allocation.id;
    const object: MapObject = {
      id,
      kind: draft.kind,
      x: grid.x - draft.widthCells / 2,
      y: grid.y - draft.heightCells / 2,
      rotationRadians: degreesToRadians(draft.rotationDegrees),
      widthCells: draft.widthCells,
      heightCells: draft.heightCells,
      losHeightMeters: draft.losHeightMeters,
      coverProtection: draft.coverProtection,
      coverReliability: draft.coverReliability,
      concealment: draft.concealment,
      penetrable: draft.penetrable,
      coverPosture: draft.coverPosture,
      labels: { en: draft.name || id, ru: draft.name || id },
    };
    state.map.objects.push(object);
    state.editor.nextObjectIndex = allocation.nextIndex;
    state.editor.selectedObjectId = id;
    state.editor.selectedZoneId = null;
    selectUnit(state, null);
    state.editor.lastMessage = `Создан предмет «${object.labels?.ru ?? id}» со всеми заданными параметрами.`;
    return true;
  }

  if (tool === 'spawn_unit') {
    const draft = drafts.unit;
    const allocation = allocateUniqueEditorId(
      'editor_unit_',
      state.editor.nextUnitIndex,
      state.units.map((unit) => unit.id),
    );
    const id = allocation.id;
    const unit = normalizeUnits([{
      id,
      label: draft.name || id,
      labelRu: draft.name || id,
      type: draft.type,
      side: draft.side,
      aiControl: 'graph',
      x: grid.x - 0.5,
      y: grid.y - 0.5,
      speedCellsPerSecond: draft.speedCellsPerSecond,
      heldItem: draft.heldItem,
      facingDegrees: draft.facingDegrees,
      viewAngleDegrees: draft.attention.profiles.observe.directAngleDegrees,
      viewRangeCells: draft.viewRangeCells,
      behaviorProfile: draft.profile,
      attention: cloneAttentionSettings(draft.attention),
      soldier: {
        traits: { ...draft.traits },
        condition: { ...draft.condition },
      },
      initialState: {
        posture: draft.posture,
        stress: draft.stress,
        suppression: draft.suppression,
        ammo: Math.round(draft.ammo),
        weaponReady: draft.weaponReady,
        fatigue: draft.condition.fatigue,
        morale: draft.condition.morale,
        confusion: draft.condition.confusion,
        health: draft.condition.health,
      },
    }])[0];
    state.units.push(unit);
    state.editor.nextUnitIndex = allocation.nextIndex;
    state.editor.selectedObjectId = null;
    state.editor.selectedZoneId = null;
    selectUnit(state, id);
    rememberSelectedUnitForTest(state);
    state.editor.lastMessage = `Создан боец «${unit.labels.ru}» · ${unit.side === 'red' ? 'Противник' : 'Свои'} · профиль ${unit.behaviorProfile}.`;
    return true;
  }

  const draft = drafts.threat;
  const allocation = allocateUniqueEditorId(
    'editor_zone_',
    state.editor.nextZoneIndex,
    state.pressureZones.map((zone) => zone.id),
  );
  const id = allocation.id;
  const zone = normalizePressureZones([{
    id,
    label: draft.name || id,
    labelRu: draft.name || id,
    type: 'debug',
    shape: draft.shape,
    mode: draft.mode,
    x: grid.x,
    y: grid.y,
    radiusCells: draft.radiusCells,
    widthCells: draft.widthCells,
    heightCells: draft.heightCells,
    rotationDegrees: draft.rotationDegrees,
    strength: draft.strength,
    suppression: draft.suppression,
    stressPerSecond: draft.stressPerSecond,
    directionDegrees: draft.directionDegrees,
    arcDegrees: draft.arcDegrees,
    rangeCells: draft.rangeCells,
    minRangeCells: draft.minRangeCells,
    falloffPercent: draft.falloffPercent,
    enabled: draft.enabled,
    sourceVisible: draft.sourceVisible,
    sourceKnown: draft.sourceKnown,
    knowledgeConfidence: draft.knowledgeConfidence,
    uncertaintyCells: draft.uncertaintyCells,
    reason: 'Editor-created threat source.',
    reasonRu: 'Источник угрозы создан в игровом редакторе.',
  }])[0];
  state.pressureZones.push(zone);
  state.editor.nextZoneIndex = allocation.nextIndex;
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = id;
  selectUnit(state, null);
  state.editor.lastMessage = `Создана угроза «${zone.labels.ru}» со всеми заданными параметрами.`;
  return true;
}

function allocateUniqueEditorId(
  prefix: string,
  requestedIndex: number,
  existingIds: readonly (string | undefined)[],
): { id: string; nextIndex: number } {
  const occupied = new Set(existingIds.filter((id): id is string => Boolean(id)));
  let index = Math.max(0, Math.floor(requestedIndex));
  while (occupied.has(`${prefix}${index}`)) index += 1;
  return { id: `${prefix}${index}`, nextIndex: index + 1 };
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
