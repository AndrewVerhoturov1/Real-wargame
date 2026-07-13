import { Container, Graphics } from 'pixi.js';
import { buildThreatGeometryKey, buildThreatMarkerKey } from '../core/knowledge/ThreatDisplayModel';
import { buildUnitKnowledgeReport, type KnowledgeCover } from '../core/knowledge/UnitKnowledge';
import { gridToCellCenter } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import { resolvePressureZoneSettings, type PressureZone } from '../core/pressure/PressureZone';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { hasHeightVariation, sampleSmoothHeightLevel } from '../core/terrain/SmoothTerrain';
import {
  getKnowledgeOverlayState,
  getRealReliefOverlayState,
  getSimulationLayerState,
  getVisibilityProbeState,
  getUnitCommandToolState,
} from '../core/ui/RuntimeUiState';
import type { KnownThreatMemory } from '../core/units/UnitModel';

const STABLE_DIRECTIONAL_FIRE_COLOR = 0xf05a47;
const CURRENT_CONTACT_MARKER_COLOR = 0xfff0b0;
import { getVisibilityProbeResult } from '../core/visibility/VisibilityProbeService';

interface OverlayDiagnostics {
  knowledgeRebuildCount: number;
  probeRebuildCount: number;
  interactionUpdateCount: number;
  interactionObjectCount: number;
  fullMapFingerprintScanCount: number;
  threatGeometryRebuildCount: number;
  threatMarkerUpdateCount: number;
  threatGeometryObjectCount: number;
}

type OverlayDebugWindow = Window & {
  __realWargameOverlayDebug?: OverlayDiagnostics;
};

export class PixiOverlayRenderer {
  readonly container = new Container();
  private readonly zoneContainer = new Container();
  private readonly realReliefContainer = new Container();
  private readonly knowledgeContainer = new Container();
  private readonly threatGeometryContainer = new Container();
  private readonly threatMarkerGraphics = new Graphics();
  private readonly probeContainer = new Container();
  private readonly interactionContainer = new Container();
  private readonly hoverCellGraphics = new Graphics();
  private readonly selectionBoxGraphics = new Graphics();
  private readonly commandDraftGraphics = new Graphics();
  private lastZoneKey = '';
  private lastRealReliefKey = '';
  private lastKnowledgeKey = '';
  private lastThreatGeometryKey = '';
  private lastThreatMarkerKey = '';
  private lastProbeKey = '';
  private lastInteractionKey = '';
  private readonly diagnostics: OverlayDiagnostics = {
    knowledgeRebuildCount: 0,
    probeRebuildCount: 0,
    interactionUpdateCount: 0,
    interactionObjectCount: 2,
    fullMapFingerprintScanCount: 0,
    threatGeometryRebuildCount: 0,
    threatMarkerUpdateCount: 0,
    threatGeometryObjectCount: 0,
  };

  constructor() {
    for (const container of [
      this.container,
      this.zoneContainer,
      this.realReliefContainer,
      this.knowledgeContainer,
      this.threatGeometryContainer,
      this.probeContainer,
      this.interactionContainer,
    ]) {
      container.eventMode = 'none';
      container.interactiveChildren = false;
    }

    this.hoverCellGraphics.eventMode = 'none';
    this.selectionBoxGraphics.eventMode = 'none';
    this.commandDraftGraphics.eventMode = 'none';
    this.threatMarkerGraphics.eventMode = 'none';
    this.interactionContainer.addChild(this.hoverCellGraphics, this.selectionBoxGraphics, this.commandDraftGraphics);
    this.container.addChild(
      this.zoneContainer,
      this.realReliefContainer,
      this.knowledgeContainer,
      this.threatGeometryContainer,
      this.threatMarkerGraphics,
      this.probeContainer,
      this.interactionContainer,
    );
    this.publishDiagnostics();
  }

  render(state: SimulationState, showGrid = true, showPressureZones = true): void {
    this.renderZoneLayerIfNeeded(state, showPressureZones && state.editor.enabled);
    this.renderRealReliefLayerIfNeeded(state);
    this.renderKnowledgeLayerIfNeeded(state);
    this.renderThreatLayersIfNeeded(state);
    this.renderProbeLayerIfNeeded(state);
    this.renderInteractionLayerIfNeeded(state, showGrid);
  }

