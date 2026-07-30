import { Container, Graphics } from 'pixi.js';
import { getCombatEventHistory, type CombatEvent } from '../core/combat/CombatEvents';
import type { ProjectileImpactV1, ShotCommitRecordV1 } from '../core/infantry-combat/runtime';
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
  hitType: 'none' | 'terrain' | 'object' | 'unit';
}

type CombatVisualEffect = MuzzleEffect | TracerEffect | ImpactEffect;

const MAX_ACTIVE_EFFECTS = 96;
const MAX_RECENT_SOURCE_ENTRIES = 256;
const MAX_PROCESSED_IDS = 512;

/**
 * Renders short-lived combat effects without turning bounded production ledgers
 * into per-frame work. Production arrays can be replaced or trimmed, so the
 * renderer observes only their recent tail and keeps its own bounded identity
 * window. Unchanged source arrays are skipped entirely.
 */
export class PixiCombatEffectsRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly processedLegacyEventIds = new BoundedIdWindow(MAX_PROCESSED_IDS);
  private readonly processedShotIds = new BoundedIdWindow(MAX_PROCESSED_IDS);
  private readonly processedImpactIds = new BoundedIdWindow(MAX_PROCESSED_IDS);
  private readonly originByShotId = new BoundedMap<string, ScreenPoint>(MAX_PROCESSED_IDS);
  private effects: CombatVisualEffect[] = [];
  private previousHistory: readonly CombatEvent[] | null = null;
  private previousCommittedShots: readonly ShotCommitRecordV1[] | null = null;
  private previousImpacts: readonly ProjectileImpactV1[] | null = null;

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.graphics.eventMode = 'none';
    this.container.addChild(this.graphics);
  }

  render(state: SimulationState): void {
    const nowMs = currentTimeMs();
    const history = getCombatEventHistory(state);
    const projectiles = state.infantryCombatProjectiles;

    if (projectiles.committedShots !== this.previousCommittedShots) {
      this.consumeCommittedShots(state, recentTail(projectiles.committedShots), nowMs);
      this.previousCommittedShots = projectiles.committedShots;
    }
    if (projectiles.impacts !== this.previousImpacts) {
      this.consumeProjectileImpacts(state, recentTail(projectiles.impacts), nowMs);
      this.previousImpacts = projectiles.impacts;
    }
    if (history !== this.previousHistory) {
      this.consumeLegacyEvents(state, recentTail(history), nowMs);
      this.previousHistory = history;
    }

    compactActiveEffects(this.effects, nowMs);
    if (this.effects.length > MAX_ACTIVE_EFFECTS) {
      this.effects.splice(0, this.effects.length - MAX_ACTIVE_EFFECTS);
    }

    this.graphics.clear();
    for (const effect of this.effects) {
      const progress = clamp((nowMs - effect.startedMs) / effect.durationMs, 0, 1);
      if (effect.kind === 'muzzle') drawMuzzleFlash(this.graphics, effect, progress);
      else if (effect.kind === 'tracer') drawTracer(this.graphics, effect, progress);
      else drawImpact(this.graphics, effect, progress);
    }
  }

  destroy(): void {
    this.effects.length = 0;
    this.previousHistory = null;
    this.previousCommittedShots = null;
    this.previousImpacts = null;
    this.processedLegacyEventIds.clear();
    this.processedShotIds.clear();
    this.processedImpactIds.clear();
    this.originByShotId.clear();
    this.container.destroy({ children: true });
  }

  private consumeCommittedShots(
    state: SimulationState,
    committedShots: readonly ShotCommitRecordV1[],
    nowMs: number,
  ): void {
    for (const shot of committedShots) {
      if (this.processedShotIds.has(shot.shotId)) continue;
      this.startShotEffect(state, shot.shotId, shot.muzzlePosition, nowMs);
    }
  }

  private consumeProjectileImpacts(
    state: SimulationState,
    impacts: readonly ProjectileImpactV1[],
    nowMs: number,
  ): void {
    for (const impact of impacts) {
      if (!this.processedImpactIds.add(impact.impactId)) continue;
      this.startImpactEffect(state, impact.shotId, impact.point, impact.hitType, nowMs);
    }
  }

  private consumeLegacyEvents(
    state: SimulationState,
    history: readonly CombatEvent[],
    nowMs: number,
  ): void {
    for (const event of history) {
      if (!this.processedLegacyEventIds.add(event.id)) continue;

      if (event.kind === 'shot_fired') {
        if (!this.processedShotIds.has(event.shotId)) {
          this.startShotEffect(state, event.shotId, event.origin, nowMs);
        }
        continue;
      }

      if (event.kind === 'projectile_impact') {
        const legacyImpactId = `legacy:${event.id}`;
        if (!this.processedImpactIds.add(legacyImpactId)) continue;
        this.startImpactEffect(state, event.shotId, event.impactPoint, event.hitType, nowMs);
      }
    }
  }

  private startShotEffect(
    state: SimulationState,
    shotId: string,
    muzzlePosition: { xMetres: number; yMetres: number },
    nowMs: number,
  ): void {
    this.processedShotIds.add(shotId);
    const origin = metresToWorld(state, muzzlePosition);
    this.originByShotId.set(shotId, origin);
    this.effects.push({ kind: 'muzzle', startedMs: nowMs, durationMs: 130, point: origin });
    playRifleShot();
  }

  private startImpactEffect(
    state: SimulationState,
    shotId: string,
    point: { xMetres: number; yMetres: number },
    hitType: 'none' | 'terrain' | 'object' | 'unit',
    nowMs: number,
  ): void {
    const impact = metresToWorld(state, point);
    const origin = this.originByShotId.get(shotId);
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
      durationMs: hitType === 'unit' ? 420 : 300,
      point: impact,
      hitType,
    });
  }
}

