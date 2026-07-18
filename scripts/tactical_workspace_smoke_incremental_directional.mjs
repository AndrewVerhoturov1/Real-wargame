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
  const staleMonitorContract = 'src/core/debug/PerformanceMonitor.ts: missing "PERFORMANCE_CONTRACT_VERSION"';
  const staleBuildContract = 'src/core/debug/BuildIdentity.ts: missing "PERFORMANCE_CONTRACT_VERSION = \'performance-report-v5\'"';
  const knownIncrementalContract = (line) => line.includes(staleDirectionalToken)
    || line.includes(staleMonitorContract)
    || line.includes(staleBuildContract);
  const onlyKnownStaleContract = failureLines.length > 0
    && failureLines.every(knownIncrementalContract);

  if (!onlyKnownStaleContract) {
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(baseline.status ?? 1);
  }

  if (failureLines.some((line) => line.includes(staleDirectionalToken))) {
    const source = readFileSync('src/core/knowledge/SoldierDangerField.ts', 'utf8');
    assert.ok(source.includes('DIRECTIONAL_SECTOR_RADIANS'), 'SoldierDanger must retain the canonical directional sector basis');
    assert.ok(source.includes('const sectorFraction = sectorPosition - lowerSector'), 'SoldierDanger must interpolate adjacent sectors exactly');
    assert.ok(source.includes('const terrainProtection ='), 'SoldierDanger must calculate directional protection inline');
    assert.ok(source.includes('const terrainExposure ='), 'SoldierDanger must calculate directional exposure inline');
    assert.ok(source.includes('without allocating a GridPosition'), 'SoldierDanger must document the allocation-free hot path');
    assert.ok(!source.includes('readDirectionalBasisValue('), 'SoldierDanger hot-path interpolation must not restore the per-cell helper call');
  }

  if (failureLines.some((line) => line.includes('PerformanceMonitor.ts') || line.includes('BuildIdentity.ts'))) {
    const identity = readFileSync('src/core/debug/BuildIdentity.ts', 'utf8');
    const report = readFileSync('src/core/debug/PerformanceReportV6.ts', 'utf8');
    const monitor = readFileSync('src/core/debug/PerformanceMonitor.ts', 'utf8');
    assert.ok(identity.includes("PERFORMANCE_CONTRACT_VERSION = 'performance-report-v6'"), 'Build identity must advertise the exact v6 contract without requiring the baseline to contain the v6 schema module');
    assert.ok(report.includes("PERFORMANCE_REPORT_VERSION = 'performance-report-v6'"), 'The canonical report version must be v6');
    assert.ok(report.includes('PERFORMANCE_REPORT_SCHEMA_VERSION = 6'), 'The canonical schema version must be 6');
    assert.ok(monitor.includes('PerformanceCaptureV6'), 'PerformanceMonitor must own the v6 capture rather than a renamed v5 payload');
    assert.ok(!identity.includes("PERFORMANCE_CONTRACT_VERSION = 'performance-report-v5'"), 'Build identity must not advertise v5 after the v6 migration');
  }

  if (baseline.stdout) process.stdout.write(baseline.stdout);
  console.log('Tactical workspace baseline accepted the allocation-free directional interpolation and explicit performance-report-v6 contracts.');
}
