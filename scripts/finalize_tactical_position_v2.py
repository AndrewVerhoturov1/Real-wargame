from __future__ import annotations

import sys
from pathlib import Path


def replace_exact(path: str, before: str, after: str) -> None:
    file = Path(path)
    source = file.read_text()
    if before not in source:
        raise RuntimeError(f"Expected fragment not found in {path}: {before[:120]!r}")
    file.write_text(source.replace(before, after, 1))


def apply_tests() -> None:
    path = Path("scripts/tactical_position_objective_smoke.ts")
    source = path.read_text()
    source = source.replace(
        "verifyContinueOrderObjective();\n",
        "verifyContinueOrderObjective();\nverifyObjectiveWeightsControlDirectionalPreference();\n",
        1,
    )
    marker = "function createField(): TacticalPositionFieldView {"
    test = """
function verifyObjectiveWeightsControlDirectionalPreference(): void {
  const field = createField();
  const settings = createDefaultTacticalPositionSettings();
  settings.minimumPositionImprovement = 0;
  settings.minimumDirectionalProtection = 1;
  settings.minimumReverseSlopeQuality = 0;
  settings.advanceToThreatWeight = 0;
  settings.withdrawFromThreatWeight = 0;
  settings.orderTargetDistanceWeight = 0;
  settings.objectiveAlignmentWeight = 0;
  const common = {
    origin: { x: 6.5, y: 1.5 },
    currentPosture: 'standing' as const,
    orderTarget: null,
    threatCount: 1,
    searchRadiusMeters: 6,
    maxSampledCells: 128,
    maxRouteExpansions: 128,
    maxCandidates: 6,
    minimumSeparationMeters: 1,
    settings,
    referenceThreatId: 'threat-east',
    referenceThreatPosition: { x: 12.5, y: 1.5 },
  };
  const balanced = searchTacticalPositionsForObjective(field, { ...common, objective: 'balanced' });
  const advance = searchTacticalPositionsForObjective(field, { ...common, objective: 'advance_to_threat' });
  assert.deepEqual(
    advance.candidates.map((candidate) => candidate.id),
    balanced.candidates.map((candidate) => candidate.id),
    'zero objective weights must disable directional reranking',
  );
}

"""
    if "function verifyObjectiveWeightsControlDirectionalPreference" not in source:
        if marker not in source:
            raise RuntimeError("Objective smoke insertion marker is missing")
        source = source.replace(marker, test + marker, 1)
    path.write_text(source)


