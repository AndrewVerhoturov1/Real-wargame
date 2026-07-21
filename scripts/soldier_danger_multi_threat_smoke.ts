import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import { getSoldierDangerField } from '../src/core/knowledge/SoldierDangerField';
import type { KnownThreatMemory } from '../src/core/units/UnitModel';

const map = normalizeMap({
  width: 9,
  height: 9,
  cellSize: 4,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
});

const first = rifleThreat('unit:enemy-a', 2.5, 3.5);
const second = rifleThreat('unit:enemy-b', 2.5, 5.5);
const targetIndex = 4 * map.width + 5;

const oneThreat = getSoldierDangerField(map, {
  unitId: 'observer',
  posture: 'standing',
  knowledgeRevision: 1,
  threats: [first],
});
const twoThreats = getSoldierDangerField(map, {
  unitId: 'observer',
  posture: 'standing',
  knowledgeRevision: 2,
  threats: [first, second],
});

const singleDanger = oneThreat.danger[targetIndex] ?? 0;
const combinedDanger = twoThreats.danger[targetIndex] ?? 0;
assert.ok(singleDanger > 0, 'the open target cell must be threatened by one visible rifleman');
assert.ok(
  combinedDanger > singleDanger + 5,
  `two independent riflemen must increase danger: one=${singleDanger}, two=${combinedDanger}`,
);

console.log(`soldier danger multi-threat smoke: one=${singleDanger}, two=${combinedDanger}`);

function rifleThreat(id: string, x: number, y: number): KnownThreatMemory {
  return {
    id,
    labelRu: id,
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 80,
    suppression: 0,
    stressPerSecond: 0,
    directionDegrees: 0,
    arcDegrees: 360,
    rangeCells: 30,
    minRangeCells: 0,
    falloffPercent: 0,
    confidence: 100,
    uncertaintyCells: 0,
    source: 'seen',
    visibleNow: true,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
    fireThreatClass: 'rifle_fire',
  };
}
