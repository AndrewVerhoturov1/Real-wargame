import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_PX = 11;

export class PixiUnitRenderer {
  readonly container = new Container();

  render(map: TacticalMap, units: UnitModel[], selectedUnitIds: string[]): void {
    this.container.removeChildren();
    const selectedIds = new Set(selectedUnitIds);

    for (const unit of units) {
      const position = gridToWorld(map, unit.position);
      const isSelected = selectedIds.has(unit.id);
      const graphics = new Graphics();

      drawStressHalo(graphics, position.x, position.y, unit);
      drawUnitBody(graphics, position.x, position.y, unit);
      drawFrontMarker(graphics, position.x, position.y, unit.facingRadians, unit.heldItem);
      drawPostureMarker(graphics, position.x, position.y, unit);

      if (isSelected) {
        graphics.lineStyle(3, 0xfff2a8, 0.96);
        graphics.drawRoundedRect(position.x - 20, position.y - 20, 40, 40, 5);
      }

      this.container.addChild(graphics);
    }
  }
}

function drawUnitBody(graphics: Graphics, x: number, y: number, unit: UnitModel): void {
  const fill = getUnitFill(unit);

  graphics.lineStyle(2, 0x111111, 0.9);

  if (unit.behaviorRuntime.posture === 'prone') {
    graphics.beginFill(fill, 1);
    graphics.drawRoundedRect(x - 15, y - 6, 30, 12, 5);
    graphics.endFill();
    return;
  }

  const radius = unit.behaviorRuntime.posture === 'crouched' ? UNIT_RADIUS_PX - 3 : UNIT_RADIUS_PX;
  graphics.beginFill(fill, 1);
  graphics.drawCircle(x, y, radius);
  graphics.endFill();
}

function drawPostureMarker(graphics: Graphics, x: number, y: number, unit: UnitModel): void {
  if (unit.behaviorRuntime.posture === 'standing') {
    return;
  }

  graphics.lineStyle(2, 0xf6edcf, 0.9);

  if (unit.behaviorRuntime.posture === 'crouched') {
    graphics.moveTo(x - 8, y + 14);
    graphics.lineTo(x + 8, y + 14);
    return;
  }

  graphics.moveTo(x - 12, y + 13);
  graphics.lineTo(x + 12, y + 13);
  graphics.moveTo(x - 10, y + 17);
  graphics.lineTo(x + 10, y + 17);
}

function drawStressHalo(graphics: Graphics, x: number, y: number, unit: UnitModel): void {
  if (unit.behaviorRuntime.stress <= 0) {
    return;
  }

  const alpha = Math.min(0.7, Math.max(0.12, unit.behaviorRuntime.stress / 160));
  graphics.lineStyle(2, 0xb6633c, alpha);
  graphics.drawCircle(x, y, 17);
}

function getUnitFill(unit: UnitModel): number {
  if (unit.behaviorRuntime.state === 'stressed') {
    return 0x743635;
  }

  if (unit.behaviorRuntime.state === 'taking_cover') {
    return 0x8a6b39;
  }

  if (unit.type === 'support_team') {
    return 0x394a6d;
  }

  if (unit.type === 'scout_team') {
    return 0x4c6742;
  }

  return 0x485f35;
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
