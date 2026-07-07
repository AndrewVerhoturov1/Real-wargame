import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const ARC_STEPS = 18;

export class PixiViewConeRenderer {
  readonly container = new Container();

  render(map: TacticalMap, units: UnitModel[], selectedUnitIds: string[]): void {
    this.container.removeChildren();
    const selectedIds = new Set(selectedUnitIds);

    for (const unit of units) {
      const center = gridToWorld(map, unit.position);
      const rangePx = unit.viewRangeCells * map.cellSize;
      const halfAngle = unit.viewAngleRadians / 2;
      const startAngle = unit.facingRadians - halfAngle;
      const endAngle = unit.facingRadians + halfAngle;
      const isSelected = selectedIds.has(unit.id);
      const graphics = new Graphics();

      graphics.beginFill(0xf1d77a, isSelected ? 0.16 : 0.07);
      graphics.lineStyle(isSelected ? 2 : 1, 0xf1d77a, isSelected ? 0.42 : 0.22);
      graphics.moveTo(center.x, center.y);

      for (let index = 0; index <= ARC_STEPS; index += 1) {
        const t = index / ARC_STEPS;
        const angle = startAngle + (endAngle - startAngle) * t;
        graphics.lineTo(
          center.x + Math.cos(angle) * rangePx,
          center.y + Math.sin(angle) * rangePx,
        );
      }

      graphics.lineTo(center.x, center.y);
      graphics.endFill();
      this.container.addChild(graphics);
    }
  }
}
