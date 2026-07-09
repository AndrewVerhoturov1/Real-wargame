import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonFile, makeValidationResult, resolveBundledGraphPath } from './ai_engine_core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultGraphPath = resolveBundledGraphPath(repoRoot);
const graphPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultGraphPath;

const graph = loadJsonFile(graphPath);
const validation = makeValidationResult(graph);
const errors = validation.issues.filter((issue) => issue.severity === 'error');

if (validation.issues.length > 0) {
  for (const issue of validation.issues) {
    const location = issue.nodeId ? ` node=${issue.nodeId}` : '';
    console.log(`[${issue.severity}] ${issue.code}${location}: ${issue.messageRu}`);
  }
}

if (errors.length > 0) {
  console.error(`AI graph validation failed: ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`AI graph validation OK: ${graphPath}`);
