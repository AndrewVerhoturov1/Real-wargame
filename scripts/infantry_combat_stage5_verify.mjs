import { spawnSync } from 'node:child_process';

const command = 'npm';
const args = ['run', 'infantry-combat-single-shot:smoke'];
const label = [command, ...args].join(' ');
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: process.env,
});
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
if (result.error || result.status !== 0) {
  console.error(`::error file=package.json,line=1,title=Stage 5 verification failed::${escapeData(`FAIL ${label}\n${tail(output, 5000)}`)}`);
  process.exit(result.status ?? 1);
}
console.log(`::notice file=package.json,line=1,title=Stage 5 verification::${escapeData(`PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`)}`);

function lastMeaningfulLine(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? '';
}

function tail(value, maximumCharacters) {
  return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters);
}

function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
