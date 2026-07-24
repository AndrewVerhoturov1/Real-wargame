import { spawnSync } from 'node:child_process';
import path from 'node:path';

const compiler = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const firstError = output.split(/\r?\n/).find((line) => line.includes('error TS')) ?? '';
const code = firstError.match(/error (TS\d+):/)?.[1] ?? '';
const matches = code === 'TS2322';
console.log(matches ? 'TYPECHECK_CODE_TS2322' : 'TYPECHECK_CODE_NOT_TS2322');
process.exit(matches ? 1 : 0);
