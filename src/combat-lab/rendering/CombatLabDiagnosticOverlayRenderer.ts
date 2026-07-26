import { Container, Graphics, Text } from 'pixi.js';
import { gridToWorld } from '../../core/map/MapModel';
import type { UnitModel } from '../../core/units/UnitModel';
import type { CombatLabDiagnosticLayerId } from '../../core/testing/combat-lab';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

export const MAX_COMBAT_LAB_TRAIL_POINTS = 4096;
const MAX_RENDERED_IMPACTS = 256;

interface TrailPoint {
  readonly projectileId: string;
  readonly xMetres: number;
  readonly yMetres: number;
}

interface LayerState {
  enabled: boolean;
}

export class CombatLabDiagnosticOverlayRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labels = new Map<string, Text>();
  private readonly trailPoints: TrailPoint[] = [];
  private readonly lastTrailPointByProjectile = new Map<string, TrailPoint>();
  private readonly layers = new Map<CombatLabDiagnosticLayerId, LayerState>();
  private destroyed = false;

  constructor(
    parent: Container,
    private session: CombatLabVisualSession,
  ) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
    this.enableRecommendedLayers();
    this.render();
  }

  bindSession(session: CombatLabVisualSession): void {
    this.session = session;
    this.clearHistory();
    this.clearLabels();
    this.enableRecommendedLayers();
    this.render();
  }

  setLayerEnabled(layerId: CombatLabDiagnosticLayerId, enabled: boolean): void {
    const layer = this.layers.get(layerId) ?? { enabled: false };
    layer.enabled = enabled;
    this.layers.set(layerId, layer);
    if (layerId === 'projectile_trails' && !enabled) this.clearHistory();
    this.render();
  }

  isLayerEnabled(layerId: CombatLabDiagnosticLayerId): boolean {
    return this.layers.get(layerId)?.enabled ?? false;
  }

  captureFrame(): void {
    if (this.destroyed || !this.layerEnabled('projectile_trails')) return;
    for (const projectile of this.session.state.infantryCombatProjectiles.activeProjectiles) {
      const next: TrailPoint = {
        projectileId: projectile.projectileId,
        xMetres: projectile.position.xMetres,
        yMetres: projectile.position.yMetres,
      };
      const previous = this.lastTrailPointByProjectile.get(projectile.projectileId);
      if (previous && Math.hypot(next.xMetres - previous.xMetres, next.yMetres - previous.yMetres) < 0.2) continue;
      this.trailPoints.push(next);
      this.lastTrailPointByProjectile.set(projectile.projectileId, next);
    }
    if (this.trailPoints.length > MAX_COMBAT_LAB_TRAIL_POINTS) {
      this.trailPoints.splice(0, this.trailPoints.length - MAX_COMBAT_LAB_TRAIL_POINTS);
    }
  }

  clearHistory(): void {
    this.trailPoints.length = 0;
    this.lastTrailPointByProjectile.clear();
  }

  forceRender(): void {
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearHistory();
    this.clearLabels();
    this.graphics.destroy();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }

  private render(): void {
    if (this.destroyed) return;
    const state = this.session.state;
    this.graphics.clear();

    if (this.layerEnabled('projectile_trails')) this.drawTrails();
    if (this.layerEnabled('impacts') || this.layerEnabled('last_hit_zone')) this.drawImpacts();
    if (this.layerEnabled('active_projectiles')) {
      for (const projectile of state.infantryCombatProjectiles.activeProjectiles) {
        const point = this.worldPoint(projectile.position.xMetres, projectile.position.yMetres);
        this.graphics.circle(point.x, point.y, 2.4).fill({ color: 0xffe092 });
      }
    }

    const visibleLabels = new Set<string>();
    for (const unit of state.units) {
      const point = gridToWorld(state.map, unit.position);
      if (this.layerEnabled('suppression_events') && unit.infantryCombatRuntime.suppression.lastEventKind) {
        const level = unit.infantryCombatRuntime.suppression.suppressionLevel;
        this.graphics.circle(point.x, point.y, state.map.cellSize * (0.3 + level * 0.8))
          .stroke({ color: 0xf1ad52, width: 1.5, alpha: 0.4 + level * 0.5 });
      }
      this.drawAim(unit, point.x, point.y);
      this.drawDeployment(unit);
      if (this.layerEnabled('unit_ids')) {
        const id = `unit:${unit.id}`;
        visibleLabels.add(id);
        this.updateLabel(id, unit.id, point.x + 8, point.y - 14, 11, 0xf4f0dc);
      }
    }

    if (this.layerEnabled('distances')) {
      for (const distance of this.session.definition.controlDistances) {
        const from = state.units.find((unit) => unit.id === distance.fromUnitId);
        const to = state.units.find((unit) => unit.id === distance.toUnitId);
        if (!from || !to) continue;
        const a = gridToWorld(state.map, from.position);
        const b = gridToWorld(state.map, to.position);
        this.graphics.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ color: 0xd7e0cf, width: 1, alpha: 0.32 });
        const id = `distance:${distance.labelRu}`;
        visibleLabels.add(id);
        this.updateLabel(id, `${distance.metres} м`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 6, 10, 0xd7e0cf);
      }
    }

    for (const [id, label] of this.labels) label.visible = visibleLabels.has(id);
  }

  private drawTrails(): void {
    let previous: TrailPoint | null = null;
    for (const point of this.trailPoints) {
      if (previous && previous.projectileId === point.projectileId) {
        const a = this.worldPoint(previous.xMetres, previous.yMetres);
        const b = this.worldPoint(point.xMetres, point.yMetres);
        this.graphics.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ color: 0xe8d18b, width: 1, alpha: 0.38 });
      }
      previous = point;
    }
  }

  private drawImpacts(): void {
    const state = this.session.state;
    for (const impact of state.infantryCombatProjectiles.impacts.slice(-MAX_RENDERED_IMPACTS)) {
      const point = this.worldPoint(impact.point.xMetres, impact.point.yMetres);
      const color = impact.hitType === 'unit' ? 0xff6b5f : impact.hitType === 'object' ? 0xe4b168 : 0xb8a27d;
      if (this.layerEnabled('impacts')) {
        this.graphics.moveTo(point.x - 4, point.y - 4).lineTo(point.x + 4, point.y + 4);
        this.graphics.moveTo(point.x + 4, point.y - 4).lineTo(point.x - 4, point.y + 4)
          .stroke({ color, width: 1.5 });
      }
      if (this.layerEnabled('last_hit_zone') && impact.hitZone) {
        this.graphics.circle(point.x, point.y, 7).stroke({ color, width: 1, alpha: 0.7 });
      }
    }
  }

  private drawAim(unit: UnitModel, fromX: number, fromY: number): void {
    const task = unit.infantryCombatRuntime.activeFireTask;
    if (!task) return;
    const to = this.worldPoint(task.target.xMetres, task.target.yMetres);
    if (this.layerEnabled('aim_direction')) {
      this.graphics.moveTo(fromX, fromY).lineTo(to.x, to.y)
        .stroke({ color: 0x8bd5ff, width: 1.4, alpha: 0.78 });
    }
    if (this.layerEnabled('target_point')) {
      const radius = Math.max(3, task.targetRadiusMetres / this.session.state.map.metersPerCell * this.session.state.map.cellSize);
      this.graphics.circle(to.x, to.y, radius).stroke({ color: 0x8bd5ff, width: 1, alpha: 0.65 });
    }
  }

  private drawDeployment(unit: UnitModel): void {
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    const deployment = weapon?.deployment;
    if (!weapon || !deployment?.anchor) return;
    const anchor = this.worldPoint(deployment.anchor.xMetres, deployment.anchor.yMetres);
    if (this.layerEnabled('dp27_anchor')) {
      this.graphics.circle(anchor.x, anchor.y, 6).stroke({ color: 0x82f0c2, width: 2 });
    }
    if (!this.layerEnabled('dp27_sector') || deployment.traverseCenterRadians === null) return;
    const halfArc = weapon.resolved.weapon.deployedTraverseArcRadians / 2;
    const radius = this.session.state.map.cellSize * 3;
    const left = deployment.traverseCenterRadians - halfArc;
    const right = deployment.traverseCenterRadians + halfArc;
    this.graphics.moveTo(anchor.x, anchor.y).lineTo(anchor.x + Math.cos(left) * radius, anchor.y + Math.sin(left) * radius);
    this.graphics.moveTo(anchor.x, anchor.y).lineTo(anchor.x + Math.cos(right) * radius, anchor.y + Math.sin(right) * radius)
      .stroke({ color: 0x82f0c2, width: 1.5, alpha: 0.8 });
  }

  private worldPoint(xMetres: number, yMetres: number): { x: number; y: number } {
    const state = this.session.state;
    return gridToWorld(state.map, {
      x: xMetres / state.map.metersPerCell,
      y: yMetres / state.map.metersPerCell,
    });
  }

  private updateLabel(id: string, text: string, x: number, y: number, fontSize: number, fill: number): void {
    let label = this.labels.get(id);
    if (!label) {
      label = new Text({ text, style: { fontFamily: 'Arial, sans-serif', fontSize, fill } });
      label.eventMode = 'none';
      this.labels.set(id, label);
      this.container.addChild(label);
    }
    label.text = text;
    label.position.set(x, y);
    label.visible = true;
  }

  private clearLabels(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }

  private enableRecommendedLayers(): void {
    for (const layerId of this.session.definition.visualPreset.recommendedLayerIds) {
      this.layers.set(layerId, { enabled: true });
    }
  }

  private layerEnabled(layerId: CombatLabDiagnosticLayerId): boolean {
    return this.layers.get(layerId)?.enabled ?? false;
  }
}
