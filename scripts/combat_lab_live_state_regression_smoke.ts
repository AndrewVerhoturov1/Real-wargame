import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CombatLabVisualSession } from '../src/combat-lab/runtime/CombatLabVisualSession';
import { buildUnitBarSnapshot } from '../src/ui/UnitBarPresentation';

const RIFLE_DISTANCE_SCENARIO_ID = 'rifle-distance-baseline';

verifyEditorModeKeepsInsetSizedMapRoot();
verifyUnitBarReadsInfantryCombatRuntime();
verifyJournalNamesShooterAndVictim();

console.log('Combat Lab live state regression smoke passed.');

function verifyEditorModeKeepsInsetSizedMapRoot(): void {
  const css = readFileSync('src/combat-lab/combat-lab-workspace.css', 'utf8');
  assert.match(
    css,
    /body\.app-shell-mode-combat-lab\.workspace-simulation #app,\s*body\.app-shell-mode-combat-lab\.workspace-editor #app\s*\{[^}]*width:\s*auto\s*!important;[^}]*height:\s*auto\s*!important;/s,
    'Combat Lab simulation and editor modes must both let fixed insets determine the map root size.',
  );
}

function verifyUnitBarReadsInfantryCombatRuntime(): void {
  const session = new CombatLabVisualSession(RIFLE_DISTANCE_SCENARIO_ID, 1);
  const shooter = session.state.units.find((unit) => unit.id === 'rifle-distance-shooter');
  assert.ok(shooter, 'Rifle-distance shooter is required.');
  const weapon = shooter.infantryCombatRuntime.primaryWeapon;
  assert.ok(weapon, 'Rifle-distance shooter must have an infantry-combat weapon.');
  const reserve = shooter.infantryCombatRuntime.ammoInventory.reserves.find(
    (entry) => entry.ammoDefinitionId === weapon.resolved.ammo.ammoDefinitionId,
  );
  assert.ok(reserve, 'Matching infantry-combat reserve is required.');

  weapon.roundsInWeapon = 3;
  reserve.rounds = 47;
  shooter.infantryCombatRuntime.physiology.blood.bloodLoss = 0.25;
  shooter.infantryCombatRuntime.physiology.fatigue.fatigue = 0.4;
  shooter.infantryCombatRuntime.suppression.suppressionLevel = 0.3;

  const snapshot = buildUnitBarSnapshot(shooter);
  assert.equal(snapshot.roundsLoaded, 3, 'Unit bar must read roundsInWeapon from infantryCombatRuntime.');
  assert.equal(snapshot.roundsReserve, 47, 'Unit bar must read matching infantry-combat reserves.');
  assert.equal(snapshot.healthLabelRu, 'Кровь', 'The obsolete generic health label must not hide the blood-loss model.');
  assert.equal(snapshot.healthPercent, 75, 'Unit bar blood percentage must reflect production blood loss.');
  assert.equal(snapshot.fatiguePercent, 40, 'Unit bar fatigue must reflect production physiology.');
  assert.equal(snapshot.suppressionPercent, 30, 'Unit bar suppression must reflect production suppression runtime.');
}

function verifyJournalNamesShooterAndVictim(): void {
  const session = new CombatLabVisualSession(RIFLE_DISTANCE_SCENARIO_ID, 1);
  const result = session.executeInteractive({
    kind: 'fire',
    shooterUnitId: 'rifle-distance-shooter',
    targetUnitId: 'rifle-target-25',
    targetPointMetres: null,
    mode: 'single',
    targetRadiusMetres: 0,
    minimumSolutionQuality: 0.65,
  });
  assert.equal(result.accepted, true, `Combat Lab fire command must be accepted: ${result.reasonCode}`);
  session.setPaused(false);

  for (let step = 0; step < 120 && session.state.infantryCombatProjectiles.impacts.length === 0; step += 1) {
    session.advance(0.05);
  }
  const impact = session.state.infantryCombatProjectiles.impacts.find(
    (candidate) => candidate.hitUnitId === 'rifle-target-25',
  );
  assert.ok(impact, 'The deterministic 25 m rifle shot must produce a victim impact for the journal contract.');

  const journal = session.getSnapshot().eventJournal.join('\n');
  assert.match(journal, /Стрелок:\s+Винтовочник/, 'Journal must contain a human-readable shooter entry.');
  assert.match(journal, /Жертва:\s+Мишень 25 м/, 'Journal must contain a human-readable victim entry.');
  assert.match(journal, /кров/i, 'Victim journal entry must report blood state or blood loss.');
  assert.match(journal, /ранен|погиб|сознани|боеспособ/i, 'Victim journal entry must report effective condition.');
}
