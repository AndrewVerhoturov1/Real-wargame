import { spawnSync } from 'node:child_process';

const scripts = [
  'scripts/combat_lab_live_unit_presentation_smoke.mjs',
  'scripts/combat_lab_live_unit_ui_contract_smoke.mjs',
  'scripts/combat_lab_polygon_shell_contract_smoke.mjs',
  'scripts/posture_transition_smoke.mjs',
];

for (const script of scripts) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Combat Lab LIVE Unit verification passed.');
