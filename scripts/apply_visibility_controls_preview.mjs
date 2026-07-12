import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes applied to ${path}`);
  await writeFile(path, next, 'utf8');
}

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  return source.replace(before, after);
}

function appendBefore(source, marker, addition, label) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}`);
  return source.replace(marker, `${addition}${marker}`);
}

await edit('src/core/ui/RuntimeUiState.ts', (source) => {
  source = replaceExact(source,
`export interface VisibilityProbeRuntimeState {
  active: boolean;
  target: GridPosition | null;
}

export interface AttentionOverlayRuntimeState {`,
`export interface VisibilityProbeRuntimeState {
  active: boolean;
  target: GridPosition | null;
}

export interface RouteFacingDraft {
  target: GridPosition;
  pointer: GridPosition;
  finalFacingRadians: number | null;
}

export interface UnitCommandToolRuntimeState {
  turnToolActive: boolean;
  routeFacingDraft: RouteFacingDraft | null;
}

export interface AttentionOverlayRuntimeState {`, 'runtime command interfaces');
  source = replaceExact(source,
`  visibilityProbe: VisibilityProbeRuntimeState;
  attentionOverlay: AttentionOverlayRuntimeState;`,
`  visibilityProbe: VisibilityProbeRuntimeState;
  unitCommandTool: UnitCommandToolRuntimeState;
  attentionOverlay: AttentionOverlayRuntimeState;`, 'runtime command slot');
  source = replaceExact(source,
`export function setVisibilityProbe(state: SimulationState, active: boolean, target: GridPosition | null): void {
  const probe = getRuntimeUiState(state).visibilityProbe;
  probe.active = active;
  probe.target = active ? target : null;
}

export function getAttentionOverlayState`,
`export function setVisibilityProbe(state: SimulationState, active: boolean, target: GridPosition | null): void {
  const probe = getRuntimeUiState(state).visibilityProbe;
  probe.active = active;
  probe.target = active ? target : null;
}

export function getUnitCommandToolState(state: SimulationState): UnitCommandToolRuntimeState {
  return getRuntimeUiState(state).unitCommandTool;
}

export function setTurnToolActive(state: SimulationState, active: boolean): void {
  const tool = getRuntimeUiState(state).unitCommandTool;
  tool.turnToolActive = active;
  if (active) tool.routeFacingDraft = null;
}

export function consumeTurnTool(state: SimulationState): boolean {
  const tool = getRuntimeUiState(state).unitCommandTool;
  const active = tool.turnToolActive;
  tool.turnToolActive = false;
  return active;
}

export function setRouteFacingDraft(state: SimulationState, draft: RouteFacingDraft | null): void {
  getRuntimeUiState(state).unitCommandTool.routeFacingDraft = draft
    ? {
        target: { ...draft.target },
        pointer: { ...draft.pointer },
        finalFacingRadians: draft.finalFacingRadians,
      }
    : null;
}

export function getAttentionOverlayState`, 'runtime command functions');
  source = replaceExact(source,
`      visibilityProbe: { active: false, target: null },
      attentionOverlay: {`,
`      visibilityProbe: { active: false, target: null },
      unitCommandTool: { turnToolActive: false, routeFacingDraft: null },
      attentionOverlay: {`, 'runtime command default');
  return source;
});

await writeFile('src/core/orders/UnitFacingCommands.ts', `import type { GridPosition } from '../geometry';
import { normalizeRadians } from '../perception/AttentionModel';
import { updateAttentionController } from '../perception/AttentionController';
import type { SimulationState } from '../simulation/SimulationState';

export function facingRadiansFromPoints(origin: GridPosition, target: GridPosition): number | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.hypot(dx, dy) < 0.001) return null;
  return normalizeRadians(Math.atan2(dy, dx));
}

export function faceSelectedUnitsToward(state: SimulationState, target: GridPosition): boolean {
  const selectedIds = new Set(state.selectedUnitIds);
  let changed = false;
  for (const unit of state.units) {
    if (!selectedIds.has(unit.id)) continue;
    const facing = facingRadiansFromPoints(unit.position, target);
    if (facing === null) continue;
    unit.facingRadians = facing;
    if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = facing;
    updateAttentionController(unit, 0);
    unit.behaviorRuntime.lastEvent = 'manual_facing_changed';
    unit.behaviorRuntime.reason = 'Игрок задал направление взгляда.';
    changed = true;
  }
  return changed;
}
`, 'utf8');

