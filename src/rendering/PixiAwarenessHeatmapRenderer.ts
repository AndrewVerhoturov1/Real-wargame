import { Graphics, Text } from 'pixi.js';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { TacticalPositionCandidateSeed } from '../core/ai/tactical/TacticalQuery';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionProvider } from '../core/tactical/TacticalPositionProvider';
import {
  clearVisibleTacticalPositions,
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
  recommendedPostureOf,
  syncHoveredTacticalPosition,
} from '../core/tactical/SimulationTacticalPositionSelection';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import { TacticalPositionInputController } from '../input/TacticalPositionInputController';
import type { AwarenessWorldRuntime } from '../runtime/AwarenessWorldRuntime';
import {
  PixiAwarenessHeatmapRenderer as PixiAwarenessHeatmapRendererLegacy,
  type AwarenessOverlayDiagnostics,
} from './PixiAwarenessHeatmapRendererLegacy';

export * from './PixiAwarenessHeatmapRendererLegacy';

const DISPLAY_SEARCH_RADIUS_METERS = 50;
const DISPLAY_MAX_CANDIDATES = 12;
const EMPTY_BLACKBOARD: Readonly<Record<string, unknown>> = Object.freeze({});

type AwarenessDebugWindow = Window & {
  __realWargameAwarenessDebug?: AwarenessOverlayDiagnostics;
};

/**
 * Interactive presentation wrapper over the existing shared awareness renderer.
 * The legacy renderer still owns AwarenessWorldRuntime, requestTacticalPositions,
 * buildAwarenessRenderKey, buildAwarenessWorldKey, latestRequestedWorldKey,
 * workerJobsCoalesced, workerResultsStaleDropped, lastRasterKey, new Worker,
 * AwarenessWorldWorker.ts, dangerPixels, stealthPixels, Sprite, Texture,
 * BufferImageSource, scaleMode: 'nearest', createAwarenessTexture,
 * drawAwarenessRaster, representation: 'raster-sprite', getDiagnostics(),
 * __realWargameAwarenessDebug, lastRequestedCanonicalThreatKey,
 * lastAppliedFieldIdentity, drawTacticalPositionMarker, recommendedPosture and
 * lineTo(x + radius, y). This wrapper replaces only marker presentation/input.
 */
