import assert from 'node:assert/strict';
import { serializePhysicalActionCoordinatorState } from '../src/core/actions/PhysicalActionCoordinatorSerialization';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  AIM_TRACKING_INTERVAL_SECONDS,
  advanceAimPhysicalProgress,
  calculateAimFactorBreakdown,
  calculatePredictedHitProbability,
  commitShot,
  deriveSeededAngularOffsets,
  equipPrimaryWeaponFromLoadout,
  getRecoveredWeaponRecoil,
  normalizeInfantryCombatUnitRuntime,
  prepareCommittedShotDirection,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
  tickInfantryCombatSimulation,
  updateAimTrackingAtBoundary,
  type AimFactorBreakdownV1,
  type FireTaskRuntimeV1,
  type InfantryWeaponInstanceV1,
} from '../src/core/infantry-combat/runtime';
import type { PerceptionContactMemory } from '../src/core/perception/PerceptionContact';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { normalizeUnits, type UnitModel } from '../src/core/units/UnitModel';

verifyTrackingAndPerceptionOnlyContracts();
verifyTrackingSchedulerAndSaveLoad();
verifyFactorAndProbabilityContracts();
verifySeededDispersionContracts();
verifyRecoilAndExactlyOnceContracts();
verifyStage4MigrationDefaults();

console.log('Infantry combat Stage 5 smoke passed: perception-only tracking, 5 Hz scheduler, lead, factors, probability, deterministic dispersion, recoil, exactly-once and migration.');

function verifyTrackingAndPerceptionOnlyContracts(): void {
  const fixed = scenario('stage5-fixed', false);
  const fixedTask = fixed.shooter.infantryCombatRuntime.activeFireTask!;
  const fixedWeapon = fixed.shooter.infantryCombatRuntime.primaryWeapon!;
  updateAimTrackingAtBoundary(fixed.state, fixed.shooter, fixedTask, fixedWeapon, 0.2);
  assert.ok(fixedTask.aimTracking.solution.valid);
  assert.deepEqual(fixedTask.aimTracking.solution.estimatedVelocityMetresPerSecond, { x: 0, y: 0, z: 0 });
  assert.deepEqual(fixedTask.aimTracking.solution.predictedAimPoint, fixedTask.target, 'fixed point must not receive false lead');

  const moving = scenario('stage5-moving-contact', true);
  const task = moving.shooter.infantryCombatRuntime.activeFireTask!;
  const weapon = moving.shooter.infantryCombatRuntime.primaryWeapon!;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 0.2);
  const firstPoint = structuredClone(task.aimTracking.solution.predictedAimPoint);
  const contact = moving.shooter.perceptionKnowledge.contacts.find((entry) => entry.id === 'target-contact')!;
  contact.lastKnownPosition = { x: 11, y: 3 };
  contact.lastObservedSeconds = 0.2;
  contact.lastUpdatedSeconds = 0.2;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 0.4);
  assert.ok(Math.abs(task.aimTracking.solution.estimatedVelocityMetresPerSecond.x - 10) < 1e-9, 'two perceived samples must estimate velocity in world metres per second');
  assert.ok(task.aimTracking.solution.predictedAimPoint.xMetres > task.aimTracking.solution.perceivedPosition!.xMetres, 'moving perceived contact must receive forward lead');
  assert.notDeepEqual(task.aimTracking.solution.predictedAimPoint, firstPoint);

  const beforeHiddenMove = structuredClone(task.aimTracking.solution.predictedAimPoint);
  moving.target.position.x += 20;
  moving.target.position.y += 20;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 0.6);
  assert.deepEqual(task.aimTracking.solution.predictedAimPoint, beforeHiddenMove, 'true target movement without a perception update must not change the aim point');

  const ordered = scenario('stage5-contact-order', true);
  const reversed = scenario('stage5-contact-order', true);
  ordered.shooter.perceptionKnowledge.contacts.push(otherContact('z-contact'));
  reversed.shooter.perceptionKnowledge.contacts.unshift(otherContact('z-contact'));
  updateAimTrackingAtBoundary(ordered.state, ordered.shooter, ordered.shooter.infantryCombatRuntime.activeFireTask!, ordered.shooter.infantryCombatRuntime.primaryWeapon!, 0.2);
  updateAimTrackingAtBoundary(reversed.state, reversed.shooter, reversed.shooter.infantryCombatRuntime.activeFireTask!, reversed.shooter.infantryCombatRuntime.primaryWeapon!, 0.2);
  assert.deepEqual(ordered.shooter.infantryCombatRuntime.activeFireTask!.aimTracking, reversed.shooter.infantryCombatRuntime.activeFireTask!.aimTracking, 'contact array order must not affect tracking');

  const qualityBefore = task.aimTracking.solution.solutionQuality;
  contact.confidence = 25;
  contact.uncertaintyCells = 8;
  contact.visibleNow = false;
  contact.observedNow = false;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 3);
  assert.ok(task.aimTracking.solution.solutionQuality < qualityBefore, 'staleness and uncertainty must lower solution quality');

  moving.shooter.perceptionKnowledge.contacts = [];
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 3.2);
  assert.equal(task.aimTracking.solution.valid, false);
  assert.equal(task.aimTracking.solution.invalidReason, 'contact_missing');
}

