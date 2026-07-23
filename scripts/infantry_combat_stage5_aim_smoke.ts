import assert from 'node:assert/strict';
import {
  normalizePhysicalActionCoordinatorState,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinatorSerialization';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  AIM_TRACKING_INTERVAL_SECONDS,
  advanceAimPhysicalProgress,
  calculateAimFactorBreakdown,
  calculatePredictedHitProbability,
  commitShot,
  deriveSeededAngularOffsets,
  equipPrimaryWeaponFromLoadout,
  getInfantryCombatDiagnostics,
  getRecoveredWeaponRecoil,
  normalizeInfantryCombatUnitRuntime,
  normalizeReferenceProjectileRuntimeState,
  prepareCommittedShotDirection,
  reconcileInfantryCombatRuntimeAfterLoad,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
  tickInfantryCombatSimulation,
  updateAimTrackingAtBoundary,
  type AimFactorBreakdownV1,
  type InfantryWeaponInstanceV1,
} from '../src/core/infantry-combat/runtime';
import type { PerceptionContactMemory } from '../src/core/perception/PerceptionContact';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyTrackingAndPerceptionOnlyContracts();
verifyTrackingSchedulerAndSaveLoad();
verifyFactorAndProbabilityContracts();
verifySeededDispersionContracts();
verifyRecoilExactlyOnceAndAtomicity();
verifyProbabilityIsNotHitResolver();
verifyOrderIndependenceAndReconciliation();
verifyStage4MigrationDefaults();
verifyReadOnlyDiagnostics();

console.log('Infantry combat Stage 5 smoke passed: perception-only 5 Hz tracking, lead, factors, probability, deterministic dispersion, recoil, atomic exactly-once, save/load and migration.');

