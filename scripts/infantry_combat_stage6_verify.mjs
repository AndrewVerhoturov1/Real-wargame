import { spawnSync } from 'node:child_process';

const checks = [
  ['npm', ['run', 'combat-catalogs:smoke']],
  ['npm', ['run', 'combat-catalog-storage:smoke']],
  ['npm', ['run', 'combat-catalog-editor:smoke']],
  ['npm', ['run', 'physical-action-coordinator:smoke']],
  ['npm', ['run', 'posture-transition:smoke']],
  ['npm', ['run', 'physical-movement:smoke']],
  ['npm', ['run', 'perception:smoke']],
  ['npm', ['run', 'infantry-combat-single-shot:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:benchmark']],
  ['npm', ['run', 'infantry-combat-stage5:smoke']],
  ['npm', ['run', 'infantry-combat-stage5:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage6:smoke']],
  ['npm', ['run', 'infantry-combat-stage6:forbidden-scan']],
  ['npm', ['run', 'performance-contract:smoke']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_smoke.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_forbidden_scan.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_verify.mjs']],
];

console.log(`Node.js ${process.version}`);
for (const [command, args] of checks) {
  const label = [command, ...args].join(' ');
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
  const output = [result.stdout ?? '', result.stderr ?? '', result.error ? String(result.error) : ''].filter(Boolean).join('\n').trim();
  if (result.status !== 0 || result.error) {
    console.error(`FAIL ${label}\n${output.slice(-12000)}`);
    process.exit(1);
  }
  const last = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? 'completed';
  console.log(`PASS ${label}: ${last}`);
}
console.log(`Stage 6 verification PASS on ${process.version}.`);
