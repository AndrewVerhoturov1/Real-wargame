import { Container, Graphics, Text } from 'pixi.js';
import type { MapObject, TacticalMap } from '../core/map/MapModel';
import { TERRAIN_STYLE } from './terrainStyle';

export class PixiMapRenderer {
  readonly container = new Container();

  render(
    map: TacticalMap,
    showGrid = true,
    selectedObjectId: string | null = null,
    showObjects = true,
  ): void {
    this.container.removeChildren();

    for (const cell of map.cells) {
      const style = TERRAIN_STYLE[cell.terrain];
      const x = cell.x * map.cellSize;
      const y = cell.y * map.cellSize;
      const graphics = new Graphics();

      graphics.beginFill(style.fill, 1);
      graphics.drawRect(x, y, map.cellSize, map.cellSize);
      graphics.endFill();

      this.container.addChild(graphics);
    }

    if (showGrid) {
      this.container.addChild(renderMeterGrid(map));
      this.container.addChild(renderScaleLabel(map));
    }

    if (showObjects) {
      for (const object of map.objects) {
        this.container.addChild(renderMapObject(map, object, object.id === selectedObjectId));
      }
    }

    const border = new Graphics();
    border.lineStyle(3, 0x10160f, 0.85);
    border.drawRect(0, 0, map.width * map.cellSize, map.height * map.cellSize);
    this.container.addChild(border);
  }
}

function renderMeterGrid(map: TacticalMap): Graphics {
  const graphics = new Graphics();
  const mapWidth = map.width * map.cellSize;
  const mapHeight = map.height * map.cellSize;

  graphics.lineStyle(1, 0xf6edcf, 0.12);

  for (let x = 0; x <= map.width; x += 1) {
    const px = x * map.cellSize;
    graphics.moveTo(px, 0);
    graphics.lineTo(px, mapHeight);
  }

  for (let y = 0; y <= map.height; y += 1) {
    const py = y * map.cellSize;
    graphics.moveTo(0, py);
    graphics.lineTo(mapWidth, py);
  }

  graphics.lineStyle(2, 0xf6edcf, 0.22);

  for (let x = 0; x <= map.width; x += 5) {
    const px = x * map.cellSize;
    graphics.moveTo(px, 0);
    graphics.lineTo(px, mapHeight);
  }

  for (let y = 0; y <= map.height; y += 5) {
    const py = y * map.cellSize;
    graphics.moveTo(0, py);
    graphics.lineTo(mapWidth, py);
  }

  return graphics;
}

function renderScaleLabel(map: TacticalMap): Container {
  const container = new Container();
  const background = new Graphics();
  const label = new Text(`1 клетка = ${map.metersPerCell} м`, {
    fill: 0xfff2a8,
    fontFamily: 'Arial, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
  });

  background.beginFill(0x121612, 0.8);
  background.drawRoundedRect(8, 8, label.width + 20, label.height + 12, 6);
  background.endFill();
  label.position.set(18, 14);

  container.addChild(background, label);
  return container;
}

function renderMapObject(map: TacticalMap, object: MapObject, isSelected: boolean): Graphics {
  const graphics = new Graphics();
  const x = (object.x + 0.5) * map.cellSize;
  const y = (object.y + 0.5) * map.cellSize;
  const width = object.widthCells * map.cellSize;
  const height = object.heightCells * map.cellSize;

  graphics.position.set(x, y);
  graphics.rotation = object.rotationRadians;

  switch (object.kind) {
    case 'tree':
      drawTopDownTree(graphics, width, height);
      break;
    case 'rock':
      drawTopDownRock(graphics, width, height);
      break;
    case 'structure':
      drawTopDownStructure(graphics, width, height);
      break;
    case 'cover':
      drawSegmentedCover(graphics, width, height, 0xb9a56a, 0x4b3f28);
      break;
    case 'ditch':
      drawTopDownDitch(graphics, width, height);
      break;
    case 'crates':
      drawTopDownCrates(graphics, width, height);
      break;
    case 'fence':
      drawTopDownFence(graphics, width, height);
      break;
    case 'post':
      drawTopDownPost(graphics, width, height);
      break;
    case 'logs':
      drawTopDownLogs(graphics, width, height);
      break;
    case 'well':
      drawTopDownWell(graphics, width, height);
      break;
    case 'bridge':
      drawTopDownBridge(graphics, width, height);
      break;
  }

  if (isSelected) {
    drawSelectedObjectControls(graphics, width, height);
  }

  return graphics;
}