await edit('src/input/BoardInputController.ts', (source) => {
  source = replaceExact(source,
`import { getSimulationLayerState, setVisibilityProbe } from '../core/ui/RuntimeUiState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';`,
`import {
  consumeTurnTool,
  getSimulationLayerState,
  getUnitCommandToolState,
  setRouteFacingDraft,
  setTurnToolActive,
  setVisibilityProbe,
} from '../core/ui/RuntimeUiState';
import { faceSelectedUnitsToward, facingRadiansFromPoints } from '../core/orders/UnitFacingCommands';
import { findUnitAtGridPosition } from '../core/units/UnitModel';`, 'board imports');
  source = replaceExact(source,
`const DRAG_SELECT_THRESHOLD_CELLS = 0.18;`,
`const DRAG_SELECT_THRESHOLD_CELLS = 0.18;
const RIGHT_DRAG_FACING_THRESHOLD_CELLS = 0.35;
const COMMAND_TOOL_CHANGED_EVENT = 'real-wargame:unit-command-tool-changed';`, 'board constants');
  source = replaceExact(source,
`  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
  private isDragSelecting = false;`,
`  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
  private rightPointerId: number | null = null;
  private rightStartGrid: GridPosition | null = null;
  private rightCurrentGrid: GridPosition | null = null;
  private isDragSelecting = false;`, 'board right pointer fields');
  source = replaceExact(source,
`    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);`,
`    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener(COMMAND_TOOL_CHANGED_EVENT, this.handleCommandToolChanged);`, 'board attach event');
  source = replaceExact(source,
`    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.cancelPendingPointerMove();`,
`    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener(COMMAND_TOOL_CHANGED_EVENT, this.handleCommandToolChanged);
    this.cancelPendingPointerMove();
    this.clearRightPointer();`, 'board destroy event');
  source = replaceExact(source,
`    if (isTextInput(event.target)) return;

    if (this.state.editor.enabled) {`,
`    if (isTextInput(event.target)) return;

    if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open && event.key === 'Escape') {
      event.preventDefault();
      setTurnToolActive(this.state, false);
      setRouteFacingDraft(this.state, null);
      this.clearRightPointer();
      this.updateCursor();
      return;
    }

    if (this.state.editor.enabled) {`, 'board escape command tool');
  source = replaceExact(source,
`    if (event.button === 2) {
      event.preventDefault();
      if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open) {
        issueRoutedMoveOrderToSelectedUnits(this.state, grid);
      }
    }`,
`    if (event.button === 2) {
      event.preventDefault();
      if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open) {
        if (getUnitCommandToolState(this.state).turnToolActive) {
          faceSelectedUnitsToward(this.state, grid);
          consumeTurnTool(this.state);
          setRouteFacingDraft(this.state, null);
          window.dispatchEvent(new CustomEvent(COMMAND_TOOL_CHANGED_EVENT));
          this.updateCursor();
          return;
        }
        this.rightPointerId = event.pointerId;
        this.rightStartGrid = grid;
        this.rightCurrentGrid = grid;
        this.canvas.setPointerCapture(event.pointerId);
        setRouteFacingDraft(this.state, {
          target: grid,
          pointer: grid,
          finalFacingRadians: null,
        });
      }
    }`, 'board right pointer down');
  source = replaceExact(source,
`    if (!this.state.editor.enabled && getSimulationLayerState(this.state).mode !== 'info') {
      hoverSimulationCoverAtPosition(this.state, grid);
    }

    if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {`,
`    if (!this.state.editor.enabled && getSimulationLayerState(this.state).mode !== 'info') {
      hoverSimulationCoverAtPosition(this.state, grid);
    }

    if (this.rightPointerId === event.pointerId && this.rightStartGrid) {
      this.rightCurrentGrid = grid;
      const finalFacingRadians = distance(this.rightStartGrid, grid) >= RIGHT_DRAG_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(this.rightStartGrid, grid)
        : null;
      setRouteFacingDraft(this.state, {
        target: this.rightStartGrid,
        pointer: grid,
        finalFacingRadians,
      });
      return;
    }

    if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {`, 'board right pointer move');
  source = replaceExact(source,
`  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.cancelPendingPointerMove();
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;

    const world = this.camera.screenToWorld(event);`,
`  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.cancelPendingPointerMove();
    if (event.button === 2 && this.rightPointerId === event.pointerId && this.rightStartGrid) {
      const world = this.camera.screenToWorld(event);
      const grid = worldToGrid(this.state.map, world);
      const finalFacingRadians = distance(this.rightStartGrid, grid) >= RIGHT_DRAG_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(this.rightStartGrid, grid) ?? undefined
        : undefined;
      issueRoutedMoveOrderToSelectedUnits(this.state, this.rightStartGrid, finalFacingRadians);
      this.clearRightPointer();
      return;
    }
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;

    const world = this.camera.screenToWorld(event);`, 'board right pointer up');
  source = replaceExact(source,
`    if (this.leftPointerId === event.pointerId) {
      clearSelectionBox(this.state);`,
`    if (this.rightPointerId === event.pointerId) this.clearRightPointer();
    if (this.leftPointerId === event.pointerId) {
      clearSelectionBox(this.state);`, 'board right cancel');
  source = replaceExact(source,
`    this.pendingPointerMove = null;
  }
}`,
`    this.pendingPointerMove = null;
  }

  private readonly handleCommandToolChanged = (): void => {
    this.updateCursor();
  };

  private clearRightPointer(): void {
    if (this.rightPointerId !== null && this.canvas.hasPointerCapture(this.rightPointerId)) {
      this.canvas.releasePointerCapture(this.rightPointerId);
    }
    this.rightPointerId = null;
    this.rightStartGrid = null;
    this.rightCurrentGrid = null;
    setRouteFacingDraft(this.state, null);
  }
}`, 'board command methods');
  source = replaceExact(source,
`  private updateCursor(): void {
    const cursor = resolveAiLabCursor(this.state);
    this.canvas.style.cursor = cursor;
    document.body.classList.toggle('cursor-crosshair-threat', getAiLabRuntime(this.state).open && getAiLabRuntime(this.state).tool === 'place_threat');
  }`,
`  private updateCursor(): void {
    if (getUnitCommandToolState(this.state).turnToolActive) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      const cursor = resolveAiLabCursor(this.state);
      this.canvas.style.cursor = cursor;
    }
    document.body.classList.toggle('cursor-crosshair-threat', getAiLabRuntime(this.state).open && getAiLabRuntime(this.state).tool === 'place_threat');
  }`, 'board cursor');
  source = replaceExact(source,
`    setVisibilityProbe(this.state, false, null);
    this.updateCursor();`,
`    setVisibilityProbe(this.state, false, null);
    this.clearRightPointer();
    this.updateCursor();`, 'board leave clear');
  return source;
});

