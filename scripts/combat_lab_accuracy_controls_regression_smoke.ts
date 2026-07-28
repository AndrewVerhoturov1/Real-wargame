import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  deriveSeededAngularOffsets,
  equipPrimaryWeaponFromLoadout,
  getFireTaskTestOverrides,
  resolveProductionAimFactors,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';
import {
  executeCombatLabCommand,
  type CombatLabScriptCommandV1,
} from '../src/core/testing/combat-lab';

const accuracyOverrides = {
  schemaVersion: 1,
  dispersionMultiplier: 2,
  aimTimeSeconds: 4,
  shootingSkill: 0.25,
  weaponProficiency: 'untrained',
  randomnessMultiplier: 0,
  randomSeed: 991,
  usePhysicalAimThreshold: true,
} as const;

verifyUnitTargetsRequireProductionContacts();
verifyWeakPerceptionNeedsExplicitForce();
verifyAccuracyOverridesReachProductionAimRuntime();
verifyCombatLabExposesRequestedControls();

console.log('Combat Lab honest accuracy controls regression smoke passed.');

function verifyUnitTargetsRequireProductionContacts(): void {
  const { state, shooter, target } = createScenario('accuracy-contact-required');
  const result = executeCombatLabCommand(state, fireCommand(shooter.id, target.id, false), {
    ownerId: 'accuracy-contact-required',
    commandSequence: 1,
    interactive: true,
  });

  assert.equal(
    result.reasonCode,
    'combat_lab_target_contact_missing',
    'Combat Lab must not fall back to the selected unit true position when the shooter has no production contact.',
  );
  assert.equal(shooter.infantryCombatRuntime.activeFireTask, null);
}

function verifyWeakPerceptionNeedsExplicitForce(): void {
  const { state, shooter, target } = createScenario('accuracy-perception-gate');
  const contactPosition = { x: 12.25, y: 7.75 };
  shooter.perceptionKnowledge.contacts = [{
    id: `${shooter.id}:weak-contact:${target.id}`,
    stimulusId: target.id,
    sourceUnitId: target.id,
    labelRu: 'Слабый контакт цели',
    stage: 'cue',
    source: 'reported',
    evidence: 25,
    confidence: 20,
    uncertaintyCells: 4,
    lastKnownPosition: contactPosition,
    visibleNow: false,
    observedNow: false,
    lastObservedSeconds: 0,
    lastUpdatedSeconds: 0,
    evidencePerSecond: 0,
    detectionVariance: 1,
    explanationRu: [],
  }];

  const normal = executeCombatLabCommand(state, fireCommand(shooter.id, target.id, false), {
    ownerId: 'accuracy-perception-gate',
    commandSequence: 1,
    interactive: true,
  });
  assert.equal(
    normal.reasonCode,
    'combat_lab_perception_below_threshold',
    'Normal fire must obey the independent perception threshold.',
  );
  assert.equal(shooter.infantryCombatRuntime.activeFireTask, null);

  const forced = executeCombatLabCommand(state, fireCommand(shooter.id, target.id, true), {
    ownerId: 'accuracy-perception-gate',
    commandSequence: 2,
    interactive: true,
  });
  assert.equal(forced.accepted, true, 'Forced fire must bypass only the perception decision gate when a contact exists.');

  const task = shooter.infantryCombatRuntime.activeFireTask;
  assert.ok(task, 'Forced fire must create a production FireTask.');
  assert.equal(task.contactId, shooter.perceptionKnowledge.contacts[0]!.id);
  assert.equal(task.target.xMetres, contactPosition.x * state.map.metersPerCell);
  assert.equal(task.target.yMetres, contactPosition.y * state.map.metersPerCell);
  assert.notEqual(
    task.target.xMetres,
    target.position.x * state.map.metersPerCell,
    'The FireTask XY target must come from contact memory, not the selected unit true position.',
  );
}

