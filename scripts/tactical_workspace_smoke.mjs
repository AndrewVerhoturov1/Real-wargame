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
  'Симуляция', 'Редактирование', 'Слой опасности', 'Слой скрытности', 'Обзор и память',
  'Приказать двигаться сюда', 'Один расчёт ИИ', 'Рассчитать и выполнить',
  'workspace-file-menu', 'updateInfoPanelLive', 'stableDecision',
  'data-action="turn-unit"', 'Повернуть',
  'data-action="unit-attention-mode"', 'Автоматически', 'Наблюдение', 'Поиск', 'Стрельба',
  'setAttentionMode', 'clearAttentionOverride',
]);
expectExcludes('src/ui/TacticalWorkspace.ts', ['u?.position.x.toFixed(2)', 'u?.behaviorRuntime.reason']);

expectIncludes('src/core/ui/RuntimeUiState.ts', [
  'UnitCommandToolRuntimeState', 'turnToolActive', 'routeFacingDraft',
  'setTurnToolActive', 'setRouteFacingDraft', 'consumeTurnTool',
]);
expectIncludes('src/input/BoardInputController.ts', [
  'rightPointerId', 'rightStartGrid', 'setRouteFacingDraft',
  'getUnitCommandToolState', 'faceSelectedUnitsToward',
  'issueRoutedMoveOrderToSelectedUnits(this.state, this.rightStartGrid, finalFacingRadians)',
  "this.canvas.style.cursor = 'crosshair'",
]);
expectIncludes('src/core/orders/PlayerCommand.ts', ['finalFacingRadians']);
expectIncludes('src/core/orders/MoveOrder.ts', ['finalFacingRadians']);
expectIncludes('src/core/orders/MoveOrderPlanning.ts', ['finalFacingRadians: options.finalFacingRadians']);
expectIncludes('src/core/orders/RoutedMoveOrders.ts', ['finalFacingRadians?: number', 'finalFacingRadians,']);
expectIncludes('src/core/simulation/SimulationTick.ts', [
  'applyFinalFacing', 'order.finalFacingRadians', 'unit.facingRadians = order.finalFacingRadians',
]);
expectIncludes('src/rendering/CommandPlanRouteOverlayModel.ts', ['finalFacingRadians']);
expectIncludes('src/rendering/PixiOrderRenderer.ts', ['drawFacingArrow', 'finalFacingRadians']);

expectIncludes('src/rendering/PixiVisibilityHeatmapRenderer.ts', [
  'UNSEEN_OVERLAY_COLOR', 'UNSEEN_OVERLAY_ALPHA', 'cachedFieldCount',
  'image.data[pixel + 3] = Math.round(UNSEEN_OVERLAY_ALPHA * 255)',
]);
expectExcludes('src/rendering/PixiVisibilityHeatmapRenderer.ts', [
  'if (quality <= 0.01) continue;',
]);
expectIncludes('src/ui/AttentionRuntimePanel.ts', [
  'attention-compact-legend', 'Хорошо видно', 'Средне', 'Слабо', 'Не видно',
  'Текущий контакт', 'Последнее место', 'Подозрение', 'Звук',
  "metric('Полей в кеше', String(fieldDiagnostics.cachedFieldCount))",
  'Повторных использований с запуска',
]);
expectIncludes('src/perception-attention.css', [
  '.attention-compact-legend', '.attention-legend-gradient', '.attention-legend-marker',
]);
expectIncludes('src/core/visibility/SelectedUnitVisibilityField.ts', [
  'cachedFieldCount', 'cachedFieldCount: runtime.field ? 1 : 0',
]);

expectIncludes('src/rendering/PixiOverlayRenderer.ts', [
  'STABLE_DIRECTIONAL_FIRE_COLOR', 'CURRENT_CONTACT_MARKER_COLOR',
]);
expectExcludes('src/rendering/PixiOverlayRenderer.ts', [
  'const dangerColor = threat.visibleNow ? 0xff4e3d : 0xf09a55;',
]);

expectIncludes('src/ui/EditorHeaderPlacement.ts', [
  'installEditorHeaderPlacement', 'TOOLS_BY_TAB',
  "{ id: 'spawn_object', label: 'Поставить предмет' }",
  "{ id: 'spawn_unit', label: 'Поставить бойца' }",
  "{ id: 'spawn_zone', label: 'Поставить угрозу' }",
  'data-header-placement-tool', '[data-action="editor-place"]',
]);
expectIncludes('src/ui/WorkspaceTooltipGuard.ts', [
  'installWorkspaceTooltipGuard', 'clearCoverTooltip', '[data-tab], [data-mode]', 'tooltip.hidden = true',
]);

expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'buildAwarenessField', 'buildBestSafePositions', 'buildRouteKey',
  'Movement does not invalidate the expensive map field',
  'buildAwarenessKnowledgeKey', 'KNOWLEDGE_CONFIDENCE_BUCKET', 'KNOWLEDGE_UNCERTAINTY_BUCKET',
  'evaluateAwarenessFieldCell', 'getAwarenessStaticField', 'evaluateRouteDangerFromField',
]);
expectExcludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'const orderCellX', 'const orderCellY', 'unit.tacticalKnowledge.revision',
  'evaluateSmallArmsCover', 'getCachedCover', 'coverCacheByMap', 'buildMapHash',
]);
expectIncludes('src/core/knowledge/AwarenessStaticField.ts', [
  'getAwarenessStaticField', 'estimateLocalProtection', 'Uint8Array',
  'getMapObjectSpatialIndex', 'getMapRevisionSnapshot',
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
  '[data-editor-tool="spawn_object"]', '[data-editor-tool="paint_height"]',
]);

expectIncludes('Run-Real-Wargame-Lab.bat', [
  "Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/'",
  'start "" "http://127.0.0.1:%APP_PORT%/"', 'intentionally not opened',
]);

expectIncludes('tests/preview-screenshots.spec.ts', [
  '01-simulation-info.png', '03-simulation-danger-layer.png', '07-editor-object-palette.png',
  '10-node-editor-unchanged.png', '11-editor-spawned-fighter-playable.png',
  'uses a movement-stable raster overlay and clears stale tooltips',
  'raster-sprite', 'newly placed fighter remains selectable and can move in simulation',
]);

if (failures.length > 0) {
  console.error('Tactical workspace smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Tactical workspace smoke passed.');
