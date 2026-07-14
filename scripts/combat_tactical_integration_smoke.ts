import assert from 'node:assert/strict';
import { applyBallisticCombatEffects, clearCombatSuppression, getCombatSuppressionSnapshot } from '../src/core/combat/CombatSuppression';
import { traceProjectile } from '../src/core/combat/BallisticRaycast';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import { createDefaultNavigationProfileRegistry } from '../src/core/navigation/NavigationProfiles';
import { evaluateNavigationReplan } from '../src/core/navigation/NavigationReplanPolicy';
import { createRouteCostFieldCache, getRouteCostFields, readRouteCostCell } from '../src/core/navigation/RouteCostField';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';
import { advanceReportedContact, advanceVisualContact, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyRealContactBecomesThreat();
verifyHiddenMovementDoesNotLeak();
verifyNearMissCreatesSuppression();
verifyDistantPassHasNegligibleEffect();
verifyCoverReducesSuppression();
verifyRealThreatChangesSafePositions();
verifyRealThreatChangesRouteCostAndReplan();
verifyThreatMemoryDecays();
verifyEvidenceDoesNotDuplicateKnownShooter();
verifyThreatPersistenceDoesNotLeakObjectivePosition();

console.log('Combat tactical integration smoke passed: 10 subjective-contact, suppression, terrain, route, decay, deduplication and persistence checks.');

function verifyRealContactBecomesThreat(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const contact = installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);

  const threat = blue.tacticalKnowledge.threats.find((item) => item.id === `unit:${red.id}`);
  assert.ok(threat, 'a real hostile contact must become a tactical threat');
  assert.equal(threat.x, contact.lastKnownPosition.x);
  assert.equal(threat.y, contact.lastKnownPosition.y);
  assert.equal(threat.confidence, contact.confidence);
  assert.equal(threat.uncertaintyCells, contact.uncertaintyCells);
  assert.equal(threat.source, 'seen');
  assert.equal(threat.visibleNow, true);
  assert.equal(threat.mode, 'directional_fire');
}

function verifyHiddenMovementDoesNotLeak(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const contact = installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const remembered = { ...contact.lastKnownPosition };

  red.position = { x: red.position.x + 8, y: red.position.y + 4 };
  contact.visibleNow = false;
  contact.observedNow = false;
  contact.confidence -= 12;
  contact.uncertaintyCells += 3;
  contact.lastUpdatedSeconds = state.simulationTimeSeconds + 2;
  state.simulationTimeSeconds += 2;
  syncSoldierThreatMemory(state, blue, 2);

  const threat = blue.tacticalKnowledge.threats.find((item) => item.id === `unit:${red.id}`);
  assert.ok(threat);
  assert.deepEqual({ x: threat.x, y: threat.y }, remembered, 'lost target must remain at the observer last-known position');
  assert.notDeepEqual({ x: threat.x, y: threat.y }, red.position, 'objective hidden movement must not enter tactical memory');
  assert.equal(threat.visibleNow, false);
  assert.ok(threat.uncertaintyCells > 1);
}

function verifyNearMissCreatesSuppression(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  blue.position = { x: 12.5, y: 7.5 };
  red.position = { x: 2.5, y: 6.5 };
  clearCombatSuppression(blue);

  traceProjectile(state, {
    shotId: 'near-miss',
    shooterId: red.id,
    origin: metres(state, red.position, 1.45),
    direction: { x: 1, y: 0, z: 0 },
    maximumDistanceMetres: 45,
    muzzleVelocityMetresPerSecond: 865,
  });

  const pressure = getCombatSuppressionSnapshot(blue, state.simulationTimeSeconds);
  assert.ok(pressure.suppression >= 10, 'a two-metre near miss must create noticeable suppression');
  assert.ok(blue.behaviorRuntime.stress > 0, 'near miss must create stress');
  syncSoldierThreatMemory(state, blue, 0.1);
  const unknown = blue.tacticalKnowledge.threats.find((item) => item.id.startsWith('unknown-fire:'));
  assert.ok(unknown, 'an unseen near miss must create an approximate directional threat');
  assert.equal(unknown.mode, 'directional_fire');
  assert.ok(unknown.uncertaintyCells >= 4);
}

