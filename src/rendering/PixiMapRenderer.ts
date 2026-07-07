import { Container, Graphics } from 'pixi.js';
import type { MapObject, TacticalMap } from '../core/map/MapModel';
import { TERRAIN_STYLE } from './terrainStyle';

export class PixiMapRenderer {
  readonly container = new Container();

  render(map: TacticalMap, showGrid = true): void {
    this.container.removeChildren();

    for (const cell of map.cells) {
      const style = TERRAIN_STYLE[cell.terrain];
      const x = cell.x * map.cellSize;
      const y = cell.y * map.cellSize;
      const graphics = new Graphics();

      if (showGrid) {
        graphics.lineStyle(1, 0x1b2417, 0.28);
      }

      graphics.beginFill(style.fill, 1);
      graphics.drawRect(x, y, map.cellSize, map.cellSize);
      graphics.endFill();

      this.container.addChild(graphics);
    }

    for (const object of map.objects) {
      this.container.addChild(renderMapObject(map, object));
    }

    const border = new Graphics();
    border.lineStyle(3, 0x10160f, 0.85);
    border.drawRect(0, 0, map.width * map.cellSize, map.height * map.cellSize);
    this.container.addChild(border);
  }
}

function renderMapObject(map: TacticalMap, object: MapObject): Graphics {
  const graphics = new Graphics();
  const x = (object.x + 0.5) * map.cellSize;
  const y = (object.y + 0.5) * map.cellSize;
  const width = object.widthCells * map.cellSize;
  const height = object.heightCells * map.cellSize;

  graphics.position.set(x, y);
  graphics.rotation = object.rotationRadians;

  switch (object.kind) {
    case 'tree':
      graphics.lineStyle(2, 0x1b2818, 0.8);
      graphics.beginFill(0x7a4d2d, 1);
      graphics.drawRect(-3, 2, 6, 11);
      graphics.endFill();
      graphics.beginFill(0x214d2c, 1);
      graphics.drawCircle(0, -2, 13);
      graphics.endFill();
      break;
    case 'rock':
      graphics.lineStyle(2, 0x2d3029, 0.7);
      graphics.beginFill(0x77786f, 1);
      graphics.drawPolygon([-12, -3, -4, -12, 11, -8, 14, 6, 3, 13, -11, 8]);
      graphics.endFill();
      break;
    case 'structure':
      graphics.lineStyle(2, 0x241d17, 0.9);
      graphics.beginFill(0x6c563f, 1);
      graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 4);
      graphics.endFill();
      graphics.lineStyle(2, 0x3a2c22, 0.9);
      graphics.moveTo(-width / 2, 0);
      graphics.lineTo(width / 2, 0);
      break;
    case 'cover':
      drawSegmentedCover(graphics, width, height, 0xb9a56a, 0x4b3f28);
      break;
    case 'ditch':
      graphics.lineStyle(4, 0x2a1f15, 0.95);
      graphics.beginFill(0x45311f, 1);
      graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 8);
      graphics.endFill();
      graphics.lineStyle(2, 0x1b140f, 0.85);
      graphics.moveTo(-width / 2 + 8, 0);
      graphics.lineTo(width / 2 - 8, 0);
      break;
    case 'crates':
      graphics.lineStyle(2, 0x251b12, 0.9);
      graphics.beginFill(0x8f6a3d, 1);
      graphics.drawRect(-14, -12, 13, 13);
      graphics.drawRect(1, -12, 13, 13);
      graphics.drawRect(-6, 2, 13, 13);
      graphics.endFill();
      break;
    case 'fence':
      graphics.lineStyle(3, 0x5c422a, 0.95);
      graphics.moveTo(-width / 2, 0);
      graphics.lineTo(width / 2, 0);
      for (let offset = -width / 2; offset <= width / 2; offset += 18) {
        graphics.moveTo(offset, -7);
        graphics.lineTo(offset, 7);
      }
      break;
    case 'post':
      graphics.lineStyle(3, 0x33251a, 0.95);
      graphics.beginFill(0x8a6a42, 1);
      graphics.drawRect(-12, -12, 24, 24);
      graphics.endFill();
      graphics.moveTo(-15, -15);
      graphics.lineTo(15, 15);
      graphics.moveTo(15, -15);
      graphics.lineTo(-15, 15);
      break;
    case 'logs':
      graphics.lineStyle(4, 0x5a351c, 0.95);
      graphics.moveTo(-15, -8);
      graphics.lineTo(15, -8);
      graphics.moveTo(-16, 0);
      graphics.lineTo(16, 0);
      graphics.moveTo(-13, 8);
      graphics.lineTo(13, 8);
      break;
    case 'well':
      graphics.lineStyle(3, 0x2b2b2b, 0.85);
      graphics.beginFill(0x808070, 1);
      graphics.drawCircle(0, 0, 13);
      graphics.endFill();
      graphics.beginFill(0x293844, 1);
      graphics.drawCircle(0, 0, 7);
      graphics.endFill();
      break;
    case 'bridge':
      graphics.lineStyle(3, 0x403225, 0.95);
      graphics.beginFill(0x8b7459, 1);
      graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 5);
      graphics.endFill();
      graphics.lineStyle(2, 0x5c4936, 0.9);
      graphics.moveTo(-width / 2 + 6, -height / 3);
      graphics.lineTo(width / 2 - 6, -height / 3);
      graphics.moveTo(-width / 2 + 6, height / 3);
      graphics.lineTo(width / 2 - 6, height / 3);
      break;
  }

  return graphics;
}

function drawSegmentedCover(
  graphics: Graphics,
  width: number,
  height: number,
  fill: number,
  stroke: number,
): void {
  graphics.lineStyle(2, stroke, 0.9);
  graphics.beginFill(fill, 1);

  const segmentWidth = 18;
  for (let x = -width / 2; x < width / 2; x += segmentWidth) {
    graphics.drawRoundedRect(x, -height / 2, segmentWidth - 2, height, 6);
  }

  graphics.endFill();
}
