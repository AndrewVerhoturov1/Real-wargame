import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_STORAGE_KEY = 'real-wargame.ai-node-editor.ui.v6';

const russianEditorUi = {
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
};

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('new movement node persists safe defaults immediately', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ graphKey, positionKey, uiKey, ui }) => {
    localStorage.setItem(graphKey, JSON.stringify({
      version: 1,
      id: 'new_move_node_defaults_graph',
      name: 'New Move Node Defaults Graph',
      nameRu: 'Граф проверки новой ноды движения',
      rootNodeId: 'root',
      blackboardDefaults: {},
      nodes: [
        { id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', children: [], parameters: {} },
      ],
    }));
    localStorage.setItem(positionKey, JSON.stringify({ root: { x: 70, y: 150 } }));
    localStorage.setItem(uiKey, JSON.stringify(ui));
  }, {
    graphKey: GRAPH_STORAGE_KEY,
    positionKey: POSITION_STORAGE_KEY,
    uiKey: UI_STORAGE_KEY,
    ui: russianEditorUi,
  });

  await page.goto('/ai-node-editor.html');
  await page.getByRole('button', { name: /Добавить ноду/ }).click();
  await page.locator('button[data-palette-type="MoveToBlackboardPosition"]').click();

  const createdNode = page.locator('.graph-node.selected[data-node-id^="movetoblackboardposition_"]');
  await expect(createdNode).toBeVisible();
  const savedParameters = await page.evaluate((graphKey) => {
    const graph = JSON.parse(localStorage.getItem(graphKey) ?? '{}');
    return graph.nodes.find((node: { type: string }) => node.type === 'MoveToBlackboardPosition')?.parameters;
  }, GRAPH_STORAGE_KEY);
  expect(savedParameters).toMatchObject({
    targetKey: 'best_cover_position',
    acceptanceRadiusCells: 0.2,
    timeoutSeconds: 15,
  });
});

test('shows running movement, remaining distance, and Russian authoring controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ graphKey, positionKey, uiKey, ui }) => {
    const graph = {
      version: 1,
      id: 'stateful_move_browser_graph',
      name: 'Stateful Move Browser Graph',
      nameRu: 'Проверочный граф длительного движения',
      rootNodeId: 'root',
      blackboardDefaults: {},
      nodes: [
        { id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', children: ['utility'], parameters: {} },
        { id: 'utility', type: 'UtilitySelector', displayName: 'Best choice', displayNameRu: 'Лучший выбор', children: ['branch'], parameters: {} },
        { id: 'branch', type: 'ActionBranch', displayName: 'Take cover', displayNameRu: 'Занять укрытие', children: ['sequence'], parameters: {} },
        { id: 'sequence', type: 'SequenceWithMemory', displayName: 'Cover sequence', displayNameRu: 'Последовательность занятия укрытия', children: ['move'], parameters: {} },
        {
          id: 'move',
          type: 'MoveToBlackboardPosition',
          displayName: 'Move to cover',
          displayNameRu: 'Двигаться к укрытию',
          children: [],
          parameters: {
            targetKey: 'best_cover_position',
            acceptanceRadiusCells: 0.2,
            timeoutSeconds: 15,
          },
        },
      ],
    };
    localStorage.setItem(graphKey, JSON.stringify(graph));
    localStorage.setItem(positionKey, JSON.stringify({
      root: { x: 70, y: 150 },
      utility: { x: 300, y: 150 },
      branch: { x: 530, y: 150 },
      sequence: { x: 760, y: 150 },
      move: { x: 520, y: 390 },
    }));
    localStorage.setItem(uiKey, JSON.stringify(ui));
    localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      unitId: 'soldier_move_test',
      unitLabel: 'Стрелок 1',
      selectedBranchNodeId: 'branch',
      selectedBranchName: 'Take cover',
      selectedBranchNameRu: 'Занять укрытие',
      ok: true,
      status: 'running',
      activeNodeId: 'move',
      activeNodeName: 'Move to cover',
      activeNodeNameRu: 'Двигаться к укрытию',
      elapsedMs: 3200,
      targetKey: 'best_cover_position',
      targetPosition: { x: 18.5, y: 12.5 },
      distanceRemainingCells: 7.4,
      actionToken: 'soldier_move_test:move:0',
      paused: false,
      previewOnly: false,
      nowMs: Date.now(),
      simulationNowMs: 3200,
      explanation: 'The soldier is moving to cover.',
      explanationRu: 'Боец движется к выбранному укрытию.',
      trace: [{ nodeId: 'move', nodeType: 'MoveToBlackboardPosition', status: 'running', reason: 'Move is active.', reasonRu: 'Движение продолжается.' }],
      scores: [{ branchNodeId: 'branch', branchName: 'Take cover', branchNameRu: 'Занять укрытие', score: 82, breakdown: [], vetoed: false }],
      effects: [],
      blackboard: {},
      lifecycle: [{ phase: 'update', nodeId: 'move', nodeType: 'MoveToBlackboardPosition', atMs: 3200, reason: 'Move is active.', reasonRu: 'Движение продолжается.' }],
    }));
  }, {
    graphKey: GRAPH_STORAGE_KEY,
    positionKey: POSITION_STORAGE_KEY,
    uiKey: UI_STORAGE_KEY,
    ui: russianEditorUi,
  });

  await page.goto('/ai-node-editor.html');

  await page.getByRole('button', { name: /Добавить ноду/ }).click();
  const paletteMove = page.locator('button[data-palette-type="MoveToBlackboardPosition"]');
  await expect(paletteMove).toBeVisible();
  await expect(paletteMove).toContainText('Двигаться к позиции из памяти');
  await page.getByRole('button', { name: /Добавить ноду/ }).click();

  const moveNode = page.locator('.graph-node[data-node-id="move"]');
  await expect(moveNode).toBeVisible();
  await expect(moveNode).toHaveClass(/runtime-debug-running/);
  await expect(moveNode).toContainText('Выполняется');
  await expect(moveNode).toContainText('3.2 сек.');

  const panel = page.locator('.ai-runtime-debug-panel');
  await expect(panel).toContainText('Состояние');
  await expect(panel).toContainText('Выполняется');
  await expect(panel).toContainText('Активная нода');
  await expect(panel).toContainText('Двигаться к укрытию');
  await expect(panel).toContainText('Цель из памяти');
  await expect(panel).toContainText('best_cover_position');
  await expect(panel).toContainText('18.5; 12.5');
  await expect(panel).toContainText('7.4 клетки');

  await moveNode.click();
  const authoring = page.locator('.stateful-node-human-panel');
  await expect(authoring).toContainText('Длительное движение');
  await expect(authoring.getByLabel('Цель из памяти')).toHaveValue('best_cover_position');
  const radiusField = authoring.getByLabel('Радиус достижения, клеток');
  const timeoutField = authoring.getByLabel('Максимальное время, секунд');
  await expect(radiusField).toHaveValue('0.2');
  await expect(timeoutField).toHaveValue('15');
  await expect(authoring).toBeInViewport();

  await radiusField.fill('0.35');
  await timeoutField.fill('20');
  await page.locator('.human-node-panel').getByRole('button', { name: 'Сохранить параметры' }).click();
  await expect(page.locator('.stateful-node-human-panel').getByLabel('Радиус достижения, клеток')).toHaveValue('0.35');
  await expect(page.locator('.stateful-node-human-panel').getByLabel('Максимальное время, секунд')).toHaveValue('20');

  const saved = await page.evaluate((graphKey) => {
    const graph = JSON.parse(localStorage.getItem(graphKey) ?? '{}');
    return graph.nodes.find((node: { id: string }) => node.id === 'move')?.parameters;
  }, GRAPH_STORAGE_KEY);
  expect(saved).toMatchObject({
    targetKey: 'best_cover_position',
    acceptanceRadiusCells: 0.35,
    timeoutSeconds: 20,
  });

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27-ai-running-move-node.png') });
});
