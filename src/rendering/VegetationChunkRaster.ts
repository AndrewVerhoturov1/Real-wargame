import { Container, Sprite, Texture } from 'pixi.js';
import type { TacticalMap } from '../core/map/MapModel';
import { getMapDirtyRegionSince, getMapLayerRevision, type MapDirtyRegion } from '../core/map/MapRuntimeState';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import { getVegetationMaterial } from '../core/map/EnvironmentMaterialProfile';
import { measurePerformancePhase } from '../core/debug/PerformancePhases';

export const VEGETATION_CHUNK_SIZE_CELLS = 32;
const TARGET_PIXELS_PER_CELL = 1.5;

export interface VegetationChunkRasterDiagnostics {
  readonly chunkBuildCount: number;
  readonly chunkCacheHitCount: number;
  readonly dirtyChunkCount: number;
  readonly textureUploadCount: number;
  readonly textureReuseCount: number;
  readonly destroyedTextureCount: number;
  readonly activeChunkCount: number;
  readonly retainedCanvasBytes: number;
  readonly lastBuildMs: number;
  readonly maxBuildMs: number;
  readonly lastBuildReason: string;
  readonly lastDirtyRegion: MapDirtyRegion | null;
}

interface ChunkRecord {
  readonly key: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly canvas: HTMLCanvasElement;
  readonly texture: Texture;
  readonly sprite: Sprite;
  signature: string;
  containsVegetation: boolean;
}

interface MutableDiagnostics {
  chunkBuildCount: number;
  chunkCacheHitCount: number;
  dirtyChunkCount: number;
  textureUploadCount: number;
  textureReuseCount: number;
  destroyedTextureCount: number;
  lastBuildMs: number;
  maxBuildMs: number;
  lastBuildReason: string;
  lastDirtyRegion: MapDirtyRegion | null;
}

export class VegetationChunkRaster {
  readonly container = new Container();
  private readonly chunks = new Map<string, ChunkRecord>();
  private map: TacticalMap | null = null;
  private forestRevision = 0;
  private profileId = '';
  private presentationRevision = 0;
  private cellSize = 0;
  private readonly diagnostics: MutableDiagnostics = {
    chunkBuildCount: 0,
    chunkCacheHitCount: 0,
    dirtyChunkCount: 0,
    textureUploadCount: 0,
    textureReuseCount: 0,
    destroyedTextureCount: 0,
    lastBuildMs: 0,
    maxBuildMs: 0,
    lastBuildReason: 'not-built',
    lastDirtyRegion: null,
  };

  render(map: TacticalMap): void {
    const profile = getActiveEnvironmentProfile();
    const nextForestRevision = getMapLayerRevision(map, 'forest');
    const mapChanged = this.map !== map || this.cellSize !== map.cellSize;
    const presentationChanged = this.profileId !== profile.id
      || this.presentationRevision !== profile.revisions.presentation;
    const forestChanged = this.forestRevision !== nextForestRevision;

    if (!mapChanged && !presentationChanged && !forestChanged) {
      this.diagnostics.chunkCacheHitCount += 1;
      return;
    }

    let dirtyRegion: MapDirtyRegion | null = null;
    let reason = 'initial-map';
    if (mapChanged) {
      this.resetForMap(map);
      dirtyRegion = fullRegion(map);
    } else if (presentationChanged) {
      dirtyRegion = fullRegion(map);
      reason = 'presentation-revision';
    } else if (forestChanged) {
      dirtyRegion = getMapDirtyRegionSince(map, 'forest', this.forestRevision) ?? fullRegion(map);
      reason = 'vegetation-cells';
    }

    this.map = map;
    this.cellSize = map.cellSize;
    this.forestRevision = nextForestRevision;
    this.profileId = profile.id;
    this.presentationRevision = profile.revisions.presentation;
    this.diagnostics.lastDirtyRegion = dirtyRegion;
    this.diagnostics.lastBuildReason = reason;
    if (!dirtyRegion) return;

    const startedAt = now();
    for (const { chunkX, chunkY } of vegetationChunkCoordinatesForRegion(map, dirtyRegion, 1)) {
      this.renderChunk(map, chunkX, chunkY, reason);
    }

    const duration = now() - startedAt;
    this.diagnostics.lastBuildMs = duration;
    this.diagnostics.maxBuildMs = Math.max(this.diagnostics.maxBuildMs, duration);
  }

