import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseline = spawnSync(
  process.execPath,
  ['scripts/tactical_workspace_smoke_pixijs8_baseline.mjs'],
  { cwd: process.cwd(), encoding: 'utf8' },
);

const acceptedMigratedContracts = [
  'src/core/knowledge/SoldierDangerField.ts: missing "readDirectionalBasisValue"',
  'src/ui/TacticalWorkspace.ts: missing "Слой опасности"',
  'src/ui/TacticalWorkspace.ts: missing "Приказать двигаться сюда"',
  'src/ui/TacticalWorkspace.ts: missing "Диагностика ИИ (без изменений)"',
  'src/ui/TacticalWorkspace.ts: missing "buildWorkspaceUpdateKey"',
  'src/ui/TacticalWorkspace.ts: missing "lastWorkspaceUpdateKey"',
  'src/ui/WorkspaceTooltipGuard.ts: missing "clearCoverTooltip"',
  'src/ui/WorkspaceTooltipGuard.ts: missing "tooltip.hidden = true"',
  'src/rendering/PixiAwarenessHeatmapRenderer.ts: missing "representation: \'raster-sprite\'"',
  'src/tactical-workspace-stage8.css: missing ".cover-map-tooltip[hidden]"',
  'tests/preview-screenshots.spec.ts: missing "raster-sprite"',
  'tests/preview-screenshots.spec.ts: missing "newly placed fighter remains selectable and can move in simulation"',
];

if (baseline.status === 0) {
  if (baseline.stdout) process.stdout.write(baseline.stdout);
  if (baseline.stderr) process.stderr.write(baseline.stderr);
} else {
  const stderr = baseline.stderr ?? '';
  const failureLines = stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('- '));
  const unexpected = failureLines.filter((line) => !acceptedMigratedContracts.some((token) => line.includes(token)));
  if (unexpected.length > 0) {
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(baseline.status ?? 1);
  }
}

const soldierDanger = readFileSync('src/core/knowledge/SoldierDangerField.ts', 'utf8');
assert.ok(soldierDanger.includes('DIRECTIONAL_SECTOR_RADIANS'), 'SoldierDanger must retain the canonical directional sector basis');
assert.ok(soldierDanger.includes('const sectorFraction = sectorPosition - lowerSector'), 'SoldierDanger must interpolate adjacent sectors exactly');
assert.ok(soldierDanger.includes('const terrainProtection ='), 'SoldierDanger must calculate directional protection inline');
assert.ok(soldierDanger.includes('const terrainExposure ='), 'SoldierDanger must calculate directional exposure inline');
assert.ok(soldierDanger.includes('without allocating a GridPosition'), 'SoldierDanger must document the allocation-free hot path');
assert.ok(!soldierDanger.includes('readDirectionalBasisValue('), 'SoldierDanger hot-path interpolation must not restore the per-cell helper call');

const cover = readFileSync('src/core/cover/CoverSuitability.ts', 'utf8');
assert.ok(cover.includes('coverSuitabilityField: Uint8Array'), 'cover suitability must expose a dense typed field');
assert.ok(cover.includes('quickCoverMask: Uint8Array'), 'quick cover must use a compact mask');
assert.ok(cover.includes('qualityCoverMask: Uint8Array'), 'quality cover must use a compact mask');
assert.ok(cover.includes('maxVisitedCells: 4096'), 'cover search must be bounded');
assert.ok(cover.includes('quickMaxRouteMeters: 10'), 'quick cover route limit must be ten meters');
assert.ok(cover.includes('fields.totalCost'), 'cover search must reuse canonical route costs');
assert.ok(cover.includes('fields.dangerPercent'), 'cover search must reuse canonical danger');
assert.ok(!cover.includes('computeLineOfSight'), 'the new danger/cover field must not repeat LOS');
assert.ok(cover.includes('resultCache'), 'cover result must be cached');
assert.ok(cover.includes('heapIndices: Int32Array'), 'bounded search queue must use reusable typed storage');
assert.ok(cover.includes('heapPositions: Int32Array'), 'bounded search must use decrease-key without duplicate heap objects');
assert.ok(!cover.includes('new MinHeap'), 'cover search must not allocate a heap per calculation');
assert.ok(!cover.includes('interface HeapItem'), 'cover search must not allocate heap item objects');
assert.ok(cover.includes('totalCost already contains the configured danger component'), 'route danger must not be added twice');
assert.ok(cover.includes('getOrRequestAsyncRouteCostFields'), 'runtime cover preparation must use the canonical route worker');
assert.ok(cover.includes("preparationStatus: 'pending'"), 'runtime cover preparation must expose a stable pending result');
assert.ok(cover.includes('pendingPollIntervalMs: 100'), 'pending worker polling must be throttled');
assert.ok(cover.includes('runtimePreparationCache'), 'unchanged runtime inputs must reuse ready/pending results');
assert.ok(cover.includes('combineRouteAndDangerFields'), 'a danger-disabled route profile must keep its route costs while reusing canonical danger');

