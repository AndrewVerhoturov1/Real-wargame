import { spawnSync } from 'node:child_process';

const checks = [
  ['node', ['scripts/combat_lab_stage10_wiring_contract_smoke.mjs']],
  ['node', ['scripts/combat_lab_stage10_lifecycle_contract_smoke.mjs']],
  ['node', ['scripts/combat_lab_stage10_ui_integration_contract_smoke.mjs']],
  ['node', ['scripts/combat_lab_stage10_representative_integration_smoke.mjs']],
  ['npm', ['run', 'combat-lab-experiment:smoke']],
  ['npm', ['run', 'combat-lab-scenario-editor:smoke']],
  ['npm', ['run', 'combat-lab-batch:smoke']],
];

for (const [command, args] of checks) run(command, args);
console.log(`Combat Lab Stage 10 scenario-system verification passed: ${checks.length} required checks.`);

function run(command, args) {
  const label = [command, ...args].join(' ');
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const output = [result.stdout ?? '', result.stderr ?? ''].filter(Boolean).join('\n').trim();
  const durationMs = Date.now() - startedAt;
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${label} (${durationMs} ms)\n${tail(output, 20_000)}`);
    process.exit(result.status || 1);
  }
  console.log(`PASS ${label} (${durationMs} ms): ${lastMeaningfulLine(output) || 'completed without output'}`);
}

function lastMeaningfulLine(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
}

function tail(value, maximumCharacters) {
  return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters);
}
