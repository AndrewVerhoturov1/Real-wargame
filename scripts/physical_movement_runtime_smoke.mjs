import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const outDir = path.join(root, '.tmp-physical-movement-runtime-smoke');
const adaptedSmoke = path.join(root, 'scripts', '.tmp-physical-movement-runtime-smoke.ts');
const entry = path.join(outDir, 'physical-movement-runtime-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  const original = await readFile(path.join(root, 'scripts', 'physical_movement_runtime_smoke.ts'), 'utf8');
  const importMarker = '  preparePhysicalMovementStep,\n  setMovementProfileRequest,';
  const migratedImport = '  preparePhysicalMovementStep,\n  requestMovementWeaponPreparation,\n  setMovementProfileRequest,';
  const legacyFixture = `  assert.equal(requestFireAction(state, shooter, contactId), false);
  const stale = getMovementWeaponPreparation(shooter);
  assert.ok(stale);
  shooter.movementRuntime.weaponPreparationRevision += 1;
  shooter.movementRuntime.weaponPreparation = {
    ownerToken: 'fire-intent:newer-contact',
    contactId: 'newer-contact',
    orderIssuedAtMs: shooter.order?.issuedAtMs ?? null,
    remainingSeconds: 1,
    revision: shooter.movementRuntime.weaponPreparationRevision,
  };
  assert.equal(cancelMovementWeaponPreparation(shooter, { ownerToken: stale.ownerToken, revision: stale.revision }), false, 'stale cleanup must not cancel newer preparation');
  assert.equal(getMovementWeaponPreparation(shooter)?.contactId, 'newer-contact');

  shooter.movementRuntime.weaponPreparation = null;
`;
  const coordinatorFixture = `  assert.equal(requestFireAction(state, shooter, contactId), false);
  const stale = getMovementWeaponPreparation(shooter);
  assert.ok(stale);
  const newerRequest = requestMovementWeaponPreparation(state, shooter, {
    contactId: 'newer-contact',
    ownerToken: 'fire-intent:newer-contact',
  });
  assert.equal(newerRequest.allowed, false);
  const newer = getMovementWeaponPreparation(shooter);
  assert.ok(newer);
  assert.equal(newer.contactId, 'newer-contact');
  assert.equal(cancelMovementWeaponPreparation(shooter, { ownerToken: stale.ownerToken, revision: stale.revision }), false, 'stale cleanup must not cancel newer preparation');
  assert.equal(getMovementWeaponPreparation(shooter)?.contactId, 'newer-contact');
  assert.equal(cancelMovementWeaponPreparation(shooter, {
    ownerToken: newer.ownerToken,
    revision: newer.revision,
    contactId: newer.contactId,
  }), true, 'current preparation cleanup must release its exact coordinator lease');
`;
  if (!original.includes(importMarker)) throw new Error('Physical movement import marker not found.');
  if (!original.includes(legacyFixture)) throw new Error('Legacy movement preparation fixture not found.');
  const adapted = original
    .replace(importMarker, migratedImport)
    .replace(legacyFixture, coordinatorFixture);
  await writeFile(adaptedSmoke, adapted);

  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: adaptedSmoke,
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'physical-movement-runtime-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entry).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
  await rm(adaptedSmoke, { force: true });
}
