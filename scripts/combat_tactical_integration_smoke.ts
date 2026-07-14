import assert from 'node:assert/strict';
import { buildBlackboardForUnit } from '../src/core/ai/AiGameBridge';
import { traceProjectile } from '../src/core/combat/BallisticRaycast';
import { applyBallisticCombatEffects, clearCombatSuppression, getCombatSuppressionSnapshot } from '../src/core/combat/CombatSuppression';
import { recordCombatThreatEvidence, type CombatThreatEvidence } from '../src/core/combat/CombatThreatEvidence';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { normalizeTacticalKnowledge, syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import { createDefaultNavigationProfileRegistry } from '../src/core/navigation/NavigationProfiles';
import { evaluateNavigationReplan } from '../src/core/navigation/NavigationReplanPolicy';
import { createRouteCostFieldCache, getRouteCostFields, readRouteCostCell } from '../src/core/navigation/RouteCostField';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';
import { advanceReportedContact, advanceVisualContact, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { evaluateThreatsAtPosition } from '../src/core/pressure/ThreatEvaluation';
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
verifyEvidenceSuppressionSurvivesContactRefreshAndDecays();
verifyRepeatedUnknownFireMergesAcrossTicks();
verifyBucketBoundaryUnknownFireMerges();
verifyDifferentUnknownFireDirectionsStaySeparate();
verifyDetectedShooterAliasesUnknownEvidence();
verifyThreatEvidenceRoundTripAndLegacyNormalization();
verifyPressureZoneSuppressionRemainsIndependent();

console.log('Combat tactical integration smoke passed: 17 subjective contact, evidence memory, suppression, merge, alias, persistence, terrain and route checks.');

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
  assert.ok(threat.strength > 0, 'an armed hostile contact must retain potential danger');
  assert.equal(threat.suppression, 0, 'ordinary contact must not create suppression in tactical memory');
  assert.equal(threat.stressPerSecond, 0, 'ordinary contact must not create combat-evidence stress');
  assert.equal(threat.evidenceCount, 0);

  const factual = evaluateThreatsAtPosition(state.map, blue, state.pressureZones);
  assert.ok(factual.danger > 0, 'the factual threat report must retain contact danger');
  assert.equal(factual.suppression, 0, 'the factual threat report must expose zero contact suppression');
  const awareness = buildSoldierAwarenessReport(state, blue);
  assert.ok(awareness.currentPosition.danger > 0, 'awareness must retain contact danger');
  assert.equal(awareness.currentPosition.suppression, 0, 'awareness must expose zero contact suppression');
  const blackboard = buildBlackboardForUnit(state, blue);
  assert.ok(typeof blackboard.danger === 'number' && blackboard.danger > 0);
  assert.equal(blackboard.suppression, 0, 'the existing graph-ready Blackboard surface must expose zero contact suppression');
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

  const incomingDx = blue.position.x - red.position.x;
  const incomingDy = blue.position.y - red.position.y;
  const incomingLength = Math.max(0.001, Math.hypot(incomingDx, incomingDy));
  const incomingDirection = { x: incomingDx / incomingLength, y: incomingDy / incomingLength, z: 0 };
  const impactGrid = {
    x: blue.position.x + incomingDirection.x * 4,
    y: blue.position.y + incomingDirection.y * 4,
  };
  const metresPerCell = state.map.metersPerCell;
  applyBallisticCombatEffects(state, {
    shotId: 'lost-known-shooter-fire',
    shooterId: red.id,
    origin: metres(state, red.position, 1.45),
    direction: incomingDirection,
    travelledMetres: Math.hypot(impactGrid.x - red.position.x, impactGrid.y - red.position.y) * metresPerCell,
    impactPoint: {
      xMetres: impactGrid.x * metresPerCell,
      yMetres: impactGrid.y * metresPerCell,
      zMetres: 1.45,
    },
    hitType: 'none',
    muzzleVelocityMetresPerSecond: 865,
  });
  state.simulationTimeSeconds += 0.1;
  syncSoldierThreatMemory(state, blue, 0.1);
  const fireUpdatedThreat = blue.tacticalKnowledge.threats.find((item) => item.id === `unit:${red.id}`);
  assert.ok(fireUpdatedThreat);
  assert.notDeepEqual(
    { x: fireUpdatedThreat.x, y: fireUpdatedThreat.y },
    remembered,
    'subjective incoming-fire evidence should cautiously shift a lost contact area',
  );
  assert.notDeepEqual(
    { x: fireUpdatedThreat.x, y: fireUpdatedThreat.y },
    red.position,
    'incoming-fire evidence must not copy the hidden objective shooter position',
  );
  assert.ok(
    fireUpdatedThreat.uncertaintyCells >= threat.uncertaintyCells,
    'conflicting fire evidence must not make a lost contact artificially precise',
  );
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
  assert.ok(unknown.suppression > 0);
  assert.ok((unknown.evidenceCount ?? 0) >= 1);
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
  const fireSectorCell = { x: 4, y: 4 };

  const beforeContext = { unitId: blue.id, originX: blue.position.x, originY: blue.position.y, knowledgeRevision: 0, knownThreats: [] };
  const beforeFields = getRouteCostFields(state.map, profile, beforeContext, cache);
  const beforeDanger = readRouteCostCell(beforeFields, fireSectorCell.x, fireSectorCell.y)?.dangerCost ?? 0;
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
  const afterDanger = readRouteCostCell(afterFields, fireSectorCell.x, fireSectorCell.y)?.dangerCost ?? 0;
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
  if (faded) {
    assert.ok(faded.uncertaintyCells > initialUncertainty);
    assert.ok(faded.suppression < initial.suppression);
  }

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

function verifyEvidenceSuppressionSurvivesContactRefreshAndDecays(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  recordCombatThreatEvidence(blue, makeEvidence(state, 'known-fire', 180, red.position, red.id, 82));
  syncSoldierThreatMemory(state, blue, 0.1);
  const hot = threatById(blue, `unit:${red.id}`);
  assert.ok(hot.suppression >= 80);
  assert.ok((hot.evidenceCount ?? 0) >= 1);

  const values = [hot.suppression];
  for (let tick = 1; tick <= 12; tick += 1) {
    state.simulationTimeSeconds += 1;
    syncSoldierThreatMemory(state, blue, 1);
    const refreshed = threatById(blue, `unit:${red.id}`);
    values.push(refreshed.suppression);
    assert.ok(refreshed.strength > 0, 'potential danger must remain while evidence suppression decays');
  }
  assert.ok(values[1] > 0 && values[1] < values[0], 'suppression must survive the next contact refresh and begin decaying');
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] <= values[index - 1], 'suppression decay must be monotonic without new fire evidence');
  }
  assert.equal(values.at(-1), 0, 'evidence suppression must not remain high forever');
}

