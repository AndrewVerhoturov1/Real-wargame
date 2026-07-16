import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  type ElevationLevel,
  type ForestLayerKind,
  type MapObject,
  type TacticalMap,
} from '../core/map/MapModel';
import { TERRAIN_STYLE } from './terrainStyle';

interface LayerPaletteEntry {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

const ELEVATION_PALETTE: Record<ElevationLevel, LayerPaletteEntry> = {
  [-2]: { red: 32, green: 66, blue: 82, alpha: 150 },
  [-1]: { red: 65, green: 91, blue: 91, alpha: 112 },
  0: { red: 128, green: 128, blue: 105, alpha: 0 },
  1: { red: 148, green: 132, blue: 74, alpha: 96 },
  2: { red: 180, green: 138, blue: 66, alpha: 126 },
  3: { red: 205, green: 153, blue: 70, alpha: 152 },
  4: { red: 232, green: 184, blue: 94, alpha: 178 },
};

const FOREST_PALETTE: Record<ForestLayerKind, LayerPaletteEntry> = {
  0: { red: 0, green: 0, blue: 0, alpha: 0 },
  1: { red: 34, green: 86, blue: 55, alpha: 118 },
  2: { red: 19, green: 58, blue: 37, alpha: 165 },
};

const MIN_VISIBLE_ELEVATION = 0.35;
const CONTOUR_THRESHOLDS = [-1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
const TEXTURE_DETAIL_SCALE = 2;

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

    const forestLayer = renderForestLayer(map);
    if (forestLayer) {
      this.staticContainer.addChild(forestLayer);
    }

    if (showGrid) {
      this.staticContainer.addChild(renderMeterGrid(map));
    }

    const border = new Graphics();
    border.rect(0, 0, map.width * map.cellSize, map.height * map.cellSize)
      .stroke({ width: 3, color: 0x10160f, alpha: 0.85 });
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
  const terrainGraphics = new Map<keyof typeof TERRAIN_STYLE, Graphics>();

  for (const cell of map.cells) {
    let graphics = terrainGraphics.get(cell.terrain);

    if (!graphics) {
      graphics = new Graphics();
      terrainGraphics.set(cell.terrain, graphics);
    }

    graphics.rect(
      cell.x * map.cellSize,
      cell.y * map.cellSize,
      map.cellSize,
      map.cellSize,
    );
  }

  for (const [terrain, graphics] of terrainGraphics) {
    graphics.fill({ color: TERRAIN_STYLE[terrain].fill });
    container.addChild(graphics);
  }
}

function renderElevationLayer(map: TacticalMap): Sprite | null {
  if (!map.cells.some((cell) => cell.height !== 0)) {
    return null;
  }

  const canvas = createHighQualityCanvas(map);
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  const smoothedHeights = buildSmoothedHeightGrid(map);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const mapX = x / TEXTURE_DETAIL_SCALE;
      const mapY = y / TEXTURE_DETAIL_SCALE;
      const value = sampleSmoothedHeight(smoothedHeights, map, mapX / map.cellSize, mapY / map.cellSize);
      const band = elevationBandForValue(value);
      const pixelIndex = (y * canvas.width + x) * 4;

      if (band === 0) {
        image.data[pixelIndex + 3] = 0;
        continue;
      }

      const color = ELEVATION_PALETTE[band];
      image.data[pixelIndex] = color.red;
      image.data[pixelIndex + 1] = color.green;
      image.data[pixelIndex + 2] = color.blue;
      image.data[pixelIndex + 3] = color.alpha;
    }
  }

  context.putImageData(image, 0, 0);
  drawElevationContourLines(context, smoothedHeights, map);

  return createScaledSprite(canvas);
}

function renderForestLayer(map: TacticalMap): Sprite | null {
  if (!map.cells.some((cell) => cell.forest !== 0)) {
    return null;
  }

  const canvas = createHighQualityCanvas(map);
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  context.save();
  context.scale(TEXTURE_DETAIL_SCALE, TEXTURE_DETAIL_SCALE);
  for (const cell of map.cells) {
    if (cell.forest === 0) {
      continue;
    }

    drawForestCell(context, map, cell.x, cell.y, cell.forest);
  }
  context.restore();

  return createScaledSprite(canvas);
}

function createHighQualityCanvas(map: TacticalMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.width * map.cellSize * TEXTURE_DETAIL_SCALE;
  canvas.height = map.height * map.cellSize * TEXTURE_DETAIL_SCALE;
  return canvas;
}

