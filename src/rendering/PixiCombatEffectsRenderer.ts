import { Container, Graphics } from 'pixi.js';
import { getCombatEventHistory, type CombatEvent } from '../core/combat/CombatEvents';
import { gridToWorld } from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';
import { playRifleShot } from '../ui/CombatAudio';

interface ScreenPoint {
  x: number;
  y: number;
}

interface MuzzleEffect {
  kind: 'muzzle';
  startedMs: number;
  durationMs: number;
  point: ScreenPoint;
}

interface TracerEffect {
  kind: 'tracer';
  startedMs: number;
  durationMs: number;
  from: ScreenPoint;
  to: ScreenPoint;
}

interface ImpactEffect {
  kind: 'impact';
  startedMs: number;
  durationMs: number;
  point: ScreenPoint;
  hitType: Extract<CombatEvent, { kind: 'projectile_impact' }>['hitType'];
}

type CombatVisualEffect = MuzzleEffect | TracerEffect | ImpactEffect;

const MAX_ACTIVE_EFFECTS = 96;

export class PixiCombatEffectsRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly processedEventIds = new Set<string>();
  private readonly originByShotId = new Map<string, ScreenPoint>();
  private effects: CombatVisualEffect[] = [];

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
  }

  render(state: SimulationState): void {
    const nowMs = currentTimeMs();
    const history = getCombatEventHistory(state);
    this.consumeNewEvents(state, history, nowMs);
    this.effects = this.effects
      .filter((effect) => nowMs - effect.startedMs <= effect.durationMs)
      .slice(-MAX_ACTIVE_EFFECTS);

    this.graphics.clear();
    for (const effect of this.effects) {
      const progress = clamp((nowMs - effect.startedMs) / effect.durationMs, 0, 1);
      if (effect.kind === 'muzzle') drawMuzzleFlash(this.graphics, effect, progress);
      else if (effect.kind === 'tracer') drawTracer(this.graphics, effect, progress);
      else drawImpact(this.graphics, effect, progress);
    }

    this.pruneProcessedHistory(history);
  }

  destroy(): void {
    this.effects = [];
    this.processedEventIds.clear();
    this.originByShotId.clear();
    this.container.destroy({ children: true });
  }

  private consumeNewEvents(
    state: SimulationState,
    history: readonly CombatEvent[],
    nowMs: number,
  ): void {
    for (const event of history) {
      if (this.processedEventIds.has(event.id)) continue;
      this.processedEventIds.add(event.id);

      if (event.kind === 'shot_fired') {
        const origin = metresToWorld(state, event.origin);
        this.originByShotId.set(event.shotId, origin);
        this.effects.push({ kind: 'muzzle', startedMs: nowMs, durationMs: 130, point: origin });
        playRifleShot();
        continue;
      }

      if (event.kind === 'projectile_impact') {
        const impact = metresToWorld(state, event.impactPoint);
        const origin = this.originByShotId.get(event.shotId)
          ?? findShotOrigin(state, history, event.shotId);
        if (origin) {
          this.effects.push({
            kind: 'tracer',
            startedMs: nowMs,
            durationMs: 210,
            from: origin,
            to: impact,
          });
        }
        this.effects.push({
          kind: 'impact',
          startedMs: nowMs,
          durationMs: event.hitType === 'unit' ? 420 : 300,
          point: impact,
          hitType: event.hitType,
        });
      }
    }
  }

  private pruneProcessedHistory(history: readonly CombatEvent[]): void {
    const retainedEventIds = new Set(history.map((event) => event.id));
    const retainedShotIds = new Set(history.map((event) => event.shotId));
    for (const eventId of this.processedEventIds) {
      if (!retainedEventIds.has(eventId)) this.processedEventIds.delete(eventId);
    }
    for (const shotId of this.originByShotId.keys()) {
      if (!retainedShotIds.has(shotId)) this.originByShotId.delete(shotId);
    }
  }
}

function drawMuzzleFlash(graphics: Graphics, effect: MuzzleEffect, progress: number): void {
  const alpha = 1 - progress;
  const radius = 3 + (1 - progress) * 7;
  graphics.lineStyle(2, 0xfff3a1, alpha);
  graphics.moveTo(effect.point.x - radius, effect.point.y);
  graphics.lineTo(effect.point.x + radius, effect.point.y);
  graphics.moveTo(effect.point.x, effect.point.y - radius);
  graphics.lineTo(effect.point.x, effect.point.y + radius);
  graphics.beginFill(0xffcf4a, alpha * 0.9);
  graphics.drawCircle(effect.point.x, effect.point.y, Math.max(1.5, radius * 0.42));
  graphics.endFill();
}

function drawTracer(graphics: Graphics, effect: TracerEffect, progress: number): void {
  const alpha = Math.max(0, 1 - progress);
  graphics.lineStyle(2.2, 0xffe18a, alpha * 0.95);
  graphics.moveTo(effect.from.x, effect.from.y);
  graphics.lineTo(effect.to.x, effect.to.y);
  graphics.lineStyle(0.8, 0xffffff, alpha * 0.75);
  graphics.moveTo(effect.from.x, effect.from.y);
  graphics.lineTo(effect.to.x, effect.to.y);
}

function drawImpact(graphics: Graphics, effect: ImpactEffect, progress: number): void {
  const alpha = Math.max(0, 1 - progress);
  const radius = 2.5 + progress * (effect.hitType === 'unit' ? 12 : 8);
  const color = effect.hitType === 'unit'
    ? 0xff5b4d
    : effect.hitType === 'object'
      ? 0xffc26b
      : 0xd9c49a;
  graphics.lineStyle(effect.hitType === 'unit' ? 2.5 : 1.8, color, alpha);
  graphics.drawCircle(effect.point.x, effect.point.y, radius);
  graphics.beginFill(color, alpha * 0.8);
  graphics.drawCircle(effect.point.x, effect.point.y, Math.max(1, 3 * (1 - progress)));
  graphics.endFill();
}

function findShotOrigin(
  state: SimulationState,
  history: readonly CombatEvent[],
  shotId: string,
): ScreenPoint | null {
  const fired = history.find((event) => event.kind === 'shot_fired' && event.shotId === shotId);
  return fired && fired.kind === 'shot_fired' ? metresToWorld(state, fired.origin) : null;
}

function metresToWorld(
  state: SimulationState,
  point: { xMetres: number; yMetres: number },
): ScreenPoint {
  const metresPerCell = Math.max(0.001, state.map.metersPerCell);
  return gridToWorld(state.map, {
    x: point.xMetres / metresPerCell,
    y: point.yMetres / metresPerCell,
  });
}

function currentTimeMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
