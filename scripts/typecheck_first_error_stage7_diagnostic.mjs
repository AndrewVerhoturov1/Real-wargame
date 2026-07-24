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
const firstPath = firstError.match(/^([^\s(]+)\(/)?.[1] ?? '';
const isScriptError = firstPath.startsWith('scripts/');
console.log(isScriptError ? 'TYPECHECK_ERROR_IN_SCRIPTS' : 'TYPECHECK_ERROR_NOT_IN_SCRIPTS');
process.exit(isScriptError ? 1 : 0);