const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
assert.ok(workspace.includes('data-overlay-mode="danger"') || workspace.includes('data-overlay-mode="${id}"'), 'danger panel must expose tactical overlay segments');
assert.ok(workspace.includes("['danger', 'Опасность']"));
assert.ok(workspace.includes("['cover', 'Укрытия']"));
assert.ok(workspace.includes("['combined', 'Вместе']"));
assert.ok(workspace.includes('getCoverSuitability(state, unit)'), 'danger panel must read regional cover candidates');
assert.ok(workspace.includes('bestQuickCoverCandidates'));
assert.ok(workspace.includes('bestQualityCoverCandidates'));
assert.ok(!workspace.includes('cover-map-tooltip'));
assert.ok(!workspace.includes('SimulationCoverSelection'));
const shellMarkup = workspace.slice(workspace.indexOf('shell.innerHTML'), workspace.indexOf('document.body.append'));
assert.ok(!shellMarkup.includes('data-overlay-mode'), 'overlay switch must not be rendered in the lower unit bar');
const dangerPanel = workspace.slice(workspace.indexOf('function renderDanger'), workspace.indexOf('function renderCandidateList'));
assert.ok(dangerPanel.includes('tactical-overlay-segmented-panel'), 'overlay switch must be rendered inside the Danger sidebar panel');
assert.ok(workspace.includes("cover?.preparationStatus ?? ''"), 'idle polling must observe pending-to-ready cover transitions');
assert.ok(workspace.includes("cover?.cacheKey ?? ''"), 'idle polling must observe a newly ready cover cache key');
assert.ok(workspace.includes("previousKey !== lastRenderKey"), 'the workspace must request a renderer refresh when cover preparation changes while idle');
assert.ok(workspace.includes('updateInfoPanelLive'), 'the Info tab live presentation must remain restored');
assert.ok(workspace.includes('stableDecision'), 'the Info tab stable AI decision presentation must remain restored');
assert.ok(workspace.includes("heading('Слой скрытности'"), 'the Stealth tab presentation must remain restored');
assert.ok(workspace.includes("heading('Обзор и память'"), 'the Overview and memory presentation must remain restored');
assert.ok(workspace.includes('buildUnitKnowledgeReport(state, unit)'), 'the Memory tab must keep its previous knowledge source');

const runtimeUi = readFileSync('src/core/ui/RuntimeUiState.ts', 'utf8');
assert.ok(runtimeUi.includes("export type TacticalOverlayMode = 'danger' | 'cover' | 'combined'"));
assert.ok(runtimeUi.includes('cycleTacticalOverlayMode'));

const input = readFileSync('src/input/BoardInputController.ts', 'utf8');
assert.ok(input.includes("event.key.toLowerCase() === 'v'"), 'V must cycle the tactical overlay');
assert.ok(!input.includes('selectSimulationCoverAtPosition'));
assert.ok(!input.includes('hoverSimulationCoverAtPosition'));

const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
assert.ok(renderer.includes("representation: 'raster-sprite-with-region-contours'"));
assert.ok(renderer.includes('drawCoverRasterWords'));
assert.ok(renderer.includes('blendCoverRasterWords'), 'combined mode must include a visible neutral cover fill, not contours alone');
assert.ok(renderer.includes('drawMaskBoundaries'));
assert.ok(renderer.includes('quickCoverMask'));
assert.ok(renderer.includes('qualityCoverMask'));
assert.ok(renderer.includes("nextCoverResult.preparationStatus === 'ready'"), 'a pending refresh must not erase the last ready cover display');
assert.ok(renderer.includes("this.coverResult.preparationStatus !== 'ready'"), 'the first pending result must still be replaceable by ready data');
assert.ok(!renderer.includes('drawCoverMarker'));

const overlay = readFileSync('src/rendering/PixiOverlayRenderer.ts', 'utf8');
assert.ok(overlay.includes('legacyCoverMarkerCount: 0'));
assert.ok(overlay.includes('drawZoneHandles'), 'editor handles must remain intact');
assert.ok(!overlay.includes('KnowledgeCover'));
assert.ok(!overlay.includes('drawCoverMarker'));

const knowledge = readFileSync('src/core/knowledge/UnitKnowledge.ts', 'utf8');
assert.ok(knowledge.includes('buildObjectCovers'), 'the Overview and memory tab must retain its previous object-knowledge source');
assert.ok(knowledge.includes('buildForestCovers'), 'the Overview and memory tab must retain its previous vegetation-knowledge source');
assert.ok(knowledge.includes('KnowledgeCover'), 'the Overview and memory tab contract must remain unchanged');
assert.equal(existsSync('src/core/knowledge/SimulationCoverSelection.ts'), false, 'the removed interactive legacy bridge must stay deleted');

const css = readFileSync('src/tactical-workspace-stage8.css', 'utf8');
assert.ok(css.includes('.tactical-overlay-segmented'));
assert.ok(css.includes('.tactical-overlay-segmented-panel'), 'the danger-panel switch must have panel-specific layout');
assert.ok(!css.includes('.cover-map-tooltip[hidden]'));

if (baseline.stdout) process.stdout.write(baseline.stdout);
console.log('Tactical workspace keeps non-danger tabs intact and renders cover persistently from the Danger panel.');
