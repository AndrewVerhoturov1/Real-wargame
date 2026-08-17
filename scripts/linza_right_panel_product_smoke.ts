import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { getActiveEnvironmentProfile } from '../src/core/map/EnvironmentProfileRuntime';
import { getSurfaceMaterial, getVegetationMaterial } from '../src/core/map/EnvironmentMaterialProfile';
import { getCell, type TacticalMapData } from '../src/core/map/MapModel';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../src/core/perception/AttentionController';
import { advanceReportedContact, createEmptyPerceptionKnowledge, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { applyAttentionProfileToUnit } from '../src/core/perception/AttentionProfiles';
import { getAttentionProfileRegistry } from '../src/core/perception/AttentionProfileStorage';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { getMapObjectSpatialIndex, getMapObjectSpatialIndexDiagnostics } from '../src/core/spatial/MapObjectSpatialIndex';
import { getDirectionalTerrainStaticGrid } from '../src/core/terrain/DirectionalTerrainStaticGrid';
import { sampleSmoothHeightLevel } from '../src/core/terrain/SmoothTerrain';
import type { UnitData } from '../src/core/units/UnitModel';

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

// Info: exercise the existing product owners rather than a LINZA-owned read store.
const point = { x: 8.5, y: 8.5 };
const cell = getCell(state.map, 8, 8);
assert.ok(cell, 'canonical map owner must resolve the inspected cell');
assert.equal(sampleSmoothHeightLevel(state.map, point.x, point.y), 0, 'height must come from SmoothTerrain');
const directional = getDirectionalTerrainStaticGrid(state.map);
const terrainIndex = 8 * state.map.width + 8;
assert.ok(Number.isFinite(directional.slopeMagnitude[terrainIndex]), 'prepared terrain owner must publish a finite slope');
const environment = getActiveEnvironmentProfile();
const surface = getSurfaceMaterial(environment, cell.surfaceMaterialId);
const vegetation = getVegetationMaterial(environment, cell.vegetationMaterialId);
assert.equal(typeof surface.movement.passable, 'boolean');
assert.ok(Number.isFinite(surface.movement.resistance));
assert.ok(Number.isFinite(vegetation.visibility.targetConcealment));

const objectIndex = getMapObjectSpatialIndex(state.map);
assert.deepEqual(objectIndex.queryCircle(point, 2).map((item) => item.id), ['near-tree']);
const objectDiagnostics = getMapObjectSpatialIndexDiagnostics(state.map);
assert.equal(objectDiagnostics.queryCount, 1, 'Info should be able to use one local prepared object query');
assert.equal(objectDiagnostics.lastCandidateCount, 1, 'local query must not return the far object');

// Attention: use existing production write functions and read back the same UnitModel.
const registry = getAttentionProfileRegistry();
assert.equal(registry.hasProfile('observer'), true);
applyAttentionProfileToUnit(observer, registry.getProfile('observer'));
assert.equal(observer.playerAttentionProfileId, 'observer');

setAttentionMode(observer, 'march', 'player');
assert.equal(observer.attentionRuntime.mode, 'march');
assert.equal(observer.attentionRuntime.modeSource, 'player');

setSearchSector(observer, Math.PI / 3, Math.PI / 2, 'player');
assert.equal(observer.attentionRuntime.mode, 'search');
assert.equal(observer.attentionRuntime.modeSource, 'player');
assert.ok(Math.abs(observer.attentionRuntime.searchCenterRadians - Math.PI / 3) < 1e-9);
assert.ok(Math.abs(observer.attentionRuntime.searchArcRadians - Math.PI / 2) < 1e-9);

clearAttentionOverride(observer);
assert.equal(observer.attentionRuntime.modeSource, 'automatic');

// Memory: reported information stays inside the existing perception knowledge owner.
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
upsertPerceptionContact(observer.perceptionKnowledge, reported);
assert.equal(observer.perceptionKnowledge.contacts.length, 1);
assert.equal(observer.perceptionKnowledge.contacts[0]!.source, 'reported');
assert.deepEqual(observer.perceptionKnowledge.contacts[0]!.lastKnownPosition, { x: 12, y: 10 });

// Revision boundary: LINZA must not own history, front semantics or recurring SimulationTick work.
for (const forbiddenPath of [
  'src/core/knowledge/EstimatedFront.ts',
  'src/core/knowledge/UnitKnowledgeHistory.ts',
  'src/core/knowledge/UnitMemoryReadModel.ts',
  'src/core/map/MapInfoReadModel.ts',
  'src/core/perception/AttentionCommands.ts',
  'src/core/perception/AttentionReadModel.ts',
]) {
  assert.equal(existsSync(forbiddenPath), false, `contract-only LINZA revision must not ship ${forbiddenPath}`);
}
const simulationTickSource = readFileSync('src/core/simulation/SimulationTick.ts', 'utf8');
assert.doesNotMatch(simulationTickSource, /UnitKnowledgeHistory|recordSimulationKnowledgeHistory/);

console.log('LINZA_RIGHT_PANEL_CONTRACT_SMOKE_OK: canonical Info/Attention/Memory owners exercised; no LINZA history/front/runtime owner remains.');
