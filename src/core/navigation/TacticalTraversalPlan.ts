import type { UnitPosture } from '../behavior/BehaviorModel';

export type TacticalTraversalPlanStatus = 'pending' | 'ready' | 'stale' | 'failed';
export type TacticalTraversalBodyFacingPolicy = 'route_heading' | 'threat_biased' | 'fixed';
export type TacticalTraversalAttentionPolicy = 'route_heading' | 'reference_threat' | 'search_sector' | 'blended';

export interface TacticalTraversalSegmentV1 {
  readonly id: string;
  readonly startRouteCellIndex: number;
  readonly endRouteCellIndex: number;
  readonly movementProfileId: string;
  readonly posture: UnitPosture;
  readonly bodyFacingPolicy: TacticalTraversalBodyFacingPolicy;
  readonly attentionPolicy: TacticalTraversalAttentionPolicy;
  readonly resolvedBodyFacingRadians: number | null;
  readonly resolvedAttentionCenterRadians: number | null;
  readonly attentionArcRadians: number | null;
  readonly referenceThreatId: string | null;
  readonly averageDanger: number;
  readonly maximumDanger: number;
  readonly averageSuppression: number;
  readonly averageProtection: number;
  readonly averageConcealment: number;
  readonly estimatedDurationSeconds: number;
  readonly transitionCost: number;
  readonly reasonCodes: readonly string[];
}

export interface TacticalTraversalPlanV1 {
  readonly version: 1;
  readonly routeRevision: number;
  readonly routeHash: string;
  readonly commandId: string | null;
  readonly commandRevision: number;
  readonly worldKey: string;
  readonly fieldIdentity: string;
  readonly knowledgeRevision: number;
  readonly tacticalPositionSettingsRevision: number;
  readonly tacticalTraversalProfileRevision: number;
  readonly movementProfileRevision: number;
  readonly intentVersion: number;
  readonly segments: readonly TacticalTraversalSegmentV1[];
  readonly estimatedDurationSeconds: number;
  readonly estimatedDangerExposure: number;
  readonly estimatedSuppressionExposure: number;
  readonly estimatedStaminaCost: number;
  readonly reasonCodes: readonly string[];
}

export function hashTraversalRoute(cells: readonly { x: number; y: number }[]): string {
  let hash = 2166136261 >>> 0;
  for (const cell of cells) {
    hash ^= Math.floor(cell.x) | 0;
    hash = Math.imul(hash, 16777619);
    hash ^= Math.floor(cell.y) | 0;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= cells.length;
  hash = Math.imul(hash, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function cloneTacticalTraversalPlan(
  plan: TacticalTraversalPlanV1 | null | undefined,
): TacticalTraversalPlanV1 | undefined {
  if (!plan) return undefined;
  return {
    ...plan,
    segments: plan.segments.map((segment) => ({
      ...segment,
      reasonCodes: [...segment.reasonCodes],
    })),
    reasonCodes: [...plan.reasonCodes],
  };
}

export function normalizeTacticalTraversalPlan(value: unknown): TacticalTraversalPlanV1 | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.segments)) return undefined;
  const segments: TacticalTraversalSegmentV1[] = [];
  for (const item of value.segments) {
    const segment = normalizeSegment(item);
    if (!segment) return undefined;
    segments.push(segment);
  }
  return {
    version: 1,
    routeRevision: integer(value.routeRevision),
    routeHash: text(value.routeHash),
    commandId: nullableText(value.commandId),
    commandRevision: integer(value.commandRevision),
    worldKey: text(value.worldKey),
    fieldIdentity: text(value.fieldIdentity),
    knowledgeRevision: integer(value.knowledgeRevision),
    tacticalPositionSettingsRevision: integer(value.tacticalPositionSettingsRevision),
    tacticalTraversalProfileRevision: integer(value.tacticalTraversalProfileRevision),
    movementProfileRevision: integer(value.movementProfileRevision),
    intentVersion: integer(value.intentVersion),
    segments,
    estimatedDurationSeconds: nonNegative(value.estimatedDurationSeconds),
    estimatedDangerExposure: nonNegative(value.estimatedDangerExposure),
    estimatedSuppressionExposure: nonNegative(value.estimatedSuppressionExposure),
    estimatedStaminaCost: nonNegative(value.estimatedStaminaCost),
    reasonCodes: stringArray(value.reasonCodes),
  };
}

