import process from 'node:process';
import { generateAgentDocuments } from './agent_docs_lib.mjs';

const root = process.cwd();
const result = await generateAgentDocuments(root, { write: true });

console.log(`Generated ${result.outputs.size} agent documentation files.`);
for (const relativePath of result.outputs.keys()) {
  console.log(`- ${relativePath}`);
}