function verifyDistantPassHasNegligibleEffect(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  blue.position = { x: 12.5, y: 12.5 };
  red.position = { x: 2.5, y: 2.5 };
  clearCombatSuppression(blue);

  traceProjectile(state, {
    shotId: 'far-pass',
    shooterId: red.id,
    origin: metres(state, red.position, 1.45),
    direction: { x: 1, y: 0, z: 0 },
    maximumDistanceMetres: 45,
    muzzleVelocityMetresPerSecond: 865,
  });

  const pressure = getCombatSuppressionSnapshot(blue, state.simulationTimeSeconds);
  assert.ok(pressure.suppression <= 1, 'a distant trajectory must not create strong suppression');
  syncSoldierThreatMemory(state, blue, 0.1);
  assert.equal(blue.tacticalKnowledge.threats.some((item) => item.id.startsWith('unknown-fire:')), false);
}

function verifyCoverReducesSuppression(): void {
  const state = makeCoverState();
  const shooter = unit(state, 'red-1');
  const open = unit(state, 'blue-open');
  const covered = unit(state, 'blue-covered');
  clearCombatSuppression(open);
  clearCombatSuppression(covered);

  applyBallisticCombatEffects(state, {
    shotId: 'cover-comparison',
    shooterId: shooter.id,
    origin: metres(state, shooter.position, 1.45),
    direction: { x: 1, y: 0, z: 0 },
    travelledMetres: 36,
    impactPoint: { xMetres: 40, yMetres: 13, zMetres: 1.45 },
    hitType: 'none',
    muzzleVelocityMetresPerSecond: 865,
  });

  const openPressure = getCombatSuppressionSnapshot(open, state.simulationTimeSeconds).suppression;
  const coveredPressure = getCombatSuppressionSnapshot(covered, state.simulationTimeSeconds).suppression;
  assert.ok(openPressure > coveredPressure + 2, `cover must attenuate suppression (${openPressure} vs ${coveredPressure})`);
}

function verifyRealThreatChangesSafePositions(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  state.map.objects.push({
    id: 'safe-wall',
    kind: 'structure',
    x: 8,
    y: 4,
    widthCells: 1,
    heightCells: 5,
    rotationRadians: 0,
    losHeightMeters: 2.5,
    coverProtection: 90,
    coverReliability: 95,
    concealment: 15,
    labels: { en: 'Wall', ru: 'Стена' },
  });
  const before = buildSoldierAwarenessReport(state, blue);
  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const after = buildSoldierAwarenessReport(state, blue);

  assert.notEqual(after.cacheKey, before.cacheKey);
  assert.ok(after.threatConfidence > 0);
  assert.ok(after.bestSafePositions.length > 0);
  assert.ok(after.bestSafePositions.some((position) => position.expectedProtection > 0 || position.danger < after.currentPosition.danger));
}

