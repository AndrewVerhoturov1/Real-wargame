import { spawnSync } from 'node:child_process';
import path from 'node:path';

const compiler = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const firstError = output.split(/\r?\n/).find((line) => line.includes('error TS'));
if (firstError) console.error(firstError);
else if (result.error) console.error(String(result.error));
else console.log('TypeScript diagnostic found no errors.');
process.exit(result.status ?? 1);
