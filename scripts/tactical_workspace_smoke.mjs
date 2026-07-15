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
  'const image = context.createImageData(mapWidth, mapHeight)',
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
  'drawZoneHandles(graphics, zone, cellSize, stroke);',
  'graphics.fill({ color: 0xfff2a8 }).stroke(stroke);',
  ".fill({ color: isSelected ? 0xfff2a8 : 0xff765f, alpha: activeAlpha })\n    .stroke(directionStroke);",
]);
expectExcludes('src/rendering/PixiOverlayRenderer.ts', [
  'const dangerColor = threat.visibleNow ? 0xff4e3d : 0xf09a55;',
  'graphics.rect(x * cellSize - handleSize / 2, y * cellSize - handleSize / 2, handleSize, handleSize).fill({ color: 0xfff2a8 });',
  'graphics.circle(centerX, centerY, isSelected ? 7 : 5).fill({ color: isSelected ? 0xfff2a8 : 0xff765f, alpha: activeAlpha });',
]);

expectIncludes('src/rendering/PixiMapRenderer.ts', [
  'const terrainGraphics = new Map<keyof typeof TERRAIN_STYLE, Graphics>();',
  'graphics.fill({ color: TERRAIN_STYLE[terrain].fill });',
  'const selectedControlStroke = { width: 3, color: 0xfff2a8, alpha: 0.95 };',
  'graphics.fill({ color: 0xfff2a8 }).stroke(selectedControlStroke);',
  'graphics.circle(0, 0, radius * 0.55).fill({ color: 0x293844 }).stroke(outline);',
]);
expectExcludes('src/rendering/PixiMapRenderer.ts', [
  ').fill({ color: style.fill });',
  'graphics.moveTo(px, 0).lineTo(px, mapHeight).stroke({ width: 1, color: 0xf6edcf, alpha: 0.12 });',
  'graphics.rect(point[0] - handle / 2, point[1] - handle / 2, handle, handle).fill({ color: 0xfff2a8 });',
]);
expectIncludes('src/rendering/PixiOrderRenderer.ts', [
  "stroke: { color: 0x101720, width: 3, join: 'round' }",
  'graphics.stroke({ width, color, alpha });',
]);
expectIncludes('src/rendering/AdaptiveGridLodInstaller.ts', [
  'graphics.stroke({ width: 2, color: 0xf6edcf, alpha: 0.22 });',
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
  'getDirectionalTacticalField', 'readDirectionalTacticalCell',
  'readDirectionalProtectionForBearing', 'readDirectionalExposureForBearing',
  'buildAwarenessKnowledgeKey', 'KNOWLEDGE_CONFIDENCE_BUCKET', 'KNOWLEDGE_UNCERTAINTY_BUCKET',
  'evaluateAwarenessFieldCell', 'getAwarenessStaticField', 'evaluateRouteDangerFromField',
  'reverseSlopeQuality', 'terrainConcealment', 'silhouetteRisk',
]);
expectExcludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'const orderCellX', 'const orderCellY',
  'evaluateSmallArmsCover', 'getCachedCover', 'coverCacheByMap', 'buildMapHash',
]);
expectIncludes('src/core/knowledge/AwarenessStaticField.ts', [
  'getAwarenessStaticField', 'estimateLocalProtection', 'Uint8Array',
  'getMapObjectSpatialIndex', 'getMapRevisionSnapshot',
]);
expectIncludes('src/core/terrain/DirectionalTerrainSectorBasis.ts', [
  'DIRECTIONAL_SECTOR_COUNT', 'slope', 'protection', 'exposure',
  'getDirectionalTerrainSectorBasisDiagnostics', 'revisions.height', 'revisions.terrain',
]);
expectIncludes('src/core/terrain/DirectionalTacticalField.ts', [
  'sectorProtection', 'sectorExposure', 'terrainProtection', 'terrainConcealment',
  'NORMALIZED_WEIGHT_BUCKET', 'getDirectionalTerrainSectorBasis', 'basis.protection',
  'getDirectionalTacticalFieldDiagnostics',
]);

expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'buildAwarenessRenderKey', 'buildAwarenessWorldKey', 'buildAwarenessMarkerKey', 'lastMarkerInputKey',
  'latestRequestedWorldKey', 'workerJobsCoalesced', 'workerResultsStaleDropped',
  'lastRasterKey', 'lastMarkerKey', 'markerUpdateCount',
  'new Worker', 'AwarenessWorldWorker.ts', 'dangerPixels', 'stealthPixels',
  'Sprite', 'Texture', 'BufferImageSource', "scaleMode: 'nearest'", 'createAwarenessTexture', 'drawAwarenessRaster',
  "representation: 'raster-sprite'", 'getDiagnostics()', '__realWargameAwarenessDebug',
  'lastRequestedCanonicalThreatKey', 'rendererLocalBestWinner', 'lastAppliedFieldIdentity',
]);
expectExcludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'buildSoldierAwarenessReport',
  'orderCell:', 'for (const cell of report.cells) drawCell', 'graphics.drawRect(cell.x * cellSize',
]);
for (const renderer of [
  'src/rendering/PixiApp.ts',
  'src/rendering/PixiMapRenderer.ts',
  'src/rendering/PixiOverlayRenderer.ts',
  'src/rendering/PixiOrderRenderer.ts',
  'src/rendering/PixiUnitRenderer.ts',
  'src/rendering/PixiAwarenessHeatmapRenderer.ts',
  'src/rendering/PixiVisibilityHeatmapRenderer.ts',
  'src/rendering/PixiRouteCostOverlayRenderer.ts',
]) {
  expectExcludes(renderer, ['beginFill(', 'endFill(', 'lineStyle(', 'drawRect(', 'drawCircle(', 'drawRoundedRect(', 'cacheAsBitmap', 'SCALE_MODES', '.baseTexture', 'Texture.fromBuffer', 'app.view']);
}

expectIncludes('src/workers/AwarenessWorldWorker.ts', [
  'buildAwarenessWorldField', 'awarenessWorkerTransferables', 'fieldIdentity', 'rasterDigest',
]);
expectIncludes('src/core/knowledge/AwarenessWorldFieldBuilder.ts', [
  'buildSoldierAwarenessReport', 'buildCanonicalWorldThreatKey',
  'dangerPixels', 'stealthPixels', 'digestAwarenessWorldField',
]);
expectIncludes('src/core/knowledge/CanonicalWorldThreat.ts', [
  'CanonicalWorldThreatSnapshot', 'unit_contact', 'directional_evidence', 'buildCanonicalWorldThreatKey',
]);
expectIncludes('src/core/debug/PerformanceMonitor.ts', [
  'PERFORMANCE_CONTRACT_VERSION', 'getRealWargameBuildIdentity', 'awarenessMovement',
]);
expectIncludes('src/core/debug/BuildIdentity.ts', [
  "PERFORMANCE_CONTRACT_VERSION = 'performance-report-v4'", 'commitSha', 'buildId', 'branch',
]);

expectIncludes('src/core/editor/GameEditorPlacement.ts', [
  'rememberSelectedUnitForTest', 'state.units.push(unit)', 'rememberSelectedUnitForTest(state)',
]);
expectIncludes('src/main.ts', [
  'installTacticalWorkspace(state, aiGameBridge',
  'installEditorHeaderPlacement()', 'installWorkspaceTooltipGuard()', 'languageToggle.click()',
  'installCombatControls(state', 'installCombatEffectsRenderer(tacticalBoard, state)',
]);
expectIncludes('src/ui/CombatControls.ts', [
  'installCombatControls', 'Стрельба: запрещена', 'Стрельба: разрешена',
  'setFireAllowed', 'aria-pressed', 'unlockCombatAudio', '.simulation-controls',
]);
expectIncludes('src/ui/CombatAudio.ts', [
  'unlockCombatAudio', 'playRifleShot', 'AudioContext', 'createOscillator', 'createBufferSource',
]);
expectIncludes('src/rendering/PixiCombatEffectsRenderer.ts', [
  'getCombatEventHistory', 'shot_fired', 'projectile_impact',
  'drawMuzzleFlash', 'drawTracer', 'drawImpact', 'playRifleShot',
]);
expectIncludes('src/rendering/CombatEffectsInstaller.ts', [
  'installCombatEffectsRenderer', 'worldContainer.addChild', 'app.ticker.add',
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