function verifyAccuracyOverridesReachProductionAimRuntime(): void {
  const { state, shooter, target } = createScenario('accuracy-overrides');
  shooter.perceptionKnowledge.contacts = [{
    id: `${shooter.id}:contact:${target.id}`,
    stimulusId: target.id,
    sourceUnitId: target.id,
    labelRu: 'Контакт цели',
    stage: 'confirmed',
    source: 'visual',
    evidence: 180,
    confidence: 100,
    uncertaintyCells: 0.25,
    lastKnownPosition: { x: target.position.x, y: target.position.y },
    visibleNow: true,
    observedNow: true,
    lastObservedSeconds: 0,
    lastUpdatedSeconds: 0,
    evidencePerSecond: 0,
    detectionVariance: 1,
    explanationRu: [],
  }];

  const result = executeCombatLabCommand(state, fireCommand(shooter.id, target.id, false), {
    ownerId: 'accuracy-overrides',
    commandSequence: 1,
    interactive: true,
  });
  assert.equal(result.accepted, true);

  const task = shooter.infantryCombatRuntime.activeFireTask;
  const weapon = shooter.infantryCombatRuntime.primaryWeapon;
  assert.ok(task && weapon);
  assert.deepEqual(getFireTaskTestOverrides(task), accuracyOverrides);

  const factors = resolveProductionAimFactors(state, shooter, weapon);
  assert.equal(factors.shootingSkill, 0.25);
  assert.equal(factors.proficiency, 'untrained');
  assert.equal(factors.aimQualityPerSecond, 0.25, 'Four seconds to full aim must produce 0.25 quality per second.');
  assert.ok(
    factors.effectiveDispersionRadians > weapon.resolved.weapon.baseDispersionRadians,
    'The 2x dispersion override and untrained profile must increase production dispersion.',
  );

  const seedOne = deriveSeededAngularOffsets({
    shooterId: shooter.id,
    weaponInstanceId: weapon.weaponInstanceId,
    shotId: `${shooter.id}:shot:1`,
    effectiveDispersionRadians: factors.effectiveDispersionRadians,
    seedSalt: 1,
  });
  const seedTwo = deriveSeededAngularOffsets({
    shooterId: shooter.id,
    weaponInstanceId: weapon.weaponInstanceId,
    shotId: `${shooter.id}:shot:1`,
    effectiveDispersionRadians: factors.effectiveDispersionRadians,
    seedSalt: 2,
  });
  assert.notDeepEqual(seedOne, seedTwo, 'Combat Lab seed must alter the deterministic shot sequence.');
}

function verifyCombatLabExposesRequestedControls(): void {
  const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
  const controls = readFileSync('src/combat-lab/ui/CombatLabAccuracyControls.ts', 'utf8');
  const css = readFileSync('src/combat-lab/combat-lab.css', 'utf8');
  const commands = readFileSync('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8');
  const uiSources = `${shell}\n${controls}`;

  for (const label of [
    'Уровень разброса',
    'Время прицеливания',
    'Порог прицеливания',
    'Навык стрельбы',
    'Владение классом оружия',
    'Порог восприятия',
    'Уровень случайности',
    'Принудительная стрельба',
  ]) {
    assert.ok(uiSources.includes(label), `Combat Lab control is missing: ${label}`);
  }
  for (const token of [
    'minimumPerceptionQuality',
    'forceFire',
    'accuracyOverrides',
    'combat_lab_target_contact_missing',
    'combat_lab_perception_below_threshold',
  ]) {
    assert.ok(commands.includes(token), `Combat Lab command path must contain ${token}.`);
  }
  assert.ok(controls.includes("type = 'range'"), 'Accuracy controls must use real range sliders.');
  assert.ok(uiSources.includes('Сбросить параметры'), 'Accuracy overrides need an explicit reset to production defaults.');
  assert.ok(css.includes('.combat-lab-slider'), 'Combat Lab must style the slider/value pairs compactly.');
}

function fireCommand(shooterUnitId: string, targetUnitId: string, forceFire: boolean): CombatLabScriptCommandV1 {
  return {
    kind: 'fire',
    shooterUnitId,
    targetUnitId,
    targetPointMetres: null,
    mode: 'single',
    targetRadiusMetres: 0,
    minimumSolutionQuality: 0.5,
    minimumPerceptionQuality: 0.5,
    forceFire,
    accuracyOverrides,
  };
}

function createScenario(id: string) {
  const state = createInitialState({
    width: 80,
    height: 30,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: `${id}-shooter`, side: 'blue', x: 2, y: 5, type: 'infantry_squad', facingDegrees: 0 },
    { id: `${id}-target`, side: 'red', x: 30, y: 5, type: 'infantry_squad', facingDegrees: 180 },
  ]);
  const shooter = state.units[0]!;
  const target = state.units[1]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  ).status, 'equipped');
  return { state, shooter, target };
}
