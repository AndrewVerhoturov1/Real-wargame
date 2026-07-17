from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src/ui/TacticalWorkspace.ts'
content = path.read_text(encoding='utf-8')


def replace_exact(old: str, new: str, label: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_exact(
    "import { getCell, resolveObjectCoverProperties } from '../core/map/MapModel';\n",
    "import { getCell, resolveObjectCoverProperties } from '../core/map/MapModel';\n"
    "import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';\n",
    'workspace map revision import',
)
replace_exact(
    "  let lastSidebarKey = '';\n  const stableDecisions = new Map<string, StableDecision>();\n",
    "  let lastSidebarKey = '';\n  let lastWorkspaceUpdateKey = '';\n  const stableDecisions = new Map<string, StableDecision>();\n",
    'workspace update key state',
)
replace_exact(
    "  function update(force = false): void {\n    measurePerformancePhase('ui.tactical-workspace.update', () => {\n      if (force) lastSidebarKey = '';\n      updateBottom();\n      renderSidebar();\n      updateEditorPlaceButton();\n      for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.classList.toggle('active', item.dataset.tab === tab);\n    });\n  }\n",
    "  function update(force = false): void {\n    const nextKey = buildWorkspaceUpdateKey(state, mode, tab, collapsed);\n    if (!force && nextKey === lastWorkspaceUpdateKey) return;\n    lastWorkspaceUpdateKey = nextKey;\n    measurePerformancePhase('ui.tactical-workspace.update', () => {\n      if (force) lastSidebarKey = '';\n      updateBottom();\n      renderSidebar();\n      updateEditorPlaceButton();\n      for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.classList.toggle('active', item.dataset.tab === tab);\n    });\n  }\n",
    'workspace signature gate',
)
helper = '''function buildWorkspaceUpdateKey(
  state: SimulationState,
  mode: TacticalWorkspaceMode,
  tab: SimulationTab,
  collapsed: boolean,
): string {
  const unit = getSelectedUnit(state);
  const revisions = getMapRevisionSnapshot(state.map);
  const layer = getSimulationLayerState(state);
  const commandTool = getUnitCommandToolState(state);
  const weapon = unit ? getWeaponRuntime(unit) : null;
  const fireAction = unit ? getFireAction(unit) : null;
  const contact = unit ? findBestDirectFireContact(state, unit) : null;
  const order = unit?.order;
  const command = unit?.playerCommand;
  const runtimeSession = unit?.behaviorRuntime.aiRuntimeSession;
  return [
    mode,
    tab,
    collapsed ? 1 : 0,
    state.selectedUnitId ?? 'none',
    state.editor.enabled ? 1 : 0,
    state.editor.tool,
    state.editor.selectedObjectId ?? 'none',
    state.editor.selectedZoneId ?? 'none',
    state.editor.lastMessage ?? '',
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    state.pressureZones.length,
    layer.mode,
    layer.selectedCoverId ?? 'none',
    layer.hoveredCoverId ?? 'none',
    commandTool.turnToolActive ? 1 : 0,
    commandTool.routeFacingDraft?.toFixed(4) ?? 'none',
    getAiTestPaused(state) ? 1 : 0,
    getAiTestTimeScale(state),
    unit?.id ?? 'none',
    unit ? `${unit.position.x.toFixed(2)}:${unit.position.y.toFixed(2)}` : 'none',
    unit?.behaviorRuntime.currentAction ?? '',
    unit?.behaviorRuntime.state ?? '',
    unit?.behaviorRuntime.posture ?? '',
    unit?.behaviorRuntime.lastEvent ?? '',
    unit?.behaviorRuntime.reason ?? '',
    unit ? Math.round(unit.behaviorRuntime.danger) : 0,
    unit ? Math.round(unit.behaviorRuntime.stress) : 0,
    unit ? Math.round(unit.behaviorRuntime.suppression) : 0,
    unit ? Math.round(unit.soldier.condition.health) : 0,
    unit ? Math.round(unit.soldier.condition.morale) : 0,
    unit ? Math.round(unit.soldier.condition.fatigue) : 0,
    weapon?.roundsLoaded ?? 0,
    weapon?.roundsReserve ?? 0,
    fireAction?.phase ?? 'none',
    order?.target.x.toFixed(2) ?? 'none',
    order?.target.y.toFixed(2) ?? 'none',
    order?.waypointIndex ?? -1,
    order?.routeStatus ?? 'none',
    command?.revision ?? 0,
    command?.status ?? 'none',
    unit?.tacticalKnowledge.revision ?? 0,
    unit?.attentionRuntime.mode ?? 'none',
    unit?.attentionRuntime.modeSource ?? 'none',
    unit?.attentionRuntime.focusDirectionRadians.toFixed(4) ?? 'none',
    runtimeSession?.status ?? 'none',
    runtimeSession?.executionState?.activeNodeId ?? 'none',
    unit?.behaviorRuntime.aiGraphReason ?? '',
    unit?.playerNavigationProfileId ?? 'none',
    unit?.playerAttentionProfileId ?? 'individual',
    contact?.id ?? 'none',
    contact?.visibleNow ? 1 : 0,
    contact ? Math.round(contact.confidence) : 0,
  ].join('|');
}

'''
replace_exact(
    "function combatCapabilityLabel(value: ReturnType<typeof getCombatRuntime>['capability']): string {\n",
    helper + "function combatCapabilityLabel(value: ReturnType<typeof getCombatRuntime>['capability']): string {\n",
    'workspace key helper insertion',
)
path.write_text(content, encoding='utf-8')

smoke_path = ROOT / 'scripts/tactical_workspace_smoke_pixijs8_baseline.mjs'
smoke = smoke_path.read_text(encoding='utf-8')
old = "  'workspace-file-menu', 'updateInfoPanelLive', 'stableDecision',\n"
new = "  'workspace-file-menu', 'updateInfoPanelLive', 'stableDecision', 'buildWorkspaceUpdateKey', 'lastWorkspaceUpdateKey',\n"
if smoke.count(old) != 1:
    raise RuntimeError(f'workspace smoke signature token count: {smoke.count(old)}')
smoke_path.write_text(smoke.replace(old, new, 1), encoding='utf-8')
print('Applied signature-driven TacticalWorkspace refresh gating.')