function createScaledSprite(canvas: HTMLCanvasElement): Sprite {
  const sprite = new Sprite(Texture.from(canvas));
  sprite.scale.set(1 / TEXTURE_DETAIL_SCALE);
  return sprite;
}

function drawForestCell(
  context: CanvasRenderingContext2D,
  map: TacticalMap,
  cellX: number,
  cellY: number,
  forest: ForestLayerKind,
): void {
  const size = map.cellSize;
  const left = cellX * size;
  const top = cellY * size;
  const palette = FOREST_PALETTE[forest];
  const seed = makeSeed(cellX, cellY, forest, 11);
  const count = forest === 2 ? 7 : 3;

  context.save();
  context.fillStyle = `rgba(${palette.red}, ${palette.green}, ${palette.blue}, ${palette.alpha / 255})`;
  context.beginPath();
  context.ellipse(left + size * 0.5, top + size * 0.5, size * 0.52, size * 0.42, random01(seed) * Math.PI, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < count; index += 1) {
    const dotSeed = makeSeed(cellX, cellY, forest, index + 31);
    const x = left + size * (0.18 + random01(dotSeed) * 0.64);
    const y = top + size * (0.18 + random01(dotSeed + 9) * 0.64);
    const radius = size * (forest === 2 ? 0.12 + random01(dotSeed + 13) * 0.08 : 0.09 + random01(dotSeed + 13) * 0.06);

    context.fillStyle = forest === 2 ? 'rgba(8, 38, 22, 0.72)' : 'rgba(22, 76, 42, 0.58)';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function buildSmoothedHeightGrid(map: TacticalMap): number[][] {
  const result: number[][] = [];

  for (let y = 0; y < map.height; y += 1) {
    const row: number[] = [];

    for (let x = 0; x < map.width; x += 1) {
      let total = 0;
      let weightTotal = 0;

      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const sampleX = clampInt(x + ox, 0, map.width - 1);
          const sampleY = clampInt(y + oy, 0, map.height - 1);
          const weight = ox === 0 && oy === 0 ? 5 : ox === 0 || oy === 0 ? 2 : 1;
          const height = map.cells[sampleY * map.width + sampleX]?.height ?? 0;

          total += height * weight;
          weightTotal += weight;
        }
      }

      row.push(total / weightTotal);
    }

    result.push(row);
  }

  return result;
}

function sampleSmoothedHeight(
  smoothedHeights: number[][],
  map: TacticalMap,
  gridX: number,
  gridY: number,
): number {
  const cellX = clamp(gridX - 0.5, 0, map.width - 1);
  const cellY = clamp(gridY - 0.5, 0, map.height - 1);
  const x1 = Math.floor(cellX);
  const y1 = Math.floor(cellY);
  const x2 = Math.min(map.width - 1, x1 + 1);
  const y2 = Math.min(map.height - 1, y1 + 1);
  const tx = cellX - x1;
  const ty = cellY - y1;

  const top = lerp(smoothedHeights[y1][x1], smoothedHeights[y1][x2], tx);
  const bottom = lerp(smoothedHeights[y2][x1], smoothedHeights[y2][x2], tx);
  return lerp(top, bottom, ty);
}

function elevationBandForValue(value: number): ElevationLevel {
  if (Math.abs(value) < MIN_VISIBLE_ELEVATION) {
    return 0;
  }

  return clampInt(Math.round(value), -2, 4) as ElevationLevel;
}

function drawElevationContourLines(
  context: CanvasRenderingContext2D,
  smoothedHeights: number[][],
  map: TacticalMap,
): void {
  const step = Math.max(3, Math.floor(map.cellSize / 5));
  const width = map.width * map.cellSize;
  const height = map.height * map.cellSize;

  context.save();
  context.scale(TEXTURE_DETAIL_SCALE, TEXTURE_DETAIL_SCALE);
  context.lineWidth = Math.max(0.65, map.cellSize * 0.026);
  context.lineCap = 'butt';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(68, 48, 27, 0.58)';

  for (const threshold of CONTOUR_THRESHOLDS) {
    context.beginPath();

    for (let y = 0; y < height - step; y += step) {
      for (let x = 0; x < width - step; x += step) {
        drawContourCell(context, smoothedHeights, map, x, y, step, threshold);
      }
    }

    context.stroke();
  }

  context.restore();
}

