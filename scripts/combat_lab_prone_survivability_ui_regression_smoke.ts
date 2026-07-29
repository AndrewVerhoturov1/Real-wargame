import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CombatLabVisualSession } from '../src/combat-lab/runtime/CombatLabVisualSession';
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
verifyAutomaticWeaponTargetsUseSeparatedFiringLanes();
verifyJournalReportsPhysicalMisses();
verifyJournalReportsProductionMoralEffects();
verifyToolbarCannotCoverScrolledControls();
verifyWorkspaceResizeWaitsForCssTransition();
verifyMetricCardsHaveRussianLabels();

console.log('Combat Lab prone target, firing lanes, journal, survivability and UI regression smoke passed.');

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
    accuracyOverrides: deterministicAccuracyOverrides(9041),
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
  verifyFiringLaneSet(built, 'rifle-distance-shooter', [
    { unitId: 'rifle-target-25', distanceMetres: 25 },
    { unitId: 'rifle-target-50', distanceMetres: 50 },
    { unitId: 'rifle-target-100', distanceMetres: 100 },
    { unitId: 'rifle-target-200', distanceMetres: 200 },
  ], 6);
}

function verifyAutomaticWeaponTargetsUseSeparatedFiringLanes(): void {
  const ppsh = buildCombatLabInitialState('ppsh-burst-recoil', 1, 9043);
  verifyFiringLaneSet(ppsh, 'ppsh-shooter', [
    { unitId: 'ppsh-target-15', distanceMetres: 15 },
    { unitId: 'ppsh-target-30', distanceMetres: 30 },
    { unitId: 'ppsh-target-60', distanceMetres: 60 },
  ], 10);

  const dp27 = buildCombatLabInitialState('dp27-portable-deployed', 1, 9044);
  verifyFiringLaneSet(dp27, 'dp-portable-gunner', [
    { unitId: 'dp-portable-target-50', distanceMetres: 50 },
    { unitId: 'dp-portable-target-100', distanceMetres: 100 },
    { unitId: 'dp-portable-target-150', distanceMetres: 150 },
  ], 8);
}

function verifyJournalReportsPhysicalMisses(): void {
  const session = new CombatLabVisualSession('rifle-distance-baseline', 9041);
  const shooter = requireUnit(session, 'rifle-distance-shooter');
  const result = session.executeInteractive({
    kind: 'fire',
    shooterUnitId: shooter.id,
    targetUnitId: null,
    targetPointMetres: { xMetres: 28, yMetres: 6, zMetres: 0.05 },
    mode: 'single',
    targetRadiusMetres: 0,
    minimumSolutionQuality: 0.5,
    minimumPerceptionQuality: 0,
    forceFire: true,
    accuracyOverrides: deterministicAccuracyOverrides(9049),
  });
  assert.equal(result.accepted, true, result.reasonRu);

  stepSessionUntil(session, (entry) => entry.includes('промах'), 360);
  assert.ok(
    session.getSnapshot().eventJournal.some((entry) => entry.includes('промах')),
    'A physical projectile that does not hit a unit must be explicitly described as a miss.',
  );
}

function verifyJournalReportsProductionMoralEffects(): void {
  const session = new CombatLabVisualSession('rifle-distance-baseline', 9041);
  const shooter = requireUnit(session, 'rifle-distance-shooter');
  const target = requireUnit(session, 'rifle-target-25');
  shooter.perceptionKnowledge.contacts = [advanceVisualContact(null, {
    id: `${shooter.id}:contact:${target.id}`,
    stimulusId: target.id,
    sourceUnitId: target.id,
    labelRu: 'Наблюдаемая мишень',
    position: { ...target.position },
    targetHeightMeters: 1.1,
    evidencePerSecond: 200,
    deltaSeconds: 1,
    nowSeconds: 0,
  })];

  const result = session.executeInteractive({
    kind: 'fire',
    shooterUnitId: shooter.id,
    targetUnitId: target.id,
    targetPointMetres: null,
    mode: 'single',
    targetRadiusMetres: 0,
    minimumSolutionQuality: 0.5,
    minimumPerceptionQuality: 0,
    forceFire: true,
    accuracyOverrides: deterministicAccuracyOverrides(9050),
  });
  assert.equal(result.accepted, true, result.reasonRu);

  stepSessionUntil(session, (entry) => entry.includes('Моральное воздействие:'), 480);
  assert.ok(
    session.state.infantryCombatProjectiles.impacts.some((impact) => impact.hitUnitId === target.id),
    'The moral-effect journal regression must be driven by a real physical hit.',
  );
  const effectEntry = session.getSnapshot().eventJournal.find((entry) => (
    entry.includes('Моральное воздействие:') && entry.includes(`[${target.id}]`)
  ));
  assert.ok(effectEntry, 'A production suppression update must create a journal entry for the affected target.');
  assert.match(effectEntry, /подавление \d+(?:,\d)?→\d+(?:,\d)?%/);
  assert.match(effectEntry, /стресс \d+(?:,\d)?→\d+(?:,\d)?%/);
  assert.match(effectEntry, /боевой дух \d+(?:,\d)?→\d+(?:,\d)?%/);
}

function verifyFiringLaneSet(
  built: Pick<ReturnType<typeof buildCombatLabInitialState>, 'state'>,
  shooterUnitId: string,
  targets: readonly { readonly unitId: string; readonly distanceMetres: number }[],
  minimumBearingSeparationDegrees: number,
): void {
  const shooter = requireUnit(built, shooterUnitId);
  const bearings = targets.map(({ unitId, distanceMetres }) => {
    const target = requireUnit(built, unitId);
    const deltaX = target.position.x - shooter.position.x;
    const deltaY = target.position.y - shooter.position.y;
    const actualDistance = Math.hypot(deltaX, deltaY) * built.state.map.metersPerCell;
    assert.ok(
      Math.abs(actualDistance - distanceMetres) < 1e-6,
      `${unitId} must preserve ${distanceMetres} m, got ${actualDistance} m.`,
    );
    return Math.atan2(deltaY, deltaX) * 180 / Math.PI;
  }).sort((left, right) => left - right);

  for (let index = 1; index < bearings.length; index += 1) {
    assert.ok(
      bearings[index]! - bearings[index - 1]! >= minimumBearingSeparationDegrees,
      `Neighbouring firing lanes must differ by at least ${minimumBearingSeparationDegrees}°, got ${bearings[index - 1]}° and ${bearings[index]}°`,
    );
  }
}

function stepSessionUntil(
  session: CombatLabVisualSession,
  predicate: (entry: string) => boolean,
  maximumSteps: number,
): void {
  for (let step = 0; step < maximumSteps; step += 1) {
    session.stepOnce();
    if (session.getSnapshot().eventJournal.some(predicate)) return;
  }
}

function deterministicAccuracyOverrides(randomSeed: number) {
  return {
    schemaVersion: 1 as const,
    dispersionMultiplier: 0.05,
    aimTimeSeconds: 0.05,
    shootingSkill: 1,
    weaponProficiency: 'specialist' as const,
    randomnessMultiplier: 0,
    randomSeed,
    usePhysicalAimThreshold: true as const,
  };
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
  built: Pick<ReturnType<typeof buildCombatLabInitialState>, 'state'>,
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
