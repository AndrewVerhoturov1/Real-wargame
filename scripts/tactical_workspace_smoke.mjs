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

function expectBefore(relativePath, earlier, later) {
  const content = read(relativePath);
  const earlierIndex = content.indexOf(earlier);
  const laterIndex = content.indexOf(later);
  if (earlierIndex < 0 || laterIndex < 0 || earlierIndex >= laterIndex) {
    failures.push(`${relativePath}: expected ${JSON.stringify(earlier)} before ${JSON.stringify(later)}`);
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
  'workspace-file-menu',
  'data-live="${key}"',
  'updateInfoPanelLive',
  'stableDecision',
  'Math.floor(unit.position.x)',
  'clearCoverTooltip',
  "import '../tactical-workspace-stage8.css'",
]);
expectExcludes('src/ui/TacticalWorkspace.ts', [
  'u?.position.x.toFixed(2)',
  'u?.behaviorRuntime.reason',
  'data-action="editor-place"',
  'findCurrentEditorPlacementTool',
  'shortPlacementLabel',
]);

expectIncludes('src/ui/GameEditorWorkbench.ts', [
  'placementButtonsForTab',
  "toolButton('Поставить предмет', 'spawn_object'",
  "toolButton('Поставить бойца', 'spawn_unit'",
  "toolButton('Поставить угрозу', 'spawn_zone'",
  "toolButton('Рисовать высоту', 'paint_height'",
  "toolButton('Рисовать лес', 'paint_forest'",
  'renderHeader(header, activeTab, state',
]);
expectExcludes('src/ui/GameEditorWorkbench.ts', [
  "toolButton('Ставить предмет'",
  "toolButton('Ставить бойца'",
  "toolButton('Ставить угрозу'",
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
  'buildBaseReport',
  'buildRouteKey',
  'Orders affect only route danger',
  'buildAwarenessKnowledgeKey',
  'KNOWLEDGE_CONFIDENCE_BUCKET',
  'KNOWLEDGE_UNCERTAINTY_BUCKET',
]);
expectExcludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'const orderCellX',
  'const orderCellY',
  'unit.tacticalKnowledge.revision',
]);

expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  "mode === 'stealth'",
  'скрытность',
  'buildAwarenessRenderKey',
  'unitCell:',
  'knowledge:',
  'Orders change often, but they do not change the heatmap cells themselves.',
  'Sprite',
  'Texture',
  'SCALE_MODES.NEAREST',
  'createAwarenessTexture',
  'drawAwarenessRaster',
  "representation: 'raster-sprite'",
  'getDiagnostics()',
]);
expectExcludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'orderCell:',
  'for (const cell of report.cells) drawCell',
  'graphics.drawRect(cell.x * cellSize',
]);
expectBefore(
  'src/rendering/PixiAwarenessHeatmapRenderer.ts',
  'if (key === this.lastKey) return;',
  'const report = buildSoldierAwarenessReport(state, unit);',
);

expectIncludes('src/rendering/PixiApp.ts', [
  "private locale: Locale = 'ru'",
  'awarenessOverlay: this.awarenessHeatmapRenderer.getDiagnostics()',
]);

expectIncludes('src/core/terrain/SmoothTerrain.ts', [
  'const SMOOTH_RADIUS_CELLS = 1',
  'const HEIGHT_WEIGHT_CENTER = 5',
  'const HEIGHT_WEIGHT_NEAR = 2',
]);
expectIncludes('src/rendering/HtmlOverlayRenderer.ts', [
  'sampleSmoothHeightLevel',
  'formatSmoothHeight',
  'MIN_VISIBLE_SMOOTH_HEIGHT',
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

expectIncludes('src/core/editor/GameEditorPlacement.ts', [
  'rememberSelectedUnitForTest',
  'state.units.push(unit)',
  'rememberSelectedUnitForTest(state)',
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
expectIncludes('src/tactical-workspace-stage8.css', [
  '.workspace-file-menu',
  'body.workspace-simulation .simulation-sidebar',
  'bottom: 9px',
  '.editor-scene-tools-slot',
  '.game-editor-status',
]);
expectExcludes('src/tactical-workspace-stage8.css', [
  '.editor-place-button',
]);

expectIncludes('src/ui/SceneExportControls.ts', [
  "workspaceFileAction = 'save'",
  "workspaceFileAction = 'load'",
  "workspaceFileInput = 'scene'",
]);
expectIncludes('src/ui/PerformanceReportControls.ts', [
  "workspaceFileAction = 'performance'",
]);

expectIncludes('Run-Real-Wargame-Lab.bat', [
  "Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/'",
  'start "" "http://127.0.0.1:%APP_PORT%/"',
]);
expectExcludes('Run-Real-Wargame-Lab.bat', [
  'lab-launch.html',
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
  '11-editor-spawned-fighter-playable.png',
  'keeps information details open during live simulation updates',
  'workspace-file-menu',
  'raster-sprite',
  'hides the cover tooltip immediately when its context changes',
  'newly placed fighter remains selectable and can move in simulation',
]);

if (failures.length > 0) {
  console.error('Tactical workspace smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Tactical workspace smoke passed.');