  destroy(): void {
    delete (window as OverlayDebugWindow).__realWargameOverlayDebug;
  }

  private renderZoneLayerIfNeeded(state: SimulationState, showPressureZones: boolean): void {
    const nextKey = getZoneLayerKey(state, showPressureZones);
    if (nextKey === this.lastZoneKey) return;

    this.lastZoneKey = nextKey;
    this.zoneContainer.cacheAsBitmap = false;
    destroyContainerChildren(this.zoneContainer);

    if (showPressureZones) {
      drawPressureZones(this.zoneContainer, state.pressureZones, state.map.cellSize, state.editor.selectedZoneId);
      this.zoneContainer.cacheAsBitmap = state.editor.selectedZoneId === null;
    }
  }

  private renderRealReliefLayerIfNeeded(state: SimulationState): void {
    const nextKey = getRealReliefLayerKey(state);
    if (nextKey === this.lastRealReliefKey) return;

    this.lastRealReliefKey = nextKey;
    this.realReliefContainer.cacheAsBitmap = false;
    destroyContainerChildren(this.realReliefContainer);

    if (!getRealReliefOverlayState(state).active || !hasHeightVariation(state.map)) return;

    drawRealReliefOverlay(this.realReliefContainer, state);
    this.realReliefContainer.cacheAsBitmap = true;
  }

  private renderKnowledgeLayerIfNeeded(state: SimulationState): void {
    const visible = isKnowledgeLayerVisible(state);
    const nextKey = visible
      ? getKnowledgeLayerKey(state)
      : `knowledge:hidden;editor:${state.editor.enabled ? '1' : '0'};mode:${getSimulationLayerState(state).mode}`;
    if (nextKey === this.lastKnowledgeKey) return;

    this.lastKnowledgeKey = nextKey;
    destroyContainerChildren(this.knowledgeContainer);

    if (visible) {
      drawKnowledgeOverlay(this.knowledgeContainer, state);
      drawCoverKnowledgeOverlay(this.knowledgeContainer, state);
    }

    this.diagnostics.knowledgeRebuildCount += 1;
    this.publishDiagnostics();
  }

  private renderThreatLayersIfNeeded(state: SimulationState): void {
    const unit = getSelectedUnit(state);
    const visible = isThreatLayerVisible(state) && Boolean(unit);
    const threats = visible && unit ? unit.tacticalKnowledge.threats : [];
    const geometryKey = visible ? buildThreatGeometryKey(threats, state.map.cellSize) : 'threats:hidden';
    if (geometryKey !== this.lastThreatGeometryKey) {
      this.lastThreatGeometryKey = geometryKey;
      destroyContainerChildren(this.threatGeometryContainer);
      if (visible) drawThreatMemoryGeometry(this.threatGeometryContainer, state);
      this.diagnostics.threatGeometryRebuildCount += 1;
      this.diagnostics.threatGeometryObjectCount = this.threatGeometryContainer.children.length;
    }
    const markerKey = visible ? buildThreatMarkerKey(threats, state.map.cellSize) : 'markers:hidden';
    if (markerKey !== this.lastThreatMarkerKey) {
      this.lastThreatMarkerKey = markerKey;
      this.threatMarkerGraphics.clear();
      if (visible) drawCurrentThreatMarkers(this.threatMarkerGraphics, threats, state.map.cellSize);
      this.diagnostics.threatMarkerUpdateCount += 1;
    }
    this.publishDiagnostics();
  }

  private renderProbeLayerIfNeeded(state: SimulationState): void {
    const nextKey = getProbeLayerKey(state);
    if (nextKey === this.lastProbeKey) return;

    this.lastProbeKey = nextKey;
    destroyContainerChildren(this.probeContainer);
    drawVisibilityProbe(this.probeContainer, state);
    this.diagnostics.probeRebuildCount += 1;
    this.publishDiagnostics();
  }

