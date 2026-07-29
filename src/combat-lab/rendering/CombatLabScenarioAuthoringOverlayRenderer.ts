import { Container, Graphics, Text } from 'pixi.js';
import type {
  CombatLabExperimentV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
  CombatLabTrackV1,
} from '../../core/testing/combat-lab/experiment';

const MAX_RELATION_LABELS = 64;

export interface CombatLabScenarioAuthoringOverlaySelectionV1 {
  readonly trackId: string;
  readonly stepId: string;
}

export class CombatLabScenarioAuthoringOverlayRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labels = new Map<string, Text>();
  private experiment: CombatLabExperimentV1 | null = null;
  private selection: CombatLabScenarioAuthoringOverlaySelectionV1 | null = null;
  private destroyed = false;

  constructor(parent: Container) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
  }

  setExperiment(experiment: CombatLabExperimentV1): void {
    if (this.destroyed) return;
    this.experiment = experiment;
    this.render();
  }

  setSelection(selection: CombatLabScenarioAuthoringOverlaySelectionV1 | null): void {
    if (this.destroyed) return;
    this.selection = selection ? { ...selection } : null;
    this.render();
  }

  clear(): void {
    if (this.destroyed) return;
    this.experiment = null;
    this.selection = null;
    this.graphics.clear();
    this.clearLabels();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.experiment = null;
    this.selection = null;
    this.clearLabels();
    this.graphics.destroy();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }

  private render(): void {
    if (this.destroyed) return;
    this.graphics.clear();
    const experiment = this.experiment;
    if (!experiment) {
      this.hideAllLabels();
      return;
    }

    const visibleLabels = new Set<string>();
    for (const marker of experiment.markers) this.drawMarker(experiment, marker, visibleLabels);
    const selected = this.resolveSelected(experiment);
    if (selected) {
      this.drawSelectedGuide(experiment, selected.track, selected.step, visibleLabels);
      this.drawSelectedTrackRelations(experiment, selected.track, visibleLabels);
    }
    for (const [id, label] of this.labels) label.visible = visibleLabels.has(id);
  }

  private drawMarker(
    experiment: CombatLabExperimentV1,
    marker: CombatLabMarkerV1,
    visibleLabels: Set<string>,
  ): void {
    const point = metresToWorld(experiment, marker.xMetres, marker.yMetres);
    const selectedTarget = this.isSelectedMarkerTarget(experiment, marker.markerId);
    const color = selectedTarget ? 0xffe28a : marker.kind === 'circle' ? 0x8bc6ff : 0x9de18f;
    if (marker.kind === 'circle') {
      const radius = metresToPixels(experiment, marker.radiusMetres);
      this.graphics.circle(point.x, point.y, radius)
        .fill({ color, alpha: selectedTarget ? 0.13 : 0.07 })
        .stroke({ color, width: selectedTarget ? 2.2 : 1.3, alpha: 0.88 });
    } else {
      const size = selectedTarget ? 7 : 5;
      this.graphics.moveTo(point.x - size, point.y).lineTo(point.x + size, point.y);
      this.graphics.moveTo(point.x, point.y - size).lineTo(point.x, point.y + size)
        .stroke({ color, width: selectedTarget ? 2.2 : 1.5, alpha: 0.95 });
      this.graphics.circle(point.x, point.y, selectedTarget ? 4 : 3).fill({ color, alpha: 0.9 });
    }
    const labelId = `marker:${marker.markerId}`;
    visibleLabels.add(labelId);
    this.updateLabel(labelId, `${marker.titleRu} · ${marker.markerId}`, point.x + 8, point.y - 16, selectedTarget ? 11 : 10, color);
  }

  private drawSelectedGuide(
    experiment: CombatLabExperimentV1,
    track: CombatLabTrackV1,
    step: CombatLabScenarioStepV1,
    visibleLabels: Set<string>,
  ): void {
    const actor = roleScenePoint(experiment, track.actorRoleId);
    const target = actionTargetPoint(experiment, step);
    if (!target) return;
    if (actor) {
      this.graphics.moveTo(actor.x, actor.y).lineTo(target.x, target.y)
        .stroke({ color: 0xffe28a, width: 2, alpha: 0.78 });
      this.graphics.circle(actor.x, actor.y, 5).stroke({ color: 0xffe28a, width: 1.5, alpha: 0.9 });
    }
    this.graphics.circle(target.x, target.y, 9).stroke({ color: 0xffe28a, width: 2.2, alpha: 0.95 });
    const id = 'selected-step';
    visibleLabels.add(id);
    this.updateLabel(id, `${track.titleRu} · ${step.titleRu}`, target.x + 11, target.y + 4, 11, 0xffe28a);
  }

  private drawSelectedTrackRelations(
    experiment: CombatLabExperimentV1,
    track: CombatLabTrackV1,
    visibleLabels: Set<string>,
  ): void {
    let rendered = 0;
    for (let index = 0; index < track.steps.length && rendered < MAX_RELATION_LABELS; index += 1) {
      const step = track.steps[index]!;
      const markerId = referencedMarkerId(step);
      if (!markerId) continue;
      const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
      if (!marker) continue;
      const point = metresToWorld(experiment, marker.xMetres, marker.yMetres);
      const id = `relation:${track.trackId}:${step.stepId}`;
      visibleLabels.add(id);
      this.updateLabel(id, String(index + 1), point.x - 6, point.y + 7 + rendered % 3 * 10, 9, 0xf3e7b0);
      rendered += 1;
    }
  }

  private resolveSelected(experiment: CombatLabExperimentV1): { track: CombatLabTrackV1; step: CombatLabScenarioStepV1 } | null {
    if (!this.selection) return null;
    const track = experiment.tracks.find((candidate) => candidate.trackId === this.selection?.trackId);
    const step = track?.steps.find((candidate) => candidate.stepId === this.selection?.stepId);
    return track && step ? { track, step } : null;
  }

  private isSelectedMarkerTarget(experiment: CombatLabExperimentV1, markerId: string): boolean {
    const selected = this.resolveSelected(experiment);
    return selected ? referencedMarkerId(selected.step) === markerId : false;
  }

  private updateLabel(id: string, value: string, x: number, y: number, fontSize: number, fill: number): void {
    let label = this.labels.get(id);
    if (!label) {
      label = new Text({
        text: value,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize,
          fill,
          stroke: { color: 0x111611, width: 3 },
        },
      });
      label.eventMode = 'none';
      this.labels.set(id, label);
      this.container.addChild(label);
    }
    label.text = value;
    label.style.fontSize = fontSize;
    label.style.fill = fill;
    label.position.set(x, y);
    label.visible = true;
  }

  private hideAllLabels(): void {
    for (const label of this.labels.values()) label.visible = false;
  }

  private clearLabels(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }
}