class BoundedIdWindow {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly limit: number) {}

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    this.order.push(id);
    while (this.order.length > this.limit) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }
}

class BoundedMap<K, V> {
  private readonly values = new Map<K, V>();

  constructor(private readonly limit: number) {}

  get(key: K): V | undefined {
    return this.values.get(key);
  }

  set(key: K, value: V): void {
    if (this.values.has(key)) this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }

  clear(): void {
    this.values.clear();
  }
}

function recentTail<T>(values: readonly T[]): readonly T[] {
  return values.length <= MAX_RECENT_SOURCE_ENTRIES
    ? values
    : values.slice(values.length - MAX_RECENT_SOURCE_ENTRIES);
}

function compactActiveEffects(effects: CombatVisualEffect[], nowMs: number): void {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < effects.length; readIndex += 1) {
    const effect = effects[readIndex]!;
    if (nowMs - effect.startedMs > effect.durationMs) continue;
    effects[writeIndex] = effect;
    writeIndex += 1;
  }
  effects.length = writeIndex;
}

function drawMuzzleFlash(graphics: Graphics, effect: MuzzleEffect, progress: number): void {
  const alpha = 1 - progress;
  const radius = 3 + (1 - progress) * 7;
  graphics.moveTo(effect.point.x - radius, effect.point.y).lineTo(effect.point.x + radius, effect.point.y);
  graphics.moveTo(effect.point.x, effect.point.y - radius).lineTo(effect.point.x, effect.point.y + radius);
  graphics.stroke({ width: 2, color: 0xfff3a1, alpha });
  graphics.circle(effect.point.x, effect.point.y, Math.max(1.5, radius * 0.42)).fill({ color: 0xffcf4a, alpha: alpha * 0.9 });
}

function drawTracer(graphics: Graphics, effect: TracerEffect, progress: number): void {
  const alpha = Math.max(0, 1 - progress);
  graphics.moveTo(effect.from.x, effect.from.y).lineTo(effect.to.x, effect.to.y)
    .stroke({ width: 2.2, color: 0xffe18a, alpha: alpha * 0.95 });
  graphics.moveTo(effect.from.x, effect.from.y).lineTo(effect.to.x, effect.to.y)
    .stroke({ width: 0.8, color: 0xffffff, alpha: alpha * 0.75 });
}

function drawImpact(graphics: Graphics, effect: ImpactEffect, progress: number): void {
  const alpha = Math.max(0, 1 - progress);
  const radius = 2.5 + progress * (effect.hitType === 'unit' ? 12 : 8);
  const color = effect.hitType === 'unit'
    ? 0xff5b4d
    : effect.hitType === 'object'
      ? 0xffc26b
      : 0xd9c49a;
  graphics.circle(effect.point.x, effect.point.y, radius)
    .stroke({ width: effect.hitType === 'unit' ? 2.5 : 1.8, color, alpha });
  graphics.circle(effect.point.x, effect.point.y, Math.max(1, 3 * (1 - progress)))
    .fill({ color, alpha: alpha * 0.8 });
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