await edit('src/ui/TacticalWorkspace.ts', (source) => {
  source = replaceExact(source,
`import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';`,
`import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../core/perception/AttentionController';
import { degreesToRadians, type AttentionMode } from '../core/perception/AttentionModel';`, 'workspace attention imports');
  source = replaceExact(source,
`  getRealReliefOverlayState,
  getSimulationLayerState,`,
`  getRealReliefOverlayState,
  getSimulationLayerState,
  getUnitCommandToolState,`, 'workspace runtime getter import');
  source = replaceExact(source,
`  setSelectedSimulationCover,
  setSimulationLayerMode,`,
`  setSelectedSimulationCover,
  setSimulationLayerMode,
  setTurnToolActive,`, 'workspace runtime setter import');
  source = replaceExact(source,
`        <label class="unit-route-profile"><span>Профиль маршрута</span><select data-action="unit-navigation-profile" aria-label="Профиль движения выбранного бойца"></select></label>
        <button type="button" data-action="route-cost-quick-toggle" aria-pressed="false">Карта стоимости: выкл</button>`,
`        <label class="unit-route-profile"><span>Профиль маршрута</span><select data-action="unit-navigation-profile" aria-label="Профиль движения выбранного бойца"></select></label>
        <label class="unit-attention-mode"><span>Внимание</span><select data-action="unit-attention-mode" aria-label="Режим внимания выбранного бойца"><option value="automatic">Автоматически</option><option value="march">Марш</option><option value="observe">Наблюдение</option><option value="search">Поиск</option><option value="engage">Стрельба</option></select></label>
        <button type="button" data-action="turn-unit" aria-pressed="false">Повернуть</button>
        <button type="button" data-action="route-cost-quick-toggle" aria-pressed="false">Карта стоимости: выкл</button>`, 'workspace bottom controls');
  source = replaceExact(source,
`  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');`,
`  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');
  const attentionModeSelect = q<HTMLSelectElement>('[data-action="unit-attention-mode"]');
  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');`, 'workspace control queries');
  source = replaceExact(source,
`  navigationProfile.addEventListener('change', () => {
    const unit = getSelectedUnit(state);`,
`  attentionModeSelect.addEventListener('change', () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const requested = attentionModeSelect.value;
    if (requested === 'automatic') {
      clearAttentionOverride(unit);
    } else if (requested === 'search') {
      setSearchSector(
        unit,
        unit.facingRadians,
        degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees),
        'player',
      );
    } else {
      setAttentionMode(unit, requested as AttentionMode, 'player');
    }
    updateBottom();
    onChanged();
  });

  turnUnitButton.addEventListener('click', () => {
    if (!getSelectedUnit(state)) return;
    const next = !getUnitCommandToolState(state).turnToolActive;
    setTurnToolActive(state, next);
    window.dispatchEvent(new CustomEvent('real-wargame:unit-command-tool-changed'));
    updateBottom();
    onChanged();
  });

  navigationProfile.addEventListener('change', () => {
    const unit = getSelectedUnit(state);`, 'workspace control handlers');
  source = replaceExact(source,
`    navigationProfile.disabled = !unit;
    if (unit) {`,
`    navigationProfile.disabled = !unit;
    attentionModeSelect.disabled = !unit;
    turnUnitButton.disabled = !unit;
    const commandTool = getUnitCommandToolState(state);
    turnUnitButton.classList.toggle('active', commandTool.turnToolActive);
    turnUnitButton.setAttribute('aria-pressed', String(commandTool.turnToolActive));
    turnUnitButton.textContent = commandTool.turnToolActive ? 'Укажите направление' : 'Повернуть';
    if (unit) {
      attentionModeSelect.value = unit.attentionRuntime.modeSource === 'automatic'
        ? 'automatic'
        : unit.attentionRuntime.mode;`, 'workspace bottom update');
  return source;
});

