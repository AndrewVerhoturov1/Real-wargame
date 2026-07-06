import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_PX = 11;

export class PixiUnitRenderer {
  readonly container = new Container();

  private readonly labelStyle = new TextStyle({
    fill: 0xf4ecd1,
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    stroke: 0x111111,
    strokeThickness: 3,
  });

  render(map: TacticalMap, units: UnitModel[], selectedUnitId: string | null): void {
    this.container.removeChildren();

    for (const unit of units) {
      const position = gridToWorld(map, unit.position);
      const isSelected = unit.id === selectedUnitId;
      const graphics = new Graphics();

      graphics.lineStyle(2, 0x111111, 0.9);
      graphics.beginFill(unit.type === 'support_team' ? 0x394a6d : 0x485f35, 1);
      graphics.drawCircle(position.x, position.y, UNIT_RADIUS_PX);
      graphics.endFill();

      graphics.lineStyle(2, 0xe2d9b8, 0.95);
      graphics.moveTo(position.x - 7, position.y);
      graphics.lineTo(position.x + 7, position.y);
      graphics.moveTo(position.x, position.y - 7);
      graphics.lineTo(position.x, position.y + 7);

      if (isSelected) {
        graphics.lineStyle(3, 0xfff2a8, 0.96);
        graphics.drawRoundedRect(position.x - 20, position.y - 20, 40, 40, 5);
      }

      const label = new Text(unit.label, this.labelStyle);
      label.anchor.set(0.5, 0);
      label.x = position.x;
      label.y = position.y + 15;

      this.container.addChild(graphics, label);
    }
  }
}
