import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'graph-v2');
const GRAPH_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_KEY = 'real-wargame.ai-node-editor.ui.v6';
const DEBUG_KEY = 'real-wargame.ai-node-editor.debug.v1';

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

function editorUiState() {
  return {
    paletteOpen: false,
    inspectorOpen: true,
    bottomOpen: false,
    bottomTab: 'console',
    zoom: 0.72,
    panX: 18,
    panY: 12,
    languageMode: 'ru',
    nodeDetailMode: 'compact',
    linkSourceNodeId: null,
  };
}

test('migrates Graph v1, shows typed ports, blocks an incompatible connection, and opens a subgraph', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ graphKey, positionKey, uiKey }) => {
    const graph = {
      version: 1,
      id: 'graph_v2_visual_migration',
      name: 'Graph v2 visual migration',
      nameRu: 'Проверка перехода на Graph v2',
      descriptionRu: 'Граф для обязательной визуальной проверки типизированных портов.',
      rootNodeId: 'root',
      blackboardDefaults: {
        best_cover_position: { x: 8, y: 5 },
        self_position: { x: 1, y: 1 },
      },
      nodes: [
        { id: 'root', type: 'Root', displayNameRu: 'Старт', children: ['sequence'], parameters: {} },
        { id: 'sequence', type: 'SequenceWithMemory', displayNameRu: 'План реакции', children: ['find_cover', 'select_target', 'move_to_cover', 'take_cover'], parameters: {} },
        {
          id: 'find_cover',
          type: 'FindBestObject',
          displayNameRu: 'Найти укрытие',
          children: [],
          parameters: { objectKind: 'cover', criteria: 'safer', searchRadiusMeters: 50, writeTo: 'best_cover_position' },
        },
        {
          id: 'select_target',
          type: 'SelectTarget',
          displayNameRu: 'Выбрать противника',
          children: [],
          parameters: { rule: 'nearest', writeTo: 'current_target' },
        },
        {
          id: 'move_to_cover',
          type: 'MoveToBlackboardPosition',
          displayNameRu: 'Двигаться к укрытию',
          children: [],
          parameters: {
            targetKey: 'best_cover_position',
            acceptanceRadiusCells: 0.2,
            timeoutSeconds: 15,
            stuckTimeoutSeconds: 2.5,
            minimumProgressCells: 0.05,
            abortOnTargetLost: true,
          },
          inputBindings: {
            target: { source: 'node', nodeId: 'find_cover', port: 'position' },
          },
        },
        {
          id: 'take_cover',
          type: 'Subgraph',
          displayNameRu: 'Занять укрытие',
          children: [],
          parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
          inputBindings: {
            cover_position: { source: 'node', nodeId: 'find_cover', port: 'position' },
          },
        },
      ],
    };
    localStorage.setItem(graphKey, JSON.stringify(graph));
    localStorage.setItem(positionKey, JSON.stringify({
      root: { x: 30, y: 120 },
      sequence: { x: 270, y: 120 },
      find_cover: { x: 520, y: 70 },
      select_target: { x: 520, y: 300 },
      move_to_cover: { x: 790, y: 70 },
      take_cover: { x: 1050, y: 70 },
    }));
    localStorage.setItem(uiKey, JSON.stringify({
      paletteOpen: false,
      inspectorOpen: true,
      bottomOpen: false,
      bottomTab: 'console',
      zoom: 0.72,
      panX: 18,
      panY: 12,
      languageMode: 'ru',
      nodeDetailMode: 'compact',
      linkSourceNodeId: null,
    }));
  }, { graphKey: GRAPH_KEY, positionKey: POSITION_KEY, uiKey: UI_KEY });

  await page.goto('/ai-node-editor.html');
  const warning = page.locator('.graph-version-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('старый формат Graph v1');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-graph-v1-migration-warning.png'), fullPage: true });

  await page.locator('#migrate-graph-banner').click();
  await expect(page.locator('.graph-version-ok')).toContainText('Graph v2');
  await expect(page.locator('.graph-node[data-node-id="find_cover"] .typed-port.output[data-port-id="position"]')).toContainText('Позиция');
  await expect(page.locator('.graph-node[data-node-id="move_to_cover"] .typed-port.input[data-port-id="target"]')).toContainText('Цель');
  await expect(page.locator('.edge-path.data-edge.position')).toHaveCount(2);

  await page.locator('.graph-node[data-node-id="move_to_cover"]').click();
  await expect(page.locator('.contract-parameter-panel')).toContainText('Цель из памяти');
  await expect(page.locator('.contract-parameter-panel')).toContainText('обязательно');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-graph-v2-typed-ports-and-contracts.png'), fullPage: true });

  const incompatibleOutput = page.locator('.graph-node[data-node-id="select_target"] .typed-port.output[data-port-id="unit"]');
  const positionInput = page.locator('.graph-node[data-node-id="move_to_cover"] .typed-port.input[data-port-id="target"]');
  const outputBox = await incompatibleOutput.boundingBox();
  const inputBox = await positionInput.boundingBox();
  expect(outputBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  await page.mouse.move(outputBox!.x + outputBox!.width / 2, outputBox!.y + outputBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2, { steps: 8 });
  await expect(positionInput).toHaveClass(/incompatible/);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-incompatible-port-highlight.png'), fullPage: true });
  await page.mouse.up();
  await expect(page.locator('.ai-editor-bottom')).toContainText('Нельзя передать «Боец» во вход «Позиция»');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-incompatible-port-russian-error.png'), fullPage: true });

  await page.locator('.graph-node[data-node-id="take_cover"]').dblclick();
  await expect(page.locator('#back-to-parent-graph')).toBeVisible();
  await expect(page.locator('.graph-breadcrumb')).toContainText('Главный граф');
  await expect(page.locator('.graph-breadcrumb')).toContainText('Занять укрытие');
  await expect(page.locator('.graph-node[data-node-id="move_to_cover"]')).toContainText('Двигаться к укрытию');
  await page.locator('.graph-node[data-node-id="move_to_cover"]').click();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-subgraph-breadcrumb-and-inspector.png'), fullPage: true });

  await page.locator('#back-to-parent-graph').click();
  await expect(page.locator('.graph-node[data-node-id="take_cover"]')).toBeVisible();
});

