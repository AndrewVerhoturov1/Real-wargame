import { Container, SCALE_MODES, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../core/navigation/NavigationRuntime';
import { getRouteCostOverlayState } from '../core/navigation/RouteCostOverlayState';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
  markRouteCostTextureUploaded,
  readRouteCostCell,
  type RouteCostCellBreakdown,
  type RouteCostFields,
} from '../core/navigation/RouteCostField';
import type { NavigationProfile } from '../core/navigation/NavigationProfiles';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

const RASTER_PIXELS_PER_CELL = 4;
const ROUTE_TEXT_RESOLUTION = Math.max(2, Math.min(4, window.devicePixelRatio * 2));
const TOOLTIP_STYLE = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 8,
  fill: 0xf4f7ee,
  stroke: 0x101510,
  strokeThickness: 2,
  lineJoin: 'round',
});
const LEGEND_STYLE = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 8,
  fontWeight: '700',
  fill: 0xffffff,
  stroke: 0x111510,
  strokeThickness: 2,
  lineJoin: 'round',
});

export interface RouteCostOverlayDiagnostics {
  readonly representation: 'two-raster-sprites';
  readonly visible: boolean;
  readonly mode: 'baseTerrain' | 'finalCost';
  readonly staticCostBuildCount: number;
  readonly dynamicCostBuildCount: number;
  readonly textureUploadCount: number;
  readonly hoverReadCount: number;
  readonly fullMapScanCount: number;
  readonly profileRevision: number;
  readonly knowledgeRevision: number;
  readonly staticTextureBuildCount: number;
  readonly dynamicTextureBuildCount: number;
  readonly displayObjectCount: number;
  readonly activeProfileId: string | null;
  readonly selectedUnitId: string | null;
}

type RouteCostDebugWindow = Window & {
  __realWargameRouteCostDebug?: RouteCostOverlayDiagnostics;
};

