import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_STORAGE_KEY = 'real-wargame.ai-node-editor.ui.v6';
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';

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

test('new movement node persists safe route defaults immediately', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ graphKey, positionKey, uiKey, ui }) => {
    localStorage.setItem(graphKey, JSON.stringify({
      version: 1,
      id: 'new_move_node_defaults_graph',
      name: 'New Move Node Defaults Graph',
      nameRu: 'Граф проверки новой ноды движения',
      rootNodeId: 'root',
      blackboardDefaults: {},
      nodes: [{ id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', children: [], parameters: {} }],
    }));
    localStorage.setItem(positionKey, JSON.stringify({ root: { x: 70, y: 150 } }));
    localStorage.setItem(uiKey, JSON.stringify(ui));
  }, { graphKey: GRAPH_STORAGE_KEY, positionKey: POSITION_STORAGE_KEY, uiKey: UI_STORAGE_KEY, ui: russianEditorUi });

  await page.goto('/ai-node-editor.html');
  await page.getByRole('button', { name: /Добавить ноду/ }).click();
  await page.locator('button[data-palette-type="MoveToBlackboardPosition"]').click();
  await expect(page.locator('.graph-node.selected[data-node-id^="movetoblackboardposition_"]')).toBeVisible();

  const parameters = await page.evaluate((graphKey) => {
    const graph = JSON.parse(localStorage.getItem(graphKey) ?? '{}');
    return graph.nodes.find((node: { type: string }) => node.type === 'MoveToBlackboardPosition')?.parameters;
  }, GRAPH_STORAGE_KEY);
  expect(parameters).toMatchObject({
    targetKey: 'best_cover_position',
    acceptanceRadiusCells: 0.2,
    timeoutSeconds: 15,
    stuckTimeoutSeconds: 2.5,
    minimumProgressCells: 0.05,
    abortOnTargetLost: true,
  });
});

test('shows following grid path and Russian movement controls', async ({ page }) => {
  await seedMovementEditor(page, {
    status: 'running',
    routeStatus: 'moving',
    routeNoProgressMs: 400,
    pathStatus: 'following',
    pathWaypointCount: 4,
    pathWaypointIndex: 1,
    pathRequestedTarget: { x: 18.5, y: 12.5 },
    pathResolvedTarget: { x: 18.5, y: 12.5 },
    pathReasonRu: 'Проходимый маршрут построен к точной клетке цели ИИ.',
  });

  const moveNode = page.locator('.graph-node[data-node-id="move"]');
  await expect(moveNode).toHaveClass(/runtime-debug-running/);
  const panel = page.locator('.ai-runtime-debug-panel');
  await expect(panel).toContainText('Маршрут');
  await expect(panel).toContainText('Движение');
  await expect(panel).toContainText('Путь');
  await expect(panel).toContainText('В пути');
  await expect(panel).toContainText('Точек маршрута');
  await expect(panel).toContainText('4');
  await expect(panel).toContainText('Текущая точка');
  await expect(panel).toContainText('2 из 4');
  await expect(panel).toContainText('Запрошенная цель');
  await expect(panel).toContainText('18.5; 12.5');
  await expect(panel).toContainText('Доступная цель');
  await expect(panel).toContainText('18.5; 12.5');
  await expect(panel).toContainText('Причина пути');
  await expect(panel).toContainText('Проходимый маршрут построен к точной клетке цели ИИ.');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '29-ai-path-following.png'), fullPage: true });

  await moveNode.click();
  const authoring = page.locator('.stateful-node-human-panel');
  const stuckField = authoring.getByLabel('Считать маршрут заблокированным через, секунд');
  const progressField = authoring.getByLabel('Минимальный заметный прогресс, клеток');
  const targetLostField = authoring.getByLabel('Отменять, если цель исчезла');
  await expect(stuckField).toHaveValue('2.5');
  await expect(progressField).toHaveValue('0.05');
  await expect(targetLostField).toBeChecked();

  await stuckField.fill('3.5');
  await progressField.fill('0.1');
  await targetLostField.uncheck();
  await page.locator('.human-node-panel').getByRole('button', { name: 'Сохранить параметры' }).click();
  const saved = await page.evaluate((graphKey) => {
    const graph = JSON.parse(localStorage.getItem(graphKey) ?? '{}');
    return graph.nodes.find((node: { id: string }) => node.id === 'move')?.parameters;
  }, GRAPH_STORAGE_KEY);
  expect(saved).toMatchObject({ stuckTimeoutSeconds: 3.5, minimumProgressCells: 0.1, abortOnTargetLost: false });

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27-ai-running-move-node.png'), fullPage: true });
});

