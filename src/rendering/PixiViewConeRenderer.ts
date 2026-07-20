import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const ARC_STEPS = 18;
const CONE_COLOR = 0xf1d77a;

export class PixiViewConeRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private lastRenderKey = '';
  private destroyed = false;

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
    this.container.visible = false;
  }

  render(map: TacticalMap, units: readonly UnitModel[], selectedUnitIds: readonly string[]): void {
    if (this.destroyed) return;
    if (!isDangerWorkspaceTabActive()) {
      this.clear();
      return;
    }

    const selectedIds = new Set(selectedUnitIds);
    const renderKey = buildRenderKey(map, units, selectedIds);
    this.container.visible = true;
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;
    this.graphics.clear();

    for (const unit of units) {
      const center = gridToWorld(map, unit.position);
      const rangePx = Math.max(0, unit.viewRangeCells * map.cellSize);
      const halfAngle = Math.max(0, unit.viewAngleRadians / 2);
      if (rangePx <= 0 || halfAngle <= 0) continue;

      const selected = selectedIds.has(unit.id);
      const startAngle = unit.facingRadians - halfAngle;
      const endAngle = unit.facingRadians + halfAngle;
      this.graphics.moveTo(center.x, center.y);
      for (let index = 0; index <= ARC_STEPS; index += 1) {
        const progress = index / ARC_STEPS;
        const angle = startAngle + (endAngle - startAngle) * progress;
        this.graphics.lineTo(
          center.x + Math.cos(angle) * rangePx,
          center.y + Math.sin(angle) * rangePx,
        );
      }
      this.graphics.closePath();
      this.graphics.fill({ color: CONE_COLOR, alpha: selected ? 0.14 : 0.045 });
      this.graphics.stroke({ width: selected ? 2 : 1, color: CONE_COLOR, alpha: selected ? 0.46 : 0.18 });
    }
  }

  clear(): void {
    if (this.destroyed) return;
    if (this.lastRenderKey !== '') this.graphics.clear();
    this.lastRenderKey = '';
    this.container.visible = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
    this.container.removeChild(this.graphics);
    this.graphics.destroy();
    this.container.destroy();
  }
}

function buildRenderKey(
  map: TacticalMap,
  units: readonly UnitModel[],
  selectedIds: ReadonlySet<string>,
): string {
  return [
    map.cellSize,
    ...units.map((unit) => [
      unit.id,
      unit.position.x.toFixed(3),
      unit.position.y.toFixed(3),
      unit.facingRadians.toFixed(4),
      unit.viewRangeCells.toFixed(3),
      unit.viewAngleRadians.toFixed(4),
      selectedIds.has(unit.id) ? 1 : 0,
    ].join(':')),
  ].join('|');
}

function isDangerWorkspaceTabActive(): boolean {
  return Boolean(document.querySelector('.tactical-workspace-shell [data-tab="danger"].active'));
}
