import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseline = spawnSync(
  process.execPath,
  ['scripts/tactical_workspace_smoke_pixijs8_baseline.mjs'],
  { cwd: process.cwd(), encoding: 'utf8' },
);

if (baseline.status !== 0) {
  const stderr = baseline.stderr ?? '';
  const failureLines = stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('- '));
  const unexpected = failureLines.filter((line) => !isExpectedMigrationFailure(line));
  if (unexpected.length > 0 || failureLines.length === 0) {
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(baseline.status ?? 1);
  }
}

verifyAllocationFreeDirectionalDanger();
verifyWorkspaceMigration();
verifyOverlayMigration();
verifySharedAwarenessRuntime();
verifyBoundedTacticalSearch();
verifyLegacyCoverDiscoveryIsGone();
verifyLegacyAuxiliaryUiIsGone();
verifyGraphRuntimeConnection();

if (baseline.stdout) process.stdout.write(baseline.stdout);
console.log('Tactical workspace migration smoke passed: old cover UI is absent and field-driven tactical positions share bounded awareness data with Graph v2.');

function isExpectedMigrationFailure(line) {
  const tacticalWorkspaceRelocations = [
    "type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'memory'",
    'Симуляция',
    'Редактирование',
    'Слой опасности',
    'Слой скрытности',
    'Обзор и память',
    'Приказать двигаться сюда',
    'Диагностика ИИ (без изменений)',
    'Рассчитать и выполнить',
    'workspace-file-menu',
    'updateInfoPanelLive',
    'stableDecision',
    'buildWorkspaceUpdateKey',
    'lastWorkspaceUpdateKey',
    'data-action=\\"turn-unit\\"',
    'Повернуть',
    'data-action=\\"unit-attention-mode\\"',
    'Автоматически',
    'Наблюдение',
    'Поиск',
    'Стрельба',
    'setAttentionMode',
    'clearAttentionOverride',
  ];
  if (line.includes('src/ui/TacticalWorkspace.ts: missing')) {
    return tacticalWorkspaceRelocations.some((token) => line.includes(token));
  }
  if (line.includes('src/rendering/PixiOverlayRenderer.ts: missing')) {
    return line.includes('STABLE_DIRECTIONAL_FIRE_COLOR')
      || line.includes('CURRENT_CONTACT_MARKER_COLOR');
  }
  if (line.includes('src/rendering/PixiAwarenessHeatmapRenderer.ts: missing')) {
    return [
      'latestRequestedWorldKey',
      'workerJobsCoalesced',
      'workerResultsStaleDropped',
      'new Worker',
      'AwarenessWorldWorker.ts',
    ].some((token) => line.includes(token));
  }
  if (line.includes('src/ui/WorkspaceTooltipGuard.ts: missing')) {
    return ['clearCoverTooltip', '[data-tab], [data-mode]', 'tooltip.hidden = true']
      .some((token) => line.includes(token));
  }
  if (line.includes('src/tactical-workspace-stage8.css: missing')) {
    return line.includes('.cover-map-tooltip[hidden]');
  }
  if (line.includes('src/core/simulation/SimulationTick.ts: missing')) {
    return line.includes('applyFinalFacing') || line.includes('unit.facingRadians = order.finalFacingRadians');
  }
  return line.includes('src/core/knowledge/SoldierDangerField.ts: missing "readDirectionalBasisValue"');
}

function verifyAllocationFreeDirectionalDanger() {
  const source = readFileSync('src/core/knowledge/SoldierDangerField.ts', 'utf8');
  assert.ok(source.includes('DIRECTIONAL_SECTOR_RADIANS'), 'SoldierDanger must retain the canonical directional sector basis');
  assert.ok(source.includes('const sectorFraction = sectorPosition - lowerSector'), 'SoldierDanger must interpolate adjacent sectors exactly');
  assert.ok(source.includes('const terrainProtection ='), 'SoldierDanger must calculate directional protection inline');
  assert.ok(source.includes('const terrainExposure ='), 'SoldierDanger must calculate directional exposure inline');
  assert.ok(source.includes('without allocating a GridPosition'), 'SoldierDanger must document the allocation-free hot path');
  assert.ok(!source.includes('readDirectionalBasisValue('), 'SoldierDanger hot-path interpolation must not restore the per-cell helper call');
}

