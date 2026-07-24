import { spawnSync } from 'node:child_process';

const checks = [
  ['npm', ['run', 'posture-transition:smoke']],
  ['npm', ['run', 'physical-movement:smoke']],
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log('STAGE7_DIAGNOSTIC_POSTURE_AND_MOVEMENT_PASSED');