function verifyRealThreatChangesRouteCostAndReplan(): void {
  const state = makeRouteState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const registry = createDefaultNavigationProfileRegistry();
  const profile = registry.getProfile('retreat');
  const cache = createRouteCostFieldCache();
  const start = { ...blue.position };
  const goal = { x: 14.5, y: 4.5 };

  const beforeContext = { unitId: blue.id, originX: blue.position.x, originY: blue.position.y, knowledgeRevision: 0, knownThreats: [] };
  const beforeFields = getRouteCostFields(state.map, profile, beforeContext, cache);
  const beforeDanger = readRouteCostCell(beforeFields, 7, 4)?.dangerCost ?? 0;
  const beforeRoute = findGridPath(state.map, start, goal, { navigationProfile: profile, tacticalContext: beforeContext });
  assert.equal(beforeRoute.ok, true);

  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const afterContext = {
    unitId: blue.id,
    originX: blue.position.x,
    originY: blue.position.y,
    knowledgeRevision: blue.tacticalKnowledge.revision,
    knownThreats: blue.tacticalKnowledge.threats,
  };
  const afterFields = getRouteCostFields(state.map, profile, afterContext, cache);
  const afterDanger = readRouteCostCell(afterFields, 7, 4)?.dangerCost ?? 0;
  const afterRoute = findGridPath(state.map, start, goal, { navigationProfile: profile, tacticalContext: afterContext });
  assert.equal(afterRoute.ok, true);
  assert.ok(afterDanger > beforeDanger, 'real contact must increase route cost in its fire sector');
  if (beforeRoute.ok && afterRoute.ok) {
    assert.ok(afterRoute.cells.some((cell) => cell.y !== 4) || afterRoute.totalCost > beforeRoute.totalCost);
  }

  const replan = evaluateNavigationReplan({
    order: {
      navigationProfileId: profile.id,
      navigationProfileRevision: profile.revision,
      knowledgeRevision: 0,
      lastReplanAtSeconds: 0,
      pathCost: 100,
    },
    profile,
    nowSeconds: 20,
    blocked: false,
    currentProfileRevision: profile.revision,
    currentKnowledgeRevision: Math.max(20, blue.tacticalKnowledge.revision),
    candidateCost: 70,
  });
  assert.equal(replan.reason, 'danger_changed');
  assert.equal(replan.shouldReplace, true);
}

function verifyThreatMemoryDecays(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  blue.position = { x: 12.5, y: 7.5 };
  red.position = { x: 2.5, y: 6.5 };

  traceProjectile(state, {
    shotId: 'decay-shot',
    shooterId: red.id,
    origin: metres(state, red.position, 1.45),
    direction: { x: 1, y: 0, z: 0 },
    maximumDistanceMetres: 45,
    muzzleVelocityMetresPerSecond: 865,
  });
  syncSoldierThreatMemory(state, blue, 0.1);
  const initial = blue.tacticalKnowledge.threats.find((item) => item.id.startsWith('unknown-fire:'));
  assert.ok(initial);
  const initialUncertainty = initial.uncertaintyCells;

  state.simulationTimeSeconds += 20;
  syncSoldierThreatMemory(state, blue, 20);
  const faded = blue.tacticalKnowledge.threats.find((item) => item.id === initial.id);
  assert.ok(!faded || faded.confidence < initial.confidence);
  if (faded) assert.ok(faded.uncertaintyCells > initialUncertainty);

  state.simulationTimeSeconds += 200;
  syncSoldierThreatMemory(state, blue, 200);
  assert.equal(blue.tacticalKnowledge.threats.some((item) => item.id === initial.id), false);
}

function verifyEvidenceDoesNotDuplicateKnownShooter(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const sound = advanceReportedContact(null, {
    id: `perception:unit:${red.id}`,
    stimulusId: `unit:${red.id}`,
    sourceUnitId: red.id,
    labelRu: 'Слышен вражеский стрелок',
    position: { x: red.position.x - 2, y: red.position.y + 1 },
    confidence: 38,
    uncertaintyCells: 8,
    nowSeconds: state.simulationTimeSeconds,
    source: 'sound',
  });
  upsertPerceptionContact(blue.perceptionKnowledge, sound);

  applyBallisticCombatEffects(state, {
    shotId: 'dedupe-shot',
    shooterId: red.id,
    origin: metres(state, red.position, 1.45),
    direction: { x: -1, y: 0, z: 0 },
    travelledMetres: 30,
    impactPoint: { xMetres: 0, yMetres: red.position.y * state.map.metersPerCell, zMetres: 1.45 },
    hitType: 'none',
    muzzleVelocityMetresPerSecond: 865,
  });
  syncSoldierThreatMemory(state, blue, 0.1);
  installVisualContact(blue, red, state.simulationTimeSeconds + 1);
  state.simulationTimeSeconds += 1;
  syncSoldierThreatMemory(state, blue, 1);

  assert.equal(blue.tacticalKnowledge.threats.filter((item) => item.id === `unit:${red.id}`).length, 1);
  assert.equal(blue.tacticalKnowledge.threats.filter((item) => item.id.startsWith('unknown-fire:')).length, 0);
}

