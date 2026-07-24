import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'infantry-combat-single-shot:smoke'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: process.env,
});
if (result.error || result.status !== 0) process.exit(1);
console.log('STAGE7_DIAGNOSTIC_COMPLETE_SINGLE_SHOT_COMMAND_PASSED');
