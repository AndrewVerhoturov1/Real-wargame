import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const artifactDir = path.join(repoRoot, 'artifacts', 'ai-engine');
const port = Number(process.env.AI_ENGINE_SMOKE_PORT ?? 8797);
const baseUrl = `http://127.0.0.1:${port}`;

mkdirSync(artifactDir, { recursive: true });

const child = spawn(process.execPath, ['scripts/local_ai_engine.mjs', '--port', String(port)], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', (chunk) => process.stdout.write(`[engine] ${chunk}`));
child.stderr.on('data', (chunk) => process.stderr.write(`[engine] ${chunk}`));

try {
  await waitForHealth();

  const health = await requestJson('GET', '/engine/health');
  writeArtifact('01-health.json', health);
  assert(health.ok === true, 'health.ok должен быть true');
  assert(health.browserDoesHeavyAi === false, 'browserDoesHeavyAi должен быть false');
  console.log('[OK] /engine/health отвечает, тяжёлый ИИ не заявлен как браузерный.');

  const validation = await requestJson('POST', '/ai/graph/validate', {});
  writeArtifact('02-validation.json', validation);
  assert(validation.ok === true, 'bundled AI-граф должен пройти validation');
  assert(validation.validation.valid === true, 'validation.valid должен быть true');
  console.log('[OK] /ai/graph/validate проверил bundled soldier graph.');

  const evaluation = await requestJson('POST', '/ai/graph/evaluate-once', {
    unitId: 'manual_soldier_1',
    hasOrder: true,
    blackboard: {
      danger: 85,
      stress: 70,
      current_action: 'continue_order',
      best_cover_position: { x: 18.5, y: 12.5 },
    },
  });
  writeArtifact('03-evaluate-once.json', evaluation);
  assert(evaluation.ok === true, 'evaluate-once должен вернуть ok=true');
  assert(evaluation.selectedBranchNodeId === 'critical_survival', 'при danger=85/stress=70 должна победить ветка critical_survival');
  assert(evaluation.command.type === 'move_to', 'при найденном укрытии команда должна быть move_to');
  console.log('[OK] /ai/graph/evaluate-once выбрал уход к укрытию для опасной ситуации.');

  console.log('');
  console.log('[GOTOVO] Local AI engine smoke passed.');
  console.log(`[INFO] JSON-otchety zapisany v: ${artifactDir}`);
} catch (error) {
  console.error('');
  console.error('[OSHIBKA] Local AI engine smoke failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 15000) {
    try {
      await requestJson('GET', '/engine/health');
      return;
    } catch (error) {
      lastError = error;
      await sleep(400);
    }
  }

  throw new Error(`Engine не ответил за 15 секунд. Последняя ошибка: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function requestJson(method, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const request = http.request(`${baseUrl}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = JSON.parse(text);
        } catch (error) {
          reject(new Error(`Не удалось прочитать JSON от ${pathname}: ${text}`));
          return;
        }

        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode} от ${pathname}: ${text}`));
          return;
        }

        resolve(json);
      });
    });

    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function writeArtifact(fileName, value) {
  writeFileSync(path.join(artifactDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