function verifyWorkspaceMigration() {
  const base = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
  const wrapper = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
  const positionsTab = readFileSync('src/ui/TacticalPositionWorkspaceTab.ts', 'utf8');
  const searchControls = readFileSync('src/ui/TacticalPositionSearchControls.ts', 'utf8');
  for (const token of ["type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'memory'", 'Диагностика ИИ (без изменений)', 'Рассчитать и выполнить', 'data-action="turn-unit"', 'data-action="unit-attention-mode"', 'setAttentionMode', 'clearAttentionOverride']) assert.ok(base.includes(token), `workspace compatibility base must retain ${token}`);
  for (const token of ['installTacticalPositionWorkspaceTab', 'installTacticalPositionSearchControls', 'installTacticalPositionSettingsControls', '.cover-map-tooltip', '.selected-cover-card', 'observer.observe(shell', 'requestAnimationFrame']) assert.ok(wrapper.includes(token), `workspace migration shell must contain ${token}`);
  for (const token of ["getSimulationLayerState(state).mode === 'positions'", 'clearVisibleTacticalPositions', 'TAB_CHANGED_EVENT']) assert.ok(positionsTab.includes(token), `positions tab bridge must contain ${token}`);
  for (const token of ["'advance_to_threat'", "'withdraw_from_threat'", "'continue_order'", "objectiveSelect.dataset.role = 'tactical-position-objective'", "diagnostics.dataset.role = 'tactical-position-metrics'", 'isTacticalPositionWorkspaceTabActive']) assert.ok(searchControls.includes(token), `positions controls must contain ${token}`);
  assert.ok(!searchControls.includes('[data-role="sidebar-body"]'));
  assert.ok(!wrapper.includes('observer.observe(document.body'));
  assert.ok(!wrapper.includes('getSimulationCovers'));
  assert.ok(!wrapper.includes('hoverSimulationCoverAtPosition'));
  assert.ok(!wrapper.includes('Приказать двигаться сюда'));
}

function verifyOverlayMigration() {
  const base = readFileSync('src/rendering/PixiOverlayRendererBase.ts', 'utf8');
  const wrapper = readFileSync('src/rendering/PixiOverlayRenderer.ts', 'utf8');
  assert.ok(base.includes('STABLE_DIRECTIONAL_FIRE_COLOR'));
  assert.ok(base.includes('CURRENT_CONTACT_MARKER_COLOR'));
  assert.ok(wrapper.includes('must not perform a second lookup'));
  assert.ok(wrapper.includes('renderThreatLayersIfNeeded'));
  assert.ok(!wrapper.includes('renderKnowledgeLayerIfNeeded(state)'), 'active overlay render path must skip the removed cover layer');
  assert.ok(!wrapper.includes('drawCoverMarker'), 'active overlay must not contain circle/square cover drawing');
}

function verifySharedAwarenessRuntime() {
  const runtime = readFileSync('src/runtime/AwarenessWorldRuntime.ts', 'utf8');
  const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  for (const token of ['new Worker', 'AwarenessWorldWorker.ts', 'workerJobsCoalesced', 'workerResultsStaleDropped', 'MAX_PENDING_OWNERS', 'MAX_READY_OWNERS']) assert.ok(runtime.includes(token), `shared awareness runtime must contain ${token}`);
  for (const token of ['AwarenessWorldRuntime', 'renderTacticalPositions', 'drawB2TacticalPositionMarker', 'recommendedPostureOf', 'TacticalPositionInputController', 'isTacticalPositionWorkspaceTabActive']) assert.ok(renderer.includes(token), `awareness renderer must contain ${token}`);
  assert.ok(!renderer.includes('buildUnitKnowledgeReport'));
  assert.ok(!renderer.includes('drawCoverMarker'));
}