function drawContourCell(
  context: CanvasRenderingContext2D,
  smoothedHeights: number[][],
  map: TacticalMap,
  x: number,
  y: number,
  step: number,
  threshold: number,
): void {
  const tl = sampleSmoothedHeight(smoothedHeights, map, x / map.cellSize, y / map.cellSize);
  const tr = sampleSmoothedHeight(smoothedHeights, map, (x + step) / map.cellSize, y / map.cellSize);
  const br = sampleSmoothedHeight(smoothedHeights, map, (x + step) / map.cellSize, (y + step) / map.cellSize);
  const bl = sampleSmoothedHeight(smoothedHeights, map, x / map.cellSize, (y + step) / map.cellSize);
  const points: Array<{ x: number; y: number }> = [];

  pushIntersection(points, tl, tr, threshold, { x, y }, { x: x + step, y });
  pushIntersection(points, tr, br, threshold, { x: x + step, y }, { x: x + step, y: y + step });
  pushIntersection(points, bl, br, threshold, { x, y: y + step }, { x: x + step, y: y + step });
  pushIntersection(points, tl, bl, threshold, { x, y }, { x, y: y + step });

  if (points.length === 2) {
    drawSegment(context, points[0], points[1]);
  } else if (points.length === 4) {
    drawSegment(context, points[0], points[1]);
    drawSegment(context, points[2], points[3]);
  }
}

function pushIntersection(
  points: Array<{ x: number; y: number }>,
  startValue: number,
  endValue: number,
  threshold: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  const startAbove = startValue >= threshold;
  const endAbove = endValue >= threshold;

  if (startAbove === endAbove) {
    return;
  }

  const factor = clamp((threshold - startValue) / (endValue - startValue), 0, 1);
  points.push({
    x: lerp(start.x, end.x, factor),
    y: lerp(start.y, end.y, factor),
  });
}

function drawSegment(context: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }): void {
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
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

  for (let x = 0; x <= map.width; x += 1) {
    const px = x * map.cellSize;
    graphics.moveTo(px, 0).lineTo(px, mapHeight);
  }

  for (let y = 0; y <= map.height; y += 1) {
    const py = y * map.cellSize;
    graphics.moveTo(0, py).lineTo(mapWidth, py);
  }
  graphics.stroke({ width: 1, color: 0xf6edcf, alpha: 0.12 });

  for (let x = 0; x <= map.width; x += 5) {
    const px = x * map.cellSize;
    graphics.moveTo(px, 0).lineTo(px, mapHeight);
  }

  for (let y = 0; y <= map.height; y += 5) {
    const py = y * map.cellSize;
    graphics.moveTo(0, py).lineTo(mapWidth, py);
  }
  graphics.stroke({ width: 2, color: 0xf6edcf, alpha: 0.22 });

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
  const selectedControlStroke = { width: 3, color: 0xfff2a8, alpha: 0.95 };

  graphics.roundRect(left, top, right - left, bottom - top, 5).stroke(selectedControlStroke);

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
    graphics.rect(point[0] - handle / 2, point[1] - handle / 2, handle, handle);
  }
  graphics.fill({ color: 0xfff2a8 }).stroke(selectedControlStroke);

  graphics.moveTo(0, top).lineTo(0, top - 18).stroke({ width: 2, color: 0xfff2a8, alpha: 0.9 });
  graphics.circle(0, top - 25, 6).fill({ color: 0x121612 }).stroke({ width: 2, color: 0xfff2a8 });
}

function drawTopDownTree(graphics: Graphics, width: number, height: number): void {
  const radius = Math.min(width, height) / 2;
  const outline = { width: 2, color: 0x142314, alpha: 0.7 };

  graphics.circle(0, 0, radius).fill({ color: 0x275431 }).stroke(outline);
  graphics.circle(-radius * 0.25, -radius * 0.15, radius * 0.45);
  graphics.circle(radius * 0.22, radius * 0.12, radius * 0.4);
  graphics.fill({ color: 0x3c6b35, alpha: 0.9 }).stroke(outline);
  graphics.circle(0, 0, Math.max(2, radius * 0.18)).fill({ color: 0x6a4328 }).stroke(outline);
}

function drawTopDownRock(graphics: Graphics, width: number, height: number): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  graphics.poly([
    -halfWidth * 0.9, -halfHeight * 0.15,
    -halfWidth * 0.35, -halfHeight * 0.95,
    halfWidth * 0.55, -halfHeight * 0.75,
    halfWidth, halfHeight * 0.2,
    halfWidth * 0.15, halfHeight,
    -halfWidth, halfHeight * 0.55,
  ]).fill({ color: 0x77786f }).stroke({ width: 2, color: 0x2d3029, alpha: 0.75 });
}