export class PixiRouteCostOverlayRenderer {
  readonly container = new Container();
  private readonly cache = createRouteCostFieldCache();
  private readonly legend = new Text('', LEGEND_STYLE);
  private readonly tooltip = new Text('', TOOLTIP_STYLE);
  private staticCanvas: HTMLCanvasElement | null = null;
  private dynamicCanvas: HTMLCanvasElement | null = null;
  private staticContext: CanvasRenderingContext2D | null = null;
  private dynamicContext: CanvasRenderingContext2D | null = null;
  private staticTexture: Texture | null = null;
  private dynamicTexture: Texture | null = null;
  private staticSprite: Sprite | null = null;
  private dynamicSprite: Sprite | null = null;
  private fields: RouteCostFields | null = null;
  private profile: NavigationProfile | null = null;
  private selectedUnitId: string | null = null;
  private lastStaticTextureKey = '';
  private lastDynamicTextureKey = '';
  private lastHoverKey = '';
  private staticTextureBuildCount = 0;
  private dynamicTextureBuildCount = 0;

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.container.visible = false;
    this.legend.resolution = ROUTE_TEXT_RESOLUTION;
    this.tooltip.resolution = ROUTE_TEXT_RESOLUTION;
    this.legend.position.set(8, 34);
    this.tooltip.visible = false;
  }

  render(state: SimulationState): void {
    const overlay = getRouteCostOverlayState(state);
    const unit = selectedUnit(state);
    if (!overlay.active || state.editor.enabled || !unit) {
      this.container.visible = false;
      this.tooltip.visible = false;
      this.publishDiagnostics(overlay.mode);
      return;
    }

    const resolved = resolveUnitNavigationProfile(unit);
    const tacticalContext = buildUnitTacticalRouteContext(unit);
    const fields = getRouteCostFields(state.map, resolved.profile, tacticalContext, this.cache);
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);
    if (!this.staticContext || !this.dynamicContext || !this.staticTexture || !this.dynamicTexture) return;

    const revisions = getMapRevisionSnapshot(state.map);
    const staticTextureKey = [
      state.map.width,
      state.map.height,
      state.map.cellSize,
      revisions.terrain,
      revisions.height,
      revisions.forest,
      revisions.objects,
      fields.profileId,
      fields.profileRevision,
    ].join(':');
    const dynamicTextureKey = fields.cacheKey;

    if (staticTextureKey !== this.lastStaticTextureKey) {
      drawRouteCostRaster(this.staticContext, fields, 'baseTerrain');
      this.staticTexture.baseTexture.update();
      markRouteCostTextureUploaded(this.cache);
      this.lastStaticTextureKey = staticTextureKey;
      this.staticTextureBuildCount += 1;
    }
    if (dynamicTextureKey !== this.lastDynamicTextureKey) {
      drawRouteCostRaster(this.dynamicContext, fields, 'finalCost');
      this.dynamicTexture.baseTexture.update();
      markRouteCostTextureUploaded(this.cache);
      this.lastDynamicTextureKey = dynamicTextureKey;
      this.dynamicTextureBuildCount += 1;
    }

    this.container.visible = true;
    if (this.staticSprite) this.staticSprite.visible = overlay.mode === 'baseTerrain';
    if (this.dynamicSprite) this.dynamicSprite.visible = overlay.mode === 'finalCost';
    this.legend.text = overlay.mode === 'baseTerrain'
      ? `СТОИМОСТЬ МАРШРУТА · БАЗОВАЯ МЕСТНОСТЬ\nПрофиль: ${resolved.profile.nameRu}\n■ выгодно  ■ нормально  ■ дорого  ■ крайне дорого  ▧ непроходимо`
      : `СТОИМОСТЬ МАРШРУТА · ИТОГОВАЯ ЦЕНА\nПрофиль: ${resolved.profile.nameRu}\n■ выгодно  ■ нормально  ■ дорого  ■ крайне дорого  ▧ непроходимо`;

    this.fields = fields;
    this.profile = resolved.profile;
    this.selectedUnitId = unit.id;
    this.updateHover(state);
    this.publishDiagnostics(overlay.mode);
  }

  getDiagnostics(mode: 'baseTerrain' | 'finalCost' = 'finalCost'): RouteCostOverlayDiagnostics {
    const diagnostics = getRouteCostFieldDiagnostics(this.cache);
    return {
      representation: 'two-raster-sprites',
      visible: this.container.visible,
      mode,
      ...diagnostics,
      staticTextureBuildCount: this.staticTextureBuildCount,
      dynamicTextureBuildCount: this.dynamicTextureBuildCount,
      displayObjectCount: this.container.children.length,
      activeProfileId: this.profile?.id ?? null,
      selectedUnitId: this.selectedUnitId,
    };
  }

  destroy(): void {
    this.container.removeChildren();
    this.staticSprite?.destroy();
    this.dynamicSprite?.destroy();
    this.staticTexture?.destroy(true);
    this.dynamicTexture?.destroy(true);
    this.legend.destroy();
    this.tooltip.destroy();
    this.staticCanvas = null;
    this.dynamicCanvas = null;
    this.staticContext = null;
    this.dynamicContext = null;
    this.staticTexture = null;
    this.dynamicTexture = null;
    this.staticSprite = null;
    this.dynamicSprite = null;
    this.fields = null;
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const pixelWidth = width * RASTER_PIXELS_PER_CELL;
    const pixelHeight = height * RASTER_PIXELS_PER_CELL;
    const needsNewRaster = !this.staticCanvas
      || !this.dynamicCanvas
      || this.staticCanvas.width !== pixelWidth
      || this.staticCanvas.height !== pixelHeight;

    if (needsNewRaster) {
      this.container.removeChildren();
      this.staticSprite?.destroy();
      this.dynamicSprite?.destroy();
      this.staticTexture?.destroy(true);
      this.dynamicTexture?.destroy(true);

      this.staticCanvas = document.createElement('canvas');
      this.dynamicCanvas = document.createElement('canvas');
      this.staticCanvas.width = pixelWidth;
      this.staticCanvas.height = pixelHeight;
      this.dynamicCanvas.width = pixelWidth;
      this.dynamicCanvas.height = pixelHeight;
      this.staticContext = this.staticCanvas.getContext('2d', { alpha: true });
      this.dynamicContext = this.dynamicCanvas.getContext('2d', { alpha: true });
      this.staticTexture = Texture.from(this.staticCanvas);
      this.dynamicTexture = Texture.from(this.dynamicCanvas);
      this.staticTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      this.dynamicTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      this.staticSprite = new Sprite(this.staticTexture);
      this.dynamicSprite = new Sprite(this.dynamicTexture);
      this.container.addChild(this.staticSprite, this.dynamicSprite, this.legend, this.tooltip);
      this.lastStaticTextureKey = '';
      this.lastDynamicTextureKey = '';
    }

    const scale = cellSize / RASTER_PIXELS_PER_CELL;
    this.staticSprite?.scale.set(scale, scale);
    this.dynamicSprite?.scale.set(scale, scale);
  }

  private updateHover(state: SimulationState): void {
    const pointer = state.mouseGridPosition;
    const fields = this.fields;
    const profile = this.profile;
    if (!pointer || !fields || !profile) {
      this.tooltip.visible = false;
      this.lastHoverKey = '';
      return;
    }
    const x = Math.floor(pointer.x);
    const y = Math.floor(pointer.y);
    const hoverKey = `${fields.cacheKey}:${x}:${y}`;
    if (hoverKey === this.lastHoverKey) return;
    this.lastHoverKey = hoverKey;

    const cell = readRouteCostCell(fields, x, y, this.cache);
    if (!cell) {
      this.tooltip.visible = false;
      return;
    }
    this.tooltip.visible = true;
    this.tooltip.text = formatTooltip(profile, cell);
    this.tooltip.position.set(
      (x + 1.08) * state.map.cellSize,
      Math.max(0, y - 0.15) * state.map.cellSize,
    );
  }

  private publishDiagnostics(mode: 'baseTerrain' | 'finalCost'): void {
    (window as RouteCostDebugWindow).__realWargameRouteCostDebug = this.getDiagnostics(mode);
  }
}

