import { spawnSync } from 'node:child_process';

const checks = [
  ['npm', ['run', 'combat-catalogs:smoke']],
  ['npm', ['run', 'combat-catalog-storage:smoke']],
  ['npm', ['run', 'combat-catalog-editor:smoke']],
  ['npm', ['run', 'physical-action-coordinator:smoke']],
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log('STAGE7_DIAGNOSTIC_FIRST_FOUR_CHECKS_PASSED');
