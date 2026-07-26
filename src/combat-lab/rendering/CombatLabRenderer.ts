import { Application, Container, Graphics, Text, type Ticker } from 'pixi.js';
import type { CombatLabDiagnosticLayerId } from '../../core/testing/combat-lab';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

export const MAX_COMBAT_LAB_TRAIL_POINTS = 4096;
const MAX_RENDERED_IMPACTS = 256;
const MAP_PADDING_PX = 28;

interface TrailPoint {
  readonly projectileId: string;
  readonly xMetres: number;
  readonly yMetres: number;
}
interface LayerState { enabled: boolean; }

export class CombatLabRenderer {
  private readonly world = new Container();
  private readonly graphics = new Graphics();
  private readonly labels = new Map<string, Text>();
  private readonly trailPoints: TrailPoint[] = [];
  private readonly lastTrailPointByProjectile = new Map<string, TrailPoint>();
  private readonly layers = new Map<CombatLabDiagnosticLayerId, LayerState>();
  private destroyed = false;

  private constructor(
    private readonly app: Application,
    private readonly root: HTMLElement,
    private readonly session: CombatLabVisualSession,
    private readonly onFrame: () => void,
  ) {
    this.world.eventMode = 'none';
    this.world.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.world.addChild(this.graphics);
    this.app.stage.addChild(this.world);
    this.root.appendChild(this.app.canvas);
    for (const layerId of session.definition.visualPreset.recommendedLayerIds) this.layers.set(layerId, { enabled: true });
    this.app.ticker.add(this.tick);
    this.render();
  }