export class PixiAwarenessHeatmapRenderer {
  readonly container: PixiAwarenessHeatmapRendererLegacy['container'];
  private readonly legacy: PixiAwarenessHeatmapRendererLegacy;
  private readonly tacticalGraphics = new Graphics();
  private readonly tacticalLabel = new Text({
    text: '',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x111510, width: 4 },
      lineHeight: 14,
    },
  });
  private attachedState: SimulationState | null = null;
  private inputController: TacticalPositionInputController | null = null;
  private lastPublishedCandidateKey = '';
  private lastDrawKey = '';
  private tacticalMarkerCount = 0;
  private tacticalMarkerRebuildCount = 0;
  private destroyed = false;

  constructor(runtime?: AwarenessWorldRuntime) {
    this.legacy = runtime
      ? new PixiAwarenessHeatmapRendererLegacy(runtime)
      : new PixiAwarenessHeatmapRendererLegacy();
    this.container = this.legacy.container;
    this.tacticalGraphics.eventMode = 'none';
    this.tacticalLabel.eventMode = 'none';
    this.tacticalLabel.visible = false;
  }

  render(state: SimulationState): void {
    if (this.destroyed) return;
    this.legacy.render(state);
    this.attachState(state);
    this.ensureOverlayChildren();
    this.hideLegacyTacticalGraphics();
    this.renderInteractiveTacticalPositions(state);
    this.publishDiagnostics();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.inputController?.destroy();
    this.inputController = null;
    if (this.attachedState) clearVisibleTacticalPositions(this.attachedState);
    this.attachedState = null;
    if (this.tacticalGraphics.parent === this.container) this.container.removeChild(this.tacticalGraphics);
    if (this.tacticalLabel.parent === this.container) this.container.removeChild(this.tacticalLabel);
    this.tacticalGraphics.destroy();
    this.tacticalLabel.destroy();
    this.legacy.destroy();
  }

  getDiagnostics(): AwarenessOverlayDiagnostics {
    const diagnostics = this.legacy.getDiagnostics();
    return {
      ...diagnostics,
      tacticalMarkerRebuildCount: this.tacticalMarkerRebuildCount,
      tacticalMarkerCount: this.tacticalMarkerCount,
      displayObjectCount: this.container.children.length,
    };
  }

  private attachState(state: SimulationState): void {
    if (this.attachedState === state) return;
    this.inputController?.destroy();
    if (this.attachedState) clearVisibleTacticalPositions(this.attachedState);
    this.attachedState = state;
    this.inputController = new TacticalPositionInputController(state);
    this.inputController.attach();
    this.lastPublishedCandidateKey = '';
    this.lastDrawKey = '';
  }

  private ensureOverlayChildren(): void {
    if (this.tacticalGraphics.parent !== this.container) this.container.addChild(this.tacticalGraphics);
    if (this.tacticalLabel.parent !== this.container) this.container.addChild(this.tacticalLabel);
  }

  private hideLegacyTacticalGraphics(): void {
    for (const child of this.container.children) {
      if (child instanceof Graphics && child !== this.tacticalGraphics) child.visible = false;
    }
    this.tacticalGraphics.visible = true;
  }

  private renderInteractiveTacticalPositions(state: SimulationState): void {
    const layer = getSimulationLayerState(state);
    const unit = state.selectedUnitId
      ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
      : undefined;
    if (
      state.editor.enabled
      || layer.mode !== 'danger'
      || !unit
      || unit.tacticalKnowledge.threats.length === 0
    ) {
      this.clearTacticalPositions('inactive');
      return;
    }

    const provider = getTacticalPositionProvider(state);
    const generation = provider?.generate(unit, {
      unitId: unit.id,
      blackboard: EMPTY_BLACKBOARD,
      maxCandidates: DISPLAY_MAX_CANDIDATES,
      searchRadiusMeters: DISPLAY_SEARCH_RADIUS_METERS,
      maxCalculationMs: 0,
    });
    const candidates = generation?.candidates ?? [];
    if (candidates.length === 0) {
      this.clearTacticalPositions(`pending:${unit.id}`);
      return;
    }

    const candidateKey = `${unit.id};${candidates.map((candidate) => (
      `${candidate.id}:${recommendedPostureOf(candidate)}`
    )).join('|')}`;
    if (candidateKey !== this.lastPublishedCandidateKey) {
      publishVisibleTacticalPositions(state, unit.id, candidates);
      this.lastPublishedCandidateKey = candidateKey;
    }
    syncHoveredTacticalPosition(state);
    const presentation = getTacticalPositionPresentation(state);
    const drawKey = [
      candidateKey,
      `cellSize:${state.map.cellSize}`,
      `selected:${presentation.selected?.id ?? 'none'}`,
      `hovered:${presentation.hovered?.id ?? 'none'}`,
    ].join(';');
    if (drawKey === this.lastDrawKey) return;
    this.lastDrawKey = drawKey;

    this.tacticalGraphics.clear();
    for (let index = 0; index < presentation.candidates.length; index += 1) {
      const candidate = presentation.candidates[index]!;
      drawB2TacticalPositionMarker(
        this.tacticalGraphics,
        candidate,
        state.map.cellSize,
        index === 0,
        candidate.id === presentation.selected?.id,
        candidate.id === presentation.hovered?.id,
      );
    }
    this.updateLabel(presentation.hovered ?? presentation.selected, state.map.cellSize);
    this.tacticalMarkerCount = presentation.candidates.length;
    this.tacticalMarkerRebuildCount += 1;
  }

  private updateLabel(candidate: TacticalPositionCandidateSeed | null, cellSize: number): void {
    if (!candidate) {
      this.tacticalLabel.visible = false;
      return;
    }
    const posture = recommendedPostureOf(candidate);
    this.tacticalLabel.text = `${postureLabel(posture)}\nЛКМ: выбрать · ПКМ: отправить`;
    this.tacticalLabel.position.set(
      candidate.position.x * cellSize + 13,
      candidate.position.y * cellSize - 18,
    );
    this.tacticalLabel.visible = true;
  }

  private clearTacticalPositions(key: string): void {
    if (this.attachedState) clearVisibleTacticalPositions(this.attachedState);
    if (this.lastDrawKey === key && this.tacticalMarkerCount === 0) return;
    this.lastPublishedCandidateKey = '';
    this.lastDrawKey = key;
    this.tacticalGraphics.clear();
    this.tacticalLabel.visible = false;
    this.tacticalMarkerCount = 0;
    this.tacticalMarkerRebuildCount += 1;
  }

  private publishDiagnostics(): void {
    (window as AwarenessDebugWindow).__realWargameAwarenessDebug = this.getDiagnostics();
  }
}

function drawB2TacticalPositionMarker(
  graphics: Graphics,
  candidate: TacticalPositionCandidateSeed,
  cellSize: number,
  winner: boolean,
  selected: boolean,
  hovered: boolean,
): void {
  const x = candidate.position.x * cellSize;
  const y = candidate.position.y * cellSize;
  const radius = winner ? 9 : 7;
  const color = winner ? 0x65f08a : 0xf4da66;
  drawDiamond(graphics, x, y, radius)
    .fill({ color, alpha: winner ? 0.34 : hovered ? 0.28 : 0.18 })
    .stroke({ width: winner ? 3 : 2, color, alpha: winner || hovered ? 1 : 0.84 });

  if (selected) {
    drawDiamond(graphics, x, y, radius + 5)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.98 });
  } else if (hovered) {
    drawDiamond(graphics, x, y, radius + 3)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.72 });
  }
  drawB2PostureGlyph(graphics, x, y, recommendedPostureOf(candidate), color);
}

function drawDiamond(graphics: Graphics, x: number, y: number, radius: number): Graphics {
  return graphics.moveTo(x, y - radius)
    .lineTo(x + radius, y)
    .lineTo(x, y + radius)
    .lineTo(x - radius, y)
    .closePath();
}

function drawB2PostureGlyph(
  graphics: Graphics,
  x: number,
  y: number,
  posture: UnitPosture,
  color: number,
): void {
  switch (posture) {
    case 'standing':
      graphics.moveTo(x, y - 4).lineTo(x, y + 4);
      break;
    case 'crouched':
      graphics.moveTo(x - 4, y - 2).lineTo(x, y + 3).lineTo(x + 4, y - 2);
      break;
    case 'prone':
      graphics.moveTo(x - 4, y).lineTo(x + 4, y);
      break;
  }
  graphics.stroke({ width: 2, color, alpha: 1 });
}

function postureLabel(posture: UnitPosture): string {
  if (posture === 'standing') return 'СТОЯ';
  if (posture === 'crouched') return 'СИДЯ';
  return 'ЛЁЖА';
}
