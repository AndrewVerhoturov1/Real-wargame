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
  assert(String(health.version).includes('graph-runner'), 'engine должен заявлять GraphRunner версию');
  assert(health.statefulRuntime === 'live-game-bridge', 'health должен указывать живой stateful runtime в game bridge');
  console.log('[OK] /engine/health отвечает, GraphRunner и stateful runtime заявлены, тяжёлый ИИ не браузерный.');

  const validation = await requestJson('POST', '/ai/graph/validate', {});
  writeArtifact('02-validation.json', validation);
  assert(validation.ok === true, 'bundled AI-граф должен пройти validation');
  assert(validation.validation.valid === true, 'validation.valid должен быть true');
  console.log('[OK] /ai/graph/validate проверил bundled clean graph.');

  const cleanEvaluation = await requestJson('POST', '/ai/graph/evaluate-once', {
    unitId: 'manual_soldier_clean',
    blackboard: {
      danger: 85,
      stress: 70,
      current_action: 'continue_order',
      best_cover_position: { x: 18.5, y: 12.5 },
    },
  });
  writeArtifact('03-clean-evaluate-once.json', cleanEvaluation);
  assert(cleanEvaluation.ok === true, 'clean evaluate-once должен вернуть ok=true');
  assert(cleanEvaluation.command.type === 'none', 'чистый root-only graph не должен выдавать старую hard-coded команду');
  assert(Array.isArray(cleanEvaluation.scores) && cleanEvaluation.scores.length === 0, 'чистый graph не должен иметь score breakdown');
  console.log('[OK] clean evaluate-once честно сообщает: нода действия ещё не подключена.');

  const utilityEvaluation = await requestJson('POST', '/ai/graph/evaluate-once', {
    unitId: 'manual_soldier_utility',
    graph: createUtilitySmokeGraph(),
    hasOrder: true,
    blackboard: {
      danger: 85,
      morale: 20,
      underFire: true,
      hasOrder: true,
      current_action: 'continue_order',
      best_cover_position: { x: 18.5, y: 12.5 },
      self_position: { x: 10, y: 10 },
    },
  });
  writeArtifact('04-utility-evaluate-once.json', utilityEvaluation);
  assert(utilityEvaluation.ok === true, 'utility evaluate-once должен вернуть ok=true');
  assert(utilityEvaluation.selectedBranchNodeId === 'branch_cover', 'при danger=85 должна победить ветка branch_cover');
  assert(utilityEvaluation.command.type === 'move_to', 'победившая ветка должна дать move_to');
  assert(Array.isArray(utilityEvaluation.scores) && utilityEvaluation.scores.length === 2, 'UtilitySelector должен вернуть оценки двух веток');
  assert(utilityEvaluation.scores[0].breakdown.length > 0, 'ветка должна иметь score breakdown');
  console.log('[OK] UtilitySelector выбрал лучшую ветку по score-ноды и выдал move_to.');

  const statefulGraph = createStatefulSmokeGraph();
  const statefulValidation = await requestJson('POST', '/ai/graph/validate', { graph: statefulGraph });
  writeArtifact('05-stateful-validation.json', statefulValidation);
  assert(statefulValidation.ok === true, 'stateful graph должен пройти validation');
  assert(statefulValidation.statefulPreview === true, 'validation должен пометить stateful preview');
  assert(String(statefulValidation.runtimeNoteRu).includes('AiGraphRuntime'), 'validation должен объяснить живое исполнение');

  const statefulEvaluation = await requestJson('POST', '/ai/graph/evaluate-once', {
    unitId: 'manual_soldier_stateful',
    graph: statefulGraph,
    blackboard: { danger: 80 },
  });
  writeArtifact('06-stateful-evaluate-once.json', statefulEvaluation);
  assert(statefulEvaluation.ok === true, 'stateful evaluate-once должен вернуть ok=true');
  assert(statefulEvaluation.statefulPreview === true, 'evaluate-once должен пометить границу stateful preview');
  assert(String(statefulEvaluation.runtimeNoteRu).includes('Выполняется/Ожидает'), 'evaluate-once должен честно направить в живой runtime');
  console.log('[OK] stateful graph валидируется, а evaluate-once честно останавливается на границе длительного поведения.');

  const graphV2Validation = await requestJson('POST', '/ai/graph/validate', { graph: createGraphV2SmokeGraph() });
  writeArtifact('07-graph-v2-validation.json', graphV2Validation);
  assert(graphV2Validation.ok === true, 'Graph v2 должен пройти local engine validation');
  assert(graphV2Validation.validation.valid === true, 'Graph v2 validation.valid должен быть true');
  assert(graphV2Validation.statefulPreview === true, 'Subgraph должен считаться границей stateful preview');
  console.log('[OK] Local engine принимает Graph v2 и честно помечает подграф как stateful boundary.');

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