  static async create(
    root: HTMLElement,
    session: CombatLabVisualSession,
    onFrame: () => void,
  ): Promise<CombatLabRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: root,
      antialias: true,
      preference: 'webgl',
      background: 0x111611,
      backgroundAlpha: 1,
    });
    app.ticker.maxFPS = 60;
    app.canvas.setAttribute('aria-label', 'Карта испытательного полигона');
    return new CombatLabRenderer(app, root, session, onFrame);
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

  clearHistory(): void {
    this.trailPoints.length = 0;
    this.lastTrailPointByProjectile.clear();
  }

  forceRender(): void { this.render(); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
    this.clearHistory();
    this.graphics.destroy();
    this.world.destroy({ children: true });
    this.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
  }

  private readonly tick = (ticker: Ticker): void => {
    const changed = this.session.advance(ticker.elapsedMS / 1000);
    if (changed) this.captureTrailPoints();
    this.render();
    this.onFrame();
  };

  private render(): void {
    if (this.destroyed) return;
    const state = this.session.state;
    const transform = createTransform(
      state.map.width * state.map.metersPerCell,
      state.map.height * state.map.metersPerCell,
      this.app.screen.width,
      this.app.screen.height,
    );
    this.graphics.clear();
    this.graphics.rect(transform.left, transform.top, transform.mapWidthPx, transform.mapHeightPx)
      .fill({ color: 0x263526 })
      .stroke({ color: 0x697d68, width: 1 });
    drawMetreGrid(this.graphics, transform);

    if (this.layer('projectile_trails').enabled) drawTrails(this.graphics, this.trailPoints, transform);
    if (this.layer('impacts').enabled) drawImpacts(this.graphics, state.infantryCombatProjectiles.impacts.slice(-MAX_RENDERED_IMPACTS), transform);
    if (this.layer('active_projectiles').enabled) {
      for (const projectile of state.infantryCombatProjectiles.activeProjectiles) {
        const point = transform.point(projectile.position.xMetres, projectile.position.yMetres);
        this.graphics.circle(point.x, point.y, 2.4).fill({ color: 0xffe092 });
      }
    }

    for (const unit of state.units) {
      const point = transform.point(unit.position.x * state.map.metersPerCell, unit.position.y * state.map.metersPerCell);
      const selected = state.selectedUnitId === unit.id;
      const radius = unit.behaviorRuntime.posture === 'prone' ? 4 : unit.behaviorRuntime.posture === 'crouched' ? 5 : 6;
      if (unit.behaviorRuntime.posture === 'prone') {
        this.graphics.roundRect(point.x - 8, point.y - 3, 16, 6, 2)
          .fill({ color: unit.side === 'blue' ? 0x4f8fe5 : 0xd94b45 })
          .stroke({ color: selected ? 0xffef9a : 0x101510, width: selected ? 3 : 1 });
      } else {
        this.graphics.circle(point.x, point.y, radius)
          .fill({ color: unit.side === 'blue' ? 0x4f8fe5 : 0xd94b45 })
          .stroke({ color: selected ? 0xffef9a : 0x101510, width: selected ? 3 : 1 });
      }
      drawFacing(this.graphics, point.x, point.y, unit.facingRadians, 14);
      if (this.layer('suppression_events').enabled && unit.infantryCombatRuntime.suppression.lastEventKind) {
        const level = unit.infantryCombatRuntime.suppression.suppressionLevel;
        this.graphics.circle(point.x, point.y, 10 + level * 18).stroke({ color: 0xf1ad52, width: 1.5, alpha: 0.4 + level * 0.5 });
      }
      if (this.layer('aim_direction').enabled) drawAim(this.graphics, state.map.metersPerCell, unit, transform);
      if (this.layer('dp27_anchor').enabled || this.layer('dp27_sector').enabled) drawDeployment(this.graphics, unit, transform, this.layers);
      this.updateLabel(`unit:${unit.id}`, this.layer('unit_ids').enabled ? unit.id : unit.labels.ru, point.x + 8, point.y - 12, 11, 0xf4f0dc);
    }

    if (this.layer('distances').enabled) {
      for (const distance of this.session.definition.controlDistances) {
        const from = state.units.find((unit) => unit.id === distance.fromUnitId);
        const to = state.units.find((unit) => unit.id === distance.toUnitId);
        if (!from || !to) continue;
        const a = transform.point(from.position.x * state.map.metersPerCell, from.position.y * state.map.metersPerCell);
        const b = transform.point(to.position.x * state.map.metersPerCell, to.position.y * state.map.metersPerCell);
        this.graphics.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xaebda5, width: 1, alpha: 0.35 });
        this.updateLabel(`distance:${distance.labelRu}`, `${distance.metres} м`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 6, 10, 0xd7e0cf);
      }
    }
    this.hideUnusedLabels(new Set([
      ...state.units.map((unit) => `unit:${unit.id}`),
      ...(this.layer('distances').enabled ? this.session.definition.controlDistances.map((distance) => `distance:${distance.labelRu}`) : []),
    ]));
  }

  private captureTrailPoints(): void {
    if (!this.layer('projectile_trails').enabled) return;
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

  private layer(id: CombatLabDiagnosticLayerId): LayerState {
    const layer = this.layers.get(id) ?? { enabled: false };
    this.layers.set(id, layer);
    return layer;
  }

  private updateLabel(id: string, text: string, x: number, y: number, fontSize: number, fill: number): void {
    let label = this.labels.get(id);
    if (!label) {
      label = new Text({ text, style: { fontFamily: 'Arial, sans-serif', fontSize, fill } });
      label.eventMode = 'none';
      this.labels.set(id, label);
      this.world.addChild(label);
    }
    label.text = text;
    label.position.set(x, y);
    label.visible = true;
  }

  private hideUnusedLabels(visible: Set<string>): void {
    for (const [id, label] of this.labels) label.visible = visible.has(id);
  }
}

