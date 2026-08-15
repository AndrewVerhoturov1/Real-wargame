import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const requireText = (source, token, message) => {
  if (!source.includes(token)) throw new Error(message ?? `Missing token: ${token}`);
};
const forbidText = (source, token, message) => {
  if (source.includes(token)) throw new Error(message ?? `Forbidden token: ${token}`);
};

const info = read('src/core/map/MapInfoReadModel.ts');
requireText(info, 'getDirectionalTerrainStaticGrid', 'Info must use the canonical prepared terrain slope owner.');
requireText(info, 'circleIntersectsMapObject', 'Info must use canonical object geometry for nearby objects.');
requireText(info, 'targetConcealment', 'Info must expose concealment without inventing a replacement score.');
requireText(info, 'maximumFireProtection', 'Info must expose real vegetation protection inputs.');

const attentionRead = read('src/core/perception/AttentionReadModel.ts');
for (const token of ['focus', 'direct', 'peripheral', 'rear', 'distanceFalloffStartMeters', 'perceptionRevision', 'displayPosition', 'linkedUnitId']) {
  requireText(attentionRead, token);
}
forbidText(attentionRead, 'evaluatePointVisibility', 'Attention read model must not calculate LOS/visibility.');
forbidText(attentionRead, 'getVisibilityGeometryField', 'Attention read model must not calculate visibility geometry.');

const attentionCommands = read('src/core/perception/AttentionCommands.ts');
for (const token of ['applyAttentionProfileToUnit', 'setAttentionMode', 'setSearchSector', 'clearAttentionOverride']) {
  requireText(attentionCommands, token);
}

const memory = read('src/core/knowledge/UnitMemoryReadModel.ts');
for (const token of ['confirmed_contact', 'last_known', 'supposition', 'intelligence', 'estimated_front', 'viewTimeSeconds']) {
  requireText(memory, token);
}
forbidText(memory, 'areUnitsHostile', 'Memory projection must not derive knowledge from objective hostile-unit lookup.');

const front = read('src/core/knowledge/EstimatedFront.ts');
requireText(front, 'estimateSubjectiveFront');
forbidText(front, 'SimulationState', 'Front estimator must only accept subjective evidence.');
forbidText(front, 'state.units', 'Front estimator must never inspect objective units.');

const history = read('src/core/knowledge/UnitKnowledgeHistory.ts');
requireText(history, 'recordSimulationKnowledgeHistory');
requireText(history, 'readUnitKnowledgeAt');
requireText(history, 'recordedAtSeconds <= target + 1e-9', 'Historical lookup must select only snapshots at or before viewTime.');
requireText(history, 'receivedNewNonVisualInformation');

const tick = read('src/core/simulation/SimulationTick.ts');
const calls = [...tick.matchAll(/recordSimulationKnowledgeHistory\(state\)/g)];
if (calls.length !== 2) throw new Error(`Expected exactly two knowledge-history boundaries per tick, found ${calls.length}.`);
const legacyCall = tick.indexOf('tickSimulationLegacy(state, deltaSeconds)');
if (!(calls[0].index < legacyCall && calls[1].index > legacyCall)) {
  throw new Error('Knowledge history must be recorded before and after the legacy simulation tick.');
}

for (const source of [info, attentionRead, attentionCommands, memory, front, history]) {
  forbidText(source, 'window.', 'Core LINZA contracts must not depend on browser globals.');
  forbidText(source, 'localStorage', 'Core LINZA contracts must not create UI-owned persistence.');
}

console.log('LINZA_RIGHT_PANEL_PRODUCT_SMOKE_OK');