function drawSelectedObjectControls(graphics: Graphics, width: number, height: number): void {
  const pad = 5;
  const handle = 8;
  const left = -width / 2 - pad;
  const right = width / 2 + pad;
  const top = -height / 2 - pad;
  const bottom = height / 2 + pad;

  graphics.lineStyle(3, 0xfff2a8, 0.95);
  graphics.drawRoundedRect(left, top, right - left, bottom - top, 5);

  graphics.beginFill(0xfff2a8, 1);
  for (const point of [
    [left, top],
    [(left + right) / 2, top],
    [right, top],
    [right, (top + bottom) / 2],
    [right, bottom],
    [(left + right) / 2, bottom],
    [left, bottom],
    [left, (top + bottom) / 2],
  ] as Array<[number, number]>) {
    graphics.drawRect(point[0] - handle / 2, point[1] - handle / 2, handle, handle);
  }
  graphics.endFill();

  graphics.lineStyle(2, 0xfff2a8, 0.9);
  graphics.moveTo(0, top);
  graphics.lineTo(0, top - 18);
  graphics.beginFill(0x121612, 1);
  graphics.drawCircle(0, top - 25, 6);
  graphics.endFill();
  graphics.lineStyle(2, 0xfff2a8, 1);
  graphics.drawCircle(0, top - 25, 6);
}

function drawTopDownTree(graphics: Graphics, width: number, height: number): void {
  const radius = Math.min(width, height) / 2;

  graphics.lineStyle(2, 0x142314, 0.7);
  graphics.beginFill(0x275431, 1);
  graphics.drawCircle(0, 0, radius);
  graphics.endFill();

  graphics.beginFill(0x3c6b35, 0.9);
  graphics.drawCircle(-radius * 0.25, -radius * 0.15, radius * 0.45);
  graphics.drawCircle(radius * 0.22, radius * 0.12, radius * 0.4);
  graphics.endFill();

  graphics.beginFill(0x6a4328, 1);
  graphics.drawCircle(0, 0, Math.max(2, radius * 0.18));
  graphics.endFill();
}

function drawTopDownRock(graphics: Graphics, width: number, height: number): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  graphics.lineStyle(2, 0x2d3029, 0.75);
  graphics.beginFill(0x77786f, 1);
  graphics.drawPolygon([
    -halfWidth * 0.9, -halfHeight * 0.15,
    -halfWidth * 0.35, -halfHeight * 0.95,
    halfWidth * 0.55, -halfHeight * 0.75,
    halfWidth, halfHeight * 0.2,
    halfWidth * 0.15, halfHeight,
    -halfWidth, halfHeight * 0.55,
  ]);
  graphics.endFill();
}

function drawTopDownStructure(graphics: Graphics, width: number, height: number): void {
  graphics.lineStyle(2, 0x241d17, 0.95);
  graphics.beginFill(0x6c563f, 1);
  graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 4);
  graphics.endFill();

  graphics.lineStyle(2, 0x3a2c22, 0.8);
  graphics.moveTo(-width / 2 + 5, 0);
  graphics.lineTo(width / 2 - 5, 0);
  graphics.moveTo(0, -height / 2 + 5);
  graphics.lineTo(0, height / 2 - 5);
}

