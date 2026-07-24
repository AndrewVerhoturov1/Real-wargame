import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'infantry-combat-stage7:forbidden-scan'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: process.env,
});
if (result.error || result.status !== 0) {
  console.error('STAGE7_DIAGNOSTIC_FORBIDDEN_SCAN_FAILED');
  process.exit(1);
}
console.log('STAGE7_DIAGNOSTIC_FORBIDDEN_SCAN_PASSED');
