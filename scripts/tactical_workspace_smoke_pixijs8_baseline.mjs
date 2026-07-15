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
  const content = read(relativePath);
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

function isFunctionLikeScope(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function createsLexicalScope(node) {
  return ts.isSourceFile(node)
    || ts.isBlock(node)
    || ts.isModuleBlock(node)
    || ts.isCatchClause(node)
    || isFunctionLikeScope(node);
}

function registerBindingName(name, value, scope) {
  if (!scope) return;
  if (ts.isIdentifier(name)) {
    scope.bindings.set(name.text, value);
    return;
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    registerBindingName(element.name, value, scope);
  }
}

function resolveApplicationBinding(name, scope) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return current.bindings.get(name);
  }
  return null;
}

function classOwnerKey(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      return `class:${current.name?.text ?? '<anonymous>'}`;
    }
  }
  return 'module';
}

function directThisPropertyKey(node) {
  if (!ts.isPropertyAccessExpression(node) || node.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  return `${classOwnerKey(node)}:this.${node.name.text}`;
}

function resolveApplicationExpression(expression, scope, ownedProperties) {
  if (ts.isIdentifier(expression)) return resolveApplicationBinding(expression.text, scope);
  const propertyKey = directThisPropertyKey(expression);
  return propertyKey ? (ownedProperties.get(propertyKey) ?? null) : null;
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

    const scopeByNode = new Map();
    const applicationRecords = [];
    const trackedConstructions = new Set();
    const ownedProperties = new Map();

    // Deterministic supported pattern: a PixiJS Application must be assigned directly to
    // an identifier variable, with an optional direct transfer to this.<property>. This
    // intentionally does not claim arbitrary control-flow or interprocedural data-flow analysis.
    const collectBindings = (node, parentScope) => {
      const scope = createsLexicalScope(node)
        ? { parent: parentScope, bindings: new Map() }
        : parentScope;
      if (createsLexicalScope(node)) scopeByNode.set(node, scope);

      if (isFunctionLikeScope(node)) {
        for (const parameter of node.parameters) registerBindingName(parameter.name, null, scope);
      }
      if (ts.isCatchClause(node) && node.variableDeclaration) {
        registerBindingName(node.variableDeclaration.name, null, scope);
      }
      if (ts.isVariableDeclaration(node)) {
        let record = null;
        if (ts.isIdentifier(node.name) && node.initializer && ts.isNewExpression(node.initializer)
          && applicationAliases.has(node.initializer.expression.getText(sourceFile))) {
          record = {
            name: node.name.text,
            construction: node.initializer,
            initCalls: [],
          };
          applicationRecords.push(record);
          trackedConstructions.add(node.initializer);
        }
        registerBindingName(node.name, record, scope);
      }
      if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && node.type
        && applicationAliases.has(node.type.getText(sourceFile))) {
        ownedProperties.set(`${classOwnerKey(node)}:this.${node.name.text}`, {
          name: `this.${node.name.text}`,
        });
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const propertyKey = directThisPropertyKey(node.left);
        if (propertyKey && ts.isIdentifier(node.right)) {
          const record = resolveApplicationBinding(node.right.text, scope);
          if (record) ownedProperties.set(propertyKey, record);
        }
      }

      ts.forEachChild(node, (child) => collectBindings(child, scope));
    };
    collectBindings(sourceFile, null);

    const inspect = (node, parentScope) => {
      const scope = scopeByNode.get(node) ?? parentScope;
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
        if (!trackedConstructions.has(node)) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: Application construction must use a direct identifier variable binding`);
        }
        if ((node.arguments?.length ?? 0) > 0) {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: Application must be constructed without synchronous options`);
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
        const receiver = node.expression.expression;
        if (ts.isIdentifier(receiver)) {
          const record = resolveApplicationBinding(receiver.text, scope);
          if (record) record.initCalls.push({ call: node, awaited: isAwaitedCall(node), webgl: hasWebglPreference(node) });
        }
      }

      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const receiver = node.expression;
        const record = resolveApplicationExpression(receiver, scope, ownedProperties);
        if (record && member === 'view') {
          failures.push(`${relativePath}:${lineOf(sourceFile, node)}: use ${record.name}.canvas instead of ${record.name}.view`);
        }
        if (record && member === 'canvas') totals.canvas += 1;
      }
      if (ts.isCallExpression(node) && syntaxName(node.expression) === 'update'
        && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
        && syntaxName(node.expression.expression) === 'source') totals.sourceUpdate += 1;

      ts.forEachChild(node, (child) => inspect(child, scope));
    };
    inspect(sourceFile, null);

    for (const record of applicationRecords) {
      if (record.initCalls.length === 0) {
        failures.push(`${relativePath}:${lineOf(sourceFile, record.construction)}: ${record.name} must call awaited init()`);
        continue;
      }
      for (const init of record.initCalls) {
        if (!init.awaited) {
          failures.push(`${relativePath}:${lineOf(sourceFile, init.call)}: ${record.name}.init() must be awaited`);
        }
        if (!init.webgl) {
          failures.push(`${relativePath}:${lineOf(sourceFile, init.call)}: ${record.name}.init() must include WebGL preference`);
        }
      }
    }
  }

  if (totals.applications === 0) failures.push('src: no PixiJS Application construction found');
  if (totals.canvas === 0) failures.push('src: no tracked Application canvas access found');
  if (totals.sourceUpdate === 0) failures.push('src: no TextureSource update call found for mutable raster data');
}

inspectPixiV8Baseline();

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