function verifyTrackingAndPerceptionOnlyContracts(): void {
  const fixed = scenario('stage5-fixed', false);
  const fixedTask = fixed.shooter.infantryCombatRuntime.activeFireTask!;
  const fixedWeapon = fixed.shooter.infantryCombatRuntime.primaryWeapon!;
  updateAimTrackingAtBoundary(fixed.state, fixed.shooter, fixedTask, fixedWeapon, 0.2);
  const fixedSolution = fixedTask.aimTracking.solution;
  assert.equal(fixedSolution.valid, true);
  assert.deepEqual(fixedSolution.estimatedVelocityMetresPerSecond, { x: 0, y: 0, z: 0 });
  assert.equal(fixedSolution.predictedAimPoint?.xMetres, fixedTask.target.xMetres);
  assert.equal(fixedSolution.predictedAimPoint?.yMetres, fixedTask.target.yMetres);
  assert.ok((fixedSolution.predictedAimPoint?.zMetres ?? 0) >= fixedTask.target.zMetres, 'fixed point may receive gravity compensation but never false horizontal lead');

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
  assert.ok(Math.abs(task.aimTracking.solution.estimatedVelocityMetresPerSecond.x - 10) < 1e-9);
  assert.ok(task.aimTracking.solution.predictedAimPoint!.xMetres > task.aimTracking.solution.perceivedPosition!.xMetres);
  assert.notDeepEqual(task.aimTracking.solution.predictedAimPoint, firstPoint);

  const beforeHiddenMove = structuredClone(task.aimTracking.solution.predictedAimPoint);
  moving.target.position.x += 20;
  moving.target.position.y += 20;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 0.6);
  assert.deepEqual(task.aimTracking.solution.predictedAimPoint, beforeHiddenMove, 'true target movement without perception update must not leak into AimSolution');

  const ordered = scenario('stage5-contact-order', true);
  const reversed = scenario('stage5-contact-order', true);
  ordered.shooter.perceptionKnowledge.contacts.push(otherContact('z-contact'));
  reversed.shooter.perceptionKnowledge.contacts.unshift(otherContact('z-contact'));
  updateAimTrackingAtBoundary(ordered.state, ordered.shooter, ordered.shooter.infantryCombatRuntime.activeFireTask!, ordered.shooter.infantryCombatRuntime.primaryWeapon!, 0.2);
  updateAimTrackingAtBoundary(reversed.state, reversed.shooter, reversed.shooter.infantryCombatRuntime.activeFireTask!, reversed.shooter.infantryCombatRuntime.primaryWeapon!, 0.2);
  assert.deepEqual(ordered.shooter.infantryCombatRuntime.activeFireTask!.aimTracking, reversed.shooter.infantryCombatRuntime.activeFireTask!.aimTracking);

  const qualityBefore = task.aimTracking.solution.solutionQuality;
  contact.confidence = 25;
  contact.uncertaintyCells = 8;
  contact.visibleNow = false;
  contact.observedNow = false;
  updateAimTrackingAtBoundary(moving.state, moving.shooter, task, weapon, 3);
  assert.ok(task.aimTracking.solution.solutionQuality < qualityBefore);
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
  assert.deepEqual(serializedUnit(fine.shooter), serializedUnit(coarse.shooter));
  assert.equal(coarse.shooter.infantryCombatRuntime.activeFireTask?.aimTracking.trackingUpdateCount, 5);
  assert.equal(coarse.shooter.infantryCombatRuntime.activeFireTask?.aimTracking.nextTrackingBoundarySeconds, 1.2);

  const restored = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(serializedUnit(coarse.shooter))));
  assert.deepEqual(restored, serializedUnit(coarse.shooter));

  const control = scenario('stage5-save-load-mid-aim', true, 1);
  const loaded = scenario('stage5-save-load-mid-aim', true, 1);
  tickInfantryCombatSimulation(control.state, { intervalStartSeconds: 0, deltaSeconds: 0.55 });
  tickInfantryCombatSimulation(loaded.state, { intervalStartSeconds: 0, deltaSeconds: 0.55 });
  reloadUnitAndProjectiles(loaded.state, loaded.shooter);
  tickInfantryCombatSimulation(control.state, { intervalStartSeconds: 0.55, deltaSeconds: 0.45 });
  tickInfantryCombatSimulation(loaded.state, { intervalStartSeconds: 0.55, deltaSeconds: 0.45 });
  assert.deepEqual(serializedUnit(loaded.shooter), serializedUnit(control.shooter));

  const beforeCommitControl = scenario('stage5-save-load-before-commit', false, 0);
  const beforeCommitLoaded = scenario('stage5-save-load-before-commit', false, 0);
  tickInfantryCombatSimulation(beforeCommitControl.state, { intervalStartSeconds: 0, deltaSeconds: 0.69 });
  tickInfantryCombatSimulation(beforeCommitLoaded.state, { intervalStartSeconds: 0, deltaSeconds: 0.69 });
  reloadUnitAndProjectiles(beforeCommitLoaded.state, beforeCommitLoaded.shooter);
  tickInfantryCombatSimulation(beforeCommitControl.state, { intervalStartSeconds: 0.69, deltaSeconds: 0.11 });
  tickInfantryCombatSimulation(beforeCommitLoaded.state, { intervalStartSeconds: 0.69, deltaSeconds: 0.11 });
  assert.deepEqual(
    serializeReferenceProjectileRuntimeState(beforeCommitLoaded.state.infantryCombatProjectiles).committedShots,
    serializeReferenceProjectileRuntimeState(beforeCommitControl.state.infantryCombatProjectiles).committedShots,
  );
  assert.deepEqual(beforeCommitLoaded.shooter.infantryCombatRuntime.primaryWeapon?.recoil, beforeCommitControl.shooter.infantryCombatRuntime.primaryWeapon?.recoil);
}