function createUtilitySmokeGraph() {
  return {
    version: 1,
    id: 'utility_selector_smoke_graph',
    name: 'Utility Selector Smoke Graph',
    nameRu: 'Проверочный граф UtilitySelector',
    rootNodeId: 'root',
    blackboardDefaults: { danger: 0, morale: 60, underFire: false, hasOrder: false, current_action: 'wait', best_cover_position: null, self_position: { x: 0, y: 0 } },
    nodes: [
      node('root', 'Root', ['utility'], 'Start', 'Старт'),
      node('utility', 'UtilitySelector', ['branch_cover', 'branch_order'], 'Best choice', 'Лучший выбор'),
      node('branch_cover', 'ActionBranch', ['under_fire', 'score_danger', 'find_cover', 'move_cover'], 'Take cover branch', 'Ветка укрытия'),
      node('under_fire', 'FlagCheck', [], 'Under fire?', 'Под огнём?', { flagKey: 'underFire', expected: true }),
      node('score_danger', 'ParameterScore', [], 'Danger score', 'Оценка опасности', { sourceKey: 'danger', direction: 'positive', weight: 1 }),
      node('find_cover', 'FindBestObject', [], 'Find cover', 'Найти укрытие', { objectKind: 'cover', criteria: 'safer', searchRadiusMeters: 35, writeTo: 'best_cover_position' }),
      node('move_cover', 'SetAction', [], 'Move to cover', 'Двигаться к укрытию', { action: 'move_to', targetKey: 'best_cover_position' }),
      node('branch_order', 'ActionBranch', ['has_order', 'score_morale', 'continue_order'], 'Continue order branch', 'Ветка продолжения приказа'),
      node('has_order', 'FlagCheck', [], 'Has order?', 'Есть приказ?', { flagKey: 'hasOrder', expected: true }),
      node('score_morale', 'ParameterScore', [], 'Morale score', 'Оценка морали', { sourceKey: 'morale', direction: 'positive', weight: 1 }),
      node('continue_order', 'SetAction', [], 'Continue order', 'Продолжать приказ', { action: 'continue_order', targetKey: 'order_target_position' }),
    ],
  };
}

function createGraphV2SmokeGraph() {
  return {
    version: 2,
    id: 'graph_v2_engine_smoke',
    name: 'Graph v2 engine smoke',
    nameRu: 'Проверка Graph v2 в движке',
    rootNodeId: 'root',
    blackboardSchema: [],
    blackboardDefaults: {},
    subgraphRefs: ['take_cover'],
    nodes: [
      node('root', 'Root', ['branch'], 'Start', 'Старт'),
      node('branch', 'ActionBranch', ['subgraph'], 'Branch', 'Ветвь'),
      { ...node('subgraph', 'Subgraph', [], 'Take cover', 'Занять укрытие', { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' }), inputBindings: { cover_position: { source: 'literal', value: { x: 2, y: 2 } } } },
    ],
  };
}

function createStatefulSmokeGraph() {
  return {
    version: 1,
    id: 'stateful_engine_smoke_graph',
    name: 'Stateful Engine Smoke Graph',
    nameRu: 'Проверочный состоянийный граф',
    rootNodeId: 'root',
    blackboardDefaults: { danger: 0 },
    nodes: [
      node('root', 'Root', ['utility'], 'Start', 'Старт'),
      node('utility', 'UtilitySelector', ['branch'], 'Best choice', 'Лучший выбор'),
      node('branch', 'ActionBranch', ['sequence'], 'Take cover', 'Занять укрытие'),
      node('sequence', 'SequenceWithMemory', ['wait'], 'Cover sequence', 'Последовательность укрытия'),
      node('wait', 'Wait', [], 'Check surroundings', 'Осмотреться', { durationSeconds: 2, timeoutSeconds: 0 }),
    ],
  };
}

function node(id, type, children, displayName, displayNameRu, parameters = {}) {
  return { id, type, displayName, displayNameRu, children, parameters };
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
        } catch {
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
    if (body) request.write(body);
    request.end();
  });
}

function writeArtifact(fileName, value) {
  writeFileSync(path.join(artifactDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
