import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

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
  'Симуляция', 'Редактирование', 'Слой опасности', 'Слой скрытности', 'Память бойца',
  'Приказать двигаться сюда', 'Один расчёт ИИ', 'Рассчитать и выполнить',
  'workspace-file-menu', 'updateInfoPanelLive', 'stableDecision',
]);
expectExcludes('src/ui/TacticalWorkspace.ts', ['u?.position.x.toFixed(2)', 'u?.behaviorRuntime.reason']);

expectIncludes('src/ui/EditorHeaderPlacement.ts', [
  'installEditorHeaderPlacement', '.game-editor-body [data-editor-tool].primary',
  "return 'Поставить предмет'", "return 'Поставить бойца'", "return 'Поставить угрозу'",
  '[data-action="editor-place"]',
]);
expectIncludes('src/ui/WorkspaceTooltipGuard.ts', [
  'installWorkspaceTooltipGuard', 'clearCoverTooltip', '[data-tab], [data-mode]', 'tooltip.hidden = true',
]);

expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'buildAwarenessField', 'buildBestSafePositions', 'buildRouteKey',
  'Movement does not invalidate the expensive map field',
  'buildAwarenessKnowledgeKey', 'KNOWLEDGE_CONFIDENCE_BUCKET', 'KNOWLEDGE_UNCERTAINTY_BUCKET',
  'getCachedCover', 'coverCacheByMap',
]);
expectExcludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'const orderCellX', 'const orderCellY', 'unit.tacticalKnowledge.revision',
]);

expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'buildAwarenessRenderKey',
  'Orders and movement change often, but they do not change the heatmap pixels themselves.',
  'lastRasterKey', 'lastMarkerKey', 'markerUpdateCount',
  'Sprite', 'Texture', 'SCALE_MODES.NEAREST', 'createAwarenessTexture', 'drawAwarenessRaster',
  "representation: 'raster-sprite'", 'getDiagnostics()', '__realWargameAwarenessDebug',
]);
expectExcludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'orderCell:', 'for (const cell of report.cells) drawCell', 'graphics.drawRect(cell.x * cellSize',
]);
expectBefore(
  'src/rendering/PixiAwarenessHeatmapRenderer.ts',
  'if (!rasterChanged && !markerChanged) return;',
  'const report = buildSoldierAwarenessReport(state, unit);',
);

expectIncludes('src/core/editor/GameEditorPlacement.ts', [
  'rememberSelectedUnitForTest', 'state.units.push(unit)', 'rememberSelectedUnitForTest(state)',
]);
expectIncludes('src/main.ts', [
  'installTacticalWorkspace(state, aiGameBridge',
  'installEditorHeaderPlacement()', 'installWorkspaceTooltipGuard()', 'languageToggle.click()',
]);
expectIncludes('src/tactical-workspace-stage8.css', [
  '.cover-map-tooltip[hidden]', '[data-action="editor-place"]', '.editor-header-placement',
]);

expectIncludes('Run-Real-Wargame-Lab.bat', [
  "Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/'",
  'start "" "http://127.0.0.1:%APP_PORT%/"', 'intentionally not opened',
]);

expectIncludes('tests/preview-screenshots.spec.ts', [
  '01-simulation-info.png', '03-simulation-danger-layer.png', '07-editor-object-palette.png',
  '10-node-editor-unchanged.png', '11-editor-spawned-fighter-playable.png',
  'uses a raster awareness overlay and clears stale tooltips',
  'raster-sprite', 'newly placed fighter remains selectable and can move in simulation',
]);

if (failures.length > 0) {
  console.error('Tactical workspace smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Tactical workspace smoke passed.');