await edit('src/core/orders/PlayerCommand.ts', (source) => {
  source = replaceExact(source,
`  readonly navigationProfileId?: string;
  readonly status: PlayerCommandStatus;`,
`  readonly navigationProfileId?: string;
  readonly finalFacingRadians?: number;
  readonly status: PlayerCommandStatus;`, 'player command field');
  source = replaceExact(source,
`  navigationProfileId: string | null = null,
): PlayerCommand {`,
`  navigationProfileId: string | null = null,
  finalFacingRadians: number | null = null,
): PlayerCommand {`, 'player command parameter');
  source = replaceExact(source,
`    navigationProfileId: normalizeNavigationProfileId(navigationProfileId),
    status: 'active',`,
`    navigationProfileId: normalizeNavigationProfileId(navigationProfileId),
    finalFacingRadians: normalizeOptionalRadians(finalFacingRadians),
    status: 'active',`, 'player command assignment');
  source = appendBefore(source,
`function normalizeNavigationProfileId`,
`function normalizeOptionalRadians(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

`, 'player command normalizer');
  return source;
});

await edit('src/core/orders/MoveOrder.ts', (source) => {
  source = replaceExact(source,
`  readonly navigationProfileSource?: NavigationProfileSource;
  readonly knowledgeRevision?: number;`,
`  readonly navigationProfileSource?: NavigationProfileSource;
  readonly finalFacingRadians?: number;
  readonly knowledgeRevision?: number;`, 'move options field');
  source = replaceExact(source,
`  navigationProfileSource?: NavigationProfileSource;
  knowledgeRevision?: number;`,
`  navigationProfileSource?: NavigationProfileSource;
  finalFacingRadians?: number;
  knowledgeRevision?: number;`, 'move order field');
  source = replaceExact(source,
`    navigationProfileSource: options.navigationProfileSource,
    knowledgeRevision: options.knowledgeRevision,`,
`    navigationProfileSource: options.navigationProfileSource,
    finalFacingRadians: options.finalFacingRadians,
    knowledgeRevision: options.knowledgeRevision,`, 'move order assignment');
  return source;
});

await edit('src/core/orders/MoveOrderPlanning.ts', (source) => {
  source = replaceExact(source,
`  readonly movementMode?: NavigationMovementMode;
  readonly tacticalContext?: TacticalRouteContext;`,
`  readonly movementMode?: NavigationMovementMode;
  readonly finalFacingRadians?: number;
  readonly tacticalContext?: TacticalRouteContext;`, 'planning option field');
  source = replaceExact(source,
`    navigationProfileSource: options.navigationProfileSource,
    knowledgeRevision: options.tacticalContext?.knowledgeRevision ?? 0,`,
`    navigationProfileSource: options.navigationProfileSource,
    finalFacingRadians: options.finalFacingRadians,
    knowledgeRevision: options.tacticalContext?.knowledgeRevision ?? 0,`, 'planning final facing');
  return source;
});

await edit('src/core/orders/RoutedMoveOrders.ts', (source) => {
  source = replaceExact(source,
`  rawTarget: GridPosition,
): void {`,
`  rawTarget: GridPosition,
  finalFacingRadians?: number,
): void {`, 'routed order signature');
  source = replaceExact(source,
`      unit.playerNavigationProfileId ?? 'normal',
    );`,
`      unit.playerNavigationProfileId ?? 'normal',
      finalFacingRadians ?? null,
    );`, 'routed command final facing');
  source = replaceExact(source,
`      navigationProfileSource: resolvedNavigation.source,
      tacticalContext: buildUnitTacticalRouteContext(unit),`,
`      navigationProfileSource: resolvedNavigation.source,
      finalFacingRadians,
      tacticalContext: buildUnitTacticalRouteContext(unit),`, 'routed plan final facing');
  return source;
});

await edit('src/core/navigation/NavigationRouteReplanner.ts', (source) => replaceExact(source,
`    navigationProfileSource: resolved.source,
    tacticalContext,`,
`    navigationProfileSource: resolved.source,
    finalFacingRadians: order.finalFacingRadians,
    tacticalContext,`, 'replan final facing'));

