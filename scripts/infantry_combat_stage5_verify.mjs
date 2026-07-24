import { spawnSync } from 'node:child_process';

const checks = [
  ['npm', ['run', 'performance-contract:smoke']],
];

for (const [command, args] of checks) {
  const label = [command, ...args].join(' ');
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.error || result.status !== 0) {
    const diagnostic = [
      `FAIL ${label}`,
      result.error ? String(result.error) : '',
      tail(output, 5000),
    ].filter(Boolean).join('\n');
    console.error(workflowAnnotation('error', 'Stage 5 verification failed', diagnostic));
    process.exit(result.status ?? 1);
  }
  const summary = lastMeaningfulLine(output) || 'completed without output';
  console.log(workflowAnnotation('notice', 'Stage 5 verification', `PASS ${label}: ${summary}`));
}

console.log(`Stage 5 verification probe passed: ${checks.length} command.`);

function lastMeaningfulLine(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? '';
}

function tail(value, maximumCharacters) {
  return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters);
}

function workflowAnnotation(level, title, message) {
  return `::${level} file=package.json,line=1,title=${escapeData(title)}::${escapeData(message)}`;
}

function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