  private renderInteractionLayerIfNeeded(state: SimulationState, showGrid: boolean): void {
    const nextKey = getInteractionLayerKey(state, showGrid);
    if (nextKey === this.lastInteractionKey) return;

    this.lastInteractionKey = nextKey;
    this.hoverCellGraphics.clear();
    this.selectionBoxGraphics.clear();
    this.commandDraftGraphics.clear();

    if (showGrid && state.mouseGridPosition) {
      const { map } = state;
      const cell = gridToCellCenter(map, {
        x: Math.floor(state.mouseGridPosition.x),
        y: Math.floor(state.mouseGridPosition.y),
      });

      this.hoverCellGraphics.lineStyle(2, 0xfff2a8, 0.5);
      this.hoverCellGraphics.drawRect(
        (cell.x - 0.5) * map.cellSize,
        (cell.y - 0.5) * map.cellSize,
        map.cellSize,
        map.cellSize,
      );
    }

    const commandTool = getUnitCommandToolState(state);
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

    if (state.selectionBox) {
      const { map } = state;
      const minX = Math.min(state.selectionBox.start.x, state.selectionBox.current.x) * map.cellSize;
      const minY = Math.min(state.selectionBox.start.y, state.selectionBox.current.y) * map.cellSize;
      const maxX = Math.max(state.selectionBox.start.x, state.selectionBox.current.x) * map.cellSize;
      const maxY = Math.max(state.selectionBox.start.y, state.selectionBox.current.y) * map.cellSize;

      this.selectionBoxGraphics.lineStyle(2, 0xfff2a8, 0.9);
      this.selectionBoxGraphics.beginFill(0xfff2a8, 0.08);
      this.selectionBoxGraphics.drawRect(minX, minY, maxX - minX, maxY - minY);
      this.selectionBoxGraphics.endFill();
    }

    this.diagnostics.interactionUpdateCount += 1;
    this.publishDiagnostics();
  }

  private publishDiagnostics(): void {
    this.diagnostics.interactionObjectCount = this.interactionContainer.children.length;
    (window as OverlayDebugWindow).__realWargameOverlayDebug = { ...this.diagnostics };
  }
}

function isKnowledgeLayerVisible(state: SimulationState): boolean {
  if (getKnowledgeOverlayState(state).active) return true;
  if (state.editor.enabled) return false;
  const mode = getSimulationLayerState(state).mode;
  return mode === 'danger' || mode === 'memory';
}

function isThreatLayerVisible(state: SimulationState): boolean {
  if (state.editor.enabled) return false;
  const mode = getSimulationLayerState(state).mode;
  return mode === 'danger' || mode === 'memory';
}

function destroyContainerChildren(container: Container): void {
  for (const child of container.removeChildren()) child.destroy();
}

function drawRealReliefOverlay(container: Container, state: SimulationState): void {
  const graphics = new Graphics();
  const { map } = state;
  const cellSize = map.cellSize;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const level = sampleSmoothHeightLevel(map, x + 0.5, y + 0.5);
      const color = reliefColor(level);
      const alpha = Math.min(0.34, Math.abs(level) * 0.12 + 0.07);
      if (Math.abs(level) < 0.08) continue;

      graphics.beginFill(color, alpha);
      graphics.drawRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
      graphics.endFill();
    }
  }

  container.addChild(graphics);
}

function drawKnowledgeOverlay(container: Container, state: SimulationState): void {
  const overlay = getKnowledgeOverlayState(state);
  const unit = getSelectedUnit(state);
  if (!overlay.active || !unit) return;

  const report = buildUnitKnowledgeReport(state, unit);
  const graphics = new Graphics();
  const cellSize = state.map.cellSize;

  graphics.beginFill(0x4fbf72, 0.055);
  graphics.lineStyle(1, 0x4fbf72, 0.2);
  graphics.drawCircle(unit.position.x * cellSize, unit.position.y * cellSize, unit.viewRangeCells * cellSize);
  graphics.endFill();

  for (const cover of report.planCovers) drawCoverMarker(graphics, cover, cellSize, false, false);
  for (const cover of report.nearbyCovers) drawCoverMarker(graphics, cover, cellSize, true, false);

  container.addChild(graphics);
}

export function drawThreatMemoryOverlay(container: Container, state: SimulationState): void {
  drawThreatMemoryGeometry(container, state);
  const unit = getSelectedUnit(state);
  if (!unit || !isThreatLayerVisible(state)) return;
  const markers = new Graphics();
  drawCurrentThreatMarkers(markers, unit.tacticalKnowledge.threats, state.map.cellSize);
  container.addChild(markers);
}

