from __future__ import annotations

from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    source = file.read_text()
    if before not in source:
        raise RuntimeError(f"Expected fragment not found in {path}: {before[:160]!r}")
    file.write_text(source.replace(before, after, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file = Path(path)
    source = file.read_text()
    start_index = source.index(start)
    end_index = source.index(end, start_index)
    file.write_text(source[:start_index] + replacement + source[end_index:])


# TypeScript integration.
replace_once(
    'src/ai-node-editor/TacticalPositionProfileEditor.ts',
    '(draft.settings as Record<string, number | boolean>)[key] = input.checked;',
    '(draft.settings as unknown as Record<string, number | boolean>)[key] = input.checked;',
)
replace_once(
    'src/ai-node-editor/TacticalPositionProfileEditor.ts',
    '(draft.settings as Record<string, number | boolean>)[key] = next;',
    '(draft.settings as unknown as Record<string, number | boolean>)[key] = next;',
)
replace_once(
    'src/core/tactical/TacticalPositionObjective.ts',
    "import type { TacticalPositionSettings } from './TacticalPositionSettings';",
    "import type { TacticalPositionCandidateSeed } from '../ai/tactical/TacticalQuery';\nimport {\n  createDefaultTacticalPositionSettings,\n  type TacticalPositionSettings,\n} from './TacticalPositionSettings';",
)
replace_once(
    'src/core/tactical/TacticalPositionObjective.ts',
    """  const requestedLimit = Math.max(1, Math.floor(request.maxCandidates));
  const expandedLimit = Math.min(96, Math.max(24, requestedLimit * 4));
  const base = searchTacticalPositions(field, {
    ...request,
    maxCandidates: expandedLimit,
    orderTarget: request.orderTarget,
  });""",
    """  const requestedLimit = Math.max(1, Math.floor(request.maxCandidates));
  const expandedLimit = Math.min(96, Math.max(24, requestedLimit * 4));
  const settings = request.settings ?? createDefaultTacticalPositionSettings();
  const base = searchTacticalPositions(field, {
    ...request,
    maxCandidates: expandedLimit,
    orderTarget: request.orderTarget,
    settings,
  });""",
)
replace_once(
    'src/core/tactical/TacticalPositionObjective.ts',
    'score: objectiveSortScore(enriched, request.objective, request.settings),',
    'score: objectiveSortScore(enriched, request.objective, settings),',
)
replace_once(
    'src/core/tactical/TacticalPositionObjective.ts',
    """export function readTacticalPositionObjectiveMetrics(
  candidate: TacticalPositionCandidateSeedV2,
): TacticalPositionObjectiveMetrics {
  const metrics = candidate.metrics as TacticalPositionCandidateSeedV2['metrics'] & Partial<TacticalPositionObjectiveMetrics>;""",
    """export function readTacticalPositionObjectiveMetrics(
  candidate: TacticalPositionCandidateSeed,
): TacticalPositionObjectiveMetrics {
  const metrics = candidate.metrics as TacticalPositionCandidateSeed['metrics'] & Partial<TacticalPositionObjectiveMetrics>;""",
)

# Comparative posture regression now intentionally expects prone.
replace_once(
    'scripts/tactical_position_search_smoke.ts',
    "assert.equal(candidate.metrics.recommendedPosture, 'crouched');",
    "assert.equal(candidate.metrics.recommendedPosture, 'prone', 'a material prone safety advantage must produce a prone candidate');",
)

# Workspace contracts follow the current split architecture.
workspace = 'scripts/tactical_workspace_smoke_incremental_directional.mjs'
replace_once(
    workspace,
    """  if (line.includes('src/tactical-workspace-stage8.css: missing')) {
    return line.includes('.cover-map-tooltip[hidden]');
  }
  return line.includes('src/core/knowledge/SoldierDangerField.ts: missing \"readDirectionalBasisValue\"');""",
    """  if (line.includes('src/tactical-workspace-stage8.css: missing')) {
    return line.includes('.cover-map-tooltip[hidden]');
  }
  if (line.includes('src/core/simulation/SimulationTick.ts: missing')) {
    return line.includes('applyFinalFacing') || line.includes('unit.facingRadians = order.finalFacingRadians');
  }
  return line.includes('src/core/knowledge/SoldierDangerField.ts: missing \"readDirectionalBasisValue\"');""",
)
replace_between(
    workspace,
    'function verifyWorkspaceMigration() {',
    'function verifyOverlayMigration() {',
    """function verifyWorkspaceMigration() {
  const base = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
  const wrapper = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
  const positionsTab = readFileSync('src/ui/TacticalPositionWorkspaceTab.ts', 'utf8');
  const searchControls = readFileSync('src/ui/TacticalPositionSearchControls.ts', 'utf8');
  for (const token of [
    "type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory'",
    'Диагностика ИИ (без изменений)',
    'Рассчитать и выполнить',
    'data-action="turn-unit"',
    'data-action="unit-attention-mode"',
    'setAttentionMode',
    'clearAttentionOverride',
  ]) assert.ok(base.includes(token), `workspace compatibility base must retain ${token}`);
  for (const token of [
    'installTacticalPositionWorkspaceTab',
    'installTacticalPositionSearchControls',
    'installTacticalPositionSettingsControls',
    '.cover-map-tooltip',
    '.selected-cover-card',
    'observer.observe(shell',
    'requestAnimationFrame',
  ]) assert.ok(wrapper.includes(token), `workspace migration shell must contain ${token}`);
  for (const token of [
    "button.textContent = 'Позиции'",
    "setSimulationLayerMode(state, 'positions')",
    'data-role="tactical-position-tab-body"',
    'TAB_CHANGED_EVENT',
  ]) assert.ok(positionsTab.includes(token), `dedicated positions tab must contain ${token}`);
  for (const token of [
    "'advance_to_threat'",
    "'withdraw_from_threat'",
    "'continue_order'",
    "objectiveSelect.dataset.role = 'tactical-position-objective'",
    "diagnostics.dataset.role = 'tactical-position-metrics'",
    'isTacticalPositionWorkspaceTabActive',
  ]) assert.ok(searchControls.includes(token), `positions controls must contain ${token}`);
  assert.ok(!searchControls.includes('[data-role="sidebar-body"]'), 'position controls must not mount into the shared sidebar body');
  assert.ok(!wrapper.includes('observer.observe(document.body'), 'workspace migration must not observe the full document');
  assert.ok(!wrapper.includes('getSimulationCovers'), 'workspace shell must not call removed cover discovery');
  assert.ok(!wrapper.includes('hoverSimulationCoverAtPosition'), 'workspace shell must not hit-test old cover markers');
  assert.ok(!wrapper.includes('Приказать двигаться сюда'), 'old object-cover movement control must not survive in active workspace code');
}

""",
)
replace_between(
    workspace,
    'function verifySharedAwarenessRuntime() {',
    'function verifyBoundedTacticalSearch() {',
    """function verifySharedAwarenessRuntime() {
  const runtime = readFileSync('src/runtime/AwarenessWorldRuntime.ts', 'utf8');
  const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  for (const token of [
    'new Worker', 'AwarenessWorldWorker.ts', 'workerJobsCoalesced',
    'workerResultsStaleDropped', 'MAX_PENDING_OWNERS', 'MAX_READY_OWNERS',
  ]) assert.ok(runtime.includes(token), `shared awareness runtime must contain ${token}`);
  for (const token of [
    'AwarenessWorldRuntime', 'renderTacticalPositions', 'drawB2TacticalPositionMarker',
    'recommendedPostureOf', 'TacticalPositionInputController', 'isTacticalPositionWorkspaceTabActive',
  ]) assert.ok(renderer.includes(token), `awareness renderer must contain ${token}`);
  assert.ok(!renderer.includes('buildUnitKnowledgeReport'), 'renderer must not rebuild legacy knowledge reports');
  assert.ok(!renderer.includes('drawCoverMarker'), 'renderer must not restore old circle/square markers');
}

""",
)
replace_between(
    workspace,
    'function verifyGraphRuntimeConnection() {',
    '',
    '',
) if False else None
workspace_file = Path(workspace)
workspace_source = workspace_file.read_text()
old_graph = """function verifyGraphRuntimeConnection() {
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
"""
new_graph = """function verifyGraphRuntimeConnection() {
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
"""
if old_graph not in workspace_source:
    raise RuntimeError('Legacy graph runtime smoke block not found')
workspace_file.write_text(workspace_source.replace(old_graph, new_graph, 1))

# AI editor contracts follow wrapper + legacy runner and require tactical profiles.
editor = 'scripts/ai_node_editor_smoke.mjs'
replace_once(
    editor,
    """  'src/core/ai/AiGraphRunner.ts',
  'src/data/ai/soldier_default_survival_graph.json',""",
    """  'src/core/ai/AiGraphRunner.ts',
  'src/core/ai/AiGraphRunnerLegacy.ts',
  'src/ai-node-editor/TacticalPositionProfileEditor.ts',
  'src/ai-node-editor/tactical-position-profile-editor.css',
  'src/core/tactical/TacticalPositionProfileStorage.ts',
  'src/core/tactical/TacticalPositionSettingsSchema.ts',
  'src/data/ai/soldier_default_survival_graph.json',""",
)
replace_once(
    editor,
    """expectContains(html, '/src/ai-node-editor/runtime-debug-overlay.css', 'HTML должен подключать стили runtime debug overlay.');
expectContains(html, 'real-wargame.ai-node-editor.graph.v6', 'HTML должен bootstrap-ить новый чистый graph storage v6.');""",
    """expectContains(html, '/src/ai-node-editor/runtime-debug-overlay.css', 'HTML должен подключать стили runtime debug overlay.');
expectContains(html, '/src/ai-node-editor/TacticalPositionProfileEditor.ts', 'HTML должен подключать редактор профилей тактических позиций.');
expectContains(html, '/src/ai-node-editor/tactical-position-profile-editor.css', 'HTML должен подключать стили профилей тактических позиций.');
expectContains(html, 'real-wargame.ai-node-editor.graph.v6', 'HTML должен bootstrap-ить новый чистый graph storage v6.');""",
)
replace_once(
    editor,
    """expectNotContains(profileEditor, 'data-navigation-tab="diagnostics"', 'Отдельная вкладка Диагностика должна быть удалена.');
expectContains(main, 'addNodeFromPalette', 'Редактор должен уметь добавлять ноды из палитры.');""",
    """expectNotContains(profileEditor, 'data-navigation-tab="diagnostics"', 'Отдельная вкладка Диагностика должна быть удалена.');
const tacticalProfileEditor = readText('src/ai-node-editor/TacticalPositionProfileEditor.ts');
for (const needle of ['Тактические позиции', 'TACTICAL_POSITION_SETTINGS_GROUPS', 'defaultObjective', 'updateTacticalPositionProfile', 'importTacticalPositionProfile', 'exportTacticalPositionProfile']) {
  expectContains(tacticalProfileEditor, needle, `Редактор тактических профилей должен содержать: ${needle}`);
}
expectContains(main, 'addNodeFromPalette', 'Редактор должен уметь добавлять ноды из палитры.');""",
)
replace_between(
    editor,
    "const graphRunner = readText('src/core/ai/AiGraphRunner.ts');",
    "const gameBridge = readText('src/core/ai/AiGameBridge.ts');",
    """const graphRunner = readText('src/core/ai/AiGraphRunner.ts');
const graphRunnerLegacy = readText('src/core/ai/AiGraphRunnerLegacy.ts');
const graphRunnerSources = `${graphRunner}\n${graphRunnerLegacy}`;
for (const needle of [
  'runAiGraph', 'executeUtilitySelector', 'evaluateBranch', 'ParameterScore',
  'DistanceScore', 'DecisionInertia', 'RandomChance', 'StableThreshold',
  'ForbidAction', 'AiGraphEffect', 'ScoreBreakdownItem',
]) expectContains(graphRunnerSources, needle, `GraphRunner должен содержать: ${needle}`);
for (const needle of ['wrapStatefulTacticalHost', 'tacticalRequestMemoryKey', '_posture']) {
  expectContains(graphRunner, needle, `GraphRunner wrapper должен содержать: ${needle}`);
}
expectNotContains(graphRunnerSources, 'SimulationState', 'GraphRunner не должен зависеть от игровой SimulationState.');
expectNotContains(graphRunnerSources, 'pixi.js', 'GraphRunner не должен зависеть от PixiJS.');
expectNotContains(graphRunnerSources, 'localStorage', 'GraphRunner не должен читать localStorage напрямую.');

""",
)
