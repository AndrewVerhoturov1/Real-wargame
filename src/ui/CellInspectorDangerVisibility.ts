import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { KnownThreatMemory, UnitModel } from '../core/units/UnitModel';
import {
  traceVisibilityRay,
  type VisibilityTraceBlockerKind,
} from '../core/visibility/VisibilityRayKernel';

const CACHE_LIMIT = 96;
const THREAT_ORIGIN_HEIGHT_METERS = 1.4;
const DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER = 1;
const FIRE_BLOCKED_TRANSMISSION = 0.02;

export interface DangerVisibilityExplanation {
  readonly directionalThreatCount: number;
  readonly potentialThreatCount: number;
  readonly blockedThreatCount: number;
  readonly clearThreatCount: number;
  readonly blockerKind: VisibilityTraceBlockerKind;
  readonly blockedThreatLabel: string | null;
  readonly primaryReason: string | null;
  readonly secondaryReason: string | null;
}

const cacheByState = new WeakMap<SimulationState, Map<string, DangerVisibilityExplanation>>();

/**
 * Performs only bounded single-cell traces for low-danger hover diagnostics.
 * Results are cached by soldier knowledge, posture, map visual revision and cell.
 */
export function readDangerVisibilityExplanation(
  state: SimulationState,
  unit: UnitModel,
  cellX: number,
  cellY: number,
): DangerVisibilityExplanation {
  const visualRevision = getMapRevisionSnapshot(state.map).visual;
  const key = [
    unit.id,
    unit.tacticalKnowledge.revision,
    unit.behaviorRuntime.posture,
    visualRevision,
    cellX,
    cellY,
  ].join(':');
  const cache = getCache(state);
  const cached = cache.get(key);
  if (cached) {
    touch(cache, key, cached);
    return cached;
  }

  const target = { x: cellX + 0.5, y: cellY + 0.5 };
  let directionalThreatCount = 0;
  let potentialThreatCount = 0;
  let blockedThreatCount = 0;
  let clearThreatCount = 0;
  let strongestBlockedThreat: KnownThreatMemory | null = null;
  let strongestBlockedScore = Number.NEGATIVE_INFINITY;
  let blockerKind: VisibilityTraceBlockerKind = 'none';

  for (const threat of unit.tacticalKnowledge.threats) {
    if (threat.mode !== 'directional_fire') continue;
    directionalThreatCount += 1;
    if (!directionalThreatCanReachCell(threat, target.x, target.y, state.map.metersPerCell)) continue;
    potentialThreatCount += 1;

    const trace = traceVisibilityRay(state.map, {
      origin: { x: threat.x, y: threat.y },
      target,
      originHeightAboveGroundMeters: THREAT_ORIGIN_HEIGHT_METERS,
      targetHeightAboveGroundMeters: targetHeightForPosture(unit.behaviorRuntime.posture),
      channel: 'combined',
    });
    const blocked = trace.hardBlocked || trace.fireTransmission <= FIRE_BLOCKED_TRANSMISSION;
    if (!blocked) {
      clearThreatCount += 1;
      continue;
    }

    blockedThreatCount += 1;
    const candidateKind = trace.hardBlocked ? trace.blockerKind : 'vegetation';
    const candidateScore = threat.strength * Math.max(0.1, threat.confidence / 100);
    if (candidateScore > strongestBlockedScore) {
      strongestBlockedScore = candidateScore;
      strongestBlockedThreat = threat;
      blockerKind = candidateKind;
    }
  }

  const result = buildExplanation({
    directionalThreatCount,
    potentialThreatCount,
    blockedThreatCount,
    clearThreatCount,
    blockerKind,
    blockedThreatLabel: strongestBlockedThreat?.labelRu ?? null,
  });
  cache.set(key, result);
  trim(cache);
  return result;
}

function buildExplanation(
  input: Omit<DangerVisibilityExplanation, 'primaryReason' | 'secondaryReason'>,
): DangerVisibilityExplanation {
  if (input.directionalThreatCount === 0) {
    return { ...input, primaryReason: null, secondaryReason: null };
  }
  if (input.potentialThreatCount === 0) {
    return {
      ...input,
      primaryReason: 'Основная причина низкой опасности: клетка вне сектора или дальности известных направлений огня.',
      secondaryReason: 'Известные огневые угрозы сейчас не могут воздействовать на эту клетку своим рассчитанным сектором.',
    };
  }
  if (input.blockedThreatCount === 0) {
    return { ...input, primaryReason: null, secondaryReason: null };
  }

  const blocker = blockerLabel(input.blockerKind);
  const threat = input.blockedThreatLabel ? ` угрозы «${input.blockedThreatLabel}»` : ' известной угрозы';
  if (input.clearThreatCount === 0) {
    return {
      ...input,
      primaryReason: input.potentialThreatCount === 1
        ? `Основная причина низкой опасности: ${blocker} полностью перекрывает линию огня${threat}.`
        : `Основная причина низкой опасности: все известные линии огня (${input.potentialThreatCount}) перекрыты; главный блокер — ${blocker}.`,
      secondaryReason: 'У противника нет прямой видимости и чистой линии огня на эту клетку.',
    };
  }

  return {
    ...input,
    primaryReason: `${capitalize(blocker)} перекрывает ${input.blockedThreatCount} из ${input.potentialThreatCount} известных линий огня.`,
    secondaryReason: `${input.clearThreatCount} ${lineWord(input.clearThreatCount)} остаётся открытой, поэтому клетка не полностью безопасна.`,
  };
}

function directionalThreatCanReachCell(
  threat: KnownThreatMemory,
  targetX: number,
  targetY: number,
  metersPerCell: number,
): boolean {
  const dx = targetX - threat.x;
  const dy = targetY - threat.y;
  const range = Math.hypot(dx, dy);
  const uncertaintyBonus = Math.max(0, threat.uncertaintyCells);
  if (range < Math.max(0, threat.minRangeCells - uncertaintyBonus)) return false;
  if (range > threat.rangeCells + uncertaintyBonus) return false;

  const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
  const uncertaintyMeters = uncertaintyBonus * metersPerCell;
  const allowedArc = Math.min(
    360,
    threat.arcDegrees + uncertaintyMeters * DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER,
  );
  return angularDifference(bearing, threat.directionDegrees) <= allowedArc / 2;
}

function targetHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.4;
}

function blockerLabel(kind: VisibilityTraceBlockerKind): string {
  if (kind === 'terrain') return 'склон или рельеф';
  if (kind === 'object') return 'твёрдый объект или сооружение';
  if (kind === 'vegetation') return 'плотная растительность';
  if (kind === 'boundary') return 'граница карты';
  return 'препятствие';
}

function lineWord(count: number): string {
  return count === 1 ? 'линия огня' : 'линии огня';
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function getCache(state: SimulationState): Map<string, DangerVisibilityExplanation> {
  const existing = cacheByState.get(state);
  if (existing) return existing;
  const created = new Map<string, DangerVisibilityExplanation>();
  cacheByState.set(state, created);
  return created;
}

function touch(
  cache: Map<string, DangerVisibilityExplanation>,
  key: string,
  value: DangerVisibilityExplanation,
): void {
  cache.delete(key);
  cache.set(key, value);
}

function trim(cache: Map<string, DangerVisibilityExplanation>): void {
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}