test('shows blocked route with Russian cancellation reason', async ({ page }) => {
  await seedMovementEditor(page, {
    status: 'cancelled',
    routeStatus: 'blocked',
    routeNoProgressMs: 2800,
    routeAbortCode: 'route_blocked',
    routeAbortReasonRu: 'Маршрут заблокирован: боец не продвигается 2,8 сек.',
    cancellationReasonRu: 'Маршрут заблокирован: боец не продвигается 2,8 сек.',
    pathStatus: 'replanned',
    pathWaypointCount: 5,
    pathWaypointIndex: 2,
    pathRequestedTarget: { x: 18.5, y: 12.5 },
    pathResolvedTarget: { x: 18.5, y: 12.5 },
    pathReasonRu: 'Маршрут был перестроен после изменения проходимости.',
  });

  const moveNode = page.locator('.graph-node[data-node-id="move"]');
  await expect(moveNode).toHaveClass(/runtime-debug-cancelled/);
  await expect(moveNode).toContainText('Отменена');
  const panel = page.locator('.ai-runtime-debug-panel');
  await expect(panel).toContainText('Заблокирован');
  await expect(panel).toContainText('2.8 сек.');
  await expect(panel).toContainText('Причина прерывания');
  await expect(panel).toContainText('Маршрут заблокирован: боец не продвигается 2,8 сек.');
  await expect(panel).toContainText('Перестроен');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '28-ai-route-blocked.png'), fullPage: true });
});

test('shows unreachable path without fake waypoints', async ({ page }) => {
  await seedMovementEditor(page, {
    status: 'failure',
    routeStatus: 'order_missing',
    routeNoProgressMs: 0,
    pathStatus: 'unreachable',
    pathWaypointCount: 0,
    pathWaypointIndex: 0,
    pathRequestedTarget: { x: 18.5, y: 12.5 },
    pathReasonRu: 'Между стартом и точной целью ИИ нет проходимого маршрута.',
    explanationRu: 'Движение провалилось: точная цель ИИ недоступна.',
    trace: [{
      nodeId: 'move',
      nodeType: 'MoveToBlackboardPosition',
      status: 'fail',
      reason: 'The exact AI goal is unreachable.',
      reasonRu: 'Точная цель ИИ недоступна.',
    }],
  });

  const moveNode = page.locator('.graph-node[data-node-id="move"]');
  await expect(moveNode).toHaveClass(/runtime-debug-fail/);
  await expect(moveNode).not.toHaveClass(/runtime-debug-running/);
  await expect(moveNode).toContainText('Провал');
  const panel = page.locator('.ai-runtime-debug-panel');
  await expect(panel).toContainText('Состояние');
  await expect(panel).toContainText('Провал');
  await expect(panel).toContainText('До провала');
  await expect(panel).toContainText('Путь');
  await expect(panel).toContainText('Недоступен');
  await expect(panel).toContainText('Точек маршрута');
  await expect(panel).toContainText('0');
  await expect(panel).toContainText('Причина пути');
  await expect(panel).toContainText('Между стартом и точной целью ИИ нет проходимого маршрута.');
  await expect(panel).not.toContainText('Доступная цель');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '30-ai-path-unreachable.png'), fullPage: true });
});

async function seedMovementEditor(page: import('@playwright/test').Page, details: Record<string, unknown>): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(({ graphKey, positionKey, uiKey, debugKey, ui, debugDetails }) => {
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
          id: 'move', type: 'MoveToBlackboardPosition', displayName: 'Move to cover', displayNameRu: 'Двигаться к укрытию', children: [],
          parameters: { targetKey: 'best_cover_position', acceptanceRadiusCells: 0.2, timeoutSeconds: 15, stuckTimeoutSeconds: 2.5, minimumProgressCells: 0.05, abortOnTargetLost: true },
        },
      ],
    };
    localStorage.setItem(graphKey, JSON.stringify(graph));
    localStorage.setItem(positionKey, JSON.stringify({ root: { x: 70, y: 150 }, utility: { x: 300, y: 150 }, branch: { x: 530, y: 150 }, sequence: { x: 760, y: 150 }, move: { x: 520, y: 390 } }));
    localStorage.setItem(uiKey, JSON.stringify(ui));
    localStorage.setItem(debugKey, JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      unitId: 'soldier_move_test',
      unitLabel: 'Стрелок 1',
      selectedBranchNodeId: 'branch',
      selectedBranchName: 'Take cover',
      selectedBranchNameRu: 'Занять укрытие',
      ok: debugDetails.status !== 'failure',
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
      explanationRu: 'Проверка длительного движения.',
      trace: [], scores: [], effects: [], blackboard: {}, lifecycle: [],
      ...debugDetails,
    }));
  }, {
    graphKey: GRAPH_STORAGE_KEY,
    positionKey: POSITION_STORAGE_KEY,
    uiKey: UI_STORAGE_KEY,
    debugKey: DEBUG_STORAGE_KEY,
    ui: russianEditorUi,
    debugDetails: details,
  });
  await page.goto('/ai-node-editor.html');
}