function referencedMarkerId(step: CombatLabScenarioStepV1): string | null {
  const action = step.action;
  if (action.kind === 'move') return action.markerId;
  if (action.kind === 'fire') {
    const target = action.target;
    if (target.kind === 'marker') return target.markerId;
  }
  return null;
}

function actionTargetPoint(experiment: CombatLabExperimentV1, step: CombatLabScenarioStepV1): { x: number; y: number } | null {
  const action = step.action;
  if (action.kind === 'move') {
    const markerId = action.markerId;
    const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
    return marker ? metresToWorld(experiment, marker.xMetres, marker.yMetres) : null;
  }
  if (action.kind === 'fire') {
    if (action.target.kind === 'marker') {
      const markerId = action.target.markerId;
      const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
      return marker ? metresToWorld(experiment, marker.xMetres, marker.yMetres) : null;
    }
    return roleScenePoint(experiment, action.target.roleId);
  }
  if (action.kind === 'transfer' || action.kind === 'first_aid') {
    return roleScenePoint(experiment, action.targetRoleId);
  }
  return null;
}

function roleScenePoint(experiment: CombatLabExperimentV1, roleId: string): { x: number; y: number } | null {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  if (!role) return null;
  const unit = experiment.sceneSnapshot.units.find((candidate) => candidate.id === role.unitId);
  if (!unit) return null;
  const x = finiteRecordNumber(unit, 'x');
  const y = finiteRecordNumber(unit, 'y');
  if (x === null || y === null) return null;
  const map = experiment.sceneSnapshot.map;
  return { x: (x + 0.5) * map.cellSize, y: (y + 0.5) * map.cellSize };
}

function metresToWorld(experiment: CombatLabExperimentV1, xMetres: number, yMetres: number): { x: number; y: number } {
  const map = experiment.sceneSnapshot.map;
  return {
    x: xMetres / map.metersPerCell * map.cellSize,
    y: yMetres / map.metersPerCell * map.cellSize,
  };
}

function metresToPixels(experiment: CombatLabExperimentV1, metres: number): number {
  const map = experiment.sceneSnapshot.map;
  return Math.max(2, metres / map.metersPerCell * map.cellSize);
}

function finiteRecordNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