function verifyFactorAndProbabilityContracts(): void {
  const weapon = scenario('stage5-factors', false).shooter.infantryCombatRuntime.primaryWeapon!;
  const base = factor(weapon);
  const crouched = factor(weapon, { posture: 'crouched' });
  const prone = factor(weapon, { posture: 'prone' });
  assert.ok(crouched.effectiveDispersionRadians <= base.effectiveDispersionRadians);
  assert.ok(prone.effectiveDispersionRadians <= crouched.effectiveDispersionRadians);

  const moving = factor(weapon, { isMoving: true, movementSpeedMetresPerSecond: 2 });
  assert.ok(moving.effectiveDispersionRadians > base.effectiveDispersionRadians);
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
  assert.ok(impaired.effectiveDispersionRadians > base.effectiveDispersionRadians);
  assert.ok(impaired.aimQualityPerSecond < base.aimQualityPerSecond);

  const probabilityBase = probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 });
  assert.ok(probability({ aimQuality: 0.8, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 }) >= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.02, uncertaintyMetres: 1 }) <= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 100, effectiveDispersionRadians: 0.01, uncertaintyMetres: 3 }) <= probabilityBase);
  assert.ok(probability({ aimQuality: 0.5, distanceMetres: 200, effectiveDispersionRadians: 0.01, uncertaintyMetres: 1 }) <= probabilityBase);

  const progressTask = scenario('stage5-progress', false, 1).shooter.infantryCombatRuntime.activeFireTask!;
  advanceAimPhysicalProgress(progressTask, base, 0.25);
  assert.ok(progressTask.aimTracking.solution.physicalAimQuality > 0);
  assert.ok(progressTask.aimTracking.solution.physicalAimQuality <= 1);
}

function verifySeededDispersionContracts(): void {
  const first = offsets('seeded-shot:1');
  const repeated = offsets('seeded-shot:1');
  const second = offsets('seeded-shot:2');
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

function verifyRecoilExactlyOnceAndAtomicity(): void {
  const ready = scenario('stage5-commit', false, 0);
  const weapon = ready.shooter.infantryCombatRuntime.primaryWeapon!;
  const task = ready.shooter.infantryCombatRuntime.activeFireTask!;
  const roundsBefore = weapon.roundsInWeapon;
  tickInfantryCombatSimulation(ready.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  const record = ready.state.infantryCombatProjectiles.committedShots[0]!;
  const projectile = ready.state.infantryCombatProjectiles.activeProjectiles[0]!;
  assert.equal(weapon.roundsInWeapon, roundsBefore - 1);
  assert.equal(weapon.recoil.sequence, 1);
  assert.ok(record.aimDirectionBeforeDispersion && record.finalProjectileDirection);
  const speed = weapon.resolved.ammo.muzzleVelocityMetersPerSecond;
  assert.ok(Math.abs(projectile.velocityMetresPerSecond.x / speed - record.finalProjectileDirection.x) < 1e-12);
  assert.equal(task.committedShotId, record.shotId);

  const recoilAfterCommit = structuredClone(weapon.recoil);
  assert.equal(commitShot({ state: ready.state, shooter: ready.shooter, task, weapon, committedSeconds: 0.8 }).status, 'already_committed');
  assert.deepEqual(weapon.recoil, recoilAfterCommit);
  const recoveredEarly = getRecoveredWeaponRecoil(weapon, 0.9, factor(weapon));
  const recoveredLate = getRecoveredWeaponRecoil(weapon, 10, factor(weapon));
  assert.ok(Math.abs(recoveredLate.pitchOffsetRadians) <= Math.abs(recoveredEarly.pitchOffsetRadians));
  assert.ok(Math.abs(recoveredLate.yawOffsetRadians) <= Math.abs(recoveredEarly.yawOffsetRadians));
  assert.notDeepEqual(
    prepareCommittedShotDirection({ aimDirection: { x: 1, y: 0, z: 0 }, recoilPitchRadians: 0, recoilYawRadians: 0, dispersionPitchRadians: 0, dispersionYawRadians: 0 }),
    prepareCommittedShotDirection({ aimDirection: { x: 1, y: 0, z: 0 }, recoilPitchRadians: recoilAfterCommit.pitchOffsetRadians, recoilYawRadians: recoilAfterCommit.yawOffsetRadians, dispersionPitchRadians: 0, dispersionYawRadians: 0 }),
  );

  const recoilSnapshot = structuredClone(weapon.recoil);
  const runtimeSnapshot = serializeReferenceProjectileRuntimeState(ready.state.infantryCombatProjectiles);
  ready.shooter.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(serializedUnit(ready.shooter))));
  ready.state.infantryCombatProjectiles = normalizeReferenceProjectileRuntimeState(JSON.parse(JSON.stringify(runtimeSnapshot)));
  assert.deepEqual(ready.shooter.infantryCombatRuntime.primaryWeapon?.recoil, recoilSnapshot);
  assert.deepEqual(serializeReferenceProjectileRuntimeState(ready.state.infantryCombatProjectiles).committedShots, runtimeSnapshot.committedShots);

  const denied = scenario('stage5-moving-denied', false, 0);
  denied.shooter.movementRuntime.isMoving = true;
  denied.shooter.movementRuntime.velocityCellsPerSecond = { x: 1, y: 0 };
  const deniedWeapon = denied.shooter.infantryCombatRuntime.primaryWeapon!;
  const deniedBefore = atomicSnapshot(denied.state, denied.shooter);
  const deniedResult = tickInfantryCombatSimulation(denied.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 }).commitResults[0]!;
  assert.equal(deniedResult.status, 'movement_forbidden');
  assert.deepEqual(atomicSnapshot(denied.state, denied.shooter), deniedBefore);
}

