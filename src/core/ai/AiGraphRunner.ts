import { isGridPositionValue } from './AiBlackboard';
import type { AiNodeParameters } from './AiGraph';
import {
  runAiGraph as runLegacyAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphRunnerInput,
  type AiGraphRunnerResult,
  type AiGraphTacticalHost,
} from './AiGraphRunnerLegacy';
import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from './tactical/TacticalQuery';
import {
  readTacticalPositionNodeSettings,
  tacticalPositionSearchSettingsDigest,
  type TacticalPositionNodeSettings,
  type TacticalPositionSearchSettings,
} from '../tactical/TacticalPositionNodeSettings';

export * from './AiGraphRunnerLegacy';

interface ExtendedTacticalQueryGenerationRequest extends TacticalQueryGenerationRequest {
  readonly targetMode?: TacticalPositionNodeSettings['target']['mode'];
  readonly targetPoint?: TacticalPositionNodeSettings['target']['point'];
  readonly sectorCenterDegrees?: number;
  readonly sectorArcDegrees?: number;
  readonly maximumRouteCost?: number;
  readonly maxPositionDanger?: number;
  readonly preliminaryCandidates?: number;
  readonly exactCandidates?: number;
  readonly exactRayLimit?: number;
  readonly searchSettings?: TacticalPositionSearchSettings;
}

/**
 * Adds stateful tactical request identity and preserves the selected position's
 * required posture, facing, kind and request identity. New generalized query
 * nodes are adapted to the legacy evaluator without changing saved cover graphs.
 * Search-sector nodes may also resolve their center from subjective Blackboard
 * positions before the legacy evaluator produces its ordinary effect.
 */
export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  const tacticalConfigs = new Map<string, TacticalPositionNodeSettings>();
  const graph = {
    ...input.graph,
    nodes: input.graph.nodes.map((node) => {
      if (node.type === 'SetSearchSector' && readString(node.parameters?.centerSource, 'fixed') === 'blackboard_position') {
        const centerDegrees = resolveSearchSectorCenterDegrees(node.parameters, input.blackboard);
        if (centerDegrees === null) {
          return {
            ...node,
            type: 'FlagCheck',
            parameters: {
              flagKey: '__real_wargame_dynamic_search_sector_position_available__',
              expected: true,
            },
          };
        }
        return {
          ...node,
          parameters: {
            ...node.parameters,
            centerDegrees,
          },
        };
      }
      if (node.type !== 'CreateTacticalPositionCandidates') return node;
      const config = readTacticalPositionNodeSettings(node.parameters);
      tacticalConfigs.set(config.queryKey, config);
      return {
        ...node,
        type: 'CreateCoverCandidates',
        parameters: {
          ...node.parameters,
          queryKey: config.queryKey,
          maxCandidates: config.searchBudget.maxCandidates,
          searchRadiusMeters: config.searchRadiusMeters,
          maxCalculationMs: config.maxCalculationMs,
        },
      };
    }),
  };
  for (const node of input.graph.nodes) {
    if (node.type !== 'CreateCoverCandidates') continue;
    const queryKey = readString(node.parameters?.queryKey, 'cover_query');
    if (!tacticalConfigs.has(queryKey)) {
      tacticalConfigs.set(queryKey, readTacticalPositionNodeSettings({
        ...node.parameters,
        queryKey,
        kind: 'defense',
        objective: 'balanced',
      }));
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
    const requestKey = tacticalRequestMemoryKey(queryKey);
    const identityKey = tacticalConfigMemoryKey(queryKey);
    const config = tacticalConfigs.get(queryKey);
    const configIdentity = config ? tacticalConfigIdentity(config) : null;
    if (
      query.searchRequestId
      && query.searchRequestStatus !== 'stale'
      && query.searchRequestStatus !== 'cancelled'
      && query.searchRequestStatus !== 'failed'
    ) {
      if (blackboard[requestKey] !== query.searchRequestId) writeMemory(requestKey, query.searchRequestId);
      if (configIdentity && blackboard[identityKey] !== configIdentity) writeMemory(identityKey, configIdentity);
    } else if (
      query.searchRequestStatus === 'stale'
      || query.searchRequestStatus === 'cancelled'
      || query.searchRequestStatus === 'failed'
    ) {
      if (blackboard[requestKey] !== null) writeMemory(requestKey, null);
      if (blackboard[identityKey] !== null) writeMemory(identityKey, null);
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
      if (posture === 'standing' || posture === 'crouched' || posture === 'prone') writeMemory(`${writeTo}_posture`, posture);
      const facing = winner?.metrics.recommendedFacingRadians;
      if (typeof facing === 'number' && Number.isFinite(facing)) writeMemory(`${writeTo}_facing`, facing);
      if (winner?.kind) writeMemory(`${writeTo}_kind`, winner.kind);
      if (winner?.requestIdentity) writeMemory(`${writeTo}_request_identity`, winner.requestIdentity);
    }
  }
  return changed ? { ...result, blackboard, effects } : result;
}

