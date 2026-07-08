import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  ELEVATION_LEVELS,
  type ElevationLevel,
  type MapObject,
  type TacticalMap,
} from '../core/map/MapModel';
import { TERRAIN_STYLE } from './terrainStyle';

interface ElevationPaintStyle {
  fill: string;
  detail: string;
  radiusScale: number;
  blurScale: number;
}

const ELEVATION_PAINT: Record<ElevationLevel, ElevationPaintStyle> = {
  [-2]: {
    fill: 'rgba(39, 64, 60, 0.44)',
    detail: 'rgba(20, 34, 35, 0.16)',
    radiusScale: 0.96,
    blurScale: 0.36,
  },
  [-1]: {
    fill: 'rgba(67, 89, 66, 0.3)',
    detail: 'rgba(31, 47, 38, 0.1)',
    radiusScale: 0.9,
    blurScale: 0.32,
  },
  0: {
    fill: 'rgba(0, 0, 0, 0)',
    detail: 'rgba(0, 0, 0, 0)',
    radiusScale: 0,
    blurScale: 0,
  },
  1: {
    fill: 'rgba(165, 151, 92, 0.24)',
    detail: 'rgba(240, 212, 134, 0.1)',
    radiusScale: 0.88,
    blurScale: 0.3,
  },
  2: {
    fill: 'rgba(183, 151, 92, 0.32)',
    detail: 'rgba(246, 215, 139, 0.12)',
    radiusScale: 0.94,
    blurScale: 0.32,
  },
  3: {
    fill: 'rgba(196, 164, 105, 0.4)',
    detail: 'rgba(255, 230, 158, 0.16)',
    radiusScale: 0.98,
    blurScale: 0.34,
  },
  4: {
    fill: 'rgba(218, 183, 112, 0.5)',
    detail: 'rgba(255, 238, 176, 0.22)',
    radiusScale: 1.04,
    blurScale: 0.36,
  },
};

export class PixiMapRenderer {
  readonly container = new Container();
  private readonly staticContainer = new Container();
  private readonly objectContainer = new Container();
  private lastStaticKey = '';
  private lastObjectKey = '';

  constructor() {
    this.container.addChild(this.staticContainer, this.objectContainer);
  }

  render(
    map: TacticalMap,
    showGrid = true,
    selectedObjectId: string | null = null,
    showObjects = true,
  ): void {
    this.renderStaticLayerIfNeeded(map, showGrid);
    this.renderObjectLayerIfNeeded(map, selectedObjectId, showObjects);
  }

  private renderStaticLayerIfNeeded(map: TacticalMap, showGrid: boolean): void {
    const nextKey = getStaticLayerKey(map, showGrid);

    if (nextKey === this.lastStaticKey) {
      return;
    }

    this.lastStaticKey = nextKey;
    this.staticContainer.removeChildren();
    renderTerrainBatches(this.staticContainer, map);

    const elevationLayer = renderElevationLayer(map);
    if (elevationLayer) {
      this.staticContainer.addChild(elevationLayer);
    }

    if (showGrid) {
      this.staticContainer.addChild(renderMeterGrid(map));
    }

    const border = new Graphics();
    border.lineStyle(3, 0x10160f, 0.85);
    border.drawRect(0, 0, map.width * map.cellSize, map.height * map.cellSize);
    this.staticContainer.addChild(border);
  }

  private renderObjectLayerIfNeeded(
    map: TacticalMap,
    selectedObjectId: string | null,
    showObjects: boolean,
  ): void {
    const nextKey = getObjectLayerKey(map, selectedObjectId, showObjects);

    if (nextKey === this.lastObjectKey) {
      return;
    }

    this.lastObjectKey = nextKey;
    this.objectContainer.removeChildren();

    if (!showObjects) {
      return;
    }

    for (const object of map.objects) {
      this.objectContainer.addChild(renderMapObject(map, object, object.id === selectedObjectId));
    }
  }
}

function renderTerrainBatches(container: Container, map: TacticalMap): void {
  const terrainGraphics = new Map<string, Graphics>();

  for (const cell of map.cells) {
    const style = TERRAIN_STYLE[cell.terrain];
    let graphics = terrainGraphics.get(cell.terrain);

    if (!graphics) {
      graphics = new Graphics();
      graphics.beginFill(style.fill, 1);
      terrainGraphics.set(cell.terrain, graphics);
    }

    graphics.drawRect(
      cell.x * map.cellSize,
      cell.y * map.cellSize,
      map.cellSize,
      map.cellSize,
    );
  }

  for (const graphics of terrainGraphics.values()) {
    graphics.endFill();
    container.addChild(graphics);
  }
}