def apply_product() -> None:
    replace_exact(
        "src/core/tactical/TacticalPositionObjective.ts",
        "import type { UnitModel } from '../units/UnitModel';\n",
        "import type { UnitModel } from '../units/UnitModel';\nimport type { TacticalPositionSettings } from './TacticalPositionSettings';\n",
    )
    replace_exact(
        "src/core/tactical/TacticalPositionObjective.ts",
        "      score: objectiveSortScore(enriched, request.objective),",
        "      score: objectiveSortScore(enriched, request.objective, request.settings),",
    )
    replace_exact(
        "src/core/tactical/TacticalPositionObjective.ts",
        """function objectiveSortScore(
  candidate: TacticalPositionCandidateWithObjective,
  objective: TacticalPositionSearchObjective,
): number {
  const metrics = candidate.metrics;
  const base = metrics.safety * 0.45
    + (100 - metrics.danger) * 0.2
    + metrics.protection * 0.2
    + (100 - metrics.routeDanger) * 0.15;
  if (objective === 'balanced') return base;
  return base + metrics.objectiveAlignment * 0.45;
}""",
        """function objectiveSortScore(
  candidate: TacticalPositionCandidateWithObjective,
  objective: TacticalPositionSearchObjective,
  settings: TacticalPositionSettings,
): number {
  const metrics = candidate.metrics;
  const base = metrics.safety * 0.45
    + (100 - metrics.danger) * 0.2
    + metrics.protection * 0.2
    + (100 - metrics.routeDanger) * 0.15;
  if (objective === 'balanced') return base;
  const modeWeight = objective === 'advance_to_threat'
    ? settings.advanceToThreatWeight
    : objective === 'withdraw_from_threat'
      ? settings.withdrawFromThreatWeight
      : settings.orderTargetDistanceWeight;
  return base + metrics.objectiveAlignment * (modeWeight + settings.objectiveAlignmentWeight);
}""",
    )

    replace_exact(
        "src/core/tactical/TacticalPositionSearchService.ts",
        """    `order:${value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'none'}`,
    `orderIdentity:${value.orderIdentity ?? 'none'}`,""",
        """    `order:${value.objective === 'continue_order' && value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'ignored'}`,
    `orderIdentity:${value.objective === 'continue_order' ? value.orderIdentity ?? 'none' : 'ignored'}`,""",
    )

    replace_exact(
        "src/ui/TacticalPositionWorkspaceTab.ts",
        "import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';\n",
        "",
    )
    replace_exact(
        "src/ui/TacticalPositionWorkspaceTab.ts",
        "    setSimulationLayerMode(state, 'danger');",
        "    setSimulationLayerMode(state, 'positions');",
    )
    replace_exact(
        "src/ui/TacticalPositionWorkspaceTab.ts",
        """    const selectedUnitId = state.selectedUnitId;
    if (selectedUnitId) getTacticalPositionSearchService(state)?.clearUnit(selectedUnitId);
    clearVisibleTacticalPositions(state);""",
        "    clearVisibleTacticalPositions(state);",
    )

    replace_exact(
        "src/rendering/PixiAwarenessHeatmapRenderer.ts",
        "import { getSimulationLayerState } from '../core/ui/RuntimeUiState';\n",
        "import { getSimulationLayerState } from '../core/ui/RuntimeUiState';\nimport { isTacticalPositionWorkspaceTabActive } from '../ui/TacticalPositionWorkspaceTab';\n",
    )
    replace_exact(
        "src/rendering/PixiAwarenessHeatmapRenderer.ts",
        """    const layer = getSimulationLayerState(state);
    const mode: VisibleAwarenessMode | null = layer.mode === 'danger'
      ? 'danger'
      : layer.mode === 'stealth'
        ? 'stealth'
        : null;""",
        """    const layer = getSimulationLayerState(state);
    const positionsActive = layer.mode === 'positions' && isTacticalPositionWorkspaceTabActive(state);
    const mode: VisibleAwarenessMode | null = layer.mode === 'danger' || layer.mode === 'positions'
      ? 'danger'
      : layer.mode === 'stealth'
        ? 'stealth'
        : null;""",
    )
    replace_exact(
        "src/rendering/PixiAwarenessHeatmapRenderer.ts",
        """    if (mode === 'danger') this.renderTacticalPositions(state, unit, service);
    else this.hideTacticalMarkers('stealth');""",
        """    if (positionsActive) this.renderTacticalPositions(state, unit, service);
    else this.hideTacticalMarkers(`layer:${layer.mode}`, mode);""",
    )
    replace_exact(
        "src/rendering/PixiAwarenessHeatmapRenderer.ts",
        "this.hideTacticalMarkers(`empty:${latest?.requestId ?? unit.id}`);",
        "this.hideTacticalMarkers(`empty:${latest?.requestId ?? unit.id}`, 'danger');",
    )
    replace_exact(
        "src/rendering/PixiAwarenessHeatmapRenderer.ts",
        """  private hideTacticalMarkers(key: string): void {
    if (this.lastDrawKey === key && this.tacticalMarkerCount === 0) return;
    this.lastDrawKey = key;
    this.tacticalGraphics.clear();
    this.tacticalGraphics.visible = false;
    this.updateOverlayText(null, 1, 'stealth');""",
        """  private hideTacticalMarkers(key: string, mode: VisibleAwarenessMode): void {
    if (this.lastDrawKey === key && this.tacticalMarkerCount === 0) return;
    this.lastDrawKey = key;
    this.tacticalGraphics.clear();
    this.tacticalGraphics.visible = false;
    this.updateOverlayText(null, 1, mode);""",
    )

    replace_exact(
        "src/shared/AppShellMenu.ts",
        """export function openGameTab(): void {
  window.open('/', '_blank');
}

export function openEditorTab(): void {
  window.open('/ai-node-editor.html', '_blank');
}""",
        """export function openGameTab(): void {
  window.open(gamePageUrl(), '_blank');
}

export function openEditorTab(): void {
  window.open(new URL('ai-node-editor.html', gamePageUrl()).toString(), '_blank');
}""",
    )
    replace_exact(
        "src/shared/AppShellMenu.ts",
        """function startNewGame(): void {
  const stamp = String(Date.now());
  localStorage.setItem(NEW_GAME_SIGNAL_KEY, stamp);
  window.location.href = `/?newGame=${encodeURIComponent(stamp)}`;
}""",
        """function gamePageUrl(newGameStamp?: string): string {
  const url = new URL('./', window.location.href);
  url.search = newGameStamp ? `newGame=${encodeURIComponent(newGameStamp)}` : '';
  url.hash = '';
  return url.toString();
}

function startNewGame(): void {
  const stamp = String(Date.now());
  localStorage.setItem(NEW_GAME_SIGNAL_KEY, stamp);
  window.location.href = gamePageUrl(stamp);
}""",
    )
    replace_exact(
        "src/shared/AppShellMenu.ts",
        "window.location.href = `/?newGame=${encodeURIComponent(event.newValue)}`;",
        "window.location.href = gamePageUrl(event.newValue);",
    )
    replace_exact(
        "src/shared/AppShellMenu.ts",
        "return window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');",
        "return window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');",
    )

    replace_exact(
        "src/ui/TacticalWorkspaceBase.ts",
        "import { exitLab } from '../shared/AppShellMenu';",
        "import { exitLab, openEditorTab } from '../shared/AppShellMenu';",
    )
    replace_exact(
        "src/ui/TacticalWorkspaceBase.ts",
        "q<HTMLButtonElement>('[data-action=\"ai-editor\"]').onclick = () => window.open('/ai-node-editor.html', '_blank');",
        "q<HTMLButtonElement>('[data-action=\"ai-editor\"]').onclick = openEditorTab;",
    )


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "product"
    if mode == "tests":
        apply_tests()
    elif mode == "product":
        apply_product()
    else:
        raise SystemExit(f"Unknown mode: {mode}")
