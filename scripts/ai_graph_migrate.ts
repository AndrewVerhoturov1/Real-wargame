import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../src/core/ai/contracts/AiSubgraphRegistry';

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
if (!inputPath) {
  console.error('Usage: node scripts/ai_graph_migrate.mjs <input.json> [output.json]');
  process.exitCode = 2;
} else {
  const source = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
  const migration = migrateAiGraphToV2(source);
  if (!migration.ok) {
    for (const issue of migration.issues) console.error(`[${issue.code}] ${issue.messageRu}`);
    console.error('Исходный граф не изменён.');
    process.exitCode = 1;
  } else {
    const subgraphs = new Map(DEFAULT_AI_SUBGRAPH_REGISTRY.list().map((definition) => [definition.id, definition.graph]));
    const validation = validateAiGraph(migration.graph, { subgraphs });
    const errors = validation.issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      for (const issue of errors) console.error(`[${issue.code}] ${issue.messageRu}`);
      console.error('Graph v2 не сохранён: после миграции остались ошибки. Исходный граф не изменён.');
      process.exitCode = 1;
    } else {
      const json = `${JSON.stringify(migration.graph, null, 2)}\n`;
      if (outputPath) {
        writeFileSync(outputPath, json, 'utf8');
        console.log(`Graph v2 сохранён отдельно: ${outputPath}`);
      } else {
        process.stdout.write(json);
      }
    }
  }
}
