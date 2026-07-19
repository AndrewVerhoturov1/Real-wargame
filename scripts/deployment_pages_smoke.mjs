import { stat } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve(process.cwd(), 'dist');
const requiredPages = ['index.html', 'ai-node-editor.html'];
const failures = [];

for (const page of requiredPages) {
  const filePath = path.join(outputDirectory, page);
  try {
    const file = await stat(filePath);
    if (!file.isFile() || file.size === 0) {
      failures.push(`${page}: файл отсутствует или пуст`);
    }
  } catch {
    failures.push(`${page}: файл не найден`);
  }
}

if (failures.length > 0) {
  console.error('Deployment pages smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Deployment pages smoke passed: ${requiredPages.join(', ')}`);