function verifyTrackingSchedulerAndSaveLoad(): void {
  assert.equal(AIM_TRACKING_INTERVAL_SECONDS, 0.2);
  const coarse = scenario('stage5-partition', true, 1);
  const fine = scenario('stage5-partition', true, 1);
  tickInfantryCombatSimulation(coarse.state, { intervalStartSeconds: 0, deltaSeconds: 1.1 });
  for (let index = 0; index < 11; index += 1) {
    tickInfantryCombatSimulation(fine.state, { intervalStartSeconds: index / 10, deltaSeconds: 0.1 });
  }
  assert.deepEqual(
    serializeInfantryCombatUnitRuntime(fine.shooter.infantryCombatRuntime),
    serializeInfantryCombatUnitRuntime(coarse.shooter.infantryCombatRuntime),
    'coarse and fine ticks must preserve the same 5 Hz scheduler state',
  );
  assert.equal(coarse.shooter.infantryCombatRuntime.activeFireTask?.aimTracking.trackingUpdateCount, 5);
  assert.equal(coarse.shooter.infantryCombatRuntime.activeFireTask?.aimTracking.nextTrackingBoundarySeconds, 1.2);

  const saved = serializeInfantryCombatUnitRuntime(coarse.shooter.infantryCombatRuntime);
  const restored = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, saved, 'aim samples, boundary and physical progress must survive save/load');

  const control = scenario('stage5-save-load', true, 1);
  const loaded = scenario('stage5-save-load', true, 1);
  tickInfantryCombatSimulation(control.state, { intervalStartSeconds: 0, deltaSeconds: 0.55 });
  tickInfantryCombatSimulation(loaded.state, { intervalStartSeconds: 0, deltaSeconds: 0.55 });
  loaded.shooter.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(
    JSON.parse(JSON.stringify(serializeInfantryCombatUnitRuntime(loaded.shooter.infantryCombatRuntime))),
  );
  loaded.shooter.behaviorRuntime.physicalActionCoordinator = JSON.parse(JSON.stringify(
    serializePhysicalActionCoordinatorState(control.shooter.behaviorRuntime.physicalActionCoordinator),
  ));
  tickInfantryCombatSimulation(control.state, { intervalStartSeconds: 0.55, deltaSeconds: 0.45 });
  tickInfantryCombatSimulation(loaded.state, { intervalStartSeconds: 0.55, deltaSeconds: 0.45 });
  assert.deepEqual(serializeInfantryCombatUnitRuntime(loaded.shooter.infantryCombatRuntime), serializeInfantryCombatUnitRuntime(control.shooter.infantryCombatRuntime));
}

function verifyFactorAndProbabilityContracts(): void {
  const weapon = scenario('stage5-factors', false).shooter.infantryCombatRuntime.primaryWeapon!;
  const base = factor(weapon, { posture: 'standing', isMoving: false, shootingSkill: 0.5, proficiency: 'trained', fatigue: 0, woundStabilityMultiplier: 1 });
  const crouched = factor(weapon, { posture: 'crouched' });
  const prone = factor(weapon, { posture: 'prone' });
  assert.ok(crouched.effectiveDispersionRadians <= base.effectiveDispersionRadians);
  assert.ok(prone.effectiveDispersionRadians <= crouched.effectiveDispersionRadians);

  const moving = factor(weapon, { isMoving: true, movementSpeedMetresPerSecond: 2 });
  assert.ok(moving.effectiveDispersionRadians > base.effectiveDispersionRadians, 'allowed movement must increase dispersion');

  const lowSkill = factor(weapon, { shootingSkill: 0 });
  const highSkill = factor(weapon, { shootingSkill: 1 });
  assert.ok(highSkill.effectiveDispersionRadians <= lowSkill.effectiveDispersionRadians);
  assert.ok(highSkill.aimQualityPerSecond >= lowSkill.aimQualityPerSecond);

  const untrained = factor(weapon, { proficiency: 'untrained' });
  const trained = factor(weapon, { proficiency: 'trained' });
  const specialist = factor(weapon, { proficiency: 'specialist' });
  assert.ok(trained.effectiveDispersionRadians <= untrained.effectiveDispersionRadians);
  assert.ok(specialist.effectiveDispersionRadians <= trained.effectiveDispersionRadians);

  const impaired = factor(weapon, { fatigue: 0.8, woundStabilityMultiplier: 0.55 });
  assert.ok(impaired.effectiveDispersionRadians > base.effectiveDispersionRadians, 'pure calculator must react to future fatigue/wound inputs');
  assert.ok(impaired.aimQualityPerSecond < base.aimQualityPerSecond);

  const probabilityBase = probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 });
  assert.ok(probability({ aimQuality: 0.8, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 }) >= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.02, uncertaintyMetres: 1 }) <= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 3 }) <= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 200, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 }) <= probabilityBase);

  const progressTask = scenario('stage5-progress', false, 1).shooter.infantryCombatRuntime.activeFireTask!;
  const before = progressTask.aimTracking.solution.physicalAimQuality;
  advanceAimPhysicalProgress(progressTask, base, 0.25);
  assert.ok(progressTask.aimTracking.solution.physicalAimQuality > before);
  assert.ok(progressTask.aimTracking.solution.physicalAimQuality <= 1);
}