await edit('src/core/simulation/SimulationTick.ts', (source) => {
  source = replaceExact(source,
`import { tickSelectedSoldierPerception } from '../perception/PerceptionSystem';`,
`import { updateAttentionController } from '../perception/AttentionController';
import { tickSelectedSoldierPerception } from '../perception/PerceptionSystem';`, 'simulation attention import');
  source = replaceExact(source,
`  unit.position = { ...order.target };
  unit.order = null;`,
`  unit.position = { ...order.target };
  applyFinalFacing(unit, order);
  unit.order = null;`, 'simulation apply facing');
  source = appendBefore(source,
`function ensureRoutePassable`,
`function applyFinalFacing(unit: UnitModel, order: MoveOrder): void {
  if (typeof order.finalFacingRadians !== 'number' || !Number.isFinite(order.finalFacingRadians)) return;
  unit.facingRadians = order.finalFacingRadians;
  if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = order.finalFacingRadians;
  updateAttentionController(unit, 0);
  unit.behaviorRuntime.lastEvent = 'move_final_facing_applied';
}

`, 'simulation final facing helper');
  return source;
});

await edit('src/rendering/CommandPlanRouteOverlayModel.ts', (source) => {
  source = replaceExact(source,
`  readonly status: 'active' | 'blocked';
}`,
`  readonly status: 'active' | 'blocked';
  readonly finalFacingRadians: number | null;
}`, 'overlay command facing field');
  source = replaceExact(source,
`        status: playerCommand.status as 'active' | 'blocked',
      }`,
`        status: playerCommand.status as 'active' | 'blocked',
        finalFacingRadians: playerCommand.finalFacingRadians ?? null,
      }`, 'overlay command facing value');
  source = replaceExact(source,
`    \`c:\${unit.playerCommand?.revision ?? 0}:\${unit.playerCommand?.status ?? 'none'}:\${command ? pointKey(command.target) : '-'}\`,`,
`    \`c:\${unit.playerCommand?.revision ?? 0}:\${unit.playerCommand?.status ?? 'none'}:\${command ? pointKey(command.target) : '-'}:\${command?.finalFacingRadians?.toFixed(4) ?? '-'}\`,`, 'overlay command key');
  return source;
});

await edit('src/rendering/PixiOrderRenderer.ts', (source) => {
  source = replaceExact(source,
`  if (command.status === 'blocked') {`,
`  if (command.finalFacingRadians !== null) {
    drawFacingArrow(graphics, to.x, to.y, command.finalFacingRadians, snapshot.selected ? 24 : 18, COMMAND_COLOR, alpha);
  }

  if (command.status === 'blocked') {`, 'order draw facing call');
  source = appendBefore(source,
`function drawDashedLine`,
`function drawFacingArrow(
  graphics: Graphics,
  x: number,
  y: number,
  finalFacingRadians: number,
  length: number,
  color: number,
  alpha: number,
): void {
  const endX = x + Math.cos(finalFacingRadians) * length;
  const endY = y + Math.sin(finalFacingRadians) * length;
  graphics.lineStyle(3, color, alpha);
  graphics.moveTo(x, y);
  graphics.lineTo(endX, endY);
  const size = 7;
  graphics.moveTo(endX, endY);
  graphics.lineTo(endX - Math.cos(finalFacingRadians - Math.PI / 6) * size, endY - Math.sin(finalFacingRadians - Math.PI / 6) * size);
  graphics.moveTo(endX, endY);
  graphics.lineTo(endX - Math.cos(finalFacingRadians + Math.PI / 6) * size, endY - Math.sin(finalFacingRadians + Math.PI / 6) * size);
}

`, 'order facing helper');
  return source;
});

await edit('src/core/visibility/SelectedUnitVisibilityField.ts', (source) => {
  source = replaceExact(source,
`  fieldRevision: number;
}`,
`  fieldRevision: number;
  cachedFieldCount: number;
}`, 'visibility cached field diagnostic');
  source = replaceExact(source,
`export function getVisibilityFieldDiagnostics(state: SimulationState): VisibilityFieldDiagnostics {
  return { ...getRuntime(state).diagnostics };
}`,
`export function getVisibilityFieldDiagnostics(state: SimulationState): VisibilityFieldDiagnostics {
  const runtime = getRuntime(state);
  return { ...runtime.diagnostics, cachedFieldCount: runtime.field ? 1 : 0 };
}`, 'visibility diagnostic getter');
  source = replaceExact(source,
`        fieldRevision: 0,
      },`,
`        fieldRevision: 0,
        cachedFieldCount: 0,
      },`, 'visibility diagnostic default');
  return source;
});