export function tacticalTraversalPlanMatches(input: {
  readonly plan: TacticalTraversalPlanV1;
  readonly routeRevision: number;
  readonly routeCells: readonly { x: number; y: number }[];
  readonly commandId: string | null;
  readonly commandRevision: number;
  readonly worldKey: string;
  readonly fieldIdentity: string;
  readonly knowledgeRevision: number;
  readonly tacticalPositionSettingsRevision: number;
  readonly tacticalTraversalProfileRevision: number;
  readonly movementProfileRevision: number;
  readonly intentVersion: number;
}): boolean {
  const plan = input.plan;
  return plan.version === 1
    && plan.routeRevision === input.routeRevision
    && plan.routeHash === hashTraversalRoute(input.routeCells)
    && plan.commandId === input.commandId
    && plan.commandRevision === input.commandRevision
    && plan.worldKey === input.worldKey
    && plan.fieldIdentity === input.fieldIdentity
    && plan.knowledgeRevision === input.knowledgeRevision
    && plan.tacticalPositionSettingsRevision === input.tacticalPositionSettingsRevision
    && plan.tacticalTraversalProfileRevision === input.tacticalTraversalProfileRevision
    && plan.movementProfileRevision === input.movementProfileRevision
    && plan.intentVersion === input.intentVersion;
}

export function findTraversalSegmentIndex(
  plan: TacticalTraversalPlanV1,
  routeCellIndex: number,
): number {
  if (plan.segments.length === 0) return -1;
  const index = Math.max(0, Math.floor(routeCellIndex));
  let low = 0;
  let high = plan.segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = plan.segments[middle]!;
    if (index < segment.startRouteCellIndex) high = middle - 1;
    else if (index > segment.endRouteCellIndex) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(plan.segments.length - 1, low));
}

function normalizeSegment(value: unknown): TacticalTraversalSegmentV1 | undefined {
  if (!isRecord(value)) return undefined;
  const posture = value.posture;
  const bodyFacingPolicy = value.bodyFacingPolicy;
  const attentionPolicy = value.attentionPolicy;
  if (!isPosture(posture)
    || !isBodyFacingPolicy(bodyFacingPolicy)
    || !isAttentionPolicy(attentionPolicy)) return undefined;
  const start = integer(value.startRouteCellIndex);
  const end = integer(value.endRouteCellIndex);
  if (end < start) return undefined;
  return {
    id: text(value.id),
    startRouteCellIndex: start,
    endRouteCellIndex: end,
    movementProfileId: text(value.movementProfileId),
    posture,
    bodyFacingPolicy,
    attentionPolicy,
    resolvedBodyFacingRadians: nullableFinite(value.resolvedBodyFacingRadians),
    resolvedAttentionCenterRadians: nullableFinite(value.resolvedAttentionCenterRadians),
    attentionArcRadians: nullableFinite(value.attentionArcRadians),
    referenceThreatId: nullableText(value.referenceThreatId),
    averageDanger: percent(value.averageDanger),
    maximumDanger: percent(value.maximumDanger),
    averageSuppression: percent(value.averageSuppression),
    averageProtection: percent(value.averageProtection),
    averageConcealment: percent(value.averageConcealment),
    estimatedDurationSeconds: nonNegative(value.estimatedDurationSeconds),
    transitionCost: nonNegative(value.transitionCost),
    reasonCodes: stringArray(value.reasonCodes),
  };
}

function isPosture(value: unknown): value is UnitPosture {
  return value === 'standing' || value === 'crouched' || value === 'prone';
}

function isBodyFacingPolicy(value: unknown): value is TacticalTraversalBodyFacingPolicy {
  return value === 'route_heading' || value === 'threat_biased' || value === 'fixed';
}

function isAttentionPolicy(value: unknown): value is TacticalTraversalAttentionPolicy {
  return value === 'route_heading'
    || value === 'reference_threat'
    || value === 'search_sector'
    || value === 'blended';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, nonNegative(value)));
}

function nullableFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
