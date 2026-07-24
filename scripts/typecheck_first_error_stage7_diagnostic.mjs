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
const match = firstError.match(/^src\/core\/infantry-combat\/runtime\/WoundRuntime\.ts\(224,(\d+)\): error (TS\d+):/);
const column = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
const lowerOrEqual = column <= 40;
console.log(lowerOrEqual ? 'TYPECHECK_COLUMN_LOWER_OR_EQUAL' : 'TYPECHECK_COLUMN_HIGHER');
process.exit(lowerOrEqual ? 1 : 0);
