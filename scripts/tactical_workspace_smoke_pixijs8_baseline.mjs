import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

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
  let content = '';
  try {
    content = read(relativePath);
  } catch {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  for (const snippet of snippets) {
    if (content.includes(snippet)) failures.push(`${relativePath}: must not contain ${JSON.stringify(snippet)}`);
  }
}

const ACTIVE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const LEGACY_PIXI_PACKAGES = new Set(['pixi.js-legacy', 'pixi-legacy']);
const LEGACY_PIXI_MEMBERS = new Set([
  'beginFill', 'beginTextureFill', 'endFill', 'lineStyle', 'lineTextureStyle',
  'drawRect', 'drawCircle', 'drawEllipse', 'drawPolygon', 'drawRoundedRect', 'drawStar',
  'drawRegularPolygon', 'drawRoundedPolygon', 'drawRoundedShape', 'drawChamferRect', 'drawFilletRect',
  'cacheAsBitmap', 'baseTexture',
]);

function collectSourceFiles(relativeDirectory) {
  const entries = fs.readdirSync(path.join(root, relativeDirectory), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  return entries.flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(relativePath);
    return entry.isFile() && ACTIVE_SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [relativePath] : [];
  });
}

function syntaxName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return null;
}

function moduleSpecifier(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text;
  if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
    && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) return node.arguments[0].text;
  return null;
}

function isLegacyPixiPackage(specifier) {
  return specifier.startsWith('@pixi/') || LEGACY_PIXI_PACKAGES.has(specifier);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function directThisProperty(expression) {
  return ts.isPropertyAccessExpression(expression) && expression.expression.kind === ts.SyntaxKind.ThisKeyword
    ? `this.${expression.name.text}`
    : null;
}

function receiverKey(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  return directThisProperty(expression);
}

function isAwaitedCall(call) {
  let current = call.parent;
  while (current && (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isNonNullExpression(current))) current = current.parent;
  return Boolean(current && ts.isAwaitExpression(current));
}

function hasWebglPreference(call) {
  const options = call.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const preference = options.properties.find((property) => property.name && syntaxName(property.name) === 'preference');
  if (!preference || !ts.isPropertyAssignment(preference)) return false;
  const value = preference.initializer;
  return (ts.isStringLiteral(value) && value.text === 'webgl')
    || (ts.isArrayLiteralExpression(value)
      && value.elements.some((element) => ts.isStringLiteral(element) && element.text === 'webgl'));
}

function inspectPixiV8Baseline() {
  const packageJson = JSON.parse(read('package.json'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (dependencies['pixi.js'] !== '^8.19.0') {
    failures.push(`package.json: pixi.js must be exactly ^8.19.0, found ${JSON.stringify(dependencies['pixi.js'])}`);
  }
  for (const dependency of Object.keys(dependencies).sort()) {
    if (isLegacyPixiPackage(dependency)) failures.push(`package.json: legacy/split Pixi package is forbidden: ${dependency}`);
  }

  const totals = { applications: 0, canvas: 0, sourceUpdate: 0 };
  for (const relativePath of collectSourceFiles('src')) {
    const sourceFile = ts.createSourceFile(relativePath, read(relativePath), ts.ScriptTarget.Latest, true);
    const applicationAliases = new Set();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause
        || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== 'pixi.js') continue;
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) applicationAliases.add(`${bindings.name.text}.Application`);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if ((element.propertyName?.text ?? element.name.text) === 'Application') applicationAliases.add(element.name.text);
        }
      }
    }

    const constructionKeys = new Map();
    const initCallsByKey = new Map();
    const inspect = (node) => {
      const specifier = moduleSpecifier(node);
      if (specifier && isLegacyPixiPackage(specifier)) {
        failures.push(`${relativePath}:${lineOf(sourceFile, node)}: legacy/split Pixi import is forbidden: ${specifier}`);
      }
      if (specifier && relativePath.startsWith('src/core/')) {
        const resolved = specifier.startsWith('.')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier))
          : '';
        if (specifier === 'pixi.js' || specifier.startsWith('pixi.js/') || isLegacyPixiPackage(specifier)) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: src/core must not import PixiJS`);
        }
        if (resolved === 'src/main' || resolved.startsWith('src/main.')
          || /^src\/(rendering|input|ui)(\/|$)/.test(resolved)) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: src/core must not import DOM/rendering layer ${specifier}`);
        }
      }

      if (ts.isNewExpression(node) && applicationAliases.has(node.expression.getText(sourceFile))) {
        totals.applications += 1;
        if ((node.arguments?.length ?? 0) > 0) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: Application must be constructed without synchronous options`);
        }
        const parent = node.parent;
        const key = ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
          ? parent.name.text
          : ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ? directThisProperty(parent.left)
            : null;
        if (!key) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: Application construction must use a direct variable or this.<property> binding`);
        } else {
          constructionKeys.set(key, node);
        }
      }

      const member = syntaxName(node);
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        && member && LEGACY_PIXI_MEMBERS.has(member)) {
        failures.push(`${relativePath}:${lineOf(sourceFile, node)}: legacy Pixi member ${member} is forbidden`);
      }
      if (ts.isIdentifier(node) && (node.text === 'BaseTexture' || node.text === 'SCALE_MODES')) {
        failures.push(`${relativePath}:${lineOf(sourceFile, node)}: legacy Pixi identifier ${node.text} is forbidden`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        && member === 'fromBuffer' && node.expression.getText(sourceFile) === 'Texture') {
        failures.push(`${relativePath}:${lineOf(sourceFile, node)}: Texture.fromBuffer is forbidden`);
      }

      if (ts.isCallExpression(node)
        && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
        && syntaxName(node.expression) === 'init') {
        const key = receiverKey(node.expression.expression);
        if (key) {
          const calls = initCallsByKey.get(key) ?? [];
          calls.push({ call: node, awaited: isAwaitedCall(node), webgl: hasWebglPreference(node) });
          initCallsByKey.set(key, calls);
        }
      }

      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && member === 'view'
        && applicationAliases.size > 0) {
        failures.push(`${relativePath}:${lineOf(sourceFile, node)}: use Application.canvas instead of Application.view`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && member === 'canvas'
        && applicationAliases.size > 0) totals.canvas += 1;
      if (ts.isCallExpression(node) && syntaxName(node.expression) === 'update'
        && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
        && syntaxName(node.expression.expression) === 'source') totals.sourceUpdate += 1;

      ts.forEachChild(node, inspect);
    };
    inspect(sourceFile);

    for (const [key, construction] of constructionKeys) {
      const calls = initCallsByKey.get(key) ?? [];
      if (calls.length === 0) {
        failures.push(`${relativePath}:${lineOf(sourceFile, construction)}: ${key} must call awaited init()`);
        continue;
      }
      for (const init of calls) {
        if (!init.awaited) failures.push(`${relativePath}:${lineOf(sourceFile, init.call)}: ${key}.init() must be awaited`);
        if (!init.webgl) failures.push(`${relativePath}:${lineOf(sourceFile, init.call)}: ${key}.init() must include WebGL preference`);
      }
    }
  }

  if (totals.applications === 0) failures.push('src: no PixiJS Application construction found');
  if (totals.canvas === 0) failures.push('src: no Application canvas access found');
  if (totals.sourceUpdate === 0) failures.push('src: no TextureSource update call found for mutable raster data');
}