  getDiagnostics(): VegetationChunkRasterDiagnostics {
    let retainedCanvasBytes = 0;
    let activeChunkCount = 0;
    for (const chunk of this.chunks.values()) {
      retainedCanvasBytes += chunk.canvas.width * chunk.canvas.height * 4;
      if (chunk.containsVegetation) activeChunkCount += 1;
    }
    return { ...this.diagnostics, activeChunkCount, retainedCanvasBytes };
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) this.destroyChunk(chunk);
    this.chunks.clear();
    this.container.removeChildren();
    this.container.destroy({ children: true });
  }

  private resetForMap(map: TacticalMap): void {
    for (const chunk of this.chunks.values()) this.destroyChunk(chunk);
    this.chunks.clear();
    this.container.removeChildren();
    this.map = map;
  }

  private renderChunk(map: TacticalMap, chunkX: number, chunkY: number, reason: string): void {
    const key = `${chunkX}:${chunkY}`;
    const bounds = chunkBounds(map, chunkX, chunkY);
    if (!bounds) return;
    const activeProfile = getActiveEnvironmentProfile();
    const signature = buildChunkSignature(map, bounds, activeProfile.id, activeProfile.revisions.presentation);
    const existing = this.chunks.get(key);
    if (existing?.signature === signature) {
      this.diagnostics.chunkCacheHitCount += 1;
      return;
    }

    const record = existing ?? this.createChunk(map, key, chunkX, chunkY, bounds);
    const rasterScale = vegetationRasterScale(map);
    const pixels = measurePerformancePhase('vegetation-chunk-raster-build', () => renderVegetationChunkPixels(map, bounds, rasterScale));
    record.canvas.width = pixels.width;
    record.canvas.height = pixels.height;
    const context = record.canvas.getContext('2d');
    if (!context) return;
    const imageData = context.createImageData(pixels.width, pixels.height);
    imageData.data.set(pixels.data);
    context.putImageData(imageData, 0, 0);
    record.containsVegetation = pixels.containsVegetation;
    record.signature = signature;
    record.sprite.visible = pixels.containsVegetation;
    record.sprite.position.set(bounds.minX * map.cellSize, bounds.minY * map.cellSize);
    record.sprite.scale.set(1 / rasterScale);
    // PixiJS 8 keeps the Texture identity stable; only its canvas source is refreshed.
    measurePerformancePhase('texture-upload', () => record.texture.source.update());
    this.diagnostics.textureUploadCount += 1;
    if (existing) this.diagnostics.textureReuseCount += 1;
    this.diagnostics.chunkBuildCount += 1;
    this.diagnostics.dirtyChunkCount += 1;
    this.diagnostics.lastBuildReason = reason;
  }

  private createChunk(
    map: TacticalMap,
    key: string,
    chunkX: number,
    chunkY: number,
    bounds: MapDirtyRegion,
  ): ChunkRecord {
    const canvas = document.createElement('canvas');
    const rasterScale = vegetationRasterScale(map);
    canvas.width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + 1) * map.cellSize * rasterScale));
    canvas.height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + 1) * map.cellSize * rasterScale));
    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.position.set(bounds.minX * map.cellSize, bounds.minY * map.cellSize);
    sprite.scale.set(1 / rasterScale);
    this.container.addChild(sprite);
    const record: ChunkRecord = { key, chunkX, chunkY, canvas, texture, sprite, signature: '', containsVegetation: false };
    this.chunks.set(key, record);
    return record;
  }

  private destroyChunk(chunk: ChunkRecord): void {
    chunk.sprite.destroy({ texture: false });
    chunk.texture.destroy(true);
    this.diagnostics.destroyedTextureCount += 1;
  }
}


export function vegetationChunkCoordinatesForRegion(
  map: Pick<TacticalMap, 'width' | 'height'>,
  region: MapDirtyRegion,
  marginCells = 1,
): ReadonlyArray<{ chunkX: number; chunkY: number }> {
  const expanded = {
    minX: Math.max(0, region.minX - marginCells),
    minY: Math.max(0, region.minY - marginCells),
    maxX: Math.min(map.width - 1, region.maxX + marginCells),
    maxY: Math.min(map.height - 1, region.maxY + marginCells),
  };
  const result: Array<{ chunkX: number; chunkY: number }> = [];
  const minChunkX = Math.floor(expanded.minX / VEGETATION_CHUNK_SIZE_CELLS);
  const maxChunkX = Math.floor(expanded.maxX / VEGETATION_CHUNK_SIZE_CELLS);
  const minChunkY = Math.floor(expanded.minY / VEGETATION_CHUNK_SIZE_CELLS);
  const maxChunkY = Math.floor(expanded.maxY / VEGETATION_CHUNK_SIZE_CELLS);
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) result.push({ chunkX, chunkY });
  }
  return result;
}

export function vegetationRasterScale(map: Pick<TacticalMap, 'cellSize'>): number {
  return Math.max(0.25, Math.min(1, TARGET_PIXELS_PER_CELL / Math.max(0.1, map.cellSize)));
}

