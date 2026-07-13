import { readFileSync } from 'node:fs';
import path from 'node:path';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';

const repoRoot = process.cwd();
const defaultGraphPath = path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
const graphPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultGraphPath;
const source = JSON.parse(readFileSync(graphPath, 'utf8')) as unknown;
const migration = migrateAiGraphToV2(source);
if (!migration.ok) {
  for (const issue of migration.issues) console.error(`[error] ${issue.code}: ${issue.messageRu}`);
  process.exitCode = 1;
} else {
  const validation = validateAiGraph(migration.graph);
  for (const issue of validation.issues) {
    const details = [issue.nodeId ? `node=${issue.nodeId}` : '', issue.parameterName ? `parameter=${issue.parameterName}` : '', issue.portId ? `port=${issue.portId}` : ''].filter(Boolean).join(' ');
    console.log(`[${issue.severity}] ${issue.code}${details ? ` ${details}` : ''}: ${issue.messageRu}${issue.fixRu ? ` Исправление: ${issue.fixRu}` : ''}`);
  }
  const errors = validation.issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    console.error(`AI graph validation failed: ${errors.length} error(s).`);
    process.exitCode = 1;
  } else {
    console.log(`AI graph validation OK: ${graphPath}${migration.migrated ? ' (Graph v1 проверен через миграцию в памяти)' : ''}`);
  }
}