function verifyThreatPersistenceDoesNotLeakObjectivePosition(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const contact = installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const remembered = { ...contact.lastKnownPosition };
  const confidence = blue.tacticalKnowledge.threats[0].confidence;
  const uncertainty = blue.tacticalKnowledge.threats[0].uncertaintyCells;
  red.position = { x: red.position.x + 6, y: red.position.y + 3 };

  const exported = buildExportedScene(state);
  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(imported.map, imported.units, imported.pressureZones);
  const restoredBlue = unit(restored, 'blue-1');
  const restoredRed = unit(restored, 'red-1');
  const threat = restoredBlue.tacticalKnowledge.threats.find((item) => item.id === 'unit:red-1');
  assert.ok(threat);
  assert.deepEqual({ x: threat.x, y: threat.y }, remembered);
  assert.notDeepEqual({ x: threat.x, y: threat.y }, restoredRed.position);
  assert.equal(threat.confidence, confidence);
  assert.equal(threat.uncertaintyCells, uncertainty);
}

function installVisualContact(observer: UnitModel, target: UnitModel, nowSeconds: number) {
  const id = `perception:unit:${target.id}`;
  const previous = observer.perceptionKnowledge.contacts.find((item) => item.id === id) ?? null;
  const contact = advanceVisualContact(previous, {
    id,
    stimulusId: `unit:${target.id}`,
    sourceUnitId: target.id,
    labelRu: target.labels.ru,
    position: { ...target.position },
    evidencePerSecond: 180,
    deltaSeconds: 1,
    nowSeconds,
    source: 'visual',
  });
  upsertPerceptionContact(observer.perceptionKnowledge, contact);
  return contact;
}

function makeState(): SimulationState {
  return createInitialState({
    width: 30,
    height: 16,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'blue-1', label: 'Blue', labelRu: 'Синий', type: 'infantry_squad', side: 'blue', x: 5, y: 6, facingDegrees: 0, viewRangeCells: 30 },
    { id: 'red-1', label: 'Red', labelRu: 'Красный', type: 'infantry_squad', side: 'red', x: 14, y: 6, facingDegrees: 180, viewRangeCells: 30 },
  ]);
}

function makeCoverState(): SimulationState {
  return createInitialState({
    width: 24,
    height: 14,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [{
      id: 'cover-wall',
      kind: 'structure',
      x: 7.5,
      y: 7,
      widthCells: 1,
      heightCells: 1.5,
      rotationDegrees: 0,
      losHeightMeters: 2.5,
      coverProtection: 95,
      coverReliability: 100,
      concealment: 10,
      label: 'Wall',
      labelRu: 'Стена',
    }],
  }, [
    { id: 'red-1', label: 'Shooter', type: 'infantry_squad', side: 'red', x: 2, y: 6 },
    { id: 'blue-open', label: 'Open', type: 'infantry_squad', side: 'blue', x: 10, y: 5 },
    { id: 'blue-covered', label: 'Covered', type: 'infantry_squad', side: 'blue', x: 10, y: 7 },
  ]);
}

function makeRouteState(): SimulationState {
  return createInitialState({
    width: 15,
    height: 9,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'blue-1', label: 'Mover', type: 'infantry_squad', side: 'blue', x: 0, y: 4, navigationProfileId: 'retreat' },
    { id: 'red-1', label: 'Threat', type: 'infantry_squad', side: 'red', x: 7, y: 4 },
  ]);
}

function unit(state: SimulationState, id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}

function metres(state: SimulationState, position: { x: number; y: number }, zMetres: number) {
  return {
    xMetres: position.x * state.map.metersPerCell,
    yMetres: position.y * state.map.metersPerCell,
    zMetres,
  };
}
