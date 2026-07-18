import { BufferImageSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  publishAwarenessMovementDiagnostics,
  resetAwarenessMovementDiagnostics,
  type AwarenessMovementDiagnostics,
} from '../core/debug/AwarenessMovementDiagnostics';
import type { GridPosition } from '../core/geometry';
import { getCoverSuitability, type CoverSuitabilityResult } from '../core/cover/CoverSuitability';
import {
  buildPositionIndependentAwarenessKnowledgeSnapshot,
} from '../core/knowledge/AwarenessWorldKey';
import {
  cloneCanonicalWorldThreat,
  type CanonicalWorldThreatSetSnapshot,
  type CanonicalWorldThreatSnapshot,
} from '../core/knowledge/CanonicalWorldThreat';
import type { SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type {
  AwarenessWorkerBuildSnapshot,
  AwarenessWorkerFieldPayload,
  AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import { buildAwarenessWorkerMapSnapshot } from '../core/knowledge/AwarenessWorkerMapSnapshot';
import { getEnvironmentProfileDomainKey } from '../core/map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import type { TacticalMap } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState, getTacticalOverlayMode } from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';

export type VisibleTacticalOverlayMode = 'danger' | 'cover' | 'combined' | 'stealth';

type MutableMovementDiagnostics = {
  -readonly [Key in keyof AwarenessMovementDiagnostics]: AwarenessMovementDiagnostics[Key];
};

interface PendingWorldBuild {
  readonly rasterKey: string;
  readonly canonicalThreatKey: string;
  readonly mapKey: string;
  readonly unitId: string;
  readonly posture: UnitModel['behaviorRuntime']['posture'];
  readonly compatibilityOrigin: GridPosition;
  readonly threats: readonly CanonicalWorldThreatSnapshot[];
  readonly knowledgeRevision: number;
  readonly orderTarget: GridPosition | null;
  readonly finalExact: boolean;
}

interface InFlightWorldBuild {
  readonly jobId: number;
  readonly rasterKey: string;
  readonly canonicalThreatKey: string;
  readonly mapKey: string;
  readonly requestedAt: number;
}

export interface AwarenessAppliedRasterDiagnostics {
  readonly width: number;
  readonly height: number;
  readonly digest: string;
  readonly fieldIdentity: string;
  readonly threatIds: readonly string[];
}

export interface AwarenessOverlayDiagnostics {
  readonly representation: 'raster-sprite-with-region-contours';
  readonly visible: boolean;
  readonly mode: VisibleTacticalOverlayMode | 'off';
  readonly rebuildCount: number;
  readonly coverContourBuildCount: number;
  readonly lastBuildMs: number;
  readonly maxBuildMs: number;
  readonly displayObjectCount: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly lastRequestedWorldKey: string;
  readonly lastAppliedWorldKey: string;
  readonly lastRequestedCanonicalThreatKey: string;
  readonly lastAppliedCanonicalThreatKey: string;
  readonly lastAppliedFieldIdentity: string;
  readonly lastAppliedJobId: number;
  readonly lastCoverCacheKey: string;
  readonly lastAppliedRaster: AwarenessAppliedRasterDiagnostics | null;
  readonly movement: AwarenessMovementDiagnostics;
}

type AwarenessDebugWindow = Window & {
  __realWargameAwarenessDebug?: AwarenessOverlayDiagnostics;
};

const mapIdentity = new WeakMap<object, number>();
let nextMapIdentity = 1;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');

export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();

  private readonly title = new Text({ text: '', style: {
    fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff,
    stroke: { color: 0x111510, width: 4 },
  } });
  private readonly contourGraphics = new Graphics();
  private readonly movement = createMovementDiagnostics();

  private lastRasterKey = '';
  private lastContourKey = '';
  private latestRequestedWorldKey = '';
  private latestRequestedCanonicalThreatKey = '';
  private lastAppliedWorldKey = '';
  private lastAppliedCanonicalThreatKey = '';
  private lastAppliedFieldIdentity = '';
  private lastAppliedRasterDigest = '';
  private lastAppliedJobId = 0;
  private currentMode: VisibleTacticalOverlayMode | 'off' = 'off';
  private rasterPixels: Uint8Array | null = null;
  private rasterPixelWords: Uint32Array | null = null;
  private rasterWidth = 0;
  private rasterHeight = 0;
  private rasterTexture: Texture | null = null;
  private rasterSprite: Sprite | null = null;
  private worldField: AwarenessWorkerFieldPayload | null = null;
  private coverResult: CoverSuitabilityResult | null = null;
  private worker: Worker | null = null;
  private workerMapKey = '';
  private nextJobId = 1;
  private inFlight: InFlightWorldBuild | null = null;
  private pending: PendingWorldBuild | null = null;
  private destroyed = false;
  private rebuildCount = 0;
  private coverContourBuildCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;

  constructor() {
    this.title.position.set(8, 8);
    this.contourGraphics.eventMode = 'none';
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    resetAwarenessMovementDiagnostics();
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    const layer = getSimulationLayerState(state);
    const unit = state.selectedUnitId
      ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
      : undefined;
    const mode = resolveVisibleMode(state);
    this.currentMode = mode;

    if (state.editor.enabled || mode === 'off' || !unit) {
      this.container.visible = false;
      this.lastRasterKey = 'hidden';
      this.publishDiagnostics();
      return;
    }

    this.container.visible = true;
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);

    const mapKey = buildAwarenessMapKey(state.map);
    this.ensureWorkerConfigured(state.map, mapKey);
    const canonical = buildPositionIndependentAwarenessKnowledgeSnapshot(unit, state.map.metersPerCell);
    const worldKey = buildAwarenessWorldKey(state, unit, canonical.key);
    if (worldKey !== this.latestRequestedWorldKey) {
      this.latestRequestedWorldKey = worldKey;
      this.latestRequestedCanonicalThreatKey = canonical.key;
      this.movement.lastRequestedRasterKey = worldKey;
      this.movement.lastRequestedWorldKey = worldKey;
      this.movement.lastRequestedCanonicalThreatKey = canonical.key;
      this.requestWorldBuild(buildPendingWorldSnapshot(state, unit, worldKey, mapKey, canonical));
    }

    this.coverResult = mode === 'cover' || mode === 'combined'
      ? getCoverSuitability(state, unit)
      : null;
    const coverKey = this.coverResult?.cacheKey ?? 'no-cover';
    const rasterKey = `${worldKey};mode:${mode};cover:${coverKey}`;
    const canApply = mode === 'cover'
      || (this.worldField !== null && this.lastAppliedWorldKey === worldKey);
    if (canApply && rasterKey !== this.lastRasterKey) this.applyRaster(mode, rasterKey);

    const contourKey = `${mode};${coverKey};cell:${state.map.cellSize}`;
    if (contourKey !== this.lastContourKey) {
      this.lastContourKey = contourKey;
      this.drawCoverContours(mode, state.map.cellSize);
    }
    this.title.text = modeLabel(mode);
    this.publishDiagnostics();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    this.inFlight = null;
    this.worldField = null;
    this.coverResult = null;
    this.container.removeChildren();
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.rasterSprite = null;
    this.rasterTexture = null;
    this.rasterPixelWords = null;
    this.rasterPixels = null;
    this.contourGraphics.destroy();
    this.title.destroy();
    this.container.destroy();
    delete (window as AwarenessDebugWindow).__realWargameAwarenessDebug;
    resetAwarenessMovementDiagnostics();
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    return {
      representation: 'raster-sprite-with-region-contours',
      visible: this.container.visible,
      mode: this.currentMode,
      rebuildCount: this.rebuildCount,
      coverContourBuildCount: this.coverContourBuildCount,
      lastBuildMs: roundMs(this.lastBuildMs),
      maxBuildMs: roundMs(this.maxBuildMs),
      displayObjectCount: this.container.children.length,
      rasterWidth: this.rasterWidth,
      rasterHeight: this.rasterHeight,
      lastRequestedWorldKey: this.latestRequestedWorldKey,
      lastAppliedWorldKey: this.lastAppliedWorldKey,
      lastRequestedCanonicalThreatKey: this.latestRequestedCanonicalThreatKey,
      lastAppliedCanonicalThreatKey: this.lastAppliedCanonicalThreatKey,
      lastAppliedFieldIdentity: this.lastAppliedFieldIdentity,
      lastAppliedJobId: this.lastAppliedJobId,
      lastCoverCacheKey: this.coverResult?.cacheKey ?? '',
      lastAppliedRaster: this.worldField && this.lastAppliedRasterDigest
        ? {
            width: this.worldField.width,
            height: this.worldField.height,
            digest: this.lastAppliedRasterDigest,
            fieldIdentity: this.lastAppliedFieldIdentity,
            threatIds: [...this.worldField.threatIds],
          }
        : null,
      movement: { ...this.movement },
    };
  }

  private ensureWorkerConfigured(map: TacticalMap, mapKey: string): void {
    if (this.worker && this.workerMapKey === mapKey) return;
    if (this.worker) {
      if (this.inFlight) this.movement.workerJobsCancelled += 1;
      if (this.pending) this.movement.workerJobsCancelled += 1;
      this.worker.terminate();
    }
    this.worker = new Worker(new URL('../workers/AwarenessWorldWorker.ts', import.meta.url), { type: 'module' });
    this.workerMapKey = mapKey;
    this.inFlight = null;
    this.pending = null;
    this.worldField = null;
    this.lastAppliedWorldKey = '';
    this.lastAppliedCanonicalThreatKey = '';
    this.lastAppliedFieldIdentity = '';
    this.lastAppliedRasterDigest = '';
    this.movement.workerInFlight = false;
    this.worker.onmessage = (event: MessageEvent<AwarenessWorkerResponse>) => this.handleWorkerResponse(event.data);
    this.worker.onerror = (event): void => {
      this.movement.lastWorkerError = event.message || 'Unknown awareness worker error.';
      this.finishInFlight();
      this.publishDiagnostics();
    };
    const snapshot = buildAwarenessWorkerMapSnapshot(map, mapKey, getActiveEnvironmentProfile());
    this.worker.postMessage({ type: 'configure', map: snapshot }, [
      snapshot.surfaceMaterialCodes.buffer,
      snapshot.vegetationMaterialCodes.buffer,
      snapshot.heightLevels.buffer,
    ]);
  }

  private requestWorldBuild(snapshot: PendingWorldBuild): void {
    if (!this.worker) return;
    if (this.inFlight) {
      this.movement.workerJobsCoalesced += 1;
      if (this.pending) this.movement.workerJobsCancelled += 1;
      this.pending = snapshot;
      this.updatePendingDepth();
      return;
    }
    this.startWorldBuild(snapshot);
  }

  private startWorldBuild(snapshot: PendingWorldBuild): void {
    if (!this.worker || snapshot.mapKey !== this.workerMapKey) return;
    const jobId = this.nextJobId++;
    this.inFlight = {
      jobId,
      rasterKey: snapshot.rasterKey,
      canonicalThreatKey: snapshot.canonicalThreatKey,
      mapKey: snapshot.mapKey,
      requestedAt: performance.now(),
    };
    this.movement.workerJobsStarted += 1;
    this.movement.workerInFlight = true;
    const request: AwarenessWorkerBuildSnapshot = { jobId, ...snapshot };
    this.worker.postMessage({ type: 'build', snapshot: request });
    this.updatePendingDepth();
  }

  private handleWorkerResponse(response: AwarenessWorkerResponse): void {
    const inFlight = this.inFlight;
    if (!inFlight || response.jobId !== inFlight.jobId) {
      this.movement.workerResultsStaleDropped += 1;
      return;
    }
    const latency = performance.now() - inFlight.requestedAt;
    this.movement.workerJobsCompleted += 1;
    this.movement.lastCompletedJobId = response.jobId;
    this.movement.lastWorkerLatencyMs = roundMs(latency);
    this.movement.maxWorkerLatencyMs = Math.max(this.movement.maxWorkerLatencyMs, this.movement.lastWorkerLatencyMs);
    this.inFlight = null;
    this.movement.workerInFlight = false;

    if (response.type === 'error') {
      this.movement.lastWorkerError = response.message;
    } else {
      this.movement.lastWorkerComputeMs = roundMs(response.computeMs);
      this.movement.maxWorkerComputeMs = Math.max(this.movement.maxWorkerComputeMs, this.movement.lastWorkerComputeMs);
      this.movement.workerThreatRelativeGeometryBuilds += response.computation.threatRelativeGeometryBuilds;
      this.movement.workerDirectionalFieldBuilds += response.computation.directionalFieldBuilds;
      this.movement.workerDirectionalBasisBuilds += response.computation.directionalBasisBuilds;
      this.movement.workerAwarenessGeometryBuilds += response.computation.awarenessGeometryBuilds;
      this.movement.workerAwarenessRescores += response.computation.awarenessRescores;
      this.movement.directionalBasisBuilds = this.movement.workerDirectionalBasisBuilds;
      const stale = response.mapKey !== this.workerMapKey
        || response.rasterKey !== this.latestRequestedWorldKey
        || response.canonicalThreatKey !== this.latestRequestedCanonicalThreatKey;
      if (stale) {
        this.movement.workerResultsStaleDropped += 1;
      } else {
        this.worldField = response.field;
        this.lastAppliedWorldKey = response.rasterKey;
        this.lastAppliedCanonicalThreatKey = response.canonicalThreatKey;
        this.lastAppliedFieldIdentity = response.fieldIdentity;
        this.lastAppliedRasterDigest = response.rasterDigest;
        this.lastAppliedJobId = response.jobId;
        this.movement.lastAppliedRasterKey = response.rasterKey;
        this.movement.lastAppliedWorldKey = response.rasterKey;
        this.movement.lastAppliedCanonicalThreatKey = response.canonicalThreatKey;
        this.movement.lastAppliedFieldIdentity = response.fieldIdentity;
        this.movement.lastAppliedRasterDigest = response.rasterDigest;
        this.movement.lastAppliedJobId = response.jobId;
        this.movement.worldRasterBuilds += 1;
        const key = `${response.rasterKey};mode:${this.currentMode};cover:${this.coverResult?.cacheKey ?? 'no-cover'}`;
        this.applyRaster(this.currentMode, key);
      }
    }
    this.finishInFlight();
  }

  private finishInFlight(): void {
    this.inFlight = null;
    this.movement.workerInFlight = false;
    const next = this.pending;
    this.pending = null;
    this.updatePendingDepth();
    if (next) this.startWorldBuild(next);
  }

  private applyRaster(mode: VisibleTacticalOverlayMode | 'off', rasterKey: string): void {
    if (!this.rasterPixelWords || !this.rasterTexture || mode === 'off') return;
    const startedAt = performance.now();
    if (mode === 'cover') {
      drawCoverRasterWords(this.rasterPixelWords, this.coverResult);
    } else if (mode === 'combined' || mode === 'danger') {
      copyRasterWords(this.rasterPixelWords, this.worldField?.dangerPixels);
    } else {
      copyRasterWords(this.rasterPixelWords, this.worldField?.stealthPixels);
    }
    this.rasterTexture.source.update();
    this.lastRasterKey = rasterKey;
    this.rebuildCount += 1;
    this.movement.mainThreadRasterSwaps += 1;
    const elapsed = performance.now() - startedAt;
    this.lastBuildMs = elapsed;
    this.maxBuildMs = Math.max(this.maxBuildMs, elapsed);
    this.movement.lastMainThreadApplyMs = roundMs(elapsed);
    this.movement.maxMainThreadApplyMs = Math.max(this.movement.maxMainThreadApplyMs, this.movement.lastMainThreadApplyMs);
  }

  private drawCoverContours(mode: VisibleTacticalOverlayMode | 'off', cellSize: number): void {
    this.contourGraphics.clear();
    if ((mode !== 'cover' && mode !== 'combined') || !this.coverResult) return;
    drawMaskBoundaries(
      this.contourGraphics,
      this.coverResult.quickCoverMask,
      this.coverResult.width,
      this.coverResult.height,
      cellSize,
      false,
    );
    this.contourGraphics.stroke({ width: 2.25, color: 0xf2f2ec, alpha: mode === 'combined' ? 0.9 : 0.95 });
    drawMaskBoundaries(
      this.contourGraphics,
      this.coverResult.qualityCoverMask,
      this.coverResult.width,
      this.coverResult.height,
      cellSize,
      true,
    );
    this.contourGraphics.stroke({ width: 1.6, color: 0xb9bbb6, alpha: mode === 'combined' ? 0.82 : 0.88 });
    this.coverContourBuildCount += 1;
  }

  private updatePendingDepth(): void {
    this.movement.pendingQueueDepth = this.pending ? 1 : 0;
    this.movement.maxPendingQueueDepth = Math.max(this.movement.maxPendingQueueDepth, this.movement.pendingQueueDepth);
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const changed = !this.rasterPixels || this.rasterWidth !== width || this.rasterHeight !== height;
    if (changed) {
      this.container.removeChildren();
      this.rasterSprite?.destroy();
      this.rasterTexture?.destroy(true);
      this.rasterWidth = width;
      this.rasterHeight = height;
      this.rasterPixels = new Uint8Array(width * height * 4);
      this.rasterPixelWords = new Uint32Array(this.rasterPixels.buffer);
      this.rasterTexture = new Texture({
        source: new BufferImageSource({
          resource: this.rasterPixels,
          width,
          height,
          format: 'rgba8unorm',
          scaleMode: 'nearest',
        }),
      });
      this.rasterSprite = new Sprite(this.rasterTexture);
      this.container.addChild(this.rasterSprite, this.contourGraphics, this.title);
      this.lastRasterKey = '';
      this.lastContourKey = '';
    }
    this.rasterSprite?.scale.set(cellSize, cellSize);
  }

  private publishDiagnostics(): void {
    publishAwarenessMovementDiagnostics(this.movement);
    (window as AwarenessDebugWindow).__realWargameAwarenessDebug = this.getDiagnostics();
  }
}