function renderElevationLayer(map: TacticalMap): Sprite | null {
  if (!map.cells.some((cell) => cell.height !== 0)) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = map.width * map.cellSize;
  canvas.height = map.height * map.cellSize;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  for (const level of ELEVATION_LEVELS) {
    if (level === 0) {
      continue;
    }

    drawElevationLevel(context, map, level);
  }

  for (const level of ELEVATION_LEVELS) {
    if (level === 0) {
      continue;
    }

    drawElevationDetails(context, map, level);
  }

  return new Sprite(Texture.from(canvas));
}

function drawElevationLevel(context: CanvasRenderingContext2D, map: TacticalMap, level: ElevationLevel): void {
  const style = ELEVATION_PAINT[level];
  const cellSize = map.cellSize;
  const baseRadius = cellSize * style.radiusScale;
  const blur = cellSize * style.blurScale;

  for (const cell of map.cells) {
    if (cell.height !== level) {
      continue;
    }

    const seed = makeSeed(cell.x, cell.y, level, 1);
    const centerX = (cell.x + 0.5) * cellSize + (random01(seed) - 0.5) * cellSize * 0.18;
    const centerY = (cell.y + 0.5) * cellSize + (random01(seed + 17) - 0.5) * cellSize * 0.18;
    const stretchX = 0.78 + random01(seed + 31) * 0.48;
    const stretchY = 0.78 + random01(seed + 47) * 0.48;

    drawOrganicPatch(context, centerX, centerY, baseRadius, blur, stretchX, stretchY, style.fill, seed);
  }
}

function drawElevationDetails(context: CanvasRenderingContext2D, map: TacticalMap, level: ElevationLevel): void {
  const style = ELEVATION_PAINT[level];
  const cellSize = map.cellSize;

  context.save();
  context.lineWidth = Math.max(1, cellSize * 0.045);
  context.strokeStyle = style.detail;
  context.lineCap = 'round';

  for (const cell of map.cells) {
    if (cell.height !== level) {
      continue;
    }

    const seed = makeSeed(cell.x, cell.y, level, 3);
    if (random01(seed) < 0.58) {
      continue;
    }

    const centerX = (cell.x + 0.5) * cellSize;
    const centerY = (cell.y + 0.5) * cellSize;
    const length = cellSize * (0.34 + random01(seed + 5) * 0.34);
    const angle = random01(seed + 9) * Math.PI * 2;

    context.beginPath();
    context.moveTo(centerX - Math.cos(angle) * length, centerY - Math.sin(angle) * length * 0.45);
    context.quadraticCurveTo(
      centerX,
      centerY + (random01(seed + 13) - 0.5) * cellSize * 0.25,
      centerX + Math.cos(angle) * length,
      centerY + Math.sin(angle) * length * 0.45,
    );
    context.stroke();
  }

  context.restore();
}

function drawOrganicPatch(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  blur: number,
  stretchX: number,
  stretchY: number,
  fill: string,
  seed: number,
): void {
  const points = 18;

  context.save();
  context.translate(centerX, centerY);
  context.scale(stretchX, stretchY);
  context.shadowColor = fill;
  context.shadowBlur = blur;
  context.fillStyle = fill;
  context.beginPath();

  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const pointRadius = radius * (0.72 + random01(seed + index * 37) * 0.36);
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
  context.fill();
  context.restore();
}

function getStaticLayerKey(map: TacticalMap, showGrid: boolean): string {
  return [
    `size:${map.width}x${map.height}`,
    `cell:${map.cellSize}`,
    `meters:${map.metersPerCell}`,
    `grid:${showGrid ? '1' : '0'}`,
    `cells:${map.cells.map((cell) => `${cell.x}:${cell.y}:${cell.terrain}:${cell.height}:${cell.forest}`).join('|')}`,
  ].join(';');
}

function getObjectLayerKey(
  map: TacticalMap,
  selectedObjectId: string | null,
  showObjects: boolean,
): string {
  if (!showObjects) {
    return `objects:hidden;selected:${selectedObjectId ?? 'none'}`;
  }

  return [
    `cell:${map.cellSize}`,
    `selected:${selectedObjectId ?? 'none'}`,
    `objects:${map.objects.map((object) => [
      object.id,
      object.kind,
      object.x.toFixed(3),
      object.y.toFixed(3),
      object.widthCells.toFixed(3),
      object.heightCells.toFixed(3),
      object.rotationRadians.toFixed(3),
    ].join(':')).join('|')}`,
  ].join(';');
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

function makeSeed(x: number, y: number, level: ElevationLevel, salt: number): number {
  return ((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ ((level + 9) * 83492791) ^ (salt * 2654435761);
}

function random01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10000) / 10000;
}
