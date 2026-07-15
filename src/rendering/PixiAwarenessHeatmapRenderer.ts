import { Container, Graphics, SCALE_MODES, Sprite, Text, Texture } from 'pixi.js';
import {
  publishAwarenessMovementDiagnostics,
  resetAwarenessMovementDiagnostics,
  type AwarenessMovementDiagnostics,
} from '../core/debug/AwarenessMovementDiagnostics';
import type { GridPosition } from '../core/geometry';
import { buildPositionIndependentAwarenessKnowledgeKey } from '../core/knowledge/AwarenessWorldKey';
import {
  type SoldierAwarenessCell,
  type SoldierSafePosition,
} from '../core/knowledge/SoldierAwarenessGrid';
import type {
  AwarenessWorkerBuildSnapshot,
  AwarenessWorkerFieldPayload,
  AwarenessWorkerMapSnapshot,
  AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import type { TacticalMap, TerrainKind } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import type { KnownThreatMemory, UnitModel } from '../core/units/UnitModel';

type VisibleAwarenessMode = 'danger' | 'stealth';
type SafePositions = SoldierSafePosition[];
type MutableMovementDiagnostics = {
  -readonly [Key in keyof AwarenessMovementDiagnostics]: AwarenessMovementDiagnostics[Key];
};

interface PendingWorldBuild {
  readonly rasterKey: string;
  readonly mapKey: string;
  readonly unitId: string;
  readonly posture: UnitModel['behaviorRuntime']['posture'];
  readonly stableWorldOrigin: GridPosition;
  readonly threats: KnownThreatMemory[];
  readonly knowledgeRevision: number;
  readonly orderTarget: GridPosition | null;
  readonly finalExact: boolean;
}

interface InFlightWorldBuild {
  readonly jobId: number;
  readonly rasterKey: string;
  readonly mapKey: string;
  readonly requestedAt: number;
  readonly finalExact: boolean;
}

interface LocalDerivedSnapshot {
  readonly position: GridPosition;
  readonly orderTarget: GridPosition | null;
  readonly metersPerCell: number;
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
}

export interface AwarenessOverlayDiagnostics {
  readonly representation: 'raster-sprite';
  readonly visible: boolean;
  readonly rebuildCount: number;
  readonly markerUpdateCount: number;
  readonly lastBuildMs: number;
  readonly maxBuildMs: number;
  readonly displayObjectCount: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
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
const TERRAIN_KINDS: readonly TerrainKind[] = ['field', 'forest', 'road', 'swamp', 'rough', 'water'];
const TERRAIN_CODE = new Map<TerrainKind, number>(
  TERRAIN_KINDS.map((kind, index) => [kind, index]),
);
const MAX_SAFE_POSITIONS = 8;
const SAFE_SEARCH_RADIUS_METERS = 120;
const SAFE_DISTANCE_PENALTY_PER_METER = 0.18;
const ROUTE_SAMPLE_STEP_METERS = 5;
const FINAL_EXACT_DELAY_MS = 120;

export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();

  private readonly markerGraphics = new Graphics();
  private readonly title = new Text('', {
    fontFamily: 'Arial, sans-serif',
    fontSize: 12,
    fontWeight: '700',
    fill: 0xffffff,
    stroke: 0x111510,
    strokeThickness: 4,
  });
  private readonly movement: MutableMovementDiagnostics = createMovementDiagnostics();

  private lastRasterKey = '';
  private lastMarkerInputKey = '';
  private lastMarkerKey = '';
  private latestRequestedWorldKey = '';
  private lastAppliedWorldKey = '';
  private currentMode: VisibleAwarenessMode = 'danger';
  private rasterPixels: Uint8Array | null = null;
  private rasterPixelWords: Uint32Array | null = null;
  private rasterWidth = 0;
  private rasterHeight = 0;
  private rasterTexture: Texture | null = null;
  private rasterSprite: Sprite | null = null;
  private worldField: AwarenessWorkerFieldPayload | null = null;
  private safePositions: SafePositions = [];
  private latestLocalSnapshot: LocalDerivedSnapshot | null = null;
  private worker: Worker | null = null;
  private workerMapKey = '';
  private nextJobId = 1;
  private inFlight: InFlightWorldBuild | null = null;
  private pending: PendingWorldBuild | null = null;
  private latestBuildSnapshot: PendingWorldBuild | null = null;
  private finalRefreshTimer: number | null = null;
  private destroyed = false;
  private rebuildCount = 0;
  private markerUpdateCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;

  constructor() {
    this.title.position.set(8, 8);
    this.container.visible = false;
    resetAwarenessMovementDiagnostics();
  }

  render(state: SimulationState): void {
    const layer = getSimulationLayerState(state);
    const mode = layer.mode === 'danger'
      ? 'danger'
      : layer.mode === 'stealth'
        ? 'stealth'
        : 'off';
    const unit = state.selectedUnitId
      ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
      : undefined;

    if (state.editor.enabled || mode === 'off' || !unit) {
      this.container.visible = false;
      this.lastRasterKey = 'hidden';
      this.lastMarkerInputKey = 'hidden';
      this.lastMarkerKey = 'hidden';
      this.publishDiagnostics();
      return;
    }

    this.container.visible = true;
    this.currentMode = mode;
    this.ensureRaster(state.map.width, state.map.height, state.map.cellSize);

    const mapKey = buildAwarenessMapKey(state.map);
    this.ensureWorkerConfigured(state.map, mapKey);
    const worldKey = buildAwarenessWorldKey(state, unit);
    const rasterKey = `${worldKey};mode:${mode}`;
    const markerInputKey = buildAwarenessMarkerInputKey(state, unit, mode);
    this.latestLocalSnapshot = {
      position: { ...unit.position },
      orderTarget: unit.order ? { ...unit.order.target } : null,
      metersPerCell: state.map.metersPerCell,
      cellSize: state.map.cellSize,
      width: state.map.width,
      height: state.map.height,
    };

    if (worldKey !== this.latestRequestedWorldKey) {
      const snapshot = buildPendingWorldSnapshot(state, unit, worldKey, mapKey, false);
      this.latestRequestedWorldKey = worldKey;
      this.latestBuildSnapshot = snapshot;
      this.movement.lastRequestedRasterKey = worldKey;
      this.requestWorldBuild(snapshot);
      this.scheduleFinalExactRefresh();
    }

    if (this.worldField && this.lastAppliedWorldKey === worldKey && rasterKey !== this.lastRasterKey) {
      this.applyRaster(mode, rasterKey);
    }

    if (
      markerInputKey !== this.lastMarkerInputKey
      && this.worldField
      && this.lastAppliedWorldKey === worldKey
    ) {
      this.updateLocalDerived(this.latestLocalSnapshot);
      this.lastMarkerInputKey = markerInputKey;
    }

    this.updateMarkers(mode, state.map.cellSize);
    this.publishDiagnostics();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.finalRefreshTimer !== null) window.clearTimeout(this.finalRefreshTimer);
    this.finalRefreshTimer = null;
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    this.inFlight = null;
    this.rasterSprite?.destroy();
    this.rasterTexture?.destroy(true);
    this.container.destroy({ children: true });
    resetAwarenessMovementDiagnostics();
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    return {
      representation: 'raster-sprite',
      visible: this.container.visible,
      rebuildCount: this.rebuildCount,
      markerUpdateCount: this.markerUpdateCount,
      lastBuildMs: roundMs(this.lastBuildMs),
      maxBuildMs: roundMs(this.maxBuildMs),
      displayObjectCount: this.container.children.length,
      rasterWidth: this.rasterWidth,
      rasterHeight: this.rasterHeight,
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

    this.worker = new Worker(new URL('../workers/AwarenessWorldWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.workerMapKey = mapKey;
    this.inFlight = null;
    this.pending = null;
    this.worldField = null;
    this.lastAppliedWorldKey = '';
    this.movement.workerInFlight = false;
    this.updatePendingDepth();

    this.worker.onmessage = (event: MessageEvent<AwarenessWorkerResponse>) => {
      this.handleWorkerResponse(event.data);
    };
    this.worker.onerror = (event): void => {
      this.movement.lastWorkerError = event.message || 'Unknown awareness worker error.';
      this.finishInFlight();
      this.publishDiagnostics();
    };

    const snapshot = buildWorkerMapSnapshot(map, mapKey);
    this.worker.postMessage({ type: 'configure', map: snapshot }, [
      snapshot.terrainCodes.buffer,
      snapshot.heightLevels.buffer,
      snapshot.forestKinds.buffer,
    ]);
  }

  private requestWorldBuild(snapshot: PendingWorldBuild): void {
    this.latestBuildSnapshot = snapshot;
    if (this.inFlight) {
      this.movement.workerJobsCoalesced += 1;
      if (this.pending) this.movement.workerJobsCancelled += 1;
      this.pending = snapshot;
      this.updatePendingDepth();
      this.publishDiagnostics();
      return;
    }
    this.startWorldBuild(snapshot);
  }

  private startWorldBuild(snapshot: PendingWorldBuild): void {
    if (!this.worker || snapshot.mapKey !== this.workerMapKey) return;

    const jobId = this.nextJobId;
    this.nextJobId += 1;
    this.inFlight = {
      jobId,
      rasterKey: snapshot.rasterKey,
      mapKey: snapshot.mapKey,
      requestedAt: performance.now(),
      finalExact: snapshot.finalExact,
    };
    this.movement.workerJobsStarted += 1;
    this.movement.workerInFlight = true;

    const request: AwarenessWorkerBuildSnapshot = { jobId, ...snapshot };
    this.worker.postMessage({ type: 'build', snapshot: request });
    this.updatePendingDepth();
    this.publishDiagnostics();
  }

  private handleWorkerResponse(response: AwarenessWorkerResponse): void {
    const inFlight = this.inFlight;
    if (!inFlight || response.jobId !== inFlight.jobId) {
      this.movement.workerResultsStaleDropped += 1;
      this.publishDiagnostics();
      return;
    }

    const latency = performance.now() - inFlight.requestedAt;
    this.movement.workerJobsCompleted += 1;
    this.movement.lastWorkerLatencyMs = roundMs(latency);
    this.movement.maxWorkerLatencyMs = Math.max(
      this.movement.maxWorkerLatencyMs,
      this.movement.lastWorkerLatencyMs,
    );
    this.inFlight = null;
    this.movement.workerInFlight = false;

    if (response.type === 'error') {
      this.movement.lastWorkerError = response.message;
    } else {
      this.movement.lastWorkerComputeMs = roundMs(response.computeMs);
      this.movement.maxWorkerComputeMs = Math.max(
        this.movement.maxWorkerComputeMs,
        this.movement.lastWorkerComputeMs,
      );
      const stale = response.mapKey !== this.workerMapKey
        || response.rasterKey !== this.latestRequestedWorldKey;

      if (stale) {
        this.movement.workerResultsStaleDropped += 1;
      } else {
        this.worldField = response.field;
        this.lastAppliedWorldKey = response.rasterKey;
        this.movement.lastAppliedRasterKey = response.rasterKey;
        this.movement.worldRasterBuilds += 1;
        this.movement.directionalBasisBuilds += response.computation.directionalBasisBuilds;
        if (response.finalExact) this.movement.finalRefreshApplied += 1;
        this.applyRaster(this.currentMode, `${response.rasterKey};mode:${this.currentMode}`);
        if (this.latestLocalSnapshot) this.updateLocalDerived(this.latestLocalSnapshot);
        this.updateMarkers(this.currentMode, this.latestLocalSnapshot?.cellSize ?? 1);
      }
    }

    const next = this.pending;
    this.pending = null;
    this.updatePendingDepth();
    this.publishDiagnostics();
    if (next) this.startWorldBuild(next);
  }

  private finishInFlight(): void {
    this.inFlight = null;
    this.movement.workerInFlight = false;
    const next = this.pending;
    this.pending = null;
    this.updatePendingDepth();
    if (next) this.startWorldBuild(next);
  }

  private scheduleFinalExactRefresh(): void {
    if (this.finalRefreshTimer !== null) window.clearTimeout(this.finalRefreshTimer);
    this.finalRefreshTimer = window.setTimeout(() => {
      this.finalRefreshTimer = null;
      if (this.destroyed || !this.latestBuildSnapshot) return;
      this.movement.finalRefreshRequests += 1;
      this.requestWorldBuild({ ...this.latestBuildSnapshot, finalExact: true });
    }, FINAL_EXACT_DELAY_MS);
  }

  private applyRaster(mode: VisibleAwarenessMode, rasterKey: string): void {
    if (!this.worldField || !this.rasterPixelWords || !this.rasterTexture) return;

    const startedAt = performance.now();
    const source = mode === 'danger'
      ? this.worldField.dangerPixels
      : this.worldField.stealthPixels;
    this.rasterPixelWords.set(source.subarray(0, this.rasterPixelWords.length));
    if (source.length < this.rasterPixelWords.length) {
      this.rasterPixelWords.fill(0, source.length);
    }
    this.rasterTexture.baseTexture.update();
    this.title.text = `СЛОЙ БОЙЦА: ${modeLabel(mode)}`;
    this.lastRasterKey = rasterKey;
    this.rebuildCount += 1;
    this.movement.mainThreadRasterSwaps += 1;

    const elapsed = performance.now() - startedAt;
    this.lastBuildMs = elapsed;
    this.maxBuildMs = Math.max(this.maxBuildMs, elapsed);
    this.movement.lastMainThreadApplyMs = roundMs(elapsed);
    this.movement.maxMainThreadApplyMs = Math.max(
      this.movement.maxMainThreadApplyMs,
      this.movement.lastMainThreadApplyMs,
    );
  }

  private updateLocalDerived(snapshot: LocalDerivedSnapshot): void {
    if (!this.worldField) return;

    const startedAt = performance.now();
    const result = buildBestSafePositionsFromWorldField(this.worldField, snapshot);
    this.safePositions = result.positions;
    this.movement.ownMovementLocalUpdates += 1;
    this.movement.safePositionLocalScans += 1;
    this.movement.safePositionCellsScanned += result.scannedCells;
    evaluateRouteDangerFromWorldField(this.worldField, snapshot);

    const elapsed = performance.now() - startedAt;
    this.movement.lastLocalUpdateMs = roundMs(elapsed);
    this.movement.maxLocalUpdateMs = Math.max(
      this.movement.maxLocalUpdateMs,
      this.movement.lastLocalUpdateMs,
    );
  }

  private updateMarkers(mode: VisibleAwarenessMode, cellSize: number): void {
    const markerKey = buildAwarenessMarkerKey(this.safePositions, mode, cellSize);
    if (markerKey === this.lastMarkerKey) return;
    this.drawSafePositionMarkers(this.safePositions, mode, cellSize);
    this.lastMarkerKey = markerKey;
    this.markerUpdateCount += 1;
  }

  private updatePendingDepth(): void {
    this.movement.pendingQueueDepth = this.pending ? 1 : 0;
    this.movement.maxPendingQueueDepth = Math.max(
      this.movement.maxPendingQueueDepth,
      this.movement.pendingQueueDepth,
    );
  }

  private ensureRaster(width: number, height: number, cellSize: number): void {
    const needsNewRaster = !this.rasterPixels
      || this.rasterWidth !== width
      || this.rasterHeight !== height;

    if (needsNewRaster) {
      this.container.removeChildren();
      this.rasterSprite?.destroy();
      this.rasterTexture?.destroy(true);
      this.rasterWidth = width;
      this.rasterHeight = height;
      this.rasterPixels = new Uint8Array(width * height * 4);
      this.rasterPixelWords = new Uint32Array(this.rasterPixels.buffer);
      this.rasterTexture = Texture.fromBuffer(this.rasterPixels, width, height, {
        scaleMode: SCALE_MODES.NEAREST,
      });
      this.rasterSprite = new Sprite(this.rasterTexture);
      this.container.addChild(this.rasterSprite, this.markerGraphics, this.title);
    }

    this.rasterSprite?.scale.set(cellSize, cellSize);
  }

  private drawSafePositionMarkers(
    positions: SafePositions,
    mode: VisibleAwarenessMode,
    cellSize: number,
  ): void {
    this.markerGraphics.clear();
    if (mode !== 'danger') return;

    const markerCount = Math.min(5, positions.length);
    for (let index = 0; index < markerCount; index += 1) {
      const best = positions[index];
      const x = best.position.x * cellSize;
      const y = best.position.y * cellSize;
      this.markerGraphics.lineStyle(index === 0 ? 4 : 2, 0xefff9a, 0.95);
      this.markerGraphics.beginFill(0x4ce78a, index === 0 ? 0.45 : 0.2);
      this.markerGraphics.drawCircle(x, y, index === 0 ? 12 : 8);
      this.markerGraphics.endFill();
    }
  }

  private publishDiagnostics(): void {
    publishAwarenessMovementDiagnostics(this.movement);
    (window as AwarenessDebugWindow).__realWargameAwarenessDebug = this.getDiagnostics();
  }
}

export function buildAwarenessRenderKey(
  state: SimulationState,
  unit: UnitModel,
  mode: VisibleAwarenessMode,
): string {
  return `${buildAwarenessWorldKey(state, unit)};mode:${mode}`;
}

export function buildAwarenessWorldKey(state: SimulationState, unit: UnitModel): string {
  return [
    buildAwarenessMapKey(state.map),
    `unit:${unit.id}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `knowledge:${buildPositionIndependentAwarenessKnowledgeKey(unit)}`,
  ].join(';');
}

export function buildAwarenessMarkerKey(
  positions: ReadonlyArray<{ position: GridPosition }>,
  mode: VisibleAwarenessMode,
  cellSize: number,
): string {
  if (mode !== 'danger') return `mode:${mode};cellSize:${cellSize};markers:none`;

  const markerCount = Math.min(5, positions.length);
  let key = `mode:${mode};cellSize:${cellSize};markers:${markerCount}`;
  for (let index = 0; index < markerCount; index += 1) {
    const position = positions[index].position;
    key += `;${index}:${position.x}:${position.y}`;
  }
  return key;
}

export function createAwarenessTexture(
  cells: SoldierAwarenessCell[],
  mode: VisibleAwarenessMode,
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
  mode: VisibleAwarenessMode,
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
  mode: VisibleAwarenessMode,
): void {
  const length = Math.min(cells.length, pixels.length);
  const lut = mode === 'danger' ? DANGER_PIXEL_LUT : STEALTH_PIXEL_LUT;
  const dangerMode = mode === 'danger';
  for (let cellIndex = 0; cellIndex < length; cellIndex += 1) {
    const cell = cells[cellIndex];
    const value = dangerMode ? cell.danger : cell.concealment;
    pixels[cellIndex] = lut[Math.max(0, Math.min(100, value))] ?? 0;
  }
  if (length < pixels.length) pixels.fill(0, length);
}

function buildAwarenessMapKey(map: TacticalMap): string {
  const revisions = getMapRevisionSnapshot(map);
  return [
    `map:${getMapIdentity(map)}`,
    `size:${map.width}x${map.height}`,
    `cellSize:${map.cellSize}`,
    `meters:${map.metersPerCell}`,
    `terrain:${revisions.terrain}`,
    `height:${revisions.height}`,
    `forest:${revisions.forest}`,
    `objects:${revisions.objects}`,
  ].join(';');
}

function buildAwarenessMarkerInputKey(
  state: SimulationState,
  unit: UnitModel,
  mode: VisibleAwarenessMode,
): string {
  const target = unit.order
    ? `${Math.floor(unit.order.target.x)}:${Math.floor(unit.order.target.y)}`
    : 'none';
  return [
    `mode:${mode}`,
    buildAwarenessMapKey(state.map),
    `unit:${unit.id}`,
    `unitCell:${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`,
    `target:${target}`,
  ].join(';');
}

function buildPendingWorldSnapshot(
  state: SimulationState,
  unit: UnitModel,
  rasterKey: string,
  mapKey: string,
  finalExact: boolean,
): PendingWorldBuild {
  return {
    rasterKey,
    mapKey,
    unitId: unit.id,
    posture: unit.behaviorRuntime.posture,
    stableWorldOrigin: {
      x: state.map.width / 2,
      y: state.map.height / 2,
    },
    threats: unit.tacticalKnowledge.threats.map(cloneThreat),
    knowledgeRevision: unit.tacticalKnowledge.revision,
    orderTarget: unit.order ? { ...unit.order.target } : null,
    finalExact,
  };
}

function buildWorkerMapSnapshot(map: TacticalMap, mapKey: string): AwarenessWorkerMapSnapshot {
  const count = map.width * map.height;
  const terrainCodes = new Uint8Array(count);
  const heightLevels = new Int8Array(count);
  const forestKinds = new Uint8Array(count);

  for (let index = 0; index < count; index += 1) {
    const cell = map.cells[index];
    terrainCodes[index] = TERRAIN_CODE.get(cell?.terrain ?? map.defaultTerrain) ?? 0;
    heightLevels[index] = cell?.height ?? map.defaultHeight;
    forestKinds[index] = cell?.forest ?? 0;
  }

  return {
    mapKey,
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    sourceToRuntimeCellScale: map.sourceToRuntimeCellScale,
    defaultTerrainCode: TERRAIN_CODE.get(map.defaultTerrain) ?? 0,
    defaultHeight: map.defaultHeight,
    terrainCodes,
    heightLevels,
    forestKinds,
    objects: map.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

function buildBestSafePositionsFromWorldField(
  field: AwarenessWorkerFieldPayload,
  snapshot: LocalDerivedSnapshot,
): { positions: SafePositions; scannedCells: number } {
  const radiusCells = SAFE_SEARCH_RADIUS_METERS / Math.max(0.001, snapshot.metersPerCell);
  const radiusSquared = radiusCells * radiusCells;
  const minX = Math.max(0, Math.floor(snapshot.position.x - radiusCells));
  const maxX = Math.min(snapshot.width - 1, Math.ceil(snapshot.position.x + radiusCells));
  const minY = Math.max(0, Math.floor(snapshot.position.y - radiusCells));
  const maxY = Math.min(snapshot.height - 1, Math.ceil(snapshot.position.y + radiusCells));
  const best: SafePositions = [];
  let scannedCells = 0;

  for (let y = minY; y <= maxY; y += 1) {
    const positionY = y + 0.5;
    const dy = positionY - snapshot.position.y;
    for (let x = minX; x <= maxX; x += 1) {
      const positionX = x + 0.5;
      const dx = positionX - snapshot.position.x;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;

      scannedCells += 1;
      const cellIndex = y * snapshot.width + x;
      const distanceCells = Math.sqrt(distanceSquared);
      const distanceMeters = distanceCells * snapshot.metersPerCell;
      const score = (field.safety[cellIndex] ?? 0)
        - distanceMeters * SAFE_DISTANCE_PENALTY_PER_METER;
      if (score <= 18) continue;
      if (
        best.length === MAX_SAFE_POSITIONS
        && score <= best[MAX_SAFE_POSITIONS - 1].score
      ) continue;

      const threatIndex = field.protectedThreatIndex[cellIndex] ?? -1;
      let insertionIndex = 0;
      while (insertionIndex < best.length && best[insertionIndex].score >= score) {
        insertionIndex += 1;
      }
      best.splice(insertionIndex, 0, {
        position: { x: positionX, y: positionY },
        score,
        danger: field.danger[cellIndex] ?? 0,
        expectedProtection: field.expectedProtection[cellIndex] ?? 0,
        expectedProtectionAgainstThreat: field.expectedProtectionAgainstThreat[cellIndex] ?? 0,
        protectedAgainstThreatId: threatIndex >= 0
          ? field.threatIds[threatIndex] ?? null
          : null,
        concealment: field.concealment[cellIndex] ?? 0,
        distanceCells,
        sourceRu: 'асинхронное поле опасности',
      });
      if (best.length > MAX_SAFE_POSITIONS) best.pop();
    }
  }

  return { positions: best, scannedCells };
}

function evaluateRouteDangerFromWorldField(
  field: AwarenessWorkerFieldPayload,
  snapshot: LocalDerivedSnapshot,
): number {
  if (!snapshot.orderTarget) {
    return readFieldValue(field.danger, snapshot.width, snapshot.height, snapshot.position);
  }

  const dx = snapshot.orderTarget.x - snapshot.position.x;
  const dy = snapshot.orderTarget.y - snapshot.position.y;
  const lengthMeters = Math.hypot(dx, dy) * snapshot.metersPerCell;
  const samples = Math.max(2, Math.ceil(lengthMeters / ROUTE_SAMPLE_STEP_METERS));
  let total = 0;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    total += readFieldValue(field.danger, snapshot.width, snapshot.height, {
      x: snapshot.position.x + dx * t,
      y: snapshot.position.y + dy * t,
    });
  }
  return Math.round(total / (samples + 1));
}

function readFieldValue(
  values: Uint8Array,
  width: number,
  height: number,
  position: GridPosition,
): number {
  const x = Math.max(0, Math.min(width - 1, Math.floor(position.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(position.y)));
  return values[y * width + x] ?? 0;
}

function cloneThreat(threat: KnownThreatMemory): KnownThreatMemory {
  return { ...threat };
}

function buildPixelLut(mode: VisibleAwarenessMode): Uint32Array {
  const result = new Uint32Array(101);
  for (let value = 0; value <= 100; value += 1) {
    if (value <= 2) continue;

    let red: number;
    let green: number;
    let blue: number;
    if (mode === 'danger') {
      if (value >= 70) {
        red = 0xe8;
        green = 0x3d;
        blue = 0x32;
      } else if (value >= 40) {
        red = 0xff;
        green = 0x7a;
        blue = 0x31;
      } else {
        red = 0xf2;
        green = 0xc8;
        blue = 0x4b;
      }
    } else if (value >= 75) {
      red = 0x1c;
      green = 0x6b;
      blue = 0x45;
    } else if (value >= 50) {
      red = 0x3d;
      green = 0xa8;
      blue = 0x5f;
    } else if (value >= 25) {
      red = 0xd7;
      green = 0xb9;
      blue = 0x4b;
    } else {
      red = 0xd9;
      green = 0x77;
      blue = 0x32;
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

function createMovementDiagnostics(): MutableMovementDiagnostics {
  return {
    worldRasterBuilds: 0,
    ownMovementLocalUpdates: 0,
    safePositionLocalScans: 0,
    safePositionCellsScanned: 0,
    directionalBasisBuilds: 0,
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
    lastLocalUpdateMs: 0,
    maxLocalUpdateMs: 0,
    lastRequestedRasterKey: '',
    lastAppliedRasterKey: '',
    lastWorkerError: null,
  };
}

function getMapIdentity(map: object): number {
  const existing = mapIdentity.get(map);
  if (existing !== undefined) return existing;
  const identity = nextMapIdentity;
  nextMapIdentity += 1;
  mapIdentity.set(map, identity);
  return identity;
}

function modeLabel(mode: VisibleAwarenessMode): string {
  return mode === 'danger' ? 'опасность' : 'скрытность';
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