function verifySeededDispersionContracts(): void {
  const first = deriveSeededAngularOffsets({
    shooterId: 'seeded-shooter',
    weaponInstanceId: 'seeded-weapon',
    shotId: 'seeded-shot:1',
    effectiveDispersionRadians: 0.02,
  });
  const repeated = deriveSeededAngularOffsets({
    shooterId: 'seeded-shooter',
    weaponInstanceId: 'seeded-weapon',
    shotId: 'seeded-shot:1',
    effectiveDispersionRadians: 0.02,
  });
  const second = deriveSeededAngularOffsets({
    shooterId: 'seeded-shooter',
    weaponInstanceId: 'seeded-weapon',
    shotId: 'seeded-shot:2',
    effectiveDispersionRadians: 0.02,
  });
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, second);

  const direction = prepareCommittedShotDirection({
    aimDirection: { x: 1, y: 0, z: 0 },
    recoilPitchRadians: 0.01,
    recoilYawRadians: -0.005,
    dispersionPitchRadians: first.pitchRadians,
    dispersionYawRadians: first.yawRadians,
  });
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
}

function verifyRecoilAndExactlyOnceContracts(): void {
  const ready = scenario('stage5-commit', false, 0);
  const weapon = ready.shooter.infantryCombatRuntime.primaryWeapon!;
  const task = ready.shooter.infantryCombatRuntime.activeFireTask!;
  const roundsBefore = weapon.roundsInWeapon;
  tickInfantryCombatSimulation(ready.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  assert.equal(ready.state.infantryCombatProjectiles.committedShots.length, 1);
  assert.equal(weapon.roundsInWeapon, roundsBefore - 1);
  assert.equal(weapon.recoil.sequence, 1);
  const record = ready.state.infantryCombatProjectiles.committedShots[0]!;
  assert.ok(record.aimDirectionBeforeDispersion);
  assert.ok(record.finalProjectileDirection);
  const projectile = ready.state.infantryCombatProjectiles.activeProjectiles[0]!;
  const speed = weapon.resolved.ammo.muzzleVelocityMetersPerSecond;
  assert.ok(Math.abs(projectile.velocityMetresPerSecond.x / speed - record.finalProjectileDirection.x) < 1e-12);
  assert.equal(task.committedShotId, record.shotId);

  const recoilAfterCommit = structuredClone(weapon.recoil);
  const duplicate = commitShot({ state: ready.state, shooter: ready.shooter, task, weapon, committedSeconds: 0.8 });
  assert.equal(duplicate.status, 'already_committed');
  assert.deepEqual(weapon.recoil, recoilAfterCommit, 'already_committed must not add recoil twice');

  const recoveredEarly = getRecoveredWeaponRecoil(weapon, 0.9, factor(weapon));
  const recoveredLate = getRecoveredWeaponRecoil(weapon, 10, factor(weapon));
  assert.ok(Math.abs(recoveredLate.pitchOffsetRadians) <= Math.abs(recoveredEarly.pitchOffsetRadians));
  assert.ok(Math.abs(recoveredLate.yawOffsetRadians) <= Math.abs(recoveredEarly.yawOffsetRadians));

  const denied = scenario('stage5-moving-denied', false, 0);
  denied.shooter.movementRuntime.isMoving = true;
  denied.shooter.movementRuntime.velocityCellsPerSecond = { x: 1, y: 0 };
  const deniedWeapon = denied.shooter.infantryCombatRuntime.primaryWeapon!;
  const deniedBefore = {
    rounds: deniedWeapon.roundsInWeapon,
    recoil: structuredClone(deniedWeapon.recoil),
    projectiles: serializeReferenceProjectileRuntimeState(denied.state.infantryCombatProjectiles),
  };
  const deniedResult = tickInfantryCombatSimulation(denied.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 }).commitResults[0]!;
  assert.equal(deniedResult.status, 'movement_forbidden');
  assert.equal(deniedWeapon.roundsInWeapon, deniedBefore.rounds);
  assert.deepEqual(deniedWeapon.recoil, deniedBefore.recoil);
  assert.deepEqual(serializeReferenceProjectileRuntimeState(denied.state.infantryCombatProjectiles), deniedBefore.projectiles);
}

