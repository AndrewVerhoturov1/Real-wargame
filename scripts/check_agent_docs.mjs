import process from 'node:process';
import { validateAgentDocuments } from './agent_docs_validation.mjs';

const result = await validateAgentDocuments(process.cwd());

for (const warning of result.warnings) {
  console.warn(`WARNING: ${warning}`);
}

if (result.errors.length) {
  for (const error of result.errors) {
    console.error(`ERROR: ${error}`);
  }
  console.error(`Agent documentation integrity failed with ${result.errors.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Agent documentation integrity passed${result.warnings.length ? ` with ${result.warnings.length} warning(s)` : ''}.`);
}
