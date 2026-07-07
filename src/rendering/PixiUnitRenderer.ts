import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_PX = 11;

export class PixiUnitRenderer {
  readonly container = new Container();

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

      drawFrontMarker(graphics, position.x, position.y, unit.facingRadians, unit.heldItem);

      graphics.lineStyle(2, 0xe2d9b8, 0.95);
      graphics.moveTo(position.x - 4, position.y - 4);
      graphics.lineTo(position.x + 4, position.y + 4);
      graphics.moveTo(position.x + 4, position.y - 4);
      graphics.lineTo(position.x - 4, position.y + 4);

      if (isSelected) {
        graphics.lineStyle(3, 0xfff2a8, 0.96);
        graphics.drawRoundedRect(position.x - 20, position.y - 20, 40, 40, 5);
      }

      this.container.addChild(graphics);
    }
  }
}

function drawFrontMarker(
  graphics: Graphics,
  x: number,
  y: number,
  facingRadians: number,
  itemKind: UnitModel['heldItem'],
): void {
  const forwardX = Math.cos(facingRadians);
  const forwardY = Math.sin(facingRadians);
  const sideX = Math.cos(facingRadians + Math.PI / 2);
  const sideY = Math.sin(facingRadians + Math.PI / 2);
  const startX = x + forwardX * 6;
  const startY = y + forwardY * 6;
  const length = itemKind === 'support_item' ? 22 : itemKind === 'short_item' ? 14 : 18;
  const endX = startX + forwardX * length;
  const endY = startY + forwardY * length;

  graphics.lineStyle(itemKind === 'support_item' ? 5 : 3, 0x1a1710, 1);
  graphics.moveTo(startX, startY);
  graphics.lineTo(endX, endY);

  graphics.lineStyle(2, 0xd2c09a, 0.95);
  graphics.moveTo(startX - sideX * 6, startY - sideY * 6);
  graphics.lineTo(startX + sideX * 6, startY + sideY * 6);
}
