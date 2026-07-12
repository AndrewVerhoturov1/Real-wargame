import { Container, Graphics } from 'pixi.js';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getAttentionOverlayState } from '../core/ui/RuntimeUiState';
import type { PerceptionContactMemory } from '../core/perception/PerceptionContact';

export interface AttentionOverlayDiagnostics {
  rebuildCount: number;
  markerCount: number;
  visibilityFanRayCount: number;
  lastKey: string;
}

type AttentionOverlayDebugWindow = Window & {
  __realWargameAttentionOverlayDebug?: AttentionOverlayDiagnostics;
};

export class PixiAttentionOverlayRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private lastKey = '';
  private readonly diagnostics: AttentionOverlayDiagnostics = {
    rebuildCount: 0,
    markerCount: 0,
    visibilityFanRayCount: 0,
    lastKey: '',
  };

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
    this.publishDiagnostics();
  }

  render(state: SimulationState): void {
    const overlay = getAttentionOverlayState(state);
    const unit = getSelectedUnit(state);
    const key = buildAttentionOverlayKey(state);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.diagnostics.lastKey = key;
    this.graphics.clear();
    this.diagnostics.markerCount = 0;
    this.diagnostics.visibilityFanRayCount = 0;

    if (!overlay.active || !unit || state.editor.enabled) {
      this.diagnostics.rebuildCount += 1;
      this.publishDiagnostics();
      return;
    }

    const cellSize = state.map.cellSize;
    const centerX = unit.position.x * cellSize;
    const centerY = unit.position.y * cellSize;
    const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
    const nominalRange = unit.viewRangeCells * cellSize;
    const peripheralRadius = Math.max(cellSize * 1.5, nominalRange * Math.max(0.18, profile.peripheralWeight));

    this.graphics.lineStyle(1.5, 0x78a9c9, 0.28);
    this.graphics.beginFill(0x78a9c9, 0.025);
    this.graphics.drawCircle(centerX, centerY, peripheralRadius);
    this.graphics.endFill();

    drawSector(
      this.graphics,
      centerX,
      centerY,
      nominalRange * Math.max(0.45, profile.directWeight),
      unit.attentionRuntime.focusDirectionRadians,
      degreesToRadians(profile.directAngleDegrees),
      0x71c5a2,
      0.08,
      0.42,
    );
    drawSector(
      this.graphics,
      centerX,
      centerY,
      nominalRange,
      unit.attentionRuntime.focusDirectionRadians,
      degreesToRadians(profile.focusAngleDegrees),
      0xf4dc7a,
      0.15,
      0.88,
    );

    const focusEndX = centerX + Math.cos(unit.attentionRuntime.focusDirectionRadians) * nominalRange;
    const focusEndY = centerY + Math.sin(unit.attentionRuntime.focusDirectionRadians) * nominalRange;
    this.graphics.lineStyle(2.5, 0xffef9c, 0.92);
    this.graphics.moveTo(centerX, centerY);
    this.graphics.lineTo(focusEndX, focusEndY);
    this.graphics.beginFill(0xffef9c, 0.95);
    this.graphics.drawCircle(centerX, centerY, Math.max(3, cellSize * 0.08));
    this.graphics.endFill();

    if (overlay.showVisibilityFan) {
      drawVisibilityFan(this.graphics, centerX, centerY, nominalRange, unit.attentionRuntime.focusDirectionRadians, profile.directAngleDegrees);
      this.diagnostics.visibilityFanRayCount = 13;
    }

    for (const contact of unit.perceptionKnowledge.contacts) {
      drawContactMarker(
        this.graphics,
        contact,
        cellSize,
        contact.id === overlay.selectedContactId,
      );
      this.diagnostics.markerCount += 1;
    }

    this.diagnostics.rebuildCount += 1;
    this.publishDiagnostics();
  }

  destroy(): void {
    this.graphics.destroy();
    this.container.removeChildren();
    delete (window as AttentionOverlayDebugWindow).__realWargameAttentionOverlayDebug;
  }

  getDiagnostics(): AttentionOverlayDiagnostics {
    return { ...this.diagnostics };
  }

  private publishDiagnostics(): void {
    if (typeof window === 'undefined') return;
    (window as AttentionOverlayDebugWindow).__realWargameAttentionOverlayDebug = { ...this.diagnostics };
  }
}