await edit('src/rendering/PixiVisibilityHeatmapRenderer.ts', (source) => {
  source = replaceExact(source,
`import {
  getSelectedUnitVisibilityField,`,
`const UNSEEN_OVERLAY_COLOR = 0x101820;
const UNSEEN_OVERLAY_ALPHA = 0.52;

import {
  getSelectedUnitVisibilityField,`, 'heatmap constants');
  source = replaceExact(source,
`  rasterHeight: number;
}`,
`  rasterHeight: number;
  cachedFieldCount: number;
}`, 'heatmap diagnostic field');
  source = replaceExact(source,
`      this.ensureRaster(field.width, field.height);`,
`      this.ensureRaster(state.map.width, state.map.height);`, 'heatmap full map raster');
  source = replaceExact(source,
`        drawVisibilityRaster(this.rasterContext, field);
        this.rasterTexture.baseTexture.update();
        this.rasterSprite.position.set(field.minCellX * state.map.cellSize, field.minCellY * state.map.cellSize);`,
`        drawVisibilityRaster(this.rasterContext, field, state.map.width, state.map.height);
        this.rasterTexture.baseTexture.update();
        this.rasterSprite.position.set(0, 0);`, 'heatmap full map draw');
  source = replaceExact(source,
`      rasterHeight: this.rasterCanvas?.height ?? 0,
    };`,
`      rasterHeight: this.rasterCanvas?.height ?? 0,
      cachedFieldCount: fieldDiagnostics?.cachedFieldCount ?? 0,
    };`, 'heatmap cached count');
  const oldRaster = `export function drawVisibilityRaster(
  context: CanvasRenderingContext2D,
  field: SelectedUnitVisibilityField,
): void {
  const image = context.createImageData(field.width, field.height);
  for (let index = 0; index < field.quality.length; index += 1) {
    const quality = field.quality[index] / 255;
    if (quality <= 0.01) continue;
    const color = heatmapColor(quality);
    const pixel = index * 4;
    image.data[pixel] = (color >> 16) & 0xff;
    image.data[pixel + 1] = (color >> 8) & 0xff;
    image.data[pixel + 2] = color & 0xff;
    image.data[pixel + 3] = Math.round((0.08 + quality * 0.48) * 255);
  }
  context.putImageData(image, 0, 0);
}`;
  const newRaster = `export function drawVisibilityRaster(
  context: CanvasRenderingContext2D,
  field: SelectedUnitVisibilityField,
  mapWidth = field.width,
  mapHeight = field.height,
): void {
  const image = context.createImageData(mapWidth, mapHeight);
  const unseenRed = (UNSEEN_OVERLAY_COLOR >> 16) & 0xff;
  const unseenGreen = (UNSEEN_OVERLAY_COLOR >> 8) & 0xff;
  const unseenBlue = UNSEEN_OVERLAY_COLOR & 0xff;
  for (let pixel = 0; pixel < image.data.length; pixel += 4) {
    image.data[pixel] = unseenRed;
    image.data[pixel + 1] = unseenGreen;
    image.data[pixel + 2] = unseenBlue;
    image.data[pixel + 3] = Math.round(UNSEEN_OVERLAY_ALPHA * 255);
  }
  for (let index = 0; index < field.quality.length; index += 1) {
    const localX = index % field.width;
    const localY = Math.floor(index / field.width);
    const mapX = field.minCellX + localX;
    const mapY = field.minCellY + localY;
    if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight) continue;
    const quality = field.quality[index] / 255;
    if (quality <= 0.01) continue;
    const color = heatmapColor(quality);
    const pixel = (mapY * mapWidth + mapX) * 4;
    image.data[pixel] = (color >> 16) & 0xff;
    image.data[pixel + 1] = (color >> 8) & 0xff;
    image.data[pixel + 2] = color & 0xff;
    image.data[pixel + 3] = Math.round((0.12 + quality * 0.48) * 255);
  }
  context.putImageData(image, 0, 0);
}`;
  source = replaceExact(source, oldRaster, newRaster, 'heatmap raster implementation');
  return source;
});

await edit('src/ui/AttentionRuntimePanel.ts', (source) => {
  source = replaceExact(source,
`      <div class="attention-runtime-grid">`,
`      <div class="attention-compact-legend" aria-label="Легенда обзора и памяти">
        <div class="attention-legend-row"><span>Обзор</span><i class="attention-legend-gradient"></i><small>Хорошо видно · Средне · Слабо · Не видно</small></div>
        <div class="attention-legend-row attention-legend-markers"><span>Память</span><b class="attention-legend-marker current"></b><small>Текущий контакт</small><b class="attention-legend-marker memory"></b><small>Последнее место</small><b class="attention-legend-marker suspicion"></b><small>Подозрение</small><b class="attention-legend-marker sound"></b><small>Звук</small></div>
      </div>
      <div class="attention-runtime-grid">`, 'attention compact legend');
  source = replaceExact(source,
`        \${metric('Попадания в кеш', String(fieldDiagnostics.cacheHitCount))}`, 
`        \${metric('Полей в кеше', String(fieldDiagnostics.cachedFieldCount))}
        \${metric('Повторных использований с запуска', String(fieldDiagnostics.cacheHitCount))}`, 'attention cache labels');
  return source;
});

