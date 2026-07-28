import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceVisualContact } from '../src/core/perception/PerceptionContact';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import {
  COMBAT_LAB_FIXED_STEP_SECONDS,
  COMBAT_LAB_METRIC_IDS,
  buildCombatLabInitialState,
  executeCombatLabCommand,
  preserveCombatLabTargetSurvivability,
} from '../src/core/testing/combat-lab';
import { combatLabMetricLabelRu } from '../src/combat-lab/ui/CombatLabMetricLabels';

verifyProneContactHeightReachesPhysicalHit();
verifyOnlyLaboratoryTargetsAreKeptAlive();
verifyRifleTargetsUseSeparatedFiringLanes();
verifyToolbarCannotCoverScrolledControls();
verifyWorkspaceResizeWaitsForCssTransition();
verifyMetricCardsHaveRussianLabels();

console.log('Combat Lab prone target, survivability and UI regression smoke passed.');

function verifyProneContactHeightReachesPhysicalHit(): void {
  const built = buildCombatLabInitialState('rifle-distance-baseline', 1, 9041);
  const shooter = requireUnit(built, 'rifle-distance-shooter');
  const target = requireUnit(built, 'rifle-target-25');
  target.behaviorRuntime.posture = 'prone';

  const contact = advanceVisualContact(null, {
    id: `${shooter.id}:contact:${target.id}`,
    stimulusId: target.id,
    sourceUnitId: target.id,
    labelRu: 'Наблюдаемая лежачая мишень',
    position: { ...target.position },
    targetHeightMeters: 0.35,
    evidencePerSecond: 200,
    deltaSeconds: 1,
    nowSeconds: 0,
  });
  shooter.perceptionKnowledge.contacts = [contact];
  assert.equal(contact.lastKnownTargetHeightMeters, 0.35, 'Visual contact must remember observed target height.');

  const result = executeCombatLabCommand(built.state, {
    kind: 'fire',
    shooterUnitId: shooter.id,
    targetUnitId: target.id,
    targetPointMetres: null,
    mode: 'single',
    targetRadiusMetres: 0,
    minimumSolutionQuality: 0.5,
    minimumPerceptionQuality: 0,
    forceFire: true,
    accuracyOverrides: {
      schemaVersion: 1,
      dispersionMultiplier: 0.05,
      aimTimeSeconds: 0.05,
      shootingSkill: 1,
      weaponProficiency: 'specialist',
      randomnessMultiplier: 0,
      randomSeed: 9041,
      usePhysicalAimThreshold: true,
    },
  }, {
    ownerId: 'prone-height-regression',
    commandSequence: 1,
    interactive: true,
  });
  assert.equal(result.accepted, true);
  assert.ok(shooter.infantryCombatRuntime.activeFireTask);
  assert.ok(
    shooter.infantryCombatRuntime.activeFireTask.target.zMetres < 0.5,
    'A task based on an observed prone contact must aim inside the prone body volume.',
  );

  for (let step = 0; step < 240 && built.state.infantryCombatProjectiles.impacts.length === 0; step += 1) {
    tickSimulation(built.state, COMBAT_LAB_FIXED_STEP_SECONDS);
  }
  assert.ok(
    built.state.infantryCombatProjectiles.impacts.some((impact) => impact.hitUnitId === target.id),
    'A deterministic 25 m shot aimed at the observed prone height must physically hit the prone target.',
  );
}

function verifyOnlyLaboratoryTargetsAreKeptAlive(): void {
  const built = buildCombatLabInitialState('rifle-distance-baseline', 1, 9041);
  const shooter = requireUnit(built, 'rifle-distance-shooter');
  const target = requireUnit(built, 'rifle-target-25');
  killForTest(target);
  killForTest(shooter);

  preserveCombatLabTargetSurvivability(built.state, built.roles);

  const targetBlood = target.infantryCombatRuntime.physiology.blood;
  assert.ok(targetBlood.bloodLoss < 0.5, 'A laboratory target must stay below the critical blood threshold.');
  assert.equal(targetBlood.pendingBloodLoss, 0);
  assert.equal(targetBlood.state === 'dead' || targetBlood.state === 'unconscious', false);
  assert.equal(target.infantryCombatRuntime.wounds.capabilities.alive, true);
  assert.equal(target.infantryCombatRuntime.wounds.capabilities.conscious, true);
  assert.equal(
    shooter.infantryCombatRuntime.physiology.blood.state,
    'dead',
    'Survivability protection must not revive shooters or other non-target roles.',
  );
}

