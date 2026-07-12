import assert from 'node:assert/strict';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import type { PressureZoneData } from '../src/core/pressure/PressureZone';
import { createResolutionAwareInitialState } from '../src/core/simulation/ResolutionAwareScene';
import type { UnitData } from '../src/core/units/UnitModel';

const mapData: TacticalMapData = {
  width: 4,
  height: 2,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  cells: [{ x: 1, y: 0, terrain: 'rough', height: 2, forest: 1 }],
  objects: [{
    id: 'legacy-cover',
    kind: 'cover',
    x: 1,
    y: 0,
    widthCells: 2,
    heightCells: 1,
  }],
};

const units: UnitData[] = [{
  id: 'legacy-unit',
  label: 'Legacy unit',
  labelRu: 'Старый боец',
  type: 'infantry_squad',
  side: 'player',
  x: 1,
  y: 0,
  speedCellsPerSecond: 0.5,
  viewRangeCells: 7,
  tacticalKnowledge: {
    revision: 1,
    threats: [{
      id: 'remembered',
      labelRu: 'Запомненная угроза',
      mode: 'area',
      x: 2,
      y: 1,
      radiusCells: 2,
      widthCells: 0,
      heightCells: 0,
      rotationDegrees: 0,
      strength: 50,
      suppression: 40,
      stressPerSecond: 10,
      directionDegrees: 0,
      arcDegrees: 360,
      rangeCells: 4,
      minRangeCells: 0,
      falloffPercent: 25,
      confidence: 70,
      uncertaintyCells: 1,
      source: 'reported',
      visibleNow: false,
      lastSeenSeconds: -1,
      lastUpdatedSeconds: 0,
    }],
    lastUpdatedSeconds: 0,
  },
}];

const zones: PressureZoneData[] = [{
  id: 'legacy-zone',
  label: 'Legacy zone',
  labelRu: 'Старая зона',
  type: 'open_area_pressure',
  shape: 'circle',
  x: 2,
  y: 1,
  radiusCells: 3,
  strength: 50,
  stressPerSecond: 12,
  reason: 'Legacy source',
  reasonRu: 'Старый источник',
}];

const state = createResolutionAwareInitialState(mapData, units, zones);
const { map } = state;

assert.equal(map.width, 20);
assert.equal(map.height, 10);
assert.equal(map.cellSize, 4.8);
assert.equal(map.metersPerCell, 2);
assert.equal(map.sourceToRuntimeCellScale, 5);
assert.equal(map.width * map.metersPerCell, 40);
assert.equal(map.height * map.metersPerCell, 20);
assert.equal(map.width * map.cellSize, 96);
assert.equal(map.height * map.cellSize, 48);

for (let y = 0; y < 5; y += 1) {
  for (let x = 5; x < 10; x += 1) {
    const cell = getCell(map, x, y);
    assert.equal(cell?.terrain, 'rough');
    assert.equal(cell?.height, 2);
    assert.equal(cell?.forest, 1);
  }
}
assert.equal(getCell(map, 4, 0)?.terrain, 'field');
assert.equal(getCell(map, 10, 0)?.terrain, 'field');

const object = map.objects[0];
assert.equal(object.x, 7);
assert.equal(object.y, 2);
assert.equal(object.widthCells, 10);
assert.equal(object.heightCells, 5);
assert.equal((object.x + 0.5) * map.cellSize, (1 + 0.5) * 24);
assert.equal((object.y + 0.5) * map.cellSize, (0 + 0.5) * 24);
assert.equal(object.widthCells * map.cellSize, 2 * 24);
assert.equal(object.heightCells * map.cellSize, 1 * 24);

const unit = state.units[0];
assert.equal(unit.position.x, 7.5);
assert.equal(unit.position.y, 2.5);
assert.equal(unit.position.x * map.cellSize, (1 + 0.5) * 24);
assert.equal(unit.position.y * map.cellSize, (0 + 0.5) * 24);
assert.equal(unit.speedCellsPerSecond, 2.5);
assert.equal(unit.speedCellsPerSecond * map.metersPerCell, 5);
assert.equal(unit.viewRangeCells, 35);
assert.equal(unit.viewRangeCells * map.metersPerCell, 70);
assert.equal(unit.tacticalKnowledge.threats[0].x, 10);
assert.equal(unit.tacticalKnowledge.threats[0].radiusCells, 10);
assert.equal(unit.tacticalKnowledge.threats[0].uncertaintyCells, 5);

const zone = state.pressureZones[0];
assert.equal(zone.x, 10);
assert.equal(zone.y, 5);
assert.equal(zone.radiusCells, 15);
assert.equal(zone.x * map.cellSize, 2 * 24);
assert.equal(zone.y * map.cellSize, 1 * 24);
assert.equal(zone.radiusCells * map.metersPerCell, 30);

assert.equal(state.editor.zoneRadiusCells * map.metersPerCell, 30);
assert.equal(state.editor.zoneWidthCells * map.metersPerCell, 50);
assert.equal(state.editor.zoneHeightCells * map.metersPerCell, 30);
assert.equal(state.editor.objectWidthCells * map.metersPerCell, 2);
assert.equal(state.editor.objectHeightCells * map.metersPerCell, 2);

const nativeTwoMeterState = createResolutionAwareInitialState({
  width: 20,
  height: 10,
  cellSize: 4.8,
  metersPerCell: 2,
  defaultTerrain: 'field',
}, [], []);
assert.equal(nativeTwoMeterState.map.width, 20);
assert.equal(nativeTwoMeterState.map.height, 10);
assert.equal(nativeTwoMeterState.map.sourceToRuntimeCellScale, 1);

console.log('Map resolution migration smoke passed: 10m source expands to 2m runtime with physical and pixel geometry preserved.');
