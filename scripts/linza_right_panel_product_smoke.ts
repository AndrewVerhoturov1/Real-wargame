import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { advanceReportedContact, createEmptyPerceptionKnowledge, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { getMapObjectSpatialIndexDiagnostics } from '../src/core/spatial/MapObjectSpatialIndex';
import type { TacticalMapData } from '../src/core/map/MapModel';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  applyPolygonAttentionProfile,
  clearPolygonAttentionOverride,
  preparePolygonInfoLiveOwners,
  readPolygonAttentionLive,
  readPolygonInfoLive,
  readPolygonMemoryLive,
  setPolygonAttentionMode,
  setPolygonSearchSector,
} from '../src/combat-lab/right-panel/PolygonRightPanelLive';

const mapData: TacticalMapData = {
  width: 24,
  height: 16,
  cellSize: 16,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [
    { id: 'near-tree', kind: 'tree', x: 8, y: 8 },
    { id: 'far-tree', kind: 'tree', x: 20, y: 14 },
  ],
};

const observerData: UnitData = {
  id: 'observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'scout_team',
  side: 'player',
  x: 7,
  y: 8,
  facingDegrees: 0,
  viewRangeCells: 20,
  behaviorProfile: 'regular',
};

const state = createInitialState(mapData, [observerData]);
const observer = state.units[0]!;

// Info: prepare heavy canonical owners before the pointer path, then perform one local query.
const preparedInfo = preparePolygonInfoLiveOwners(state);
const beforeQuery = getMapObjectSpatialIndexDiagnostics(state.map);
const info = readPolygonInfoLive(state, { x: 8.5, y: 8.5, pinned: false }, preparedInfo);
const afterQuery = getMapObjectSpatialIndexDiagnostics(state.map);
assert.equal(info.availability, 'available');
assert.equal(info.cellX, 8);
assert.equal(info.cellY, 8);
assert.equal(info.surfaceNameRu, 'Поле');
assert.equal(info.passable, true);
assert.equal(info.surfaceResistance, 1);
assert.equal(info.vegetationResistance, 1);
assert.equal(info.nearbyObjects.length, 1);
assert.equal(info.nearbyObjects[0]!.id, 'near-tree');
assert.equal(info.nearbyUnits.availability, 'unavailable', 'hover path must not scan every unit without a bounded owner');
assert.equal(info.danger.availability, 'unavailable', 'missing danger contract must stay explicitly unavailable');
assert.equal(afterQuery.queryCount, beforeQuery.queryCount + 1, 'Info must use one local prepared object query');
assert.equal(afterQuery.lastCandidateCount, 1, 'local query must exclude the far object');

// Attention: every write goes through the product functions wrapped by the thin adapter, then reads back UnitModel.
let attention = readPolygonAttentionLive(state, observer.id);
assert.equal(attention.availability, 'available');
attention = applyPolygonAttentionProfile(state, observer.id, 'observer');
assert.equal(attention.profileId, 'observer');
assert.equal(observer.playerAttentionProfileId, 'observer');

attention = setPolygonAttentionMode(state, observer.id, 'march');
assert.equal(attention.mode, 'march');
assert.equal(attention.modeSource, 'player');
assert.equal(observer.attentionRuntime.mode, 'march');

attention = setPolygonSearchSector(state, observer.id, 60, 90);
assert.equal(attention.mode, 'search');
assert.equal(attention.modeSource, 'player');
assert.ok(Math.abs((attention.searchCenterDegrees ?? 0) - 60) < 1e-9);
assert.ok(Math.abs((attention.searchArcDegrees ?? 0) - 90) < 1e-9);

attention = clearPolygonAttentionOverride(state, observer.id);
assert.equal(attention.modeSource, 'automatic');
assert.equal(observer.attentionRuntime.modeSource, 'automatic');

// Memory: use only the selected soldier's canonical perception knowledge. Reported data remains intel provenance.
observer.perceptionKnowledge = createEmptyPerceptionKnowledge();
const reported = advanceReportedContact(null, {
  id: 'reported-contact',
  stimulusId: 'report:reported-contact',
  labelRu: 'Доложенный контакт',
  position: { x: 12, y: 10 },
  confidence: 55,
  uncertaintyCells: 3,
  nowSeconds: 5,
  source: 'reported',
  explanationRu: ['Положение получено из доклада.'],
});
const sound = advanceReportedContact(null, {
  id: 'sound-contact',
  stimulusId: 'sound:sound-contact',
  labelRu: 'Источник звука',
  position: { x: 6, y: 3 },
  confidence: 30,
  uncertaintyCells: 5,
  nowSeconds: 6,
  source: 'sound',
  explanationRu: ['Слышен звук.'],
});
upsertPerceptionContact(observer.perceptionKnowledge, reported);
upsertPerceptionContact(observer.perceptionKnowledge, sound);
state.simulationTimeSeconds = 8;
const memory = readPolygonMemoryLive(state, observer.id);
assert.equal(memory.availability, 'available');
assert.equal(memory.intelCount, 1);
assert.equal(memory.assumptionCount, 1);
assert.equal(memory.contacts.find((item) => item.id === 'reported-contact')?.kind, 'intel');
assert.equal(memory.contacts.find((item) => item.id === 'sound-contact')?.kind, 'assumption');
assert.equal(memory.estimatedFront.availability, 'unavailable');
assert.deepEqual(memory.contacts.find((item) => item.id === 'reported-contact')?.lastKnownPosition, { x: 12, y: 10 });

// Ownership boundary: no LINZA history/front/read-model/selection/runtime owner and no recurring UI loop.
for (const forbiddenPath of [
  'src/core/knowledge/EstimatedFront.ts',
  'src/core/knowledge/UnitKnowledgeHistory.ts',
  'src/core/knowledge/UnitMemoryReadModel.ts',
  'src/core/map/MapInfoReadModel.ts',
  'src/core/perception/AttentionCommands.ts',
  'src/core/perception/AttentionReadModel.ts',
]) {
  assert.equal(existsSync(forbiddenPath), false, `LINZA must not ship ${forbiddenPath}`);
}
const simulationTickSource = readFileSync('src/core/simulation/SimulationTick.ts', 'utf8');
assert.doesNotMatch(simulationTickSource, /UnitKnowledgeHistory|recordSimulationKnowledgeHistory/);
const liveSource = readFileSync('src/combat-lab/right-panel/PolygonRightPanelLive.ts', 'utf8');
assert.doesNotMatch(liveSource, /buildBlackboardForUnit|SimulationTick|selectedUnitId\s*=|new\s+MapObjectSpatialIndex/);
assert.match(liveSource, /preparePolygonInfoLiveOwners/);
assert.match(liveSource, /nearbyUnits:\s*\{\s*availability:\s*'unavailable'/);
const viewSource = readFileSync('src/combat-lab/right-panel/PolygonRightPanelLiveView.ts', 'utf8');
assert.doesNotMatch(viewSource, /setInterval|requestAnimationFrame|CombatLabSelectionController/);
assert.match(viewSource, /getAttentionContext/);
assert.match(viewSource, /applyPolygonAttentionProfile/);
assert.match(viewSource, /setPolygonSearchSector/);
const cssSource = readFileSync('src/combat-lab/right-panel/polygon-right-panel-live.css', 'utf8');
assert.match(cssSource, /\.polygon-linza-card\s*\{[^}]*border-radius:\s*6px/s);
assert.match(cssSource, /\.polygon-linza-memory-entry/);

console.log('LINZA_RIGHT_PANEL_LIVE_SMOKE_OK: bounded Info + canonical Attention write/readback + subjective Memory; no second owner/history/front.');
