import {
  runAiGraph as runLegacyAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerInput,
  type AiGraphRunnerResult,
  type AiGraphTacticalHost,
} from './AiGraphRunnerLegacy';
import type {
  TacticalPositionKind,
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from './tactical/TacticalQuery';
import type { TacticalPositionSearchObjective } from '../tactical/TacticalPositionObjective';

export * from './AiGraphRunnerLegacy';

interface TacticalNodeQueryConfig {
  readonly queryKey: string;
  readonly kind: TacticalPositionKind;
  readonly objective: TacticalPositionSearchObjective;
  readonly targetMode: 'automatic' | 'order_point' | 'facing_sector';
  readonly targetPoint: { readonly x: number; readonly y: number } | null;
  readonly sectorCenterDegrees: number;
  readonly sectorArcDegrees: number;
  readonly maximumRouteCost: number;
  readonly maxPositionDanger: number;
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
}

interface ExtendedTacticalQueryGenerationRequest extends TacticalQueryGenerationRequest {
  readonly targetMode?: TacticalNodeQueryConfig['targetMode'];
  readonly targetPoint?: TacticalNodeQueryConfig['targetPoint'];
  readonly sectorCenterDegrees?: number;
  readonly sectorArcDegrees?: number;
  readonly maximumRouteCost?: number;
  readonly maxPositionDanger?: number;
  readonly preliminaryCandidates?: number;
  readonly exactCandidates?: number;
  readonly exactRayLimit?: number;
}

/**
 * Adds stateful tactical request identity and preserves the selected position's
 * required posture, facing, kind and request identity. New generalized query
 * nodes are adapted to the legacy evaluator without changing saved cover graphs.
 */
export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  const tacticalConfigs = new Map<string, TacticalNodeQueryConfig>();
  const graph = {
    ...input.graph,
    nodes: input.graph.nodes.map((node) => {
      if (node.type !== 'CreateTacticalPositionCandidates') return node;
      const config = readTacticalNodeConfig(node.parameters);
      tacticalConfigs.set(config.queryKey, config);
      return {
        ...node,
        type: 'CreateCoverCandidates',
        parameters: {
          ...node.parameters,
          queryKey: config.queryKey,
          maxCandidates: readNumber(node.parameters?.maxCandidates, 12),
          searchRadiusMeters: readNumber(node.parameters?.searchRadiusMeters, 50),
          maxCalculationMs: readNumber(node.parameters?.maxCalculationMs, 12),
        },
      };
    }),
  };
  for (const node of input.graph.nodes) {
    if (node.type !== 'CreateCoverCandidates') continue;
    const queryKey = readString(node.parameters?.queryKey, 'cover_query');
    if (!tacticalConfigs.has(queryKey)) {
      tacticalConfigs.set(queryKey, {
        queryKey,
        kind: 'defense',
        objective: 'balanced',
        targetMode: 'automatic',
        targetPoint: null,
        sectorCenterDegrees: 0,
        sectorArcDegrees: 90,
        maximumRouteCost: 100000,
        maxPositionDanger: 78,
        preliminaryCandidates: 36,
        exactCandidates: 12,
        exactRayLimit: 32,
      });
    }
  }
  const queryKeys = [...tacticalConfigs.keys()];
  const result = runLegacyAiGraph({
    ...input,
    graph,
    tacticalHost: wrapStatefulTacticalHost(input, queryKeys, tacticalConfigs),
  });

  let blackboard = result.blackboard;
  let effects = result.effects;
  let changed = false;
  const writeMemory = (key: string, value: string | number | null): void => {
    if (!changed) {
      blackboard = { ...result.blackboard };
      effects = [...result.effects];
      changed = true;
    }
    blackboard[key] = value;
    (effects as AiGraphEffect[]).push({ type: 'write_memory', key, value });
  };

  for (const [queryKey, query] of Object.entries(result.tacticalQueries)) {
    const memoryKey = tacticalRequestMemoryKey(queryKey);
    if (
      query.searchRequestId
      && query.searchRequestStatus !== 'stale'
      && query.searchRequestStatus !== 'cancelled'
      && query.searchRequestStatus !== 'failed'
    ) {
      if (blackboard[memoryKey] !== query.searchRequestId) writeMemory(memoryKey, query.searchRequestId);
    } else if (
      query.searchRequestStatus === 'stale'
      || query.searchRequestStatus === 'cancelled'
      || query.searchRequestStatus === 'failed'
    ) {
      if (blackboard[memoryKey] !== null) writeMemory(memoryKey, null);
    }
  }

  if (result.ok) {
    for (const node of input.graph.nodes) {
      if (node.type !== 'SelectBestTacticalPosition') continue;
      const queryKey = readString(node.parameters?.queryKey, 'cover_query');
      const writeTo = readString(node.parameters?.writeTo, 'best_cover_position');
      const query = result.tacticalQueries[queryKey];
      const winner = query?.winnerCandidateId
        ? query.candidates.find((candidate) => candidate.id === query.winnerCandidateId)
        : undefined;
      const posture = winner?.metrics.recommendedPosture;
      if (posture === 'standing' || posture === 'crouched' || posture === 'prone') {
        writeMemory(`${writeTo}_posture`, posture);
      }
      const facing = winner?.metrics.recommendedFacingRadians;
      if (typeof facing === 'number' && Number.isFinite(facing)) writeMemory(`${writeTo}_facing`, facing);
      if (winner?.kind) writeMemory(`${writeTo}_kind`, winner.kind);
      if (winner?.requestIdentity) writeMemory(`${writeTo}_request_identity`, winner.requestIdentity);
    }
  }

  return changed ? { ...result, blackboard, effects } : result;
}