function drawThreatMemoryGeometry(container: Container, state: SimulationState): void {
  const layer = getSimulationLayerState(state);
  const unit = getSelectedUnit(state);
  if (!unit || !isThreatLayerVisible(state)) return;
  const graphics = new Graphics();
  const cellSize = state.map.cellSize;
  for (const threat of unit.tacticalKnowledge.threats) drawRememberedThreat(graphics, threat, cellSize, layer.mode === 'memory');
  container.addChild(graphics);
}

function drawCurrentThreatMarkers(graphics: Graphics, threats: KnownThreatMemory[], cellSize: number): void {
  for (const threat of threats) {
    if (!threat.visibleNow) continue;
    graphics.lineStyle(2, CURRENT_CONTACT_MARKER_COLOR, 1);
    graphics.beginFill(CURRENT_CONTACT_MARKER_COLOR, 0.82);
    graphics.drawCircle(threat.x * cellSize, threat.y * cellSize, 4);
    graphics.endFill();
  }
}

export function drawCoverKnowledgeOverlay(container: Container, state: SimulationState): void {
  const layer = getSimulationLayerState(state);
  const unit = getSelectedUnit(state);
  if (state.editor.enabled || !unit || (layer.mode !== 'danger' && layer.mode !== 'memory')) return;

  const report = buildUnitKnowledgeReport(state, unit);
  const graphics = new Graphics();
  const cellSize = state.map.cellSize;
  const covers = [...report.planCovers, ...report.nearbyCovers];
  for (const cover of covers) {
    const selected = cover.id === layer.selectedCoverId;
    const hovered = cover.id === layer.hoveredCoverId;
    drawCoverMarker(graphics, cover, cellSize, cover.currentCover, selected || hovered);
    if (selected && unit.tacticalKnowledge.threats[0]) {
      const threat = unit.tacticalKnowledge.threats[0];
      graphics.lineStyle(2, 0x9ff29c, 0.75);
      graphics.moveTo(cover.x * cellSize, cover.y * cellSize);
      graphics.lineTo(threat.x * cellSize, threat.y * cellSize);
    }
  }
  container.addChild(graphics);
}

function drawCoverMarker(
  graphics: Graphics,
  cover: KnowledgeCover,
  cellSize: number,
  nearby: boolean,
  emphasized: boolean,
): void {
  const x = cover.x * cellSize;
  const y = cover.y * cellSize;
  const color = emphasized ? 0xffffff : nearby ? 0xfff2a8 : 0xe8d985;
  const radius = emphasized ? 10 : nearby ? 7 : 5;
  graphics.lineStyle(emphasized ? 4 : 2, color, emphasized ? 1 : 0.86);
  graphics.beginFill(nearby ? 0x8acb76 : 0xfff2a8, emphasized ? 0.38 : nearby ? 0.18 : 0.12);
  if (nearby) graphics.drawRoundedRect(x - radius, y - radius, radius * 2, radius * 2, 3);
  else graphics.drawCircle(x, y, radius);
  graphics.endFill();
}

function drawRememberedThreat(graphics: Graphics, threat: KnownThreatMemory, cellSize: number, memoryMode: boolean): void {
  const confidenceAlpha = Math.max(0.18, Math.min(0.9, threat.confidence / 100));
  const sourceX = threat.x * cellSize;
  const sourceY = threat.y * cellSize;
  const dangerColor = threat.mode === 'directional_fire' ? STABLE_DIRECTIONAL_FIRE_COLOR : 0xf09a55;
  const uncertaintyRadius = Math.max(0.18, threat.uncertaintyCells) * cellSize;

  graphics.lineStyle(2, dangerColor, confidenceAlpha);
  graphics.beginFill(dangerColor, memoryMode ? 0.08 : 0.12);
  graphics.drawCircle(sourceX, sourceY, uncertaintyRadius);
  graphics.endFill();

  if (threat.mode === 'directional_fire') {
    const direction = degreesToRadians(threat.directionDegrees);
    const halfArc = degreesToRadians(threat.arcDegrees / 2);
    const radius = threat.rangeCells * cellSize;
    graphics.lineStyle(2, dangerColor, confidenceAlpha * 0.8);
    graphics.beginFill(dangerColor, memoryMode ? 0.035 : 0.075);
    graphics.moveTo(sourceX, sourceY);
    graphics.arc(sourceX, sourceY, radius, direction - halfArc, direction + halfArc);
    graphics.lineTo(sourceX, sourceY);
    graphics.endFill();
    graphics.moveTo(sourceX, sourceY);
    graphics.lineTo(sourceX + Math.cos(direction) * radius, sourceY + Math.sin(direction) * radius);
  } else if (threat.radiusCells > 0) {
    graphics.lineStyle(2, dangerColor, confidenceAlpha * 0.7);
    graphics.drawCircle(sourceX, sourceY, threat.radiusCells * cellSize);
  } else {
    graphics.lineStyle(2, dangerColor, confidenceAlpha * 0.7);
    graphics.drawRect(
      (threat.x - threat.widthCells / 2) * cellSize,
      (threat.y - threat.heightCells / 2) * cellSize,
      threat.widthCells * cellSize,
      threat.heightCells * cellSize,
    );
  }

  graphics.lineStyle(2, dangerColor, confidenceAlpha);
  graphics.moveTo(sourceX - 6, sourceY - 6);
  graphics.lineTo(sourceX + 6, sourceY + 6);
  graphics.moveTo(sourceX + 6, sourceY - 6);
  graphics.lineTo(sourceX - 6, sourceY + 6);
}