inspectPixiV8Baseline();

expectIncludes('src/ui/TacticalWorkspaceBase.ts', [
  "type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'memory'",
  'Симуляция', 'Редактирование', 'Обзор и память',
  'Диагностика ИИ (без изменений)', 'Рассчитать и выполнить',
  'workspace-file-menu', 'updateInfoPanelLive', 'stableDecision', 'buildWorkspaceUpdateKey', 'lastWorkspaceUpdateKey',
  'data-action="turn-unit"', 'Повернуть',
  'data-action="unit-attention-mode"', 'Автоматически', 'Наблюдение', 'Поиск', 'Стрельба',
  'setAttentionMode', 'clearAttentionOverride',
]);
expectExcludes('src/ui/TacticalWorkspaceBase.ts', ['u?.position.x.toFixed(2)', 'u?.behaviorRuntime.reason']);
expectIncludes('src/ui/TacticalWorkspace.ts', [
  'installTacticalPositionWorkspaceTab', 'installTacticalPositionSearchControls',
  'installTacticalPositionSettingsControls', 'installCellInspector',
  'data-tab="routeCost"', 'setRouteCostOverlayActive', 'observer.observe(shell',
]);
expectExcludes('src/ui/TacticalWorkspace.ts', [
  'observer.observe(document.body', 'getSimulationCovers', 'hoverSimulationCoverAtPosition', 'Приказать двигаться сюда',
]);

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
expectIncludes('src/core/simulation/SimulationTickLegacy.ts', [
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
  'readonly fieldsByUnit: Map<string, SelectedUnitVisibilityField>',
  'cachedFieldCount: runtime.fieldsByUnit.size',
  'runtime.fieldsByUnit.clear()',
]);