export interface VegetationChunkPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly containsVegetation: boolean;
}

export function renderVegetationChunkPixels(
  map: TacticalMap,
  bounds: MapDirtyRegion,
  scale = vegetationRasterScale(map),
): VegetationChunkPixels {
  const profile = getActiveEnvironmentProfile();
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + 1) * map.cellSize * scale));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + 1) * map.cellSize * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  let containsVegetation = false;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const mapPixelX = bounds.minX * map.cellSize + (px + 0.5) / scale;
      const mapPixelY = bounds.minY * map.cellSize + (py + 0.5) / scale;
      const gridX = mapPixelX / map.cellSize;
      const gridY = mapPixelY / map.cellSize;
      const cellX = clampInt(Math.floor(gridX), 0, map.width - 1);
      const cellY = clampInt(Math.floor(gridY), 0, map.height - 1);
      const cell = map.cells[cellY * map.width + cellX];
      const material = getVegetationMaterial(profile, cell?.vegetationMaterialId);
      if (material.id === 'none' || material.presentation.coverage <= 0 || material.presentation.opacity <= 0) continue;
      containsVegetation = true;

      const occupancy = smoothedVegetationOccupancy(map, gridX, gridY, material.id);
      const noise = continuousNoise(
        mapPixelX / Math.max(0.1, material.presentation.textureScale),
        mapPixelY / Math.max(0.1, material.presentation.textureScale),
        material.presentation.noiseScale,
        stringHash(material.presentation.textureId),
      );
      const edge = Math.max(0.015, material.presentation.edgeSoftness);
      const threshold = 1 - material.presentation.coverage;
      const alphaMask = smoothstep(threshold - edge, threshold + edge, occupancy + (noise - 0.5) * 0.24);
      const alpha = material.presentation.opacity * alphaMask;
      if (alpha <= 0.002) continue;

      const color = material.presentation.colorTint;
      const shade = 0.76 + noise * 0.34;
      const index = (py * width + px) * 4;
      data[index] = clampByte((color >> 16 & 0xff) * shade);
      data[index + 1] = clampByte((color >> 8 & 0xff) * shade);
      data[index + 2] = clampByte((color & 0xff) * shade);
      data[index + 3] = clampByte(alpha * 255);
    }
  }

  return { width, height, data, containsVegetation };
}

function smoothedVegetationOccupancy(map: TacticalMap, gridX: number, gridY: number, materialId: string): number {
  const sampleX = gridX - 0.5;
  const sampleY = gridY - 0.5;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const a = occupancyAt(map, x0, y0, materialId);
  const b = occupancyAt(map, x0 + 1, y0, materialId);
  const c = occupancyAt(map, x0, y0 + 1, materialId);
  const d = occupancyAt(map, x0 + 1, y0 + 1, materialId);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
function occupancyAt(map: TacticalMap, x: number, y: number, materialId: string): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  const id = map.cells[y * map.width + x]?.vegetationMaterialId ?? 'none';
  if (id === materialId) return 1;
  return id === 'none' ? 0 : 0.62;
}
function continuousNoise(x: number, y: number, scale: number, seed: number): number {
  const frequency = Math.max(0.01, scale) * 0.18;
  const sx = x * frequency;
  const sy = y * frequency;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smoothstep01(sx - x0);
  const ty = smoothstep01(sy - y0);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 0xffffffff;
}
function stringHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash | 0;
}
function smoothstep01(value: number): number { return value * value * (3 - 2 * value); }
function buildChunkSignature(map: TacticalMap, bounds: MapDirtyRegion, profileId: string, presentationRevision: number): string {
  let hash = 2166136261;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    const id = map.cells[y * map.width + x]?.vegetationMaterialId ?? 'none';
    for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  return `${profileId}:${presentationRevision}:${hash >>> 0}:${map.cellSize}`;
}
function chunkBounds(map: TacticalMap, chunkX: number, chunkY: number): MapDirtyRegion | null {
  const minX = chunkX * VEGETATION_CHUNK_SIZE_CELLS;
  const minY = chunkY * VEGETATION_CHUNK_SIZE_CELLS;
  if (minX >= map.width || minY >= map.height) return null;
  return { minX, minY, maxX: Math.min(map.width - 1, minX + VEGETATION_CHUNK_SIZE_CELLS - 1), maxY: Math.min(map.height - 1, minY + VEGETATION_CHUNK_SIZE_CELLS - 1) };
}
function fullRegion(map: TacticalMap): MapDirtyRegion { return { minX: 0, minY: 0, maxX: map.width - 1, maxY: map.height - 1 }; }
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
function smoothstep(edge0: number, edge1: number, value: number): number { const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0)); return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function clampInt(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.floor(value))); }
function clampByte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }
