import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_CELL_FRACTION = 0.16;
const MIN_UNIT_RADIUS_PX = 3.5;

export class PixiUnitRenderer {
  readonly container = new Container();

  render(map: TacticalMap, units: UnitModel[], selectedUnitIds: string[]): void {
    this.container.removeChildren();
    const selectedIds = new Set(selectedUnitIds);

    for (const unit of units) {
      const position = gridToWorld(map, unit.position);
      const isSelected = selectedIds.has(unit.id);
      const graphics = new Graphics();
      const unitRadius = getUnitRadius(map);

      drawStressHalo(graphics, position.x, position.y, unit, unitRadius);
      drawUnitBody(graphics, position.x, position.y, unit, unitRadius);
      drawFrontMarker(graphics, position.x, position.y, unit.facingRadians, unit.heldItem, unitRadius);
      drawPostureMarker(graphics, position.x, position.y, unit, unitRadius);

      if (isSelected) {
        const selectionRadius = unitRadius + 5;
        graphics.lineStyle(2, 0xfff2a8, 0.96);
        graphics.drawRoundedRect(
          position.x - selectionRadius,
          position.y - selectionRadius,
          selectionRadius * 2,
          selectionRadius * 2,
          4,
        );
      }

      this.container.addChild(graphics);
    }
  }
}

function drawUnitBody(graphics: Graphics, x: number, y: number, unit: UnitModel, unitRadius: number): void {
  const fill = getUnitFill(unit);

  graphics.lineStyle(1.5, 0x111111, 0.9);

  if (unit.behaviorRuntime.posture === 'prone') {
    graphics.beginFill(fill, 1);
    graphics.drawRoundedRect(x - unitRadius * 1.5, y - unitRadius * 0.45, unitRadius * 3, unitRadius * 0.9, 4);
    graphics.endFill();
    return;
  }

  const radius = unit.behaviorRuntime.posture === 'crouched' ? unitRadius * 0.75 : unitRadius;
  graphics.beginFill(fill, 1);
  graphics.drawCircle(x, y, radius);
  graphics.endFill();
}

function drawPostureMarker(graphics: Graphics, x: number, y: number, unit: UnitModel, unitRadius: number): void {
  if (unit.behaviorRuntime.posture === 'standing') {
    return;
  }

  graphics.lineStyle(1.5, 0xf6edcf, 0.9);

  if (unit.behaviorRuntime.posture === 'crouched') {
    graphics.moveTo(x - unitRadius * 0.8, y + unitRadius * 1.25);
    graphics.lineTo(x + unitRadius * 0.8, y + unitRadius * 1.25);
    return;
  }

  graphics.moveTo(x - unitRadius, y + unitRadius * 1.15);
  graphics.lineTo(x + unitRadius, y + unitRadius * 1.15);
  graphics.moveTo(x - unitRadius * 0.8, y + unitRadius * 1.55);
  graphics.lineTo(x + unitRadius * 0.8, y + unitRadius * 1.55);
}

function drawStressHalo(graphics: Graphics, x: number, y: number, unit: UnitModel, unitRadius: number): void {
  if (unit.behaviorRuntime.stress <= 0) {
    return;
  }

  const alpha = Math.min(0.7, Math.max(0.12, unit.behaviorRuntime.stress / 160));
  graphics.lineStyle(1.5, 0xb6633c, alpha);
  graphics.drawCircle(x, y, unitRadius + 5);
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
  unitRadius: number,
): void {
  const forwardX = Math.cos(facingRadians);
  const forwardY = Math.sin(facingRadians);
  const sideX = Math.cos(facingRadians + Math.PI / 2);
  const sideY = Math.sin(facingRadians + Math.PI / 2);
  const startX = x + forwardX * (unitRadius * 0.6);
  const startY = y + forwardY * (unitRadius * 0.6);
  const length = itemKind === 'support_item' ? unitRadius * 2.2 : itemKind === 'short_item' ? unitRadius * 1.4 : unitRadius * 1.8;
  const endX = startX + forwardX * length;
  const endY = startY + forwardY * length;

  graphics.lineStyle(itemKind === 'support_item' ? 3 : 2, 0x1a1710, 1);
  graphics.moveTo(startX, startY);
  graphics.lineTo(endX, endY);

  graphics.lineStyle(1.5, 0xd2c09a, 0.95);
  graphics.moveTo(startX - sideX * unitRadius * 0.5, startY - sideY * unitRadius * 0.5);
  graphics.lineTo(startX + sideX * unitRadius * 0.5, startY + sideY * unitRadius * 0.5);
}

function getUnitRadius(map: TacticalMap): number {
  return Math.max(MIN_UNIT_RADIUS_PX, map.cellSize * UNIT_RADIUS_CELL_FRACTION);
}