function createTransform(mapWidthMetres: number, mapHeightMetres: number, width: number, height: number) {
  const scale = Math.max(0.1, Math.min((width - MAP_PADDING_PX * 2) / mapWidthMetres, (height - MAP_PADDING_PX * 2) / mapHeightMetres));
  const mapWidthPx = mapWidthMetres * scale;
  const mapHeightPx = mapHeightMetres * scale;
  const left = (width - mapWidthPx) / 2;
  const top = (height - mapHeightPx) / 2;
  return { left, top, scale, mapWidthPx, mapHeightPx, point: (xMetres: number, yMetres: number) => ({ x: left + xMetres * scale, y: top + yMetres * scale }) };
}
function drawMetreGrid(graphics: Graphics, transform: ReturnType<typeof createTransform>): void {
  if (transform.scale < 1.2) return;
  const stepMetres = transform.scale >= 5 ? 10 : 25;
  for (let x = stepMetres; x * transform.scale < transform.mapWidthPx; x += stepMetres) {
    const px = transform.left + x * transform.scale;
    graphics.moveTo(px, transform.top).lineTo(px, transform.top + transform.mapHeightPx).stroke({ color: 0x829181, width: 1, alpha: 0.12 });
  }
  for (let y = stepMetres; y * transform.scale < transform.mapHeightPx; y += stepMetres) {
    const py = transform.top + y * transform.scale;
    graphics.moveTo(transform.left, py).lineTo(transform.left + transform.mapWidthPx, py).stroke({ color: 0x829181, width: 1, alpha: 0.12 });
  }
}
function drawTrails(graphics: Graphics, points: readonly TrailPoint[], transform: ReturnType<typeof createTransform>): void {
  let previous: TrailPoint | null = null;
  for (const point of points) {
    if (previous && previous.projectileId === point.projectileId) {
      const a = transform.point(previous.xMetres, previous.yMetres);
      const b = transform.point(point.xMetres, point.yMetres);
      graphics.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xe8d18b, width: 1, alpha: 0.38 });
    }
    previous = point;
  }
}
function drawImpacts(graphics: Graphics, impacts: readonly { point: { xMetres: number; yMetres: number }; hitType: string; hitZone: string | null }[], transform: ReturnType<typeof createTransform>): void {
  for (const impact of impacts) {
    const point = transform.point(impact.point.xMetres, impact.point.yMetres);
    const color = impact.hitType === 'unit' ? 0xff6b5f : impact.hitType === 'object' ? 0xe4b168 : 0xb8a27d;
    graphics.moveTo(point.x - 4, point.y - 4).lineTo(point.x + 4, point.y + 4);
    graphics.moveTo(point.x + 4, point.y - 4).lineTo(point.x - 4, point.y + 4).stroke({ color, width: 1.5 });
    if (impact.hitZone) graphics.circle(point.x, point.y, 7).stroke({ color, width: 1, alpha: 0.7 });
  }
}
function drawFacing(graphics: Graphics, x: number, y: number, radians: number, length: number): void {
  graphics.moveTo(x, y).lineTo(x + Math.cos(radians) * length, y + Math.sin(radians) * length).stroke({ color: 0xf7f2d6, width: 1.5 });
}
function drawAim(graphics: Graphics, metresPerCell: number, unit: CombatLabVisualSession['state']['units'][number], transform: ReturnType<typeof createTransform>): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  const from = transform.point(unit.position.x * metresPerCell, unit.position.y * metresPerCell);
  const to = transform.point(task.target.xMetres, task.target.yMetres);
  graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0x8bd5ff, width: 1.4, alpha: 0.78 });
  graphics.circle(to.x, to.y, Math.max(3, task.targetRadiusMetres * transform.scale)).stroke({ color: 0x8bd5ff, width: 1, alpha: 0.65 });
}
function drawDeployment(graphics: Graphics, unit: CombatLabVisualSession['state']['units'][number], transform: ReturnType<typeof createTransform>, layers: Map<CombatLabDiagnosticLayerId, LayerState>): void {
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  const deployment = weapon?.deployment;
  if (!weapon || !deployment?.anchor) return;
  const anchor = transform.point(deployment.anchor.xMetres, deployment.anchor.yMetres);
  if (layers.get('dp27_anchor')?.enabled) graphics.circle(anchor.x, anchor.y, 6).stroke({ color: 0x82f0c2, width: 2 });
  if (!layers.get('dp27_sector')?.enabled || deployment.traverseCenterRadians === null) return;
  const halfArc = weapon.resolved.weapon.deployedTraverseArcRadians / 2;
  const radius = 48;
  const left = deployment.traverseCenterRadians - halfArc;
  const right = deployment.traverseCenterRadians + halfArc;
  graphics.moveTo(anchor.x, anchor.y).lineTo(anchor.x + Math.cos(left) * radius, anchor.y + Math.sin(left) * radius);
  graphics.moveTo(anchor.x, anchor.y).lineTo(anchor.x + Math.cos(right) * radius, anchor.y + Math.sin(right) * radius).stroke({ color: 0x82f0c2, width: 1.5, alpha: 0.8 });
}