function drawVisibilityProbe(container: Container, state: SimulationState): void {
  const result = getVisibilityProbeResult(state);
  if (!result) return;

  const cellSize = state.map.cellSize;
  const graphics = new Graphics();
  const origin = result.origin;
  const target = result.target;
  const visibleEnd = result.blockedAt ?? target;

  graphics.lineStyle(3, 0x2dff55, 0.95);
  graphics.moveTo(origin.x * cellSize, origin.y * cellSize);
  graphics.lineTo(visibleEnd.x * cellSize, visibleEnd.y * cellSize);

  if (result.blocked && result.blockedAt) {
    graphics.lineStyle(3, 0xff3535, 0.95);
    graphics.moveTo(result.blockedAt.x * cellSize, result.blockedAt.y * cellSize);
    graphics.lineTo(target.x * cellSize, target.y * cellSize);
    graphics.lineStyle(2, 0xff3535, 1);
    graphics.drawCircle(result.blockedAt.x * cellSize, result.blockedAt.y * cellSize, 6);
    graphics.moveTo(result.blockedAt.x * cellSize - 7, result.blockedAt.y * cellSize - 7);
    graphics.lineTo(result.blockedAt.x * cellSize + 7, result.blockedAt.y * cellSize + 7);
    graphics.moveTo(result.blockedAt.x * cellSize + 7, result.blockedAt.y * cellSize - 7);
    graphics.lineTo(result.blockedAt.x * cellSize - 7, result.blockedAt.y * cellSize + 7);
  }

  container.addChild(graphics);
}

function reliefColor(level: number): number {
  if (level < -1.25) return 0x315c74;
  if (level < -0.25) return 0x4b7275;
  if (level < 0.75) return 0x8a8d5a;
  if (level < 1.75) return 0xb6a44c;
  if (level < 2.75) return 0xd2a24a;
  return 0xf0c262;
}

function getZoneLayerKey(state: SimulationState, showPressureZones: boolean): string {
  if (!showPressureZones) return 'zones:hidden';

  return [
    `cell:${state.map.cellSize}`,
    `selected:${state.editor.selectedZoneId ?? 'none'}`,
    `zones:${state.pressureZones.map((zone) => {
      const settings = resolvePressureZoneSettings(zone);
      return [
        zone.id,
        zone.shape,
        settings.mode,
        zone.x.toFixed(3),
        zone.y.toFixed(3),
        zone.radiusCells.toFixed(3),
        zone.widthCells.toFixed(3),
        zone.heightCells.toFixed(3),
        zone.strength.toFixed(1),
        settings.directionDegrees.toFixed(1),
        settings.arcDegrees.toFixed(1),
        settings.rangeCells.toFixed(2),
        settings.enabled ? '1' : '0',
      ].join(':');
    }).join('|')}`,
  ].join(';');
}

function getRealReliefLayerKey(state: SimulationState): string {
  const active = getRealReliefOverlayState(state).active ? '1' : '0';
  if (!active) return 'relief:hidden';
  const revisions = getMapRevisionSnapshot(state.map);

  return [
    'relief:cached',
    `active:${active}`,
    `size:${state.map.width}x${state.map.height}`,
    `cell:${state.map.cellSize}`,
    `heightRevision:${revisions.height}`,
  ].join(';');
}