function verifyRifleTargetsUseSeparatedFiringLanes(): void {
  const built = buildCombatLabInitialState('rifle-distance-baseline', 1, 9041);
  const shooter = requireUnit(built, 'rifle-distance-shooter');
  const targets = ['rifle-target-25', 'rifle-target-50', 'rifle-target-100', 'rifle-target-200']
    .map((unitId) => requireUnit(built, unitId));
  const bearings = targets.map((target) => Math.atan2(
    target.position.y - shooter.position.y,
    target.position.x - shooter.position.x,
  ) * 180 / Math.PI).sort((left, right) => left - right);
  for (let index = 1; index < bearings.length; index += 1) {
    assert.ok(
      bearings[index]! - bearings[index - 1]! >= 6,
      `Neighbouring firing lanes must differ by at least 6°, got ${bearings[index - 1]}° and ${bearings[index]}°`,
    );
  }
}

function verifyToolbarCannotCoverScrolledControls(): void {
  const css = readFileSync('src/combat-lab/combat-lab.css', 'utf8');
  const toolbarRule = css.match(/\.combat-lab-run-toolbar\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.doesNotMatch(toolbarRule, /position:\s*sticky/, 'The run toolbar must scroll normally instead of covering controls.');
  assert.doesNotMatch(toolbarRule, /top:\s*0/, 'A non-sticky toolbar must not keep a sticky top offset.');
}

function verifyWorkspaceResizeWaitsForCssTransition(): void {
  const workspace = readFileSync('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8');
  assert.match(workspace, /WORKSPACE_LAYOUT_TRANSITION_MILLISECONDS\s*=\s*150/);
  assert.match(workspace, /window\.setTimeout\([^)]*WORKSPACE_LAYOUT_TRANSITION_MILLISECONDS\s*\+\s*WORKSPACE_LAYOUT_RESIZE_SETTLE_MILLISECONDS/s);
  assert.match(workspace, /scheduleWorkspaceViewportResize\(\)/);
}

function verifyMetricCardsHaveRussianLabels(): void {
  for (const metricId of COMBAT_LAB_METRIC_IDS) {
    const label = combatLabMetricLabelRu(metricId);
    assert.notEqual(label, metricId, `Metric ${metricId} must not be shown as a raw technical identifier.`);
    assert.match(label, /[А-Яа-яЁё]/, `Metric ${metricId} needs a Russian visible label.`);
  }
  const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
  assert.ok(extension.includes('combatLabMetricLabelRu(key)'), 'Metric cards must use the Russian label resolver.');
  assert.doesNotMatch(extension, /node\('span', '', humanize\(key\)\)/, 'Metric cards must not humanize raw English keys.');
}

function requireUnit(
  built: ReturnType<typeof buildCombatLabInitialState>,
  unitId: string,
) {
  const unit = built.state.units.find((candidate) => candidate.id === unitId);
  assert.ok(unit, `Missing unit ${unitId}`);
  return unit;
}

function killForTest(unit: ReturnType<typeof requireUnit>): void {
  const blood = unit.infantryCombatRuntime.physiology.blood;
  blood.bloodLoss = 1;
  blood.pendingBloodLoss = 0.25;
  blood.state = 'dead';
  unit.infantryCombatRuntime.wounds.capabilities = {
    alive: false,
    conscious: false,
    canStand: false,
    canMove: false,
    canUseHands: false,
    canUseWeapon: false,
    movementSpeedMultiplier: 0,
    stabilityMultiplier: 0,
    accuracyMultiplier: 0,
  };
}
