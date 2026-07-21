import assert from 'node:assert/strict';
import { buildCanonicalWorldThreatSet } from '../src/core/knowledge/CanonicalWorldThreat';
import { buildMultiThreatAwarenessWorldField } from '../src/core/knowledge/MultiThreatAwarenessWorldFieldBuilder';
import type { AwarenessWorkerBuildSnapshot } from '../src/core/knowledge/AwarenessWorldWorkerProtocol';
import { normalizeMap } from '../src/core/map/MapModel';
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

const oneThreat = buildMultiThreatAwarenessWorldField(map, snapshot([first], 1));
const twoThreats = buildMultiThreatAwarenessWorldField(map, snapshot([first, second], 2));

const singleDanger = oneThreat.field.danger[targetIndex] ?? 0;
const combinedDanger = twoThreats.field.danger[targetIndex] ?? 0;
assert.ok(singleDanger > 0, 'the open target cell must be threatened by one visible rifleman');
assert.equal(
  combinedDanger,
  Math.min(100, singleDanger * 2),
  `independent rifle threats must add and clamp: one=${singleDanger}, two=${combinedDanger}`,
);
assert.ok(combinedDanger > 78, 'two exposed rifle threats must exceed the default tactical-position danger limit');
assert.equal(
  twoThreats.field.protectedThreatIndex[targetIndex],
  0,
  'protection diagnostics must identify the strongest residual threat, not the best-covered threat',
);

console.log(`soldier danger multi-threat smoke: one=${singleDanger}, two=${combinedDanger}`);

function snapshot(threats: KnownThreatMemory[], jobId: number): AwarenessWorkerBuildSnapshot {
  const canonical = buildCanonicalWorldThreatSet(threats, map.metersPerCell);
  return {
    jobId,
    rasterKey: `raster:${jobId}`,
    canonicalThreatKey: canonical.key,
    mapKey: 'map:test',
    unitId: 'observer',
    posture: 'standing',
    compatibilityOrigin: { x: 4.5, y: 4.5 },
    threats: canonical.threats,
    knowledgeRevision: jobId,
    orderTarget: null,
    finalExact: false,
  };
}

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