expectIncludes('src/rendering/PixiOverlayRendererBase.ts', [
  'STABLE_DIRECTIONAL_FIRE_COLOR', 'CURRENT_CONTACT_MARKER_COLOR',
]);
expectIncludes('src/rendering/PixiOverlayRenderer.ts', [
  'renderThreatLayersIfNeeded', 'must not perform a second lookup',
]);
expectExcludes('src/rendering/PixiOverlayRenderer.ts', [
  'const dangerColor = threat.visibleNow ? 0xff4e3d : 0xf09a55;',
  'renderKnowledgeLayerIfNeeded(state)', 'drawCoverMarker',
]);

expectIncludes('src/ui/EditorHeaderPlacement.ts', [
  'installEditorHeaderPlacement', 'TOOLS_BY_TAB',
  "{ id: 'spawn_object', label: 'Поставить предмет' }",
  "{ id: 'spawn_unit', label: 'Поставить бойца' }",
  "{ id: 'spawn_zone', label: 'Поставить угрозу' }",
  'data-header-placement-tool', '[data-action="editor-place"]',
]);
expectIncludes('src/ui/WorkspaceTooltipGuard.ts', ['@deprecated', 'return () => undefined']);
expectExcludes('src/ui/WorkspaceTooltipGuard.ts', ['clearCoverTooltip', 'addEventListener', '.cover-map-tooltip']);

expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'buildAwarenessField', 'buildRouteKey',
  'getDirectionalTacticalField', 'readDirectionalTacticalCell',
  'buildAwarenessKnowledgeKey', 'KNOWLEDGE_CONFIDENCE_BUCKET', 'KNOWLEDGE_UNCERTAINTY_BUCKET',
  'evaluateAwarenessFieldCell', 'getAwarenessStaticField', 'evaluateRouteDangerFromField',
  'reverseSlopeQuality', 'terrainConcealment', 'silhouetteRisk',
]);
expectIncludes('src/core/knowledge/SoldierDangerField.ts', [
  'getSoldierDangerField', 'getSoldierDangerFieldDiagnostics',
  'getThreatRelativeCoverField', 'getDirectionalTerrainSectorBasis',
  'DIRECTIONAL_SECTOR_RADIANS', 'const sectorFraction = sectorPosition - lowerSector',
  'const terrainProtection =', 'const terrainExposure =',
  'fireThreatClassForAggregation', "'rifle_fire'", "'machine_gun_fire'",
  'THREAT_GEOMETRY_CACHE_LIMIT', 'FIELD_CACHE_LIMIT', 'cachedThreatGeometryCount', 'retainedTypedArrayBytes',
]);
expectExcludes('src/core/knowledge/SoldierDangerField.ts', [
  'readDirectionalBasisValue(', 'pixi.js', '../rendering/', '../ui/',
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

expectIncludes('src/runtime/AwarenessWorldRuntime.ts', [
  'buildAwarenessWorldKey', 'latestWorldKeyByUnit',
  'workerJobsCoalesced', 'workerResultsStaleDropped',
  'new Worker', 'AwarenessWorldWorker.ts', 'MAX_PENDING_OWNERS', 'MAX_READY_OWNERS',
  'lastRequestedCanonicalThreatKey', 'lastAppliedFieldIdentity',
]);
expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'lastRasterKey', 'dangerPixels', 'stealthPixels',
  'Sprite', 'Texture', 'BufferImageSource', "scaleMode: 'nearest'", 'createAwarenessTexture',
  "representation: 'raster-sprite'", 'getDiagnostics()', '__realWargameAwarenessDebug',
  'renderTacticalPositions', 'drawB2TacticalPositionMarker', 'TacticalPositionInputController',
]);
expectExcludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'new Worker', 'AwarenessWorldWorker.ts', 'buildSoldierAwarenessReport',
  'orderCell:', 'for (const cell of report.cells) drawCell', 'graphics.drawRect(cell.x * cellSize',
]);
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
  "PERFORMANCE_CONTRACT_VERSION = 'performance-report-v5'", 'commitSha', 'buildId', 'branch',
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
  '[data-action="editor-place"]', '.editor-header-placement',
  '[data-editor-tool="spawn_object"]', '[data-editor-tool="paint_height"]',
]);
expectExcludes('src/tactical-workspace-stage8.css', ['.cover-map-tooltip']);

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
