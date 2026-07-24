import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-infantry-combat-stage5-aim-smoke');
const sourcePath = path.join(repoRoot, 'scripts', 'infantry_combat_stage5_aim_smoke.ts');
const probePath = path.join(repoRoot, 'scripts', '.tmp_infantry_combat_stage5_probe.ts');
const excludedCalls = [
  'verifyTrackingAndPerceptionOnlyContracts();',
  'verifyTrackingSchedulerAndSaveLoad();',
  'verifyFactorAndProbabilityContracts();',
  'verifySeededDispersionContracts();',
  'verifyProbabilityIsNotHitResolver();',
  'verifyOrderIndependenceAndReconciliation();',
  'verifyStage4MigrationDefaults();',
  'verifyReadOnlyDiagnostics();',
];
const recoilProbe = `{
  const ready = scenario('stage5-commit-probe', false, 0);
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
}`;

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await rm(probePath, { force: true });
  try {
    let source = await readFile(sourcePath, 'utf8');
    for (const call of excludedCalls) source = source.replace(call, `// CI probe skipped: ${call}`);
    source = source.replace('verifyRecoilExactlyOnceAndAtomicity();', recoilProbe);
    await writeFile(probePath, source, 'utf8');
    await runSmoke('.tmp_infantry_combat_stage5_probe.ts', 'stage5-aim-smoke.mjs');
  } finally {
    await rm(probePath, { force: true });
    await rm(outDir, { recursive: true, force: true });
  }
}

async function runSmoke(sourceName, outputName) {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    clearScreen: false,
    build: {
      ssr: path.join(repoRoot, 'scripts', sourceName),
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: outputName, format: 'es' } },
    },
  });
  await import(`${pathToFileURL(path.join(outDir, outputName)).href}?run=stage5-probe`);
}