function drawTopDownStructure(graphics: Graphics, width: number, height: number): void {
  graphics.roundRect(-width / 2, -height / 2, width, height, 4).fill({ color: 0x6c563f }).stroke({ width: 2, color: 0x241d17, alpha: 0.95 });
  graphics.moveTo(-width / 2 + 5, 0).lineTo(width / 2 - 5, 0);
  graphics.moveTo(0, -height / 2 + 5).lineTo(0, height / 2 - 5);
  graphics.stroke({ width: 2, color: 0x3a2c22, alpha: 0.8 });
}

function drawTopDownDitch(graphics: Graphics, width: number, height: number): void {
  graphics.roundRect(-width / 2, -height / 2, width, height, height / 2).fill({ color: 0x45311f }).stroke({ width: 3, color: 0x2a1f15, alpha: 0.95 });
  graphics.moveTo(-width / 2 + 8, 0).lineTo(width / 2 - 8, 0).stroke({ width: 2, color: 0x1b140f, alpha: 0.85 });
}

function drawTopDownCrates(graphics: Graphics, width: number, height: number): void {
  const crateWidth = width * 0.42;
  const crateHeight = height * 0.42;

  graphics.rect(-crateWidth, -crateHeight, crateWidth, crateHeight);
  graphics.rect(0, -crateHeight, crateWidth, crateHeight);
  graphics.rect(-crateWidth / 2, 0, crateWidth, crateHeight);
  graphics.fill({ color: 0x8f6a3d }).stroke({ width: 2, color: 0x251b12, alpha: 0.9 });
}

function drawTopDownFence(graphics: Graphics, width: number, height: number): void {
  const postHeight = Math.max(6, height);

  graphics.moveTo(-width / 2, 0).lineTo(width / 2, 0);
  for (let offset = -width / 2; offset <= width / 2; offset += Math.max(10, width / 8)) {
    graphics.moveTo(offset, -postHeight / 2).lineTo(offset, postHeight / 2);
  }
  graphics.stroke({ width: 3, color: 0x5c422a, alpha: 0.95 });
}

function drawTopDownPost(graphics: Graphics, width: number, height: number): void {
  graphics.roundRect(-width / 2, -height / 2, width, height, 3).fill({ color: 0x8a6a42 }).stroke({ width: 2, color: 0x33251a, alpha: 0.95 });
  graphics.moveTo(-width / 2, -height / 2).lineTo(width / 2, height / 2);
  graphics.moveTo(width / 2, -height / 2).lineTo(-width / 2, height / 2);
  graphics.stroke({ width: 2, color: 0x3d2b1b, alpha: 0.85 });
}

function drawTopDownLogs(graphics: Graphics, width: number, height: number): void {
  const spacing = height / 3;

  graphics.moveTo(-width / 2, -spacing).lineTo(width / 2, -spacing);
  graphics.moveTo(-width / 2, 0).lineTo(width / 2, 0);
  graphics.moveTo(-width / 2, spacing).lineTo(width / 2, spacing);
  graphics.stroke({ width: Math.max(3, height * 0.22), color: 0x5a351c, alpha: 0.95 });
}

function drawTopDownWell(graphics: Graphics, width: number, height: number): void {
  const radius = Math.min(width, height) / 2;
  const outline = { width: 3, color: 0x2b2b2b, alpha: 0.85 };

  graphics.circle(0, 0, radius).fill({ color: 0x808070 }).stroke(outline);
  graphics.circle(0, 0, radius * 0.55).fill({ color: 0x293844 }).stroke(outline);
}

function drawTopDownBridge(graphics: Graphics, width: number, height: number): void {
  graphics.roundRect(-width / 2, -height / 2, width, height, 5).fill({ color: 0x8b7459 }).stroke({ width: 3, color: 0x403225, alpha: 0.95 });
  graphics.moveTo(-width / 2 + 6, -height / 3).lineTo(width / 2 - 6, -height / 3);
  graphics.moveTo(-width / 2 + 6, height / 3).lineTo(width / 2 - 6, height / 3);
  graphics.stroke({ width: 2, color: 0x5c4936, alpha: 0.9 });
}

function drawSegmentedCover(
  graphics: Graphics,
  width: number,
  height: number,
  fill: number,
  stroke: number,
): void {
  const segmentWidth = Math.max(10, width / 7);
  for (let x = -width / 2; x < width / 2; x += segmentWidth) {
    graphics.roundRect(x, -height / 2, segmentWidth - 2, height, 4);
  }
  graphics.fill({ color: fill }).stroke({ width: 2, color: stroke, alpha: 0.9 });
}

function makeSeed(x: number, y: number, level: number, salt: number): number {
  return ((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ ((level + 9) * 83492791) ^ (salt * 2654435761);
}

function random01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10000) / 10000;
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