function buildAttentionOverlayKey(state: SimulationState): string {
  const overlay = getAttentionOverlayState(state);
  const unit = getSelectedUnit(state);
  if (!overlay.active || !unit || state.editor.enabled) {
    return `attention:hidden:${overlay.active ? '1' : '0'}:${state.editor.enabled ? '1' : '0'}:${unit?.id ?? 'none'}`;
  }
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  return [
    'attention:v1',
    unit.id,
    unit.position.x.toFixed(2),
    unit.position.y.toFixed(2),
    unit.attentionRuntime.mode,
    unit.attentionRuntime.focusDirectionRadians.toFixed(3),
    unit.attentionRuntime.scanProgress01.toFixed(3),
    profile.focusAngleDegrees.toFixed(1),
    profile.directAngleDegrees.toFixed(1),
    profile.directWeight.toFixed(3),
    profile.peripheralWeight.toFixed(3),
    unit.viewRangeCells.toFixed(2),
    unit.perceptionKnowledge.revision,
    state.map.cellSize.toFixed(2),
    overlay.showVisibilityFan ? 'fan' : 'no-fan',
    overlay.selectedContactId ?? 'none',
  ].join(':');
}

function drawSector(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  direction: number,
  arc: number,
  color: number,
  fillAlpha: number,
  lineAlpha: number,
): void {
  const half = arc / 2;
  const start = direction - half;
  const end = direction + half;
  graphics.lineStyle(1.5, color, lineAlpha);
  graphics.beginFill(color, fillAlpha);
  graphics.moveTo(x, y);
  graphics.arc(x, y, radius, start, end);
  graphics.lineTo(x, y);
  graphics.endFill();
}

function drawVisibilityFan(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  direction: number,
  directAngleDegrees: number,
): void {
  const half = degreesToRadians(directAngleDegrees) / 2;
  graphics.lineStyle(1, 0xd8efff, 0.16);
  for (let index = 0; index < 13; index += 1) {
    const factor = index / 12;
    const angle = direction - half + half * 2 * factor;
    graphics.moveTo(x, y);
    graphics.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
}

function drawContactMarker(
  graphics: Graphics,
  contact: PerceptionContactMemory,
  cellSize: number,
  selected: boolean,
): void {
  const x = contact.lastKnownPosition.x * cellSize;
  const y = contact.lastKnownPosition.y * cellSize;
  const uncertainty = Math.max(5, contact.uncertaintyCells * cellSize);
  const color = contact.visibleNow ? 0xff664f : contact.source === 'sound' ? 0x8ec6ff : 0xf2aa62;
  const alpha = Math.max(0.22, Math.min(0.95, contact.confidence / 100));
  const size = selected ? 10 : 7;

  graphics.lineStyle(selected ? 3 : 2, color, alpha);
  if (contact.stage === 'cue') {
    graphics.drawCircle(x, y, size);
    return;
  }

  if (contact.stage === 'suspicion') {
    graphics.drawCircle(x, y, uncertainty);
    graphics.drawCircle(x, y, size * 0.65);
    return;
  }

  graphics.moveTo(x, y - size);
  graphics.lineTo(x + size, y);
  graphics.lineTo(x, y + size);
  graphics.lineTo(x - size, y);
  graphics.lineTo(x, y - size);

  if (contact.stage === 'identified' || contact.stage === 'confirmed') {
    graphics.beginFill(color, alpha * 0.65);
    graphics.moveTo(x, y - size + 1);
    graphics.lineTo(x + size - 1, y);
    graphics.lineTo(x, y + size - 1);
    graphics.lineTo(x - size + 1, y);
    graphics.lineTo(x, y - size + 1);
    graphics.endFill();
  }

  if (contact.stage === 'confirmed') {
    graphics.beginFill(0xffffff, 0.95);
    graphics.drawCircle(x, y, 2.5);
    graphics.endFill();
  }
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}
