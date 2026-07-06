import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

export class PixiOrderRenderer {
  readonly container = new Container();

  render(map: TacticalMap, units: UnitModel[], selectedUnitId: string | null): void {
    this.container.removeChildren();

    for (const unit of units) {
      if (!unit.order) {
        continue;
      }

      const from = gridToWorld(map, unit.position);
      const to = gridToWorld(map, unit.order.target);
      const isSelected = unit.id === selectedUnitId;
      const graphics = new Graphics();

      graphics.lineStyle(isSelected ? 4 : 2, isSelected ? 0xfff2a8 : 0xf1d77a, isSelected ? 0.95 : 0.55);
      graphics.moveTo(from.x, from.y);
      graphics.lineTo(to.x, to.y);

      graphics.lineStyle(2, 0xfff2a8, 0.9);
      graphics.drawCircle(to.x, to.y, 8);
      graphics.moveTo(to.x - 12, to.y);
      graphics.lineTo(to.x + 12, to.y);
      graphics.moveTo(to.x, to.y - 12);
      graphics.lineTo(to.x, to.y + 12);

      this.container.addChild(graphics);
    }
  }
}