function verifyRepeatedUnknownFireMergesAcrossTicks(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const directions = [179, 181, 180];
  const positions = [
    { x: 14.1, y: 6.6 },
    { x: 14.6, y: 6.3 },
    { x: 14.3, y: 6.5 },
  ];
  let stableId = '';
  for (let index = 0; index < directions.length; index += 1) {
    state.simulationTimeSeconds = index;
    recordCombatThreatEvidence(blue, makeEvidence(state, `unknown-repeat-${index}`, directions[index], positions[index], null, 62));
    syncSoldierThreatMemory(state, blue, index === 0 ? 0.1 : 1);
    const unknowns = blue.tacticalKnowledge.threats.filter((item) => item.id.startsWith('unknown-fire:'));
    assert.equal(unknowns.length, 1);
    if (index === 0) stableId = unknowns[0].id;
    assert.equal(unknowns[0].id, stableId, 'compatible evidence must retain one stable unknown identity');
    assert.ok((unknowns[0].evidenceCount ?? 0) >= index + 1);
    assert.ok(unknowns[0].strength <= 100 && unknowns[0].suppression <= 100);
  }
}

function verifyBucketBoundaryUnknownFireMerges(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  recordCombatThreatEvidence(blue, makeEvidence(state, 'boundary-a', 14, { x: 8.2, y: 2.2 }, null, 55));
  syncSoldierThreatMemory(state, blue, 0.1);
  const firstId = blue.tacticalKnowledge.threats.find((item) => item.id.startsWith('unknown-fire:'))?.id;
  assert.ok(firstId);
  state.simulationTimeSeconds = 1;
  recordCombatThreatEvidence(blue, makeEvidence(state, 'boundary-b', 16, { x: 8.7, y: 2.4 }, null, 57));
  syncSoldierThreatMemory(state, blue, 1);
  const unknowns = blue.tacticalKnowledge.threats.filter((item) => item.id.startsWith('unknown-fire:'));
  assert.equal(unknowns.length, 1, 'compatible evidence across a former direction bucket boundary must merge');
  assert.equal(unknowns[0].id, firstId);
  assert.ok((unknowns[0].evidenceCount ?? 0) >= 2);
}