export function resolveSearchSectorCenterDegrees(
  parameters: AiNodeParameters | undefined,
  blackboard: AiGraphRunnerBlackboard,
): number | null {
  if (readString(parameters?.centerSource, 'fixed') !== 'blackboard_position') {
    return normalizeDegrees(readNumber(parameters?.centerDegrees, 0));
  }
  const originKey = readString(parameters?.originPositionKey, 'self_position');
  const targetKey = readString(parameters?.targetPositionKey, 'suspected_enemy_position');
  const origin = blackboard[originKey];
  const target = blackboard[targetKey];
  if (!isGridPositionValue(origin) || !isGridPositionValue(target)) return null;
  const deltaX = target.x - origin.x;
  const deltaY = target.y - origin.y;
  if (Math.abs(deltaX) <= 1e-9 && Math.abs(deltaY) <= 1e-9) return null;
  return normalizeDegrees(Math.atan2(deltaY, deltaX) * 180 / Math.PI);
}

function wrapStatefulTacticalHost(
  input: AiGraphRunnerInput,
  queryKeys: readonly string[],
  tacticalConfigs: ReadonlyMap<string, TacticalPositionNodeSettings>,
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
      const config = tacticalConfigs.get(queryKey);
      const storedRequest = input.blackboard[tacticalRequestMemoryKey(queryKey)];
      const storedIdentity = input.blackboard[tacticalConfigMemoryKey(queryKey)];
      const currentIdentity = config ? tacticalConfigIdentity(config) : null;
      const canReuse = typeof storedRequest === 'string'
        && storedRequest.length > 0
        && currentIdentity !== null
        && storedIdentity === currentIdentity;
      const extended: ExtendedTacticalQueryGenerationRequest = {
        ...request,
        queryKey,
        requestId: canReuse ? storedRequest : undefined,
        kind: config?.kind ?? request.kind ?? 'cover',
        objective: config?.objective ?? request.objective,
        target: config ? null : request.target,
        targetMode: config?.target.mode,
        targetPoint: config?.target.point,
        sectorCenterDegrees: config?.target.sectorCenterDegrees,
        sectorArcDegrees: config?.target.sectorArcDegrees,
        maximumRouteCost: config?.searchBudget.maximumRouteCost,
        maxPositionDanger: config?.constraints.maxPositionDanger,
        preliminaryCandidates: config?.searchBudget.preliminaryCandidates,
        exactCandidates: config?.searchBudget.exactCandidates,
        exactRayLimit: config?.searchBudget.exactRayLimit,
        searchSettings: config?.search,
      };
      return generate(extended);
    },
  };
}

export function tacticalRequestMemoryKey(queryKey: string): string {
  return `${queryKey}_request_id`;
}

export function tacticalConfigMemoryKey(queryKey: string): string {
  return `${queryKey}_config_identity`;
}

function tacticalConfigIdentity(config: TacticalPositionNodeSettings): string {
  return [
    config.kind,
    config.objective,
    config.target.mode,
    config.target.point ? `${config.target.point.x}:${config.target.point.y}` : 'none',
    config.target.sectorCenterDegrees,
    config.target.sectorArcDegrees,
    config.searchRadiusMeters,
    config.maxCalculationMs,
    tacticalPositionSearchSettingsDigest(config.search),
  ].join('|');
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}