export function buildAwarenessRenderKey(
  state: SimulationState,
  unit: UnitModel,
  mode: VisibleTacticalOverlayMode,
): string {
  const canonical = buildPositionIndependentAwarenessKnowledgeSnapshot(unit, state.map.metersPerCell);
  const coverKey = mode === 'cover' || mode === 'combined' ? getCoverSuitability(state, unit).cacheKey : 'no-cover';
  return `${buildAwarenessWorldKey(state, unit, canonical.key)};mode:${mode};cover:${coverKey}`;
}

export function buildAwarenessWorldKey(
  state: SimulationState,
  unit: UnitModel,
  canonicalThreatKey = buildPositionIndependentAwarenessKnowledgeSnapshot(unit, state.map.metersPerCell).key,
): string {
  return [
    buildAwarenessMapKey(state.map),
    `unit:${unit.id}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `canonicalThreats:${canonicalThreatKey}`,
  ].join(';');
}

export function createAwarenessTexture(
  cells: SoldierAwarenessCell[],
  mode: 'danger' | 'stealth',
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (context) drawAwarenessRaster(context, cells, mode, width, height);
  return canvas;
}

export function drawAwarenessRaster(
  context: CanvasRenderingContext2D,
  cells: SoldierAwarenessCell[],
  mode: 'danger' | 'stealth',
  width: number,
  height: number,
): void {
  const image = context.createImageData(width, height);
  drawAwarenessRasterWords(new Uint32Array(image.data.buffer), cells, mode);
  context.putImageData(image, 0, 0);
}

export function drawAwarenessRasterWords(
  pixels: Uint32Array,
  cells: SoldierAwarenessCell[],
  mode: 'danger' | 'stealth',
): void {
  const length = Math.min(cells.length, pixels.length);
  const lut = mode === 'danger' ? DANGER_PIXEL_LUT : STEALTH_PIXEL_LUT;
  for (let index = 0; index < length; index += 1) {
    const value = mode === 'danger' ? cells[index].danger : cells[index].concealment;
    pixels[index] = lut[Math.max(0, Math.min(100, Math.round(value)))] ?? 0;
  }
  if (length < pixels.length) pixels.fill(0, length);
}

function resolveVisibleMode(state: SimulationState): VisibleTacticalOverlayMode | 'off' {
  const layer = getSimulationLayerState(state);
  if (layer.mode === 'stealth') return 'stealth';
  if (layer.mode !== 'danger') return 'off';
  return getTacticalOverlayMode(state);
}

function drawCoverRasterWords(pixels: Uint32Array, result: CoverSuitabilityResult | null): void {
  pixels.fill(0);
  if (!result) return;
  const length = Math.min(pixels.length, result.coverSuitabilityField.length);
  for (let index = 0; index < length; index += 1) {
    const quick = result.quickCoverMask[index] === 1;
    const quality = result.qualityCoverMask[index] === 1;
    if (!quick && !quality) continue;
    const suitability = result.coverSuitabilityField[index] ?? 0;
    const x = index % result.width;
    const y = Math.floor(index / result.width);
    const hatch = ((x + y) & 1) === 0;
    const shade = quick ? Math.round(150 + suitability * 0.65) : Math.round(118 + suitability * 0.52);
    const alpha = quick ? Math.round((0.18 + suitability / 100 * 0.28) * 255) : Math.round((hatch ? 0.24 : 0.11) * 255);
    pixels[index] = packRgba(shade, shade, Math.min(255, shade + 3), alpha);
  }
}

function drawMaskBoundaries(
  graphics: Graphics,
  mask: Uint8Array,
  width: number,
  height: number,
  cellSize: number,
  dashed: boolean,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index] === 0) continue;
      const left = x === 0 || mask[index - 1] === 0;
      const right = x === width - 1 || mask[index + 1] === 0;
      const top = y === 0 || mask[index - width] === 0;
      const bottom = y === height - 1 || mask[index + width] === 0;
      if (top && (!dashed || ((x + y) & 1) === 0)) graphics.moveTo(x * cellSize, y * cellSize).lineTo((x + 1) * cellSize, y * cellSize);
      if (right && (!dashed || ((x + y + 1) & 1) === 0)) graphics.moveTo((x + 1) * cellSize, y * cellSize).lineTo((x + 1) * cellSize, (y + 1) * cellSize);
      if (bottom && (!dashed || ((x + y) & 1) === 0)) graphics.moveTo((x + 1) * cellSize, (y + 1) * cellSize).lineTo(x * cellSize, (y + 1) * cellSize);
      if (left && (!dashed || ((x + y + 1) & 1) === 0)) graphics.moveTo(x * cellSize, (y + 1) * cellSize).lineTo(x * cellSize, y * cellSize);
    }
  }
}

function copyRasterWords(target: Uint32Array, source: Uint32Array | undefined): void {
  if (!source) {
    target.fill(0);
    return;
  }
  target.set(source.subarray(0, target.length));
  if (source.length < target.length) target.fill(0, source.length);
}

function buildAwarenessMapKey(map: TacticalMap): string {
  const revisions = getMapRevisionSnapshot(map);
  const environment = getActiveEnvironmentProfile();
  return [
    `map:${getMapIdentity(map)}`,
    `size:${map.width}x${map.height}`,
    `cellSize:${map.cellSize}`,
    `meters:${map.metersPerCell}`,
    `terrain:${revisions.terrain}`,
    `height:${revisions.height}`,
    `forest:${revisions.forest}`,
    `objects:${revisions.objects}`,
    `visibility:${getEnvironmentProfileDomainKey(environment, 'visibility')}`,
    `fire:${getEnvironmentProfileDomainKey(environment, 'fire')}`,
    `movement:${getEnvironmentProfileDomainKey(environment, 'movement')}`,
  ].join(';');
}

function buildPendingWorldSnapshot(
  _state: SimulationState,
  unit: UnitModel,
  rasterKey: string,
  mapKey: string,
  canonical: CanonicalWorldThreatSetSnapshot,
): PendingWorldBuild {
  return {
    rasterKey,
    canonicalThreatKey: canonical.key,
    mapKey,
    unitId: unit.id,
    posture: unit.behaviorRuntime.posture,
    compatibilityOrigin: { ...unit.position },
    threats: canonical.threats.map(cloneCanonicalWorldThreat),
    knowledgeRevision: unit.tacticalKnowledge.revision,
    orderTarget: unit.order ? { ...unit.order.target } : null,
    finalExact: true,
  };
}

function buildPixelLut(mode: 'danger' | 'stealth'): Uint32Array {
  const result = new Uint32Array(101);
  for (let value = 0; value <= 100; value += 1) {
    if (value <= 2) continue;
    let red: number;
    let green: number;
    let blue: number;
    if (mode === 'danger') {
      if (value >= 70) {
        red = 0xe8; green = 0x3d; blue = 0x32;
      } else if (value >= 40) {
        red = 0xff; green = 0x7a; blue = 0x31;
      } else {
        red = 0xf2; green = 0xc8; blue = 0x4b;
      }
    } else if (value >= 75) {
      red = 0x1c; green = 0x6b; blue = 0x45;
    } else if (value >= 50) {
      red = 0x3d; green = 0xa8; blue = 0x5f;
    } else if (value >= 25) {
      red = 0xd7; green = 0xb9; blue = 0x4b;
    } else {
      red = 0xd9; green = 0x77; blue = 0x32;
    }
    const alpha = Math.round(Math.min(0.55, 0.08 + value / 100 * 0.46) * 255);
    result[value] = packRgba(red, green, blue, alpha);
  }
  return result;
}

function packRgba(red: number, green: number, blue: number, alpha: number): number {
  return LITTLE_ENDIAN
    ? (red | green << 8 | blue << 16 | alpha << 24) >>> 0
    : (red << 24 | green << 16 | blue << 8 | alpha) >>> 0;
}

function getMapIdentity(map: object): number {
  const existing = mapIdentity.get(map);
  if (existing) return existing;
  const created = nextMapIdentity++;
  mapIdentity.set(map, created);
  return created;
}

function modeLabel(mode: VisibleTacticalOverlayMode | 'off'): string {
  if (mode === 'danger') return 'ТАКТИЧЕСКИЙ СЛОЙ: ОПАСНОСТЬ';
  if (mode === 'cover') return 'ТАКТИЧЕСКИЙ СЛОЙ: УКРЫТИЯ';
  if (mode === 'combined') return 'ТАКТИЧЕСКИЙ СЛОЙ: ОПАСНОСТЬ + УКРЫТИЯ';
  if (mode === 'stealth') return 'СЛОЙ БОЙЦА: СКРЫТНОСТЬ';
  return '';
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createMovementDiagnostics(): MutableMovementDiagnostics {
  return {
    worldRasterBuilds: 0,
    directionalBasisBuilds: 0,
    workerThreatRelativeGeometryBuilds: 0,
    workerDirectionalFieldBuilds: 0,
    workerDirectionalBasisBuilds: 0,
    workerAwarenessGeometryBuilds: 0,
    workerAwarenessRescores: 0,
    workerJobsStarted: 0,
    workerJobsCompleted: 0,
    workerJobsCancelled: 0,
    workerJobsCoalesced: 0,
    workerResultsStaleDropped: 0,
    mainThreadRasterSwaps: 0,
    finalRefreshRequests: 0,
    finalRefreshApplied: 0,
    pendingQueueDepth: 0,
    maxPendingQueueDepth: 0,
    workerInFlight: false,
    lastWorkerLatencyMs: 0,
    maxWorkerLatencyMs: 0,
    lastWorkerComputeMs: 0,
    maxWorkerComputeMs: 0,
    lastMainThreadApplyMs: 0,
    maxMainThreadApplyMs: 0,
    lastRequestedRasterKey: '',
    lastAppliedRasterKey: '',
    lastRequestedWorldKey: '',
    lastAppliedWorldKey: '',
    lastRequestedCanonicalThreatKey: '',
    lastAppliedCanonicalThreatKey: '',
    lastCompletedJobId: 0,
    lastAppliedJobId: 0,
    lastCompletedJobFinalExact: false,
    lastFinalRefreshLatencyMs: 0,
    maxFinalRefreshLatencyMs: 0,
    lastAppliedFieldIdentity: '',
    lastAppliedRasterDigest: '',
    lastWorkerError: null,
  };
}