function verifyStage4MigrationDefaults(): void {
  const current = scenario('stage5-migration', true, 1);
  tickInfantryCombatSimulation(current.state, { intervalStartSeconds: 0, deltaSeconds: 0.4 });
  const stage4 = structuredClone(serializeInfantryCombatUnitRuntime(current.shooter.infantryCombatRuntime)) as any;
  delete stage4.primaryWeapon.operatorProfile;
  delete stage4.primaryWeapon.recoil;
  delete stage4.activeFireTask.aimTracking;
  const migrated = normalizeInfantryCombatUnitRuntime(stage4);
  assert.ok(migrated.primaryWeapon?.operatorProfile);
  assert.equal(migrated.primaryWeapon?.operatorProfile.shootingSkill, 0.5);
  assert.equal(migrated.primaryWeapon?.operatorProfile.proficiencyByWeaponClass.rifle, 'trained');
  assert.equal(migrated.primaryWeapon?.recoil.sequence, 0);
  assert.ok(migrated.activeFireTask?.aimTracking);
  assert.equal(migrated.activeFireTask?.aimTracking.trackingUpdateCount, 0);
}

function factor(
  weapon: InfantryWeaponInstanceV1,
  overrides: Partial<Parameters<typeof calculateAimFactorBreakdown>[0]> = {},
): AimFactorBreakdownV1 {
  return calculateAimFactorBreakdown({
    weapon: weapon.resolved.weapon,
    posture: 'standing',
    isMoving: false,
    movementSpeedMetresPerSecond: 0,
    shootingSkill: 0.5,
    proficiency: 'trained',
    fatigue: 0,
    woundStabilityMultiplier: 1,
    ...overrides,
  });
}

function probability(overrides: Partial<Parameters<typeof calculatePredictedHitProbability>[0]>): number {
  return calculatePredictedHitProbability({
    distanceMetres: 100,
    targetRadiusMetres: 0.45,
    effectiveDispersionRadians: 0.01,
    aimQuality: 0.5,
    solutionQuality: 0.8,
    uncertaintyMetres: 1,
    contactAgeSeconds: 0,
    ...overrides,
  });
}

function scenario(id: string, contactBased: boolean, minimumSolutionQuality = 1): {
  state: SimulationState;
  shooter: UnitModel;
  target: UnitModel;
} {
  const state = createInitialState({
    width: 100,
    height: 30,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id, side: 'blue', x: 2, y: 3, type: 'infantry_squad', facingDegrees: 0 },
    { id: `${id}-target`, side: 'red', x: 10, y: 3, type: 'infantry_squad' },
  ]);
  const shooter = state.units[0]!;
  const target = state.units[1]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  ).status, 'equipped');
  if (contactBased) shooter.perceptionKnowledge.contacts = [contact('target-contact', target.id, 10, 3, 0)];
  const requested = requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` },
    ownerToken: `${id}-token`,
    target: { xMetres: 20, yMetres: 6, zMetres: 1.35 },
    targetRadiusMetres: 0,
    contactId: contactBased ? 'target-contact' : null,
    sourceUnitId: target.id,
    mode: 'single',
    minimumSolutionQuality,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  });
  assert.equal(requested.status, 'started');
  return { state, shooter, target };
}

function contact(id: string, sourceUnitId: string, x: number, y: number, seconds: number): PerceptionContactMemory {
  return {
    id,
    stimulusId: `${id}-stimulus`,
    sourceUnitId,
    labelRu: 'Воспринимаемая цель',
    stage: 'confirmed',
    source: 'visual',
    evidence: 150,
    confidence: 100,
    uncertaintyCells: 0.25,
    lastKnownPosition: { x, y },
    visibleNow: true,
    observedNow: true,
    lastObservedSeconds: seconds,
    lastUpdatedSeconds: seconds,
    evidencePerSecond: 0,
    detectionVariance: 1,
    explanationRu: [],
  };
}

function otherContact(id: string): PerceptionContactMemory {
  return contact(id, `${id}-unit`, 40, 20, 0);
}
