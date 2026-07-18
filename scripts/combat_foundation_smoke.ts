import assert from 'node:assert/strict';
import { hasFriendlyUnitBeforeDistance, traceProjectile } from '../src/core/combat/BallisticRaycast';
import {
  applyUnitHit,
  getCombatRuntime,
  isUnitCombatCapable,
  replaceCombatRuntime,
} from '../src/core/combat/CombatDamage';
import { getCombatEventHistory } from '../src/core/combat/CombatEvents';
import {
  getFireAction,
  requestFireAction,
} from '../src/core/combat/FireAction';
import { isFireAllowed, setFireAllowed } from '../src/core/combat/CombatRules';
import { getUnitHitShapes, intersectRayWithUnitHitShapes } from '../src/core/combat/UnitHitShapes';
import {
  DEFAULT_RIFLE_ID,
  getWeaponRuntime,
  reloadWeapon,
  tryConsumeRound,
} from '../src/core/combat/WeaponModel';
import { evaluateSmallArmsCover, evaluateSmallArmsExpectedProtection } from '../src/core/cover/SmallArmsCoverEvaluation';
import { normalizeMap } from '../src/core/map/MapModel';
import { tickAllUnitPerception } from '../src/core/perception/PerceptionSystem';
import { normalizePressureZones } from '../src/core/pressure/PressureZone';
import {
  createThreatRuntimeEvaluation,
  evaluateThreatRuntimeAtPosition,
  evaluateThreatsAtPosition,
} from '../src/core/pressure/ThreatEvaluation';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { areUnitsHostile, getSideRelation } from '../src/core/units/SideRelations';
import type { UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

function makeState() {
  return createInitialState(
    {
      width: 20,
      height: 12,
      cellSize: 16,
      metersPerCell: 2,
      runtimeMetersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
      objects: [],
    },
    [
      {
        id: 'blue-1',
        label: 'Blue rifleman',
        labelRu: 'Синий стрелок',
        type: 'infantry_squad',
        side: 'blue',
        x: 3,
        y: 5,
        facingDegrees: 0,
        viewRangeCells: 20,
        runtime: { ammo: 5, weaponReady: true },
      },
      {
        id: 'red-1',
        label: 'Red rifleman',
        labelRu: 'Красный стрелок',
        type: 'infantry_squad',
        side: 'red',
        x: 8,
        y: 5,
        facingDegrees: 180,
        viewRangeCells: 20,
        runtime: { ammo: 5, weaponReady: true },
      },
    ],
  );
}

function makeStateWithFriendlyInLine() {
  return createInitialState(
    {
      width: 20,
      height: 12,
      cellSize: 16,
      metersPerCell: 2,
      runtimeMetersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
      objects: [],
    },
    [
      {
        id: 'blue-1',
        label: 'Blue rifleman',
        type: 'infantry_squad',
        side: 'blue',
        x: 3,
        y: 5,
        facingDegrees: 0,
        runtime: { ammo: 5, weaponReady: true },
      },
      {
        id: 'blue-2',
        label: 'Blue ally',
        type: 'infantry_squad',
        side: 'blue',
        x: 5,
        y: 5,
        facingDegrees: 0,
      },
      {
        id: 'red-1',
        label: 'Red rifleman',
        type: 'infantry_squad',
        side: 'red',
        x: 8,
        y: 5,
        facingDegrees: 180,
      },
    ],
  );
}

function verifySides(): void {
  const state = makeState();
  const blue = state.units[0];
  const red = state.units[1];
  assert.deepEqual(state.units.map((unit) => unit.side), ['blue', 'red']);
  assert.equal(getSideRelation(blue.side, blue.side), 'friendly');
  assert.equal(getSideRelation(blue.side, red.side), 'hostile');
  assert.equal(areUnitsHostile(blue, red), true);
}

function verifyAllUnitPerception(): void {
  const state = makeState();
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  for (let index = 0; index < 80; index += 1) {
    state.simulationTimeSeconds += 0.1;
    tickAllUnitPerception(state, 0.1);
  }
  const blueContact = state.units[0].perceptionKnowledge.contacts.find((item) => item.sourceUnitId === 'red-1');
  const redContact = state.units[1].perceptionKnowledge.contacts.find((item) => item.sourceUnitId === 'blue-1');
  assert.ok(blueContact, 'blue unit must perceive the real red unit without being selected');
  assert.ok(redContact, 'red unit must perceive the real blue unit without being selected');
  assert.notEqual(blueContact, redContact, 'each observer must retain independent subjective contact memory');
}

function verifySmallArmsRuntimeCoverParity(): void {
  const map = normalizeMap({
    width: 12,
    height: 6,
    cellSize: 16,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cellRects: [
      { x1: 6, x2: 7, y1: 2, y2: 2, vegetationMaterialId: 'dense_forest' },
      { x1: 8, x2: 8, y1: 2, y2: 2, height: 2 },
    ],
    objects: [{
      id: 'runtime-cover-parity',
      kind: 'structure',
      x: 4,
      y: 2,
      widthCells: 1,
      heightCells: 1,
      coverProtection: 92,
      coverReliability: 96,
      penetrable: false,
      coverPosture: 'standing',
    }],
  });
  const source = { x: 1.5, y: 2.5 };
  const target = { x: 10.5, y: 2.5 };
  const optionSets = [
    undefined,
    { includeObjects: false },
    { includeForest: false },
    { includeRelief: false },
    { includeObjects: false, includeForest: false },
  ] as const;

  for (const posture of ['standing', 'crouched', 'prone'] as const) {
    for (const options of optionSets) {
      const detailed = evaluateSmallArmsCover(map, source, target, posture, options).expectedProtection;
      const runtime = evaluateSmallArmsExpectedProtection(map, source, target, posture, options);
      assert.equal(runtime, detailed, `runtime cover parity failed for ${posture} ${JSON.stringify(options)}`);
    }
  }
}

function verifyThreatRuntimeSummaryParity(): void {
  const state = makeState();
  const blue = state.units[0];
  state.pressureZones.push(...normalizePressureZones([{
    id: 'zone-runtime-parity',
    label: 'Runtime parity zone',
    type: 'open_area_pressure',
    shape: 'circle',
    x: 6,
    y: 5,
    radiusCells: 8,
    strength: 42,
    suppression: 31,
    stressPerSecond: 3.5,
    reason: 'runtime parity',
  }]));
  blue.tacticalKnowledge.threats = [{
    id: 'known-runtime-parity',
    labelRu: 'Известная угроза',
    mode: 'directional_fire',
    x: 9,
    y: 5,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 35,
    suppression: 27,
    stressPerSecond: 2,
    directionDegrees: 180,
    arcDegrees: 90,
    rangeCells: 12,
    minRangeCells: 0,
    falloffPercent: 25,
    confidence: 80,
    uncertaintyCells: 0.5,
    source: 'seen',
    visibleNow: false,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
  }];

  const detailed = evaluateThreatsAtPosition(state.map, blue, state.pressureZones);
  const runtime = evaluateThreatRuntimeAtPosition(
    state.map,
    blue,
    state.pressureZones,
    createThreatRuntimeEvaluation(),
  );
  assert.equal(runtime.danger, detailed.danger);
  assert.equal(runtime.suppression, detailed.suppression);
  assert.equal(runtime.stressPerSecond, detailed.stressPerSecond);
  assert.equal(runtime.strongestScenarioId, detailed.strongest?.zone.id ?? null);
  assert.equal(runtime.strongestKnownId, detailed.strongestKnown?.threat.id ?? null);
}

function verifyWeaponRuntime(): void {
  const state = makeState();
  const weapon = getWeaponRuntime(state.units[0]);
  assert.equal(weapon.weaponId, DEFAULT_RIFLE_ID);
  assert.equal(weapon.roundsLoaded, 5);
  assert.equal(tryConsumeRound(state.units[0], 0), true);
  assert.equal(getWeaponRuntime(state.units[0]).roundsLoaded, 4);
  getWeaponRuntime(state.units[0]).roundsReserve = 3;
  getWeaponRuntime(state.units[0]).roundsLoaded = 0;
  assert.equal(reloadWeapon(state.units[0]), 3);
  assert.equal(getWeaponRuntime(state.units[0]).roundsLoaded, 3);
  assert.equal(getWeaponRuntime(state.units[0]).roundsReserve, 0);
}

function verifyHitShapes(): void {
  const state = makeState();
  const target = state.units[1];
  const standing = getUnitHitShapes(target, state.map);
  assert.ok(standing.some((shape) => shape.zone === 'head'));
  assert.ok(standing.some((shape) => shape.zone === 'torso'));
  target.behaviorRuntime.posture = 'prone';
  target.facingRadians = Math.PI / 2;
  const prone = getUnitHitShapes(target, state.map);
  assert.ok(Math.max(...prone.map((shape) => shape.centerYMetres)) - Math.min(...prone.map((shape) => shape.centerYMetres)) > 0.5);
  const hit = intersectRayWithUnitHitShapes(
    { xMetres: target.position.x * state.map.metersPerCell, yMetres: (target.position.y - 4) * state.map.metersPerCell, zMetres: 0.3 },
    { x: 0, y: 1, z: 0 },
    20,
    target,
    state.map,
  );
  assert.ok(hit, 'ray through the oriented prone silhouette must hit a body zone');
}

function directShotGeometry(state = makeState()) {
  const blue = state.units.find((unit) => unit.id === 'blue-1')!;
  const red = state.units.find((unit) => unit.id === 'red-1')!;
  const origin = {
    xMetres: blue.position.x * state.map.metersPerCell,
    yMetres: blue.position.y * state.map.metersPerCell,
    zMetres: 1.45,
  };
  const target = {
    xMetres: red.position.x * state.map.metersPerCell,
    yMetres: red.position.y * state.map.metersPerCell,
    zMetres: 1.1,
  };
  const length = Math.hypot(target.xMetres - origin.xMetres, target.yMetres - origin.yMetres, target.zMetres - origin.zMetres);
  return {
    blue,
    red,
    origin,
    target,
    length,
    direction: {
      x: (target.xMetres - origin.xMetres) / length,
      y: (target.yMetres - origin.yMetres) / length,
      z: (target.zMetres - origin.zMetres) / length,
    },
  };
}

function verifyBallistics(): void {
  const state = makeState();
  const geometry = directShotGeometry(state);
  const result = traceProjectile(state, {
    shotId: 'ballistic-test',
    shooterId: geometry.blue.id,
    origin: geometry.origin,
    direction: geometry.direction,
    maximumDistanceMetres: 100,
    muzzleVelocityMetresPerSecond: 800,
  });
  assert.equal(result.hitType, 'unit');
  assert.equal(result.hitUnitId, geometry.red.id);
}

function verifyObjectBlocksBeforeTarget(): void {
  const state = makeState();
  state.map.objects.push({
    id: 'wall',
    kind: 'structure',
    x: 5.5,
    y: 5,
    rotationRadians: 0,
    widthCells: 1,
    heightCells: 1,
    losHeightMeters: 2.5,
    labels: { en: 'Wall', ru: 'Стена' },
  });
  const geometry = directShotGeometry(state);
  const result = traceProjectile(state, {
    shotId: 'wall-test',
    shooterId: geometry.blue.id,
    origin: geometry.origin,
    direction: geometry.direction,
    maximumDistanceMetres: 100,
    muzzleVelocityMetresPerSecond: 800,
  });
  assert.equal(result.hitType, 'object');
  assert.equal(result.hitObjectId, 'wall');
}

function verifyFriendlyFireCorridor(): void {
  const state = makeStateWithFriendlyInLine();
  const geometry = directShotGeometry(state);
  const friendlyId = hasFriendlyUnitBeforeDistance(
    state,
    {
      shotId: 'friendly-safety-test',
      shooterId: geometry.blue.id,
      origin: geometry.origin,
      direction: geometry.direction,
      maximumDistanceMetres: 100,
      muzzleVelocityMetresPerSecond: 800,
    },
    new Set(['blue-1', 'blue-2']),
    geometry.length,
  );
  assert.equal(friendlyId, 'blue-2', 'friendly unit must block AI fire before the hostile target');
}

function verifyDamage(): void {
  const state = makeState();
  const red = state.units[1];
  const result = applyUnitHit(red, { shotId: 'head-test', zone: 'head', energyJoules: 3000 });
  assert.ok(result.capability === 'incapacitated' || result.capability === 'dead');
  assert.equal(isUnitCombatCapable(red), false);
  assert.equal(getCombatRuntime(red).lastHit?.zone, 'head');
}

function verifyCombatPersistence(): void {
  const state = makeState();
  const blue = state.units[0];
  const weapon = getWeaponRuntime(blue);
  weapon.roundsLoaded = 2;
  weapon.roundsReserve = 7;
  weapon.ready = true;
  weapon.currentRecoil = 0.3;
  weapon.nextAllowedShotSeconds = 12.5;
  const hit = applyUnitHit(blue, { shotId: 'persist-limb-hit', zone: 'limbs', energyJoules: 1200 });

  const exported = buildExportedScene(state);
  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restoredState = createInitialState(imported.map, imported.units, imported.pressureZones);
  const restored = restoredState.units.find((unit) => unit.id === blue.id)!;
  const restoredWeapon = getWeaponRuntime(restored);
  const restoredCombat = getCombatRuntime(restored);

  assert.equal(restored.side, 'blue');
  assert.equal(restoredWeapon.roundsLoaded, 2);
  assert.equal(restoredWeapon.roundsReserve, 7);
  assert.equal(restoredWeapon.currentRecoil, 0.3);
  assert.equal(restoredWeapon.nextAllowedShotSeconds, 12.5);
  assert.equal(restoredCombat.capability, hit.capability);
  assert.equal(restoredCombat.lastHit?.zone, 'limbs');
}

function verifyFirePermissionAndContinuedFire(): void {
  const state = makeState();
  const blue = state.units[0];
  const red = state.units[1];
  installIdentifiedContact(blue, red, state.simulationTimeSeconds);

  assert.equal(isFireAllowed(state), false, 'fire permission must be disabled by default');
  assert.equal(requestFireAction(state, blue, blue.perceptionKnowledge.contacts[0].id), false, 'manual fire must be denied while permission is disabled');
  assert.equal(getWeaponRuntime(blue).roundsLoaded, 5);

  setFireAllowed(state, true);
  assert.equal(isFireAllowed(state), true);
  for (let index = 0; index < 500 && getWeaponRuntime(blue).roundsLoaded > 3; index += 1) {
    restoreTargetForContinuedFire(red);
    tickSimulation(state, 0.05);
    restoreTargetForContinuedFire(red);
  }
  assert.ok(getWeaponRuntime(blue).roundsLoaded <= 3, 'enabled engagement must complete more than one single-shot cycle');

  setFireAllowed(state, false);
  const roundsAfterDisable = getWeaponRuntime(blue).roundsLoaded;
  for (let index = 0; index < 100; index += 1) {
    restoreTargetForContinuedFire(red);
    tickSimulation(state, 0.05);
  }
  assert.equal(getWeaponRuntime(blue).roundsLoaded, roundsAfterDisable, 'disabling permission must prevent another shot');
}

function verifyStatefulFire(): void {
  const state = makeState();
  const blue = state.units[0];
  const red = state.units[1];
  let contact = blue.perceptionKnowledge.contacts.find((item) => item.sourceUnitId === red.id);
  for (let index = 0; index < 400 && !contact?.visibleNow; index += 1) {
    state.simulationTimeSeconds += 0.1;
    tickAllUnitPerception(state, 0.1);
    contact = blue.perceptionKnowledge.contacts.find((item) => item.sourceUnitId === red.id);
  }
  assert.ok(contact, 'stateful fire requires a real subjective contact');
  assert.equal(contact.visibleNow, true, `contact must be visually identified before direct fire; stage=${contact.stage}, evidence=${contact.evidence.toFixed(1)}`);
  setFireAllowed(state, true);
  assert.equal(requestFireAction(state, blue, contact.id), true);
  const phases = new Set<string>();
  for (let index = 0; index < 120 && getFireAction(blue); index += 1) {
    phases.add(getFireAction(blue)?.phase ?? 'none');
    tickSimulation(state, 0.05);
  }
  assert.ok(phases.has('turning') || phases.has('readying_weapon'));
  assert.ok(phases.has('aiming'));
  assert.ok(phases.has('firing'));
  assert.ok(getWeaponRuntime(blue).roundsLoaded < 5, 'round must be consumed only by the real firing phase');
  assert.ok(getCombatRuntime(red).lastHit || getFireAction(blue) === null, 'fire action must resolve without hanging');

  const history = getCombatEventHistory(state);
  const fired = history.find((event) => event.kind === 'shot_fired');
  assert.ok(fired && fired.kind === 'shot_fired', 'real fire must record an origin for presentation');
  const impact = history.find((event) => event.kind === 'projectile_impact' && event.shotId === fired.shotId);
  assert.ok(impact && impact.kind === 'projectile_impact', 'real fire must record a matching impact for tracer presentation');
  for (const value of [
    fired.origin.xMetres,
    fired.origin.yMetres,
    impact.impactPoint.xMetres,
    impact.impactPoint.yMetres,
  ]) assert.ok(Number.isFinite(value), 'shot presentation coordinates must be finite');
}

function installIdentifiedContact(observer: UnitModel, target: UnitModel, nowSeconds: number): void {
  observer.perceptionKnowledge.contacts = [{
    id: `perception:unit:${target.id}`,
    stimulusId: `unit:${target.id}`,
    sourceUnitId: target.id,
    labelRu: target.labels.ru,
    stage: 'confirmed',
    source: 'visual',
    evidence: 180,
    confidence: 100,
    uncertaintyCells: 0.25,
    lastKnownPosition: { ...target.position },
    visibleNow: true,
    observedNow: true,
    lastObservedSeconds: nowSeconds,
    lastUpdatedSeconds: nowSeconds,
    evidencePerSecond: 100,
    detectionVariance: 1,
    explanationRu: ['Проверочный подтверждённый личный контакт.'],
  }];
  observer.perceptionKnowledge.revision += 1;
}

function restoreTargetForContinuedFire(target: UnitModel): void {
  if (isUnitCombatCapable(target)) return;
  target.soldier.condition.health = 100;
  replaceCombatRuntime(target, { capability: 'effective', lastHit: null });
  target.behaviorRuntime.currentAction = 'observe';
  target.behaviorRuntime.weaponReady = true;
}

verifySides();
verifyAllUnitPerception();
verifySmallArmsRuntimeCoverParity();
verifyThreatRuntimeSummaryParity();
verifyWeaponRuntime();
verifyHitShapes();
verifyBallistics();
verifyObjectBlocksBeforeTarget();
verifyFriendlyFireCorridor();
verifyDamage();
verifyCombatPersistence();
verifyFirePermissionAndContinuedFire();
verifyStatefulFire();

console.log('Combat foundation smoke passed.');
