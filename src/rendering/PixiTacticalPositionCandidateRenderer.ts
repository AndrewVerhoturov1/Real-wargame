import { Container, Graphics, Text } from 'pixi.js';
import type { TacticalPositionKind } from '../core/ai/tactical/TacticalQuery';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  getTacticalPositionPresentation,
  recommendedPostureOf,
} from '../core/tactical/SimulationTacticalPositionSelection';
import { isTacticalPositionWorkspaceTabActive } from '../ui/TacticalPositionWorkspaceTab';

export interface TacticalPositionCandidateOverlayDiagnostics {
  readonly visible: boolean;
  readonly markerCount: number;
  readonly graphicsCount: number;
  readonly textCount: number;
}

const KIND_STYLE: Readonly<Record<TacticalPositionKind, {
  readonly fill: number;
  readonly stroke: number;
  readonly label: string;
}>> = Object.freeze({
  observation: { fill: 0x2b9eb3, stroke: 0xc8f7ff, label: 'Н' },
  defense: { fill: 0xc9a33e, stroke: 0xffefad, label: 'З' },
  firing: { fill: 0xc54d3e, stroke: 0xffc3a4, label: 'О' },
});

/** Presentation-only overlay for already calculated subjective candidates. */
export class PixiTacticalPositionCandidateRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labels = new Container();
  private markerCount = 0;
  private destroyed = false;

  constructor() {
    this.container.eventMode = 'none';
    this.graphics.eventMode = 'none';
    this.labels.eventMode = 'none';
    this.container.addChild(this.graphics, this.labels);
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    const visible = !state.editor.enabled && isTacticalPositionWorkspaceTabActive(state);
    this.container.visible = visible;
    this.graphics.clear();
    this.labels.removeChildren().forEach((child) => child.destroy());
    this.markerCount = 0;
    if (!visible) return;

    const presentation = getTacticalPositionPresentation(state);
    const cellSize = state.map.cellSize;
    const radius = Math.max(7, cellSize * 0.34);
    for (const candidate of presentation.candidates) {
      const kind = canonicalKind(candidate.kind);
      if (!kind) continue;
      const x = candidate.position.x * cellSize;
      const y = candidate.position.y * cellSize;
      const selected = presentation.selected?.id === candidate.id;
      const hovered = presentation.hovered?.id === candidate.id;
      const style = KIND_STYLE[kind];
      const scale = selected ? 1.3 : hovered ? 1.16 : 1;
      const markerRadius = radius * scale;
      drawKindMarker(this.graphics, kind, x, y, markerRadius, style.fill, style.stroke, selected || hovered);
      const facing = candidate.metrics.recommendedFacingRadians;
      if (typeof facing === 'number' && Number.isFinite(facing)) {
        const lineLength = markerRadius * 1.75;
        this.graphics
          .moveTo(x, y)
          .lineTo(x + Math.cos(facing) * lineLength, y + Math.sin(facing) * lineLength)
          .stroke({ color: style.stroke, width: selected ? 3 : 2, alpha: 0.95 });
      }
      const label = new Text({
        text: `${style.label} ${postureGlyph(recommendedPostureOf(candidate))}`,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: Math.max(9, Math.min(13, cellSize * 0.27)),
          fontWeight: '700',
          fill: 0xffffff,
          stroke: { color: 0x111611, width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      label.position.set(x, y - markerRadius - 2);
      this.labels.addChild(label);
      this.markerCount += 1;
    }
  }

  getDiagnostics(): TacticalPositionCandidateOverlayDiagnostics {
    return {
      visible: this.container.visible,
      markerCount: this.markerCount,
      graphicsCount: 1,
      textCount: this.labels.children.length,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.labels.removeChildren().forEach((child) => child.destroy());
    this.graphics.destroy();
    this.labels.destroy();
    this.container.destroy();
  }
}

function drawKindMarker(
  graphics: Graphics,
  kind: TacticalPositionKind,
  x: number,
  y: number,
  radius: number,
  fill: number,
  stroke: number,
  emphasized: boolean,
): void {
  const width = emphasized ? 3 : 2;
  if (kind === 'observation') {
    graphics
      .ellipse(x, y, radius * 1.15, radius * 0.72)
      .fill({ color: fill, alpha: 0.98 })
      .stroke({ color: stroke, width, alpha: 1 })
      .circle(x, y, radius * 0.24)
      .fill({ color: 0x10262b, alpha: 1 });
    return;
  }
  if (kind === 'defense') {
    graphics
      .poly([
        x, y - radius,
        x + radius * 0.86, y - radius * 0.42,
        x + radius * 0.66, y + radius * 0.72,
        x, y + radius,
        x - radius * 0.66, y + radius * 0.72,
        x - radius * 0.86, y - radius * 0.42,
      ])
      .fill({ color: fill, alpha: 0.98 })
      .stroke({ color: stroke, width, alpha: 1 });
    return;
  }
  graphics
    .poly([
      x + radius, y,
      x - radius * 0.72, y - radius * 0.82,
      x - radius * 0.42, y,
      x - radius * 0.72, y + radius * 0.82,
    ])
    .fill({ color: fill, alpha: 0.98 })
    .stroke({ color: stroke, width, alpha: 1 });
}

function canonicalKind(value: unknown): TacticalPositionKind | null {
  if (value === 'observation' || value === 'firing') return value;
  if (value === 'defense' || value === 'cover') return 'defense';
  return null;
}

function postureGlyph(posture: 'standing' | 'crouched' | 'prone'): string {
  if (posture === 'standing') return 'С';
  if (posture === 'crouched') return 'П';
  return 'Л';
}
