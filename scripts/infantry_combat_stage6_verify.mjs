import { execFileSync } from 'node:child_process';

for (const script of [
  'scripts/infantry_combat_stage6_smoke.mjs',
  'scripts/infantry_combat_stage6_forbidden_scan.mjs',
]) {
  execFileSync(process.execPath, [script], { stdio: 'inherit' });
}

console.log('Infantry combat Stage 6 verification passed.');