function wrapStatefulTacticalHost(
  input: AiGraphRunnerInput,
  queryKeys: readonly string[],
  tacticalConfigs: ReadonlyMap<string, TacticalNodeQueryConfig>,
): AiGraphTacticalHost | undefined {
  const original = input.tacticalHost;
  const generate = original?.generateCoverCandidates;
  if (!generate) return original;
  let callIndex = 0;
  return {
    ...original,
    generateCoverCandidates: (request: TacticalQueryGenerationRequest): TacticalQueryGenerationResult => {
      const queryKey = request.queryKey
        ?? queryKeys[Math.min(callIndex, Math.max(0, queryKeys.length - 1))]
        ?? 'cover_query';
      callIndex += 1;
      const stored = input.blackboard[tacticalRequestMemoryKey(queryKey)];
      const config = tacticalConfigs.get(queryKey);
      const target = config ? null : request.target;
      const extended: ExtendedTacticalQueryGenerationRequest = {
        ...request,
        queryKey,
        requestId: typeof stored === 'string' && stored.length > 0 ? stored : undefined,
        kind: config?.kind ?? request.kind ?? 'cover',
        objective: config?.objective ?? request.objective,
        target,
        targetMode: config?.targetMode,
        targetPoint: config?.targetPoint,
        sectorCenterDegrees: config?.sectorCenterDegrees,
        sectorArcDegrees: config?.sectorArcDegrees,
        maximumRouteCost: config?.maximumRouteCost,
        maxPositionDanger: config?.maxPositionDanger,
        preliminaryCandidates: config?.preliminaryCandidates,
        exactCandidates: config?.exactCandidates,
        exactRayLimit: config?.exactRayLimit,
      };
      return generate(extended);
    },
  };
}

export function tacticalRequestMemoryKey(queryKey: string): string {
  return `${queryKey}_request_id`;
}

function readTacticalNodeConfig(parameters: Readonly<Record<string, unknown>> | undefined): TacticalNodeQueryConfig {
  return {
    queryKey: readString(parameters?.queryKey, 'tactical_position_query'),
    kind: readKind(parameters?.kind),
    objective: readObjective(parameters?.objective),
    targetMode: readTargetMode(parameters?.targetMode),
    targetPoint: readPosition(parameters?.targetPoint),
    sectorCenterDegrees: readNumber(parameters?.sectorCenterDegrees, 0),
    sectorArcDegrees: clamp(readNumber(parameters?.sectorArcDegrees, 90), 1, 360),
    maximumRouteCost: Math.max(1, readNumber(parameters?.maximumRouteCost, 100000)),
    maxPositionDanger: clamp(readNumber(parameters?.maxPositionDanger, 78), 0, 100),
    preliminaryCandidates: Math.round(clamp(readNumber(parameters?.preliminaryCandidates, 36), 8, 128)),
    exactCandidates: Math.round(clamp(readNumber(parameters?.exactCandidates, 12), 1, 32)),
    exactRayLimit: Math.round(clamp(readNumber(parameters?.exactRayLimit, 32), 0, 128)),
  };
}

function readKind(value: unknown): TacticalPositionKind {
  if (value === 'observation' || value === 'firing') return value;
  return 'defense';
}

function readObjective(value: unknown): TacticalPositionSearchObjective {
  if (value === 'advance_to_threat' || value === 'withdraw_from_threat' || value === 'continue_order') return value;
  return 'balanced';
}

function readTargetMode(value: unknown): TacticalNodeQueryConfig['targetMode'] {
  if (value === 'order_point' || value === 'facing_sector') return value;
  return 'automatic';
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