function getKnowledgeLayerKey(state: SimulationState): string {
  const knowledgeOverlay = getKnowledgeOverlayState(state).active ? '1' : '0';
  const selectedUnit = getSelectedUnit(state);
  const layer = getSimulationLayerState(state);
  const revisions = getMapRevisionSnapshot(state.map);

  return [
    `editor:${state.editor.enabled ? '1' : '0'}`,
    `cell:${state.map.cellSize}`,
    `selectedUnit:${selectedUnit?.id ?? 'none'}`,
    `unitPosition:${selectedUnit ? `${selectedUnit.position.x.toFixed(2)}:${selectedUnit.position.y.toFixed(2)}` : 'none'}`,
    `viewRange:${selectedUnit?.viewRangeCells.toFixed(2) ?? 'none'}`,
    `knowledge:${knowledgeOverlay}`,
    `layer:${layer.mode}`,
    `selectedCover:${layer.selectedCoverId ?? ''}`,
    `hoveredCover:${layer.hoveredCoverId ?? ''}`,
    `knowledgeRevision:${selectedUnit?.tacticalKnowledge.revision ?? 0}`,
    `objectsRevision:${revisions.objects}`,
    `zones:${state.pressureZones.length}`,
  ].join(';');
}

function getProbeLayerKey(state: SimulationState): string {
  const probe = getVisibilityProbeState(state);
  if (!probe.active || !probe.target) return 'probe:off';

  const selectedUnit = getSelectedUnit(state);
  const revisions = getMapRevisionSnapshot(state.map);

  return [
    `probe:${probe.target.x.toFixed(2)}:${probe.target.y.toFixed(2)}`,
    `unit:${selectedUnit?.id ?? 'none'}`,
    `unitPosition:${selectedUnit ? `${selectedUnit.position.x.toFixed(2)}:${selectedUnit.position.y.toFixed(2)}` : 'none'}`,
    `posture:${selectedUnit?.behaviorRuntime.posture ?? 'none'}`,
    `cell:${state.map.cellSize}`,
    `heightRevision:${revisions.height}`,
    `forestRevision:${revisions.forest}`,
    `objectsRevision:${revisions.objects}`,
  ].join(';');
}

function getInteractionLayerKey(state: SimulationState, showGrid: boolean): string {
  const mouse = showGrid && state.mouseGridPosition
    ? `${Math.floor(state.mouseGridPosition.x)}:${Math.floor(state.mouseGridPosition.y)}`
    : 'none';
  const draft = getUnitCommandToolState(state).routeFacingDraft;
  const draftKey = draft
    ? `${draft.target.x.toFixed(2)}:${draft.target.y.toFixed(2)}:${draft.pointer.x.toFixed(2)}:${draft.pointer.y.toFixed(2)}:${draft.finalFacingRadians?.toFixed(4) ?? 'none'}`
    : 'none';
  const box = state.selectionBox
    ? `${state.selectionBox.start.x.toFixed(2)}:${state.selectionBox.start.y.toFixed(2)}:${state.selectionBox.current.x.toFixed(2)}:${state.selectionBox.current.y.toFixed(2)}`
    : 'none';

  return [
    `grid:${showGrid ? '1' : '0'}`,
    `mouseCell:${mouse}`,
    `box:${box}`,
    `draft:${draftKey}`,
    `cell:${state.map.cellSize}`,
  ].join(';');
}

function drawPressureZones(
  container: Container,
  zones: PressureZone[],
  cellSize: number,
  selectedZoneId: string | null,
): void {
  for (const zone of zones) {
    const settings = resolvePressureZoneSettings(zone);
    const graphics = new Graphics();
    const isSelected = zone.id === selectedZoneId;

    if (settings.mode === 'directional_fire') drawDirectionalThreat(graphics, zone, cellSize, isSelected);
    else drawAreaThreat(graphics, zone, cellSize, isSelected);

    container.addChild(graphics);
  }
}