test('shows an active subgraph, full trace path, and separated memory scopes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ graphKey, positionKey, uiKey, debugKey }) => {
    const graph = {
      version: 2,
      id: 'graph_v2_runtime_visual',
      name: 'Graph v2 runtime visual',
      nameRu: 'Живой подграф Graph v2',
      rootNodeId: 'root',
      blackboardSchema: [
        { key: 'best_cover_position', valueKind: 'nullablePosition', label: 'Cover', labelRu: 'Укрытие', description: 'Cover.', descriptionRu: 'Укрытие.', defaultValue: { x: 8, y: 5 } },
      ],
      blackboardDefaults: { best_cover_position: { x: 8, y: 5 } },
      subgraphRefs: ['take_cover'],
      nodes: [
        { id: 'root', type: 'Root', displayNameRu: 'Старт', children: ['take_cover_node'], parameters: {} },
        {
          id: 'take_cover_node',
          type: 'Subgraph',
          displayNameRu: 'Занять укрытие',
          children: [],
          parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
          inputBindings: { cover_position: { source: 'blackboard', key: 'best_cover_position' } },
        },
      ],
    };
    localStorage.setItem(graphKey, JSON.stringify(graph));
    localStorage.setItem(positionKey, JSON.stringify({ root: { x: 170, y: 220 }, take_cover_node: { x: 520, y: 220 } }));
    localStorage.setItem(uiKey, JSON.stringify({
      paletteOpen: false,
      inspectorOpen: true,
      bottomOpen: false,
      bottomTab: 'console',
      zoom: 1,
      panX: 0,
      panY: 0,
      languageMode: 'ru',
      nodeDetailMode: 'compact',
      linkSourceNodeId: null,
    }));
    localStorage.setItem(debugKey, JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      unitId: 'soldier_graph_v2_visual',
      unitLabel: 'Стрелок 1',
      selectedBranchNodeId: 'take_cover_node',
      selectedBranchName: 'Take Cover',
      selectedBranchNameRu: 'Занять укрытие',
      ok: true,
      status: 'running',
      activeNodeId: 'take_cover_node',
      activeNodeName: 'Take Cover',
      activeNodeNameRu: 'Занять укрытие',
      activeSubgraphId: 'take_cover',
      activeSubgraphName: 'Take Cover',
      activeSubgraphNameRu: 'Занять укрытие',
      subgraphPath: 'main_graph / take_cover / move_to_cover',
      elapsedMs: 3800,
      paused: false,
      nowMs: Date.now(),
      explanation: 'The soldier is moving through the take-cover subgraph.',
      explanationRu: 'Боец выполняет подграф занятия укрытия.',
      trace: [{ nodeId: 'take_cover_node', nodeType: 'Subgraph', status: 'running', path: 'main_graph / take_cover / move_to_cover', reason: 'Subgraph is active.', reasonRu: 'Подграф выполняется.' }],
      scores: [],
      effects: [],
      memoryScopes: {
        persistentSoldierMemory: { enemyKnown: true },
        runtimeSessionMemory: { last_event: 'shot_nearby' },
        activeStateMemory: { active_goal: 'take_cover' },
        subgraphLocalMemory: { take_cover: { subgraph_private: 'take_cover_local', best_cover_position: { x: 8, y: 5 } } },
        nodeLocalState: { move_to_cover: { ownerToken: 'ai-route-token' } },
      },
    }));
  }, { graphKey: GRAPH_KEY, positionKey: POSITION_KEY, uiKey: UI_KEY, debugKey: DEBUG_KEY });

  await page.goto('/ai-node-editor.html');
  const runtimePanel = page.locator('.ai-runtime-debug-panel');
  await expect(runtimePanel).toContainText('Активный подграф');
  await expect(runtimePanel).toContainText('Занять укрытие');
  await expect(runtimePanel).toContainText('main_graph / take_cover / move_to_cover');
  await expect(page.locator('.graph-node[data-node-id="take_cover_node"]')).toHaveClass(/runtime-debug-running/);
  await runtimePanel.locator('summary', { hasText: 'Области памяти' }).click();
  await expect(runtimePanel).toContainText('Постоянная память бойца');
  await expect(runtimePanel).toContainText('Локальная память подграфа · take_cover');
  await expect(runtimePanel).toContainText('Локальное состояние ноды · move_to_cover');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-active-subgraph-runtime-and-memory-scopes.png'), fullPage: true });
});
