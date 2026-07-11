import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHealthPayload,
  evaluateSoldierOnce,
  loadJsonFile,
  makeValidationResult,
  resolveBundledGraphPath,
} from './ai_engine_core.mjs';
import { hasStatefulPreviewNodes, prepareGraphForInstantPreview } from './ai_engine_stateful_preview.mjs';

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1024 * 1024;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundledGraphPath = resolveBundledGraphPath(repoRoot);
const port = readPort();

const server = http.createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      errorRu: 'Внутренняя ошибка local AI engine.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[AI ENGINE] listening on http://127.0.0.1:${port}`);
  console.log('[AI ENGINE] GET  /engine/health');
  console.log('[AI ENGINE] POST /ai/graph/validate');
  console.log('[AI ENGINE] POST /ai/graph/evaluate-once');
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function routeRequest(request, response) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

  if (method === 'OPTIONS') {
    writeCors(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/engine/health') {
    writeJson(response, 200, {
      ...createHealthPayload(port),
      statefulRuntime: 'live-game-bridge',
      statefulPreview: 'execution-boundary-only',
      statefulPreviewRu: 'Evaluate один раз показывает границу длительного поведения; реальный прогресс идёт в живом game bridge.',
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/ai/graph/validate') {
    const body = await readJsonBody(request);
    const sourceGraph = body.graph ?? loadJsonFile(bundledGraphPath);
    const statefulPreview = hasStatefulPreviewNodes(sourceGraph);
    const graph = prepareGraphForInstantPreview(sourceGraph);
    const validation = makeValidationResult(graph);
    writeJson(response, validation.valid ? 200 : 422, {
      ok: validation.valid,
      graphId: typeof sourceGraph.id === 'string' ? sourceGraph.id : null,
      validation,
      statefulPreview,
      ...(statefulPreview ? {
        runtimeNote: 'Stateful nodes are validated as instant preview boundaries. Live progress is executed by AiGraphRuntime.',
        runtimeNoteRu: 'Состоянийные ноды проверены как границы preview. Реальный прогресс выполняет AiGraphRuntime.',
      } : {}),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/ai/graph/evaluate-once') {
    const body = await readJsonBody(request);
    const bundledGraph = loadJsonFile(bundledGraphPath);
    const sourceGraph = body.graph ?? bundledGraph;
    const statefulPreview = hasStatefulPreviewNodes(sourceGraph);
    const result = evaluateSoldierOnce({
      ...body,
      graph: prepareGraphForInstantPreview(sourceGraph),
      bundledGraph: prepareGraphForInstantPreview(bundledGraph),
    });
    writeJson(response, result.ok ? 200 : 422, {
      ...result,
      statefulPreview,
      ...(statefulPreview ? {
        runtimeNote: 'Evaluate once stops at the duration boundary. Open the game to observe Running or Waiting progress.',
        runtimeNoteRu: 'Evaluate один раз останавливается на границе длительного поведения. Прогресс «Выполняется/Ожидает» виден в игре.',
      } : {}),
    });
    return;
  }

  writeJson(response, 404, {
    ok: false,
    errorRu: `Неизвестный endpoint: ${method} ${url.pathname}`,
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text.length === 0) return {};
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
  return parsed;
}

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  writeCors(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function writeCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readPort() {
  const argPortIndex = process.argv.indexOf('--port');
  const argPort = argPortIndex >= 0 ? process.argv[argPortIndex + 1] : undefined;
  const rawPort = argPort ?? process.env.AI_ENGINE_PORT;
  const parsed = Number(rawPort ?? DEFAULT_PORT);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}

function shutdown() {
  console.log('\n[AI ENGINE] shutting down...');
  server.close(() => process.exit(0));
}