function drawAreaThreat(graphics: Graphics, zone: PressureZone, cellSize: number, isSelected: boolean): void {
  const alpha = Math.max(0.08, Math.min(0.28, zone.strength / 350));
  graphics.lineStyle(isSelected ? 4 : 2, isSelected ? 0xfff2a8 : 0xb6633c, isSelected ? 0.95 : 0.75);
  graphics.beginFill(0xb6633c, alpha);

  if (zone.shape === 'circle') {
    graphics.drawCircle(zone.x * cellSize, zone.y * cellSize, zone.radiusCells * cellSize);
  } else {
    graphics.drawRect(
      (zone.x - zone.widthCells / 2) * cellSize,
      (zone.y - zone.heightCells / 2) * cellSize,
      zone.widthCells * cellSize,
      zone.heightCells * cellSize,
    );
  }

  graphics.endFill();
  if (isSelected) drawZoneHandles(graphics, zone, cellSize);
}

function drawDirectionalThreat(graphics: Graphics, zone: PressureZone, cellSize: number, isSelected: boolean): void {
  const settings = resolvePressureZoneSettings(zone);
  const centerX = zone.x * cellSize;
  const centerY = zone.y * cellSize;
  const radius = settings.rangeCells * cellSize;
  const direction = degreesToRadians(settings.directionDegrees);
  const halfArc = degreesToRadians(settings.arcDegrees / 2);
  const start = direction - halfArc;
  const end = direction + halfArc;
  const activeAlpha = settings.enabled ? 1 : 0.28;
  const color = settings.enabled ? 0xd33f32 : 0x777777;
  const fillAlpha = Math.max(0.06, Math.min(0.3, zone.strength / 300)) * activeAlpha;

  graphics.lineStyle(isSelected ? 4 : 2, isSelected ? 0xfff2a8 : color, 0.9 * activeAlpha);
  graphics.beginFill(color, fillAlpha);
  graphics.moveTo(centerX, centerY);
  graphics.arc(centerX, centerY, radius, start, end);
  graphics.lineTo(centerX, centerY);
  graphics.endFill();

  const endX = centerX + Math.cos(direction) * radius;
  const endY = centerY + Math.sin(direction) * radius;
  graphics.lineStyle(isSelected ? 4 : 3, isSelected ? 0xfff2a8 : 0xff765f, 0.95 * activeAlpha);
  graphics.moveTo(centerX, centerY);
  graphics.lineTo(endX, endY);
  drawArrowHead(graphics, endX, endY, direction, isSelected ? 12 : 9);

  graphics.beginFill(isSelected ? 0xfff2a8 : 0xff765f, activeAlpha);
  graphics.drawCircle(centerX, centerY, isSelected ? 7 : 5);
  graphics.endFill();

  if (settings.minRangeCells > 0) {
    graphics.lineStyle(1, color, 0.65 * activeAlpha);
    graphics.drawCircle(centerX, centerY, settings.minRangeCells * cellSize);
  }
}

function drawArrowHead(graphics: Graphics, x: number, y: number, angle: number, size: number): void {
  graphics.moveTo(x, y);
  graphics.lineTo(x - Math.cos(angle - Math.PI / 6) * size, y - Math.sin(angle - Math.PI / 6) * size);
  graphics.moveTo(x, y);
  graphics.lineTo(x - Math.cos(angle + Math.PI / 6) * size, y - Math.sin(angle + Math.PI / 6) * size);
}

function drawZoneHandles(graphics: Graphics, zone: PressureZone, cellSize: number): void {
  const handleSize = 8;
  graphics.beginFill(0xfff2a8, 1);

  if (zone.shape === 'circle') {
    for (const [x, y] of [
      [zone.x + zone.radiusCells, zone.y],
      [zone.x - zone.radiusCells, zone.y],
      [zone.x, zone.y + zone.radiusCells],
      [zone.x, zone.y - zone.radiusCells],
    ] as Array<[number, number]>) {
      graphics.drawRect(x * cellSize - handleSize / 2, y * cellSize - handleSize / 2, handleSize, handleSize);
    }
    graphics.endFill();
    return;
  }

  const left = (zone.x - zone.widthCells / 2) * cellSize;
  const right = (zone.x + zone.widthCells / 2) * cellSize;
  const top = (zone.y - zone.heightCells / 2) * cellSize;
  const bottom = (zone.y + zone.heightCells / 2) * cellSize;

  for (const [x, y] of [
    [left, top],
    [(left + right) / 2, top],
    [right, top],
    [right, (top + bottom) / 2],
    [right, bottom],
    [(left + right) / 2, bottom],
    [left, bottom],
    [left, (top + bottom) / 2],
  ] as Array<[number, number]>) {
    graphics.drawRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
  }

  graphics.endFill();
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