function verifyDifferentUnknownFireDirectionsStaySeparate(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  recordCombatThreatEvidence(blue, makeEvidence(state, 'direction-a', 10, { x: 8, y: 2 }, null, 55));
  syncSoldierThreatMemory(state, blue, 0.1);
  state.simulationTimeSeconds = 1;
  recordCombatThreatEvidence(blue, makeEvidence(state, 'direction-b', 140, { x: 9, y: 3 }, null, 55));
  syncSoldierThreatMemory(state, blue, 1);
  assert.equal(
    blue.tacticalKnowledge.threats.filter((item) => item.id.startsWith('unknown-fire:')).length,
    2,
    'strongly different fire directions must remain separate threats',
  );
}

function verifyDetectedShooterAliasesUnknownEvidence(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const subjectiveEstimate = { x: red.position.x - 0.4, y: red.position.y + 0.3 };
  recordCombatThreatEvidence(blue, makeEvidence(state, 'alias-unknown', 180, subjectiveEstimate, red.id, 76));
  syncSoldierThreatMemory(state, blue, 0.1);
  const unknown = blue.tacticalKnowledge.threats.find((item) => item.id.startsWith('unknown-fire:'));
  assert.ok(unknown);
  const unknownCount = unknown.evidenceCount ?? 0;

  state.simulationTimeSeconds = 1;
  const contact = installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 1);
  const known = threatById(blue, `unit:${red.id}`);
  assert.equal(blue.tacticalKnowledge.threats.filter((item) => item.id.startsWith('unknown-fire:')).length, 0);
  assert.equal(blue.tacticalKnowledge.threats.filter((item) => item.id === `unit:${red.id}`).length, 1);
  assert.ok(known.suppression > 0 && known.suppression <= 100);
  assert.ok((known.evidenceCount ?? 0) >= unknownCount);
  assert.deepEqual({ x: known.x, y: known.y }, contact.lastKnownPosition, 'aliasing must retain the perceived contact position');

  const remembered = { ...contact.lastKnownPosition };
  contact.visibleNow = false;
  contact.observedNow = false;
  red.position = { x: red.position.x + 7, y: red.position.y + 4 };
  state.simulationTimeSeconds = 2;
  syncSoldierThreatMemory(state, blue, 1);
  const hidden = threatById(blue, `unit:${red.id}`);
  assert.deepEqual({ x: hidden.x, y: hidden.y }, remembered);
  assert.notDeepEqual({ x: hidden.x, y: hidden.y }, red.position, 'hidden objective shooter position must not leak after aliasing');
  assert.equal('weapon' in hidden || 'weaponState' in hidden || 'currentShooterPosition' in hidden, false);
}