export function drawRouteCostRaster(
  context: CanvasRenderingContext2D,
  fields: RouteCostFields,
  mode: 'baseTerrain' | 'finalCost',
): void {
  const width = fields.width * RASTER_PIXELS_PER_CELL;
  const height = fields.height * RASTER_PIXELS_PER_CELL;
  const image = context.createImageData(width, height);

  for (let y = 0; y < fields.height; y += 1) {
    for (let x = 0; x < fields.width; x += 1) {
      const cellIndex = y * fields.width + x;
      const passable = fields.passable[cellIndex] === 1;
      const value = mode === 'baseTerrain'
        ? fields.terrainCost[cellIndex] + fields.slopeCost[cellIndex] + fields.coverAdjustment[cellIndex]
        : fields.totalCost[cellIndex];
      const color = passable ? costColor(value) : [30, 34, 32, 210] as const;
      for (let py = 0; py < RASTER_PIXELS_PER_CELL; py += 1) {
        for (let px = 0; px < RASTER_PIXELS_PER_CELL; px += 1) {
          const outputX = x * RASTER_PIXELS_PER_CELL + px;
          const outputY = y * RASTER_PIXELS_PER_CELL + py;
          const offset = (outputY * width + outputX) * 4;
          const hatch = !passable && (px === py || px + py === RASTER_PIXELS_PER_CELL - 1);
          image.data[offset] = hatch ? 225 : color[0];
          image.data[offset + 1] = hatch ? 225 : color[1];
          image.data[offset + 2] = hatch ? 225 : color[2];
          image.data[offset + 3] = hatch ? 235 : color[3];
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
}

function selectedUnit(state: SimulationState): UnitModel | undefined {
  return state.selectedUnitId
    ? state.units.find((unit) => unit.id === state.selectedUnitId)
    : undefined;
}

function costColor(value: number): readonly [number, number, number, number] {
  if (!Number.isFinite(value)) return [30, 34, 32, 210];
  if (value <= 0.85) return [52, 180, 105, 112];
  if (value <= 1.25) return [222, 201, 66, 105];
  if (value <= 2) return [238, 132, 50, 120];
  return [220, 55, 48, 135];
}

function formatTooltip(profile: NavigationProfile, cell: RouteCostCellBreakdown): string {
  if (!cell.passable) {
    return `Профиль: ${profile.nameRu}\nНепроходимая клетка`;
  }
  const lines = [
    `Профиль: ${profile.nameRu}`,
    `Итоговая стоимость: ${formatCost(cell.totalCost)}`,
    '',
    `${terrainLabel(cell.terrainKey)}: ${signed(cell.terrainCost)}`,
    `Уклон: ${signed(cell.slopeCost)}`,
    cell.availability.danger ? `Известная опасность: ${signed(cell.dangerCost)}` : 'Опасность: нет известных данных',
    cell.availability.exposure ? `Видимость противнику: ${signed(cell.exposureCost)}` : 'Видимость противнику: данные недоступны',
    `Укрытие / маскировка: ${signed(cell.coverAdjustment)}`,
    cell.availability.enemyDistance ? `Близость противника: ${signed(cell.enemyDistanceCost)}` : 'Близость противника: данные недоступны',
    cell.availability.territory ? `Территория: ${signed(cell.territoryCost)}` : 'Территория: данные недоступны',
  ];
  return lines.join('\n');
}

function terrainLabel(key: string): string {
  const labels: Record<string, string> = {
    road: 'Дорога',
    field: 'Поле',
    sparseForest: 'Редкий лес',
    denseForest: 'Густой лес',
    rough: 'Пересечённая местность',
    swamp: 'Болото',
    bridge: 'Мост',
    ditch: 'Канава',
  };
  return labels[key] ?? key;
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return 'недоступно';
  const prefix = value > 0.0005 ? '+' : '';
  return `${prefix}${formatCost(value)}`;
}

function formatCost(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '∞';
}