await edit('src/perception-attention.css', (source) => `${source}

.attention-compact-legend {
  display: grid;
  gap: 6px;
  margin: 0 0 10px;
  padding: 7px 8px;
  border: 1px solid rgba(108, 158, 169, 0.24);
  border-radius: 7px;
  background: rgba(9, 15, 17, 0.72);
  color: #b8c6bd;
  font-size: 10px;
}

.attention-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.attention-legend-row > span {
  flex: 0 0 46px;
  color: #e6ecd9;
  font-weight: 700;
}

.attention-legend-row small {
  color: #9fb0a1;
  font-size: 9px;
  line-height: 1.2;
}

.attention-legend-gradient {
  width: 74px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: linear-gradient(90deg, #ffe88a 0%, #69d7a2 35%, #4aa9b8 62%, #315a78 78%, rgba(16, 24, 32, 0.92) 100%);
}

.attention-legend-markers {
  flex-wrap: wrap;
}

.attention-legend-marker {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  transform: rotate(45deg);
}

.attention-legend-marker.current { color: #ff664f; background: currentColor; }
.attention-legend-marker.memory { color: #f2aa62; }
.attention-legend-marker.suspicion { color: #f0cf6a; border-radius: 50%; }
.attention-legend-marker.sound { color: #8ec6ff; border-radius: 50%; border-style: dashed; }
`);

await edit('src/rendering/PixiOverlayRenderer.ts', (source) => {
  source = replaceExact(source,
`import type { KnownThreatMemory } from '../core/units/UnitModel';`,
`import type { KnownThreatMemory } from '../core/units/UnitModel';

const STABLE_DIRECTIONAL_FIRE_COLOR = 0xf05a47;
const CURRENT_CONTACT_MARKER_COLOR = 0xfff0b0;`, 'stable fire constants');
  source = replaceExact(source,
`  private readonly selectionBoxGraphics = new Graphics();`,
`  private readonly selectionBoxGraphics = new Graphics();
  private readonly commandDraftGraphics = new Graphics();`, 'draft graphics field');
  source = replaceExact(source,
`    this.selectionBoxGraphics.eventMode = 'none';
    this.interactionContainer.addChild(this.hoverCellGraphics, this.selectionBoxGraphics);`,
`    this.selectionBoxGraphics.eventMode = 'none';
    this.commandDraftGraphics.eventMode = 'none';
    this.interactionContainer.addChild(this.hoverCellGraphics, this.selectionBoxGraphics, this.commandDraftGraphics);`, 'draft graphics setup');
  source = replaceExact(source,
`    this.selectionBoxGraphics.clear();`,
`    this.selectionBoxGraphics.clear();
    this.commandDraftGraphics.clear();`, 'draft clear');
  source = replaceExact(source,
`    if (state.selectionBox) {`,
`    const commandTool = getUnitCommandToolState(state);
    if (commandTool.routeFacingDraft) {
      const draft = commandTool.routeFacingDraft;
      const startX = draft.target.x * state.map.cellSize;
      const startY = draft.target.y * state.map.cellSize;
      const endX = draft.pointer.x * state.map.cellSize;
      const endY = draft.pointer.y * state.map.cellSize;
      this.commandDraftGraphics.lineStyle(3, 0xffd85a, 0.95);
      this.commandDraftGraphics.drawCircle(startX, startY, 8);
      if (draft.finalFacingRadians !== null) {
        this.commandDraftGraphics.moveTo(startX, startY);
        this.commandDraftGraphics.lineTo(endX, endY);
        drawArrowHead(this.commandDraftGraphics, endX, endY, draft.finalFacingRadians, 9);
      }
    }

    if (state.selectionBox) {`, 'draft drawing');
  source = replaceExact(source,
`import {
  getKnowledgeOverlayState,`,
`import {
  getKnowledgeOverlayState,`, 'noop import anchor');
  source = replaceExact(source,
`  getVisibilityProbeState,
} from '../core/ui/RuntimeUiState';`,
`  getVisibilityProbeState,
  getUnitCommandToolState,
} from '../core/ui/RuntimeUiState';`, 'draft state import');
  source = replaceExact(source,
`  const dangerColor = threat.visibleNow ? 0xff4e3d : 0xf09a55;`,
`  const dangerColor = threat.mode === 'directional_fire' ? STABLE_DIRECTIONAL_FIRE_COLOR : 0xf09a55;`, 'stable threat color');
  source = replaceExact(source,
`  graphics.moveTo(sourceX + 6, sourceY - 6);
  graphics.lineTo(sourceX - 6, sourceY + 6);
}`,
`  graphics.moveTo(sourceX + 6, sourceY - 6);
  graphics.lineTo(sourceX - 6, sourceY + 6);
  if (threat.visibleNow) {
    graphics.beginFill(CURRENT_CONTACT_MARKER_COLOR, 0.95);
    graphics.drawCircle(sourceX, sourceY, 3);
    graphics.endFill();
  }
}`, 'current contact marker');
  source = replaceExact(source,
`  const box = state.selectionBox`,
`  const draft = getUnitCommandToolState(state).routeFacingDraft;
  const draftKey = draft
    ? \`\${draft.target.x.toFixed(2)}:\${draft.target.y.toFixed(2)}:\${draft.pointer.x.toFixed(2)}:\${draft.pointer.y.toFixed(2)}:\${draft.finalFacingRadians?.toFixed(4) ?? 'none'}\`
    : 'none';
  const box = state.selectionBox`, 'draft key variable');
  source = replaceExact(source,
`    \`box:\${box}\`,
    \`cell:\${state.map.cellSize}\`,`,
`    \`box:\${box}\`,
    \`draft:\${draftKey}\`,
    \`cell:\${state.map.cellSize}\`,`, 'draft key return');
  return source;
});