function verifyThreatEvidenceRoundTripAndLegacyNormalization(): void {
  const state = makeState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  recordCombatThreatEvidence(blue, makeEvidence(state, 'round-trip', 180, red.position, red.id, 74));
  syncSoldierThreatMemory(state, blue, 0.1);
  const before = threatById(blue, `unit:${red.id}`);

  const exported = buildExportedScene(state);
  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(imported.map, imported.units, imported.pressureZones);
  const after = threatById(unit(restored, 'blue-1'), `unit:${red.id}`);
  assert.equal(after.suppression, before.suppression);
  assert.equal(after.evidenceCount, before.evidenceCount);
  assert.equal(after.lastEvidenceSeconds, before.lastEvidenceSeconds);

  const legacy = normalizeTacticalKnowledge({
    threats: [
      { id: 'unit:legacy', strength: 60, suppression: 48, stressPerSecond: 6, confidence: 70, lastUpdatedSeconds: 9 },
      { id: 'unknown-fire:legacy', strength: 55, suppression: 42, stressPerSecond: 4, confidence: 50, lastUpdatedSeconds: 7 },
    ] as never,
  });
  const legacyUnit = legacy.threats.find((item) => item.id === 'unit:legacy');
  const legacyUnknown = legacy.threats.find((item) => item.id === 'unknown-fire:legacy');
  assert.ok(legacyUnit && legacyUnknown);
  assert.equal(legacyUnit.suppression, 0, 'legacy unit contacts without evidence metadata must not retain synthetic suppression');
  assert.equal(legacyUnit.evidenceCount, 0);
  assert.equal(legacyUnit.lastEvidenceSeconds, -1);
  assert.equal(legacyUnknown.suppression, 42);
  assert.equal(legacyUnknown.evidenceCount, 1);
  assert.equal(legacyUnknown.lastEvidenceSeconds, 7);
}

function verifyPressureZoneSuppressionRemainsIndependent(): void {
  const state = createInitialState({
    width: 20,
    height: 12,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'blue-zone', label: 'Blue', type: 'infantry_squad', side: 'blue', x: 5, y: 5 },
  ], [{
    id: 'pressure-zone-memory',
    label: 'Pressure zone',
    labelRu: 'Зона огневого давления',
    type: 'open_area_pressure',
    shape: 'circle',
    mode: 'area',
    x: 5.5,
    y: 5.5,
    radiusCells: 5,
    strength: 40,
    suppression: 64,
    stressPerSecond: 5,
    enabled: true,
    sourceVisible: false,
    sourceKnown: false,
    knowledgeSource: 'fire_pressure',
    reason: 'Scenario pressure',
    reasonRu: 'Сценарное огневое давление',
  }]);
  const blue = unit(state, 'blue-zone');
  blue.behaviorRuntime.danger = 40;
  blue.behaviorRuntime.suppression = 64;
  syncSoldierThreatMemory(state, blue, 0.1);
  const initial = threatById(blue, 'pressure-zone-memory');
  assert.equal(initial.suppression, 64);
  assert.equal(initial.evidenceCount, 0);
  assert.equal(initial.lastEvidenceSeconds, -1);
  state.simulationTimeSeconds = 3;
  syncSoldierThreatMemory(state, blue, 3);
  assert.equal(threatById(blue, 'pressure-zone-memory').suppression, 64, 'pressureZone suppression must preserve its existing behavior');
}

function makeEvidence(
  state: SimulationState,
  id: string,
  directionDegrees: number,
  estimatedSourcePosition: { x: number; y: number },
  sourceUnitId: string | null,
  suppression: number,
): CombatThreatEvidence {
  return {
    id,
    kind: 'near_miss',
    sourceUnitId,
    estimatedSourcePosition: { ...estimatedSourcePosition },
    directionDegrees,
    confidence: 52,
    uncertaintyCells: 5,
    strength: 58,
    suppression,
    stressPerSecond: 8,
    rangeCells: 70,
    arcDegrees: 58,
    createdSeconds: state.simulationTimeSeconds,
    lastUpdatedSeconds: state.simulationTimeSeconds,
    evidenceCount: 1,
  };
}

function threatById(unitModel: UnitModel, id: string) {
  const threat = unitModel.tacticalKnowledge.threats.find((item) => item.id === id);
  assert.ok(threat, `threat ${id} must exist`);
  return threat;
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