function verifyBoundedTacticalSearch() {
  const search = readFileSync('src/core/tactical/TacticalPositionSearch.ts', 'utf8');
  for (const token of [
    'maxSampledCells',
    'maxRouteExpansions',
    'buildLocalRouteField',
    'minimumSeparationMeters',
    'staticProtectionByPosture',
    'recommendedPosture',
    'sampleBudgetExhausted',
    'routeBudgetExhausted',
  ]) {
    assert.ok(search.includes(token), `tactical position search must contain ${token}`);
  }
  assert.ok(!search.includes('performance.now'), 'gameplay search must not stop on wall-clock timing');
  assert.ok(!search.includes('findGridPath'), 'candidate generation must not run A* per candidate');
  assert.ok(!search.includes('map.objects'), 'candidate identity must come from field cells, not map objects');
}

function verifyLegacyCoverDiscoveryIsGone() {
  assert.equal(existsSync('src/core/cover/CoverTacticalCandidates.ts'), false, 'legacy object-based candidate generator must be deleted');
  const knowledge = readFileSync('src/core/knowledge/UnitKnowledge.ts', 'utf8');
  const selection = readFileSync('src/core/knowledge/SimulationCoverSelection.ts', 'utf8');
  for (const token of ['buildObjectCovers', 'buildForestCovers', 'computeLineOfSight', 'map.objects', 'map.cells']) {
    assert.ok(!knowledge.includes(token), `legacy unit knowledge must not contain ${token}`);
  }
  assert.ok(knowledge.includes('nearbyCovers: []'));
  assert.ok(knowledge.includes('planCovers: []'));
  assert.ok(!selection.includes('buildUnitKnowledgeReport'));
  assert.ok(selection.includes('return [];'));
  assert.ok(selection.includes('return null;'));
}

function verifyLegacyAuxiliaryUiIsGone() {
  const guard = readFileSync('src/ui/WorkspaceTooltipGuard.ts', 'utf8');
  const coverDirection = readFileSync('src/rendering/PixiCoverDirectionRenderer.ts', 'utf8');
  const stage8Css = readFileSync('src/tactical-workspace-stage8.css', 'utf8');
  assert.ok(!guard.includes('addEventListener'), 'removed cover tooltip must not leave global listeners');
  assert.ok(!guard.includes('.cover-map-tooltip'), 'removed cover tooltip must not remain in its former guard');
  for (const token of ['objectCenter', 'resolveObjectCoverProperties', 'getSelectedMapObject', 'selectedCoverProtectsUnit']) {
    assert.ok(!coverDirection.includes(token), `cover-direction compatibility renderer must not contain ${token}`);
  }
  assert.ok(coverDirection.includes('Directional protection is now calculated only by the shared soldier awareness fields'));
  assert.ok(!stage8Css.includes('.cover-map-tooltip'), 'legacy tooltip CSS must be deleted');
}

function verifyGraphRuntimeConnection() {
  const runtime = readFileSync('src/core/ai/AiGraphRuntime.ts', 'utf8');
  const runner = readFileSync('src/core/ai/AiGraphRunner.ts', 'utf8');
  const service = readFileSync('src/core/tactical/TacticalPositionSearchService.ts', 'utf8');
  const objective = readFileSync('src/core/tactical/TacticalPositionObjective.ts', 'utf8');
  assert.ok(runtime.includes("export * from './AiGraphRuntimeLegacy'"));
  assert.ok(runner.includes('wrapStatefulTacticalHost'));
  assert.ok(runner.includes('tacticalRequestMemoryKey'));
  assert.ok(service.includes('enqueueCoverSearch'));
  assert.ok(service.includes('searchTacticalPositionsForObjective'));
  assert.ok(service.includes('origin: { ...unit.position }'));
  assert.ok(service.includes('currentPosture: unit.behaviorRuntime.posture'));
  assert.ok(service.includes('Walking'));
  assert.ok(objective.includes('distanceToThreatMeters'));
  assert.ok(objective.includes('threatDistanceDeltaMeters'));
  assert.ok(objective.includes('distanceToOrderTargetMeters'));
}
