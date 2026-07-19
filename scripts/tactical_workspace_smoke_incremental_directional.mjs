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
verifyGraphRuntimeConnection();

if (baseline.stdout) process.stdout.write(baseline.stdout);
console.log('Tactical workspace migration smoke passed: old cover UI is absent and field-driven tactical positions share bounded awareness data with Graph v2.');

function isExpectedMigrationFailure(line) {
  const tacticalWorkspaceRelocations = [
    "type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory'",
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
  for (const token of [
    "type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory'",
    'Диагностика ИИ (без изменений)',
    'Рассчитать и выполнить',
    'data-action="turn-unit"',
    'data-action="unit-attention-mode"',
    'setAttentionMode',
    'clearAttentionOverride',
  ]) {
    assert.ok(base.includes(token), `workspace compatibility base must retain ${token}`);
  }
  for (const token of [
    'Опасность и тактические позиции',
    'tactical-position-help',
    'Ромбы на карте рассчитаны из личного поля опасности бойца',
    '.cover-map-tooltip',
    '.selected-cover-card',
  ]) {
    assert.ok(wrapper.includes(token), `workspace migration shell must contain ${token}`);
  }
  assert.ok(!wrapper.includes('getSimulationCovers'), 'workspace shell must not call removed cover discovery');
  assert.ok(!wrapper.includes('hoverSimulationCoverAtPosition'), 'workspace shell must not hit-test old cover markers');
  assert.ok(!wrapper.includes('Приказать двигаться сюда'), 'old object-cover movement control must not survive in active workspace code');
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
  for (const token of [
    'new Worker',
    'AwarenessWorldWorker.ts',
    'workerJobsCoalesced',
    'workerResultsStaleDropped',
    'MAX_PENDING_OWNERS',
    'MAX_READY_OWNERS',
    'requestTacticalPositions',
    'searchTacticalPositions',
  ]) {
    assert.ok(runtime.includes(token), `shared awareness runtime must contain ${token}`);
  }
  for (const token of [
    'AwarenessWorldRuntime',
    'requestTacticalPositions',
    'drawTacticalPositionMarker',
    'recommendedPosture',
    'lineTo(x + radius, y)',
  ]) {
    assert.ok(renderer.includes(token), `awareness renderer must contain ${token}`);
  }
  assert.ok(!renderer.includes('buildUnitKnowledgeReport'), 'renderer must not rebuild legacy knowledge reports');
  assert.ok(!renderer.includes('drawCoverMarker'), 'renderer must not restore old circle/square markers');
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

function verifyGraphRuntimeConnection() {
  const runtime = readFileSync('src/core/ai/AiGraphRuntime.ts', 'utf8');
  const provider = readFileSync('src/core/tactical/TacticalPositionProvider.ts', 'utf8');
  const adapter = readFileSync('src/runtime/AwarenessTacticalPositionAdapter.ts', 'utf8');
  assert.ok(runtime.includes('generateRegisteredTacticalPositions'));
  assert.ok(runtime.includes("export * from './AiGraphRuntimeLegacy'"));
  assert.ok(provider.includes('MAX_ACTIVE_PROVIDER_STATES'));
  assert.ok(provider.includes('generateRegisteredTacticalPositions'));
  assert.ok(adapter.includes('MAX_LOCAL_SAMPLE_CELLS'));
  assert.ok(adapter.includes('MAX_LOCAL_ROUTE_EXPANSIONS'));
  assert.ok(adapter.includes('no synchronous full-map fallback'));
}
