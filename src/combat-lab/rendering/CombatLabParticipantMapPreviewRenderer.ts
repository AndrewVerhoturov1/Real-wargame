import { Container, Graphics } from 'pixi.js';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';

export type CombatLabParticipantMapPreviewEventV1 =
  | { readonly kind: 'placement'; readonly roleId: string; readonly x: number; readonly y: number }
  | { readonly kind: 'facing'; readonly roleId: string; readonly x: number; readonly y: number; readonly facingDegrees: number };

export class CombatLabParticipantMapPreviewRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private experiment: CombatLabExperimentV1 | null = null;
  private preview: CombatLabParticipantMapPreviewEventV1 | null = null;
  private destroyed = false;

  constructor(parent: Container) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
    window.addEventListener('combat-lab:participant-map-preview', this.handlePreview as EventListener);
  }

  setExperiment(experiment: CombatLabExperimentV1): void {
    if (this.destroyed) return;
    this.experiment = experiment;
    this.render();
  }

  clear(): void {
    if (this.destroyed) return;
    this.preview = null;
    this.graphics.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('combat-lab:participant-map-preview', this.handlePreview as EventListener);
    this.graphics.destroy();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }

  private readonly handlePreview = (event: CustomEvent<CombatLabParticipantMapPreviewEventV1 | null>): void => {
    if (this.destroyed) return;
    this.preview = event.detail ? { ...event.detail } : null;
    this.render();
  };

  private render(): void {
    this.graphics.clear();
    const preview = this.preview;
    const experiment = this.experiment;
    if (!preview || !experiment) return;
    const cellSize = experiment.sceneSnapshot.map.cellSize;
    const x = (preview.x + 0.5) * cellSize;
    const y = (preview.y + 0.5) * cellSize;
    const radius = Math.max(7, cellSize * 0.42);
    const color = preview.kind === 'placement' ? 0x75d9ff : 0xffd166;

    this.graphics.circle(x, y, radius)
      .fill({ color, alpha: 0.14 })
      .stroke({ color, width: 2.5, alpha: 0.96 });
    this.graphics.moveTo(x - radius - 5, y).lineTo(x + radius + 5, y);
    this.graphics.moveTo(x, y - radius - 5).lineTo(x, y + radius + 5)
      .stroke({ color, width: 1.4, alpha: 0.74 });

    if (preview.kind !== 'facing') return;
    const angle = (preview.facingDegrees * Math.PI) / 180;
    const length = Math.max(cellSize * 1.7, 26);
    const tipX = x + Math.cos(angle) * length;
    const tipY = y + Math.sin(angle) * length;
    const wing = Math.max(6, cellSize * 0.24);
    this.graphics.moveTo(x, y).lineTo(tipX, tipY).stroke({ color, width: 3, alpha: 0.98 });
    this.graphics.moveTo(tipX, tipY)
      .lineTo(tipX - Math.cos(angle - Math.PI / 4) * wing, tipY - Math.sin(angle - Math.PI / 4) * wing)
      .moveTo(tipX, tipY)
      .lineTo(tipX - Math.cos(angle + Math.PI / 4) * wing, tipY - Math.sin(angle + Math.PI / 4) * wing)
      .stroke({ color, width: 3, alpha: 0.98 });
  }
}