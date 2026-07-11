import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('shows a waiting node, duration details, and Russian live diagnostics', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const graph = {
      version: 1,
      id: 'stateful_browser_graph',
      name: 'Stateful Browser Graph',
      nameRu: 'Проверочный состоянийный граф',
      rootNodeId: 'root',
      blackboardDefaults: {},
      nodes: [
        { id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', children: ['utility'], parameters: {} },
        { id: 'utility', type: 'UtilitySelector', displayName: 'Best choice', displayNameRu: 'Лучший выбор', children: ['branch'], parameters: {} },
        { id: 'branch', type: 'ActionBranch', displayName: 'Take cover', displayNameRu: 'Занять укрытие', children: ['sequence'], parameters: {} },
        { id: 'sequence', type: 'SequenceWithMemory', displayName: 'Cover sequence', displayNameRu: 'Последовательность занятия укрытия', children: ['wait'], parameters: {} },
        { id: 'wait', type: 'Wait', displayName: 'Check surroundings', displayNameRu: 'Осмотреться', children: [], parameters: { durationSeconds: 2, timeoutSeconds: 0 } },
      ],
    };
    localStorage.setItem('real-wargame.ai-node-editor.graph.v6', JSON.stringify(graph));
    localStorage.setItem('real-wargame.ai-node-editor.positions.v6', JSON.stringify({
      root: { x: 70, y: 150 },
      utility: { x: 300, y: 150 },
      branch: { x: 530, y: 150 },
      sequence: { x: 760, y: 150 },
      wait: { x: 530, y: 370 },
    }));
    localStorage.setItem('real-wargame.ai-node-editor.ui.v6', JSON.stringify({
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
    localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      unitId: 'soldier_runtime_test',
      unitLabel: 'Стрелок 1',
      selectedBranchNodeId: 'branch',
      selectedBranchName: 'Take cover',
      selectedBranchNameRu: 'Занять укрытие',
      ok: true,
      status: 'waiting',
      activeNodeId: 'wait',
      activeNodeName: 'Check surroundings',
      activeNodeNameRu: 'Осмотреться',
      elapsedMs: 1200,
      paused: false,
      previewOnly: false,
      nowMs: Date.now(),
      simulationNowMs: 1200,
      explanation: 'The sequence is waiting.',
      explanationRu: 'Последовательность ожидает завершения осмотра.',
      trace: [{ nodeId: 'wait', nodeType: 'Wait', status: 'waiting', reason: 'Wait is active.', reasonRu: 'Ожидание продолжается.' }],
      scores: [{ branchNodeId: 'branch', branchName: 'Take cover', branchNameRu: 'Занять укрытие', score: 75, breakdown: [], vetoed: false }],
      effects: [],
      blackboard: {},
      lifecycle: [{ phase: 'update', nodeId: 'wait', nodeType: 'Wait', atMs: 1200, reason: 'Wait is active.', reasonRu: 'Ожидание продолжается.' }],
    }));
  });

  await page.goto('/ai-node-editor.html');
  const waitNode = page.locator('.graph-node[data-node-id="wait"]');
  await expect(waitNode).toBeVisible();
  await expect(waitNode).toHaveClass(/runtime-debug-waiting/);
  await expect(waitNode).toContainText('Ожидает');

  const panel = page.locator('.ai-runtime-debug-panel');
  await expect(panel).toContainText('Состояние');
  await expect(panel).toContainText('Ожидает');
  await expect(panel).toContainText('Активная нода');
  await expect(panel).toContainText('Осмотреться');
  await expect(panel).toContainText('1.2 сек.');

  await waitNode.click();
  const authoring = page.locator('.stateful-node-human-panel');
  await expect(authoring).toContainText('Длительное ожидание');
  const durationField = authoring.getByLabel('Длительность, секунд');
  await expect(durationField).toHaveValue('2');
  await expect(authoring.getByLabel('Тайм-аут, секунд')).toHaveValue('0');
  await expect(authoring).toBeInViewport();

  await durationField.fill('4');
  await page.locator('.human-node-panel').getByRole('button', { name: 'Сохранить параметры' }).click();
  await expect(page.locator('.stateful-node-human-panel').getByLabel('Длительность, секунд')).toHaveValue('4');
  const savedDuration = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem('real-wargame.ai-node-editor.graph.v6') ?? '{}');
    return graph.nodes.find((node: { id: string }) => node.id === 'wait')?.parameters?.durationSeconds;
  });
  expect(savedDuration).toBe(4);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '26-ai-running-waiting-node.png') });
});