function drawTopDownDitch(graphics: Graphics, width: number, height: number): void {
  graphics.lineStyle(3, 0x2a1f15, 0.95);
  graphics.beginFill(0x45311f, 1);
  graphics.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
  graphics.endFill();

  graphics.lineStyle(2, 0x1b140f, 0.85);
  graphics.moveTo(-width / 2 + 8, 0);
  graphics.lineTo(width / 2 - 8, 0);
}

function drawTopDownCrates(graphics: Graphics, width: number, height: number): void {
  const crateWidth = width * 0.42;
  const crateHeight = height * 0.42;

  graphics.lineStyle(2, 0x251b12, 0.9);
  graphics.beginFill(0x8f6a3d, 1);
  graphics.drawRect(-crateWidth, -crateHeight, crateWidth, crateHeight);
  graphics.drawRect(0, -crateHeight, crateWidth, crateHeight);
  graphics.drawRect(-crateWidth / 2, 0, crateWidth, crateHeight);
  graphics.endFill();
}

function drawTopDownFence(graphics: Graphics, width: number, height: number): void {
  const postHeight = Math.max(6, height);

  graphics.lineStyle(3, 0x5c422a, 0.95);
  graphics.moveTo(-width / 2, 0);
  graphics.lineTo(width / 2, 0);

  for (let offset = -width / 2; offset <= width / 2; offset += Math.max(10, width / 8)) {
    graphics.moveTo(offset, -postHeight / 2);
    graphics.lineTo(offset, postHeight / 2);
  }
}

function drawTopDownPost(graphics: Graphics, width: number, height: number): void {
  graphics.lineStyle(2, 0x33251a, 0.95);
  graphics.beginFill(0x8a6a42, 1);
  graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 3);
  graphics.endFill();

  graphics.lineStyle(2, 0x3d2b1b, 0.85);
  graphics.moveTo(-width / 2, -height / 2);
  graphics.lineTo(width / 2, height / 2);
  graphics.moveTo(width / 2, -height / 2);
  graphics.lineTo(-width / 2, height / 2);
}

function drawTopDownLogs(graphics: Graphics, width: number, height: number): void {
  const spacing = height / 3;

  graphics.lineStyle(Math.max(3, height * 0.22), 0x5a351c, 0.95);
  graphics.moveTo(-width / 2, -spacing);
  graphics.lineTo(width / 2, -spacing);
  graphics.moveTo(-width / 2, 0);
  graphics.lineTo(width / 2, 0);
  graphics.moveTo(-width / 2, spacing);
  graphics.lineTo(width / 2, spacing);
}

function drawTopDownWell(graphics: Graphics, width: number, height: number): void {
  const radius = Math.min(width, height) / 2;

  graphics.lineStyle(3, 0x2b2b2b, 0.85);
  graphics.beginFill(0x808070, 1);
  graphics.drawCircle(0, 0, radius);
  graphics.endFill();

  graphics.beginFill(0x293844, 1);
  graphics.drawCircle(0, 0, radius * 0.55);
  graphics.endFill();
}

function drawTopDownBridge(graphics: Graphics, width: number, height: number): void {
  graphics.lineStyle(3, 0x403225, 0.95);
  graphics.beginFill(0x8b7459, 1);
  graphics.drawRoundedRect(-width / 2, -height / 2, width, height, 5);
  graphics.endFill();

  graphics.lineStyle(2, 0x5c4936, 0.9);
  graphics.moveTo(-width / 2 + 6, -height / 3);
  graphics.lineTo(width / 2 - 6, -height / 3);
  graphics.moveTo(-width / 2 + 6, height / 3);
  graphics.lineTo(width / 2 - 6, height / 3);
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

  const segmentWidth = Math.max(10, width / 7);
  for (let x = -width / 2; x < width / 2; x += segmentWidth) {
    graphics.drawRoundedRect(x, -height / 2, segmentWidth - 2, height, 4);
  }

  graphics.endFill();
}
