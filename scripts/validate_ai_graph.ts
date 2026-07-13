import path from 'node:path';
import { readFileSync } from 'node:fs';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../src/core/ai/contracts/AiSubgraphRegistry';

const defaultGraphPath = path.resolve('src/data/ai/soldier_default_survival_graph.json');
const graphPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultGraphPath;
const source = JSON.parse(readFileSync(graphPath, 'utf8')) as unknown;
const migration = migrateAiGraphToV2(source);
if (!migration.ok) {
  for (const issue of migration.issues) printIssue(issue);
  console.error(`AI graph migration failed: ${migration.issues.length} issue(s).`);
  process.exitCode = 1;
} else {
  const subgraphs = new Map(DEFAULT_AI_SUBGRAPH_REGISTRY.list().map((definition) => [definition.id, definition.graph]));
  const validation = validateAiGraph(migration.graph, { subgraphs });
  for (const issue of [...migration.issues, ...validation.issues]) printIssue(issue);
  const errors = validation.issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    console.error(`AI graph validation failed: ${errors.length} error(s).`);
    process.exitCode = 1;
  } else {
    console.log(`AI graph validation OK: ${graphPath}`);
  }
}

function printIssue(issue: { readonly severity:string; readonly code:string; readonly messageRu:string; readonly nodeId?:string; readonly parameterName?:string; readonly portName?:string; readonly fixRu?:string }): void {
  const location = [issue.nodeId ? `node=${issue.nodeId}` : '', issue.parameterName ? `parameter=${issue.parameterName}` : '', issue.portName ? `port=${issue.portName}` : ''].filter(Boolean).join(' ');
  console.log(`[${issue.severity}] ${issue.code}${location ? ` ${location}` : ''}: ${issue.messageRu}${issue.fixRu ? ` Исправление: ${issue.fixRu}` : ''}`);
}