await edit('src/tactical-workspace-compact-route.css', (source) => {
  source = replaceExact(source,
`  grid-template-columns: minmax(112px, 1fr) auto;
  grid-template-areas:
    "profile cost"
    "details details";`,
`  grid-template-columns: minmax(108px, 1fr) minmax(96px, 0.8fr) auto auto;
  grid-template-areas:
    "profile attention turn cost"
    "details details details details";`, 'compact control grid');
  source = replaceExact(source,
`.unit-route-profile {
  grid-area: profile;`,
`.unit-route-profile {
  grid-area: profile;`, 'compact profile anchor');
  source = replaceExact(source,
`.unit-route-profile select {`,
`.unit-attention-mode {
  grid-area: attention;
  display: grid;
  gap: 1px;
  min-width: 0;
  color: var(--workspace-muted);
  font-size: 8px;
}

.unit-route-profile select,
.unit-attention-mode select {`, 'compact attention select');
  source = replaceExact(source,
`.unit-bar-route-controls [data-action="route-cost-quick-toggle"] {`,
`.unit-bar-route-controls [data-action="turn-unit"] {
  grid-area: turn;
  min-height: 25px;
  padding: 3px 7px;
  border-radius: 7px;
  white-space: nowrap;
  font-size: 9px;
  font-weight: 800;
}

.unit-bar-route-controls [data-action="turn-unit"].active {
  color: #141910;
  border-color: #f4d66f;
  background: #f4d66f;
}

.unit-bar-route-controls [data-action="route-cost-quick-toggle"] {`, 'compact turn button');
  return source;
});

await edit('scripts/routed_move_smoke.ts', (source) => {
  source = replaceExact(source,
`verifyPlayerOrderUsesSharedPlanner();
verifyBlockedPlayerCommandRemainsVisible();`,
`verifyPlayerOrderUsesSharedPlanner();
verifyFinalFacingAppliedAfterMovement();
verifyBlockedPlayerCommandRemainsVisible();`, 'routed test call');
  source = appendBefore(source,
`function verifyBlockedPlayerCommandRemainsVisible`,
`function verifyFinalFacingAppliedAfterMovement(): void {
  const state = createTestState(makeEmptyMap());
  const unit = selectedUnit(state);
  const finalFacingRadians = Math.PI * 0.75;
  issueRoutedMoveOrderToSelectedUnits(state, { x: 5.5, y: 3.5 }, finalFacingRadians);
  assert.equal(unit.playerCommand?.finalFacingRadians, finalFacingRadians);
  assert.equal(unit.order?.finalFacingRadians, finalFacingRadians);
  for (let step = 0; step < 500 && unit.order; step += 1) tickSimulation(state, 0.05);
  assert.equal(unit.order, null);
  assert.ok(Math.abs(unit.facingRadians - finalFacingRadians) < 0.0001, 'final facing must be applied at destination');
  assert.equal(unit.playerCommand?.status, 'completed');
}

`, 'routed final facing test');
  return source;
});

await edit('scripts/view_memory_heatmap_smoke.ts', (source) => {
  source = replaceExact(source,
`assert.ok(getVisibilityFieldDiagnostics(state).cacheHitCount >= 1);`,
`assert.ok(getVisibilityFieldDiagnostics(state).cacheHitCount >= 1);
assert.equal(getVisibilityFieldDiagnostics(state).cachedFieldCount, 1, 'only the latest field may be retained');`, 'heatmap cache count test');
  return source;
});

console.log('Visibility controls implementation applied.');
