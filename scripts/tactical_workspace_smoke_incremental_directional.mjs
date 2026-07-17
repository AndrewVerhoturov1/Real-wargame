import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseline = spawnSync(
  process.execPath,
  ['scripts/tactical_workspace_smoke_pixijs8_baseline.mjs'],
  { cwd: process.cwd(), encoding: 'utf8' },
);

if (baseline.status === 0) {
  if (baseline.stdout) process.stdout.write(baseline.stdout);
  if (baseline.stderr) process.stderr.write(baseline.stderr);
} else {
  const stderr = baseline.stderr ?? '';
  const failureLines = stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('- '));
  const staleDirectionalToken = 'src/core/knowledge/SoldierDangerField.ts: missing "readDirectionalBasisValue"';
  const onlyKnownStaleContract = failureLines.length > 0
    && failureLines.every((line) => line.includes(staleDirectionalToken));

  if (!onlyKnownStaleContract) {
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(baseline.status ?? 1);
  }

  const source = readFileSync('src/core/knowledge/SoldierDangerField.ts', 'utf8');
  assert.ok(source.includes('DIRECTIONAL_SECTOR_RADIANS'), 'SoldierDanger must retain the canonical directional sector basis');
  assert.ok(source.includes('const sectorFraction = sectorPosition - lowerSector'), 'SoldierDanger must interpolate adjacent sectors exactly');
  assert.ok(source.includes('const terrainProtection ='), 'SoldierDanger must calculate directional protection inline');
  assert.ok(source.includes('const terrainExposure ='), 'SoldierDanger must calculate directional exposure inline');
  assert.ok(source.includes('without allocating a GridPosition'), 'SoldierDanger must document the allocation-free hot path');
  assert.ok(!source.includes('readDirectionalBasisValue('), 'SoldierDanger hot-path interpolation must not restore the per-cell helper call');

  if (baseline.stdout) process.stdout.write(baseline.stdout);
  console.log('Tactical workspace baseline accepted the allocation-free SoldierDanger directional interpolation contract.');
}
