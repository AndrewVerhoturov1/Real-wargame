import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'infantry-combat-stage5:forbidden-scan'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: process.env,
});
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
if (result.error || result.status !== 0) {
  console.error(`::error file=package.json,line=1,title=Stage 5 forbidden scan failed::${escapeData(output || String(result.error))}`);
  process.exit(result.status ?? 1);
}
console.log(`::notice file=package.json,line=1,title=Stage 5 forbidden scan::${escapeData(lastMeaningfulLine(output) || 'PASS')}`);

function lastMeaningfulLine(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? '';
}

function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