function verifyProbabilityIsNotHitResolver(): void {
  const zero = scenario('stage5-probability-not-resolver', false, 0);
  const one = scenario('stage5-probability-not-resolver', false, 0);
  tickInfantryCombatSimulation(zero.state, { intervalStartSeconds: 0, deltaSeconds: 0.69 });
  tickInfantryCombatSimulation(one.state, { intervalStartSeconds: 0, deltaSeconds: 0.69 });
  zero.shooter.infantryCombatRuntime.activeFireTask!.aimTracking.solution.predictedHitProbability = 0;
  one.shooter.infantryCombatRuntime.activeFireTask!.aimTracking.solution.predictedHitProbability = 1;
  tickInfantryCombatSimulation(zero.state, { intervalStartSeconds: 0.69, deltaSeconds: 0.11 });
  tickInfantryCombatSimulation(one.state, { intervalStartSeconds: 0.69, deltaSeconds: 0.11 });
  assert.deepEqual(
    zero.state.infantryCombatProjectiles.committedShots[0]?.finalProjectileDirection,
    one.state.infantryCombatProjectiles.committedShots[0]?.finalProjectileDirection,
  );
}

function verifyOrderIndependenceAndReconciliation(): void {
  const ordered = scenario('stage5-unit-order', false, 0);
  const reversed = scenario('stage5-unit-order', false, 0);
  reversed.state.units.reverse();
  tickInfantryCombatSimulation(ordered.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  tickInfantryCombatSimulation(reversed.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  assert.deepEqual(
    serializeReferenceProjectileRuntimeState(ordered.state.infantryCombatProjectiles),
    serializeReferenceProjectileRuntimeState(reversed.state.infantryCombatProjectiles),
  );
  reconcileInfantryCombatRuntimeAfterLoad(ordered.state);
  const once = JSON.stringify({
    unit: serializedUnit(ordered.shooter),
    projectile: serializeReferenceProjectileRuntimeState(ordered.state.infantryCombatProjectiles),
  });
  reconcileInfantryCombatRuntimeAfterLoad(ordered.state);
  assert.equal(JSON.stringify({
    unit: serializedUnit(ordered.shooter),
    projectile: serializeReferenceProjectileRuntimeState(ordered.state.infantryCombatProjectiles),
  }), once);
}

function verifyStage4MigrationDefaults(): void {
  const current = scenario('stage5-migration', true, 1);
  tickInfantryCombatSimulation(current.state, { intervalStartSeconds: 0, deltaSeconds: 0.4 });
  const stage4Unit = structuredClone(serializedUnit(current.shooter)) as any;
  delete stage4Unit.primaryWeapon.operatorProfile;
  delete stage4Unit.primaryWeapon.recoil;
  delete stage4Unit.activeFireTask.aimTracking;
  const migratedUnit = normalizeInfantryCombatUnitRuntime(stage4Unit);
  assert.equal(migratedUnit.primaryWeapon?.operatorProfile.shootingSkill, 0.5);
  assert.equal(migratedUnit.primaryWeapon?.operatorProfile.proficiencyByWeaponClass.rifle, 'trained');
  assert.equal(migratedUnit.primaryWeapon?.recoil.sequence, 0);
  assert.equal(migratedUnit.activeFireTask?.aimTracking.trackingUpdateCount, 0);

  const committed = scenario('stage5-projectile-migration', false, 0);
  tickInfantryCombatSimulation(committed.state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  const stage4Projectile = structuredClone(serializeReferenceProjectileRuntimeState(committed.state.infantryCombatProjectiles)) as any;
  for (const record of stage4Projectile.committedShots) {
    delete record.aimDirectionBeforeDispersion;
    delete record.dispersionPitchRadians;
    delete record.dispersionYawRadians;
    delete record.recoilPitchRadians;
    delete record.recoilYawRadians;
    delete record.finalProjectileDirection;
    delete record.predictedHitProbability;
    delete record.effectiveDispersionRadians;
  }
  const migratedProjectile = normalizeReferenceProjectileRuntimeState(stage4Projectile);
  assert.equal(migratedProjectile.committedShots.length, 1);
  assert.equal(migratedProjectile.activeProjectiles.length, 1);
}

function verifyReadOnlyDiagnostics(): void {
  const current = scenario('stage5-diagnostics', true, 1);
  tickInfantryCombatSimulation(current.state, { intervalStartSeconds: 0, deltaSeconds: 0.4 });
  const before = serializedUnit(current.shooter);
  const diagnostics = getInfantryCombatDiagnostics(current.state);
  const task = diagnostics.units.find((entry) => entry.unitId === current.shooter.id)?.fireTask;
  assert.equal(task?.trackingUpdateCount, 2);
  assert.equal(task?.trackingIntervalSeconds, 0.2);
  assert.ok(task?.perceivedPosition);
  assert.ok(task?.factors);
  assert.deepEqual(serializedUnit(current.shooter), before);
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

function offsets(shotId: string) {
  return deriveSeededAngularOffsets({
    shooterId: 'seeded-shooter',
    weaponInstanceId: 'seeded-weapon',
    shotId,
    effectiveDispersionRadians: 0.02,
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

function reloadUnitAndProjectiles(state: SimulationState, shooter: UnitModel): void {
  shooter.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(serializedUnit(shooter))));
  shooter.behaviorRuntime.physicalActionCoordinator = normalizePhysicalActionCoordinatorState(JSON.parse(JSON.stringify(
    serializePhysicalActionCoordinatorState(shooter.behaviorRuntime.physicalActionCoordinator),
  )));
  state.infantryCombatProjectiles = normalizeReferenceProjectileRuntimeState(JSON.parse(JSON.stringify(
    serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles),
  )));
}

function serializedUnit(shooter: UnitModel) {
  return serializeInfantryCombatUnitRuntime(shooter.infantryCombatRuntime);
}

function atomicSnapshot(state: SimulationState, shooter: UnitModel): unknown {
  return {
    rounds: shooter.infantryCombatRuntime.primaryWeapon?.roundsInWeapon,
    recoil: structuredClone(shooter.infantryCombatRuntime.primaryWeapon?.recoil),
    projectiles: serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles),
  };
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
