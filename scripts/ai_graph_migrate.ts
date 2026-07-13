import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Использование: npm run ai-graph:migrate -- <input.json> [output.json]');
  process.exitCode = 2;
} else {
  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(process.argv[3] ?? inputPath.replace(/\.json$/i, '.v2.json'));
  if (!existsSync(inputPath)) {
    console.error(`Исходный граф не найден: ${inputPath}`);
    process.exitCode = 2;
  } else if (inputPath === outputPath) {
    console.error('Исходный граф не перезаписан: укажите отдельный output.json.');
    process.exitCode = 2;
  } else {
    const source = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
    const migration = migrateAiGraphToV2(source);
    if (!migration.ok) {
      for (const issue of migration.issues) console.error(`[error] ${issue.code}: ${issue.messageRu}`);
      console.error('Старый файл не изменён.');
      process.exitCode = 1;
    } else {
      const validation = validateAiGraph(migration.graph);
      const errors = validation.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        for (const issue of errors) console.error(`[error] ${issue.code}${issue.nodeId ? ` node=${issue.nodeId}` : ''}: ${issue.messageRu}`);
        console.error('Graph v2 не сохранён: миграция не прошла строгую проверку. Старый файл не изменён.');
        process.exitCode = 1;
      } else {
        writeFileSync(outputPath, `${JSON.stringify(migration.graph, null, 2)}\n`, 'utf8');
        console.log(`Graph v2 сохранён: ${outputPath}`);
        console.log(`Старый файл сохранён без изменений: ${inputPath}`);
      }
    }
  }
}
