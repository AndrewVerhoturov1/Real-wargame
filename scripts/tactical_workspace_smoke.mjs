import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];

function expectIncludes(relativePath, snippets) {
  let content = '';
  try {
    content = read(relativePath);
  } catch {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (content.includes(snippet)) failures.push(`${relativePath}: must not contain ${JSON.stringify(snippet)}`);
  }
}

expectIncludes('src/ui/TacticalWorkspace.ts', [
  "type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory'",
  'Симуляция',
  'Редактирование',
  'Последнее решение ИИ',
  'Слой опасности',
  'Слой скрытности',
  'Память бойца',
  'Приказать двигаться сюда',
  'Один расчёт ИИ',
  'Рассчитать и выполнить',
  'setAiTestPaused(state, true)',
]);

expectIncludes('src/core/ui/RuntimeUiState.ts', [
  "export type SimulationLayerMode = 'info' | 'danger' | 'stealth' | 'memory'",
  'selectedCoverId',
  'hoveredCoverId',
  'setSimulationLayerMode',
  'setSelectedSimulationCover',
]);

expectIncludes('src/core/knowledge/SimulationCoverSelection.ts', [
  'findSimulationCoverAtPosition',
  'selectSimulationCoverAtPosition',
  'getSelectedSimulationCover',
]);

expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  "'stealth'",
  'postureConcealmentBonus',
]);

expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  "mode === 'stealth'",
  'скрытность',
]);

expectIncludes('src/rendering/PixiOverlayRenderer.ts', [
  'getSimulationLayerState',
  'drawThreatMemoryOverlay',
  'drawCoverKnowledgeOverlay',
  'selectedCoverId',
  'hoveredCoverId',
]);

expectIncludes('src/input/BoardInputController.ts', [
  'selectSimulationCoverAtPosition',
  'hoverSimulationCoverAtPosition',
]);

expectIncludes('src/main.ts', [
  "import { installTacticalWorkspace } from './ui/TacticalWorkspace'",
  'installTacticalWorkspace(state, aiGameBridge',
]);
expectExcludes('src/main.ts', [
  "installAiTestLabControls(state, aiGameBridge",
  'installGameHudControls(state)',
]);

expectIncludes('src/tactical-workspace.css', [
  '.tactical-workspace-bar',
  '.simulation-sidebar',
  '.simulation-unit-bar',
  'body.workspace-editor #app',
  'body.workspace-simulation.sidebar-open #app',
  '.cover-map-tooltip',
]);

expectIncludes('tests/preview-screenshots.spec.ts', [
  '01-simulation-info.png',
  '02-simulation-sidebar-collapsed.png',
  '03-simulation-danger-layer.png',
  '04-simulation-cover-selected.png',
  '05-simulation-stealth-layer.png',
  '06-simulation-memory-layer.png',
  '07-editor-object-palette.png',
  '08-editor-threat-tools.png',
  '09-editor-terrain-tools.png',
  '10-node-editor-unchanged.png',
]);

if (failures.length > 0) {
  console.error('Tactical workspace smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Tactical workspace smoke passed.');
