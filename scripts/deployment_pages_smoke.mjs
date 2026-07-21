import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const options = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(options.root ?? 'dist');
const requireSource = options['require-source'] === true;
const requiredPages = ['index.html', 'ai-node-editor.html'];
const failures = [];

for (const page of requiredPages) {
  const filePath = path.join(outputDirectory, page);
  try {
    const file = await stat(filePath);
    if (!file.isFile() || file.size === 0) failures.push(`${page}: файл отсутствует или пуст`);
  } catch {
    failures.push(`${page}: файл не найден`);
  }
}

if (requireSource) {
  const sourceFile = path.join(outputDirectory, 'deployment-source.json');
  try {
    const file = await stat(sourceFile);
    if (!file.isFile() || file.size === 0) {
      failures.push('deployment-source.json: файл отсутствует или пуст');
    } else {
      const payload = JSON.parse(await readFile(sourceFile, 'utf8'));
      if (!/^[0-9a-f]{40}$/.test(payload.sourceSha ?? '')) {
        failures.push('deployment-source.json: отсутствует точный 40-символьный SHA');
      }
      if (!Array.isArray(payload.checks)) failures.push('deployment-source.json: отсутствует список выполненных проверок');
      if (!Array.isArray(payload.skippedChecks)) failures.push('deployment-source.json: отсутствует список пропущенных проверок');
    }
  } catch (error) {
    if (error instanceof SyntaxError) failures.push('deployment-source.json: некорректный JSON');
    else failures.push('deployment-source.json: файл не найден');
  }
}

if (failures.length > 0) {
  console.error('Deployment pages smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const checked = requireSource ? [...requiredPages, 'deployment-source.json'] : requiredPages;
console.log(`Deployment pages smoke passed: ${checked.join(', ')}`);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--require-source') {
      result['require-source'] = true;
      continue;
    }
    if (token === '--root') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) fail('Missing value for --root.');
      result.root = value;
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${token}`);
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
