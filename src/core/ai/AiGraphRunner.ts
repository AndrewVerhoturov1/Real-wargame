import { isGridPositionValue, type AiBlackboardValue } from './AiBlackboard';
import type { AiNodeParameters } from './AiGraph';
import {
  contactInvestigationStateKey,
  deserializeContactInvestigationState,
  normalizeContactInvestigationSettings,
  resolveContactInvestigation,
  serializeContactInvestigationState,
  type ContactInvestigationResult,
  type ContactInvestigationSettings,
} from './ContactInvestigation';
import { ensureContactInvestigationNodeContractRegistered } from './ContactInvestigationNodeContract';
import { listSubjectiveInvestigationContacts } from './ContactInvestigationRuntimeHost';
import { readAiSimulationExecutionContext } from './AiSimulationExecutionContext';
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

interface ContactInvestigationExecution {
  readonly nodeId: string;
  readonly stateKey: string;
  readonly result: ContactInvestigationResult;
  readonly settings: ContactInvestigationSettings;
}

/**
 * Adds stateful tactical request identity and preserves the selected position's
 * required posture, facing, kind and request identity. New generalized query
 * nodes are adapted to the legacy evaluator without changing saved cover graphs.
 * Search-sector nodes may also resolve their center from subjective Blackboard
 * positions before the legacy evaluator produces its ordinary effect.
 * Contact investigation reads a bounded subjective contact snapshot and adapts
 * the chosen contact to the existing search-sector effect.
 */
export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  ensureContactInvestigationNodeContractRegistered();
  const tacticalConfigs = new Map<string, TacticalPositionNodeSettings>();
  const investigationExecutions = new Map<string, ContactInvestigationExecution>();
  const executionContext = readAiSimulationExecutionContext(input.unitId);
  const investigationContacts = executionContext
    ? listSubjectiveInvestigationContacts(executionContext.state, executionContext.unit)
    : [];
  const nowSeconds = Math.max(0, input.nowMs / 1000);
  const graph = {
    ...input.graph,
    nodes: input.graph.nodes.map((node) => {
      if (node.type === 'InvestigateContact') {
        const settings = readContactInvestigationSettings(node.parameters);
        const stateKey = contactInvestigationStateKey(node.id);
        const previous = deserializeContactInvestigationState(input.blackboard[stateKey], nowSeconds);
        const investigation = resolveContactInvestigation(
          settings,
          investigationContacts,
          previous,
          nowSeconds,
        );
        investigationExecutions.set(node.id, {
          nodeId: node.id,
          stateKey,
          result: investigation,
          settings,
        });
        const selection = investigation.selection;
        const origin = executionContext?.unit.position ?? input.blackboard.self_position;
        const centerDegrees = selection && isGridPositionValue(origin)
          ? directionDegrees(origin, selection.contact.lastKnownPosition)
          : null;
        if (!selection || centerDegrees === null) {
          return {
            ...node,
            type: 'FlagCheck',
            parameters: {
              ...node.parameters,
              flagKey: `__real_wargame_investigation_candidate_available__:${node.id}`,
              expected: true,
            },
          };
        }
        return {
          ...node,
          type: 'SetSearchSector',
          parameters: {
            ...node.parameters,
            centerDegrees,
            arcDegrees: settings.searchArcDegrees,
            reason: `Investigate subjective contact ${selection.contact.id}.`,
            reasonRu: selection.reasonRu,
          },
        };
      }
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
  let trace = result.trace;
  let changed = false;
  const ensureMutable = (): void => {
    if (changed) return;
    blackboard = { ...result.blackboard };
    effects = [...result.effects];
    trace = [...result.trace];
    changed = true;
  };
  const writeMemory = (key: string, value: AiBlackboardValue): void => {
    ensureMutable();
    blackboard[key] = value;
    (effects as AiGraphEffect[]).push({ type: 'write_memory', key, value });
  };

  for (const execution of investigationExecutions.values()) {
    const wasExecuted = result.trace.some((item) => item.nodeId === execution.nodeId && item.status !== 'skip');
    if (!wasExecuted) continue;
    const selection = execution.result.selection;
    writeMemory(execution.stateKey, serializeContactInvestigationState(execution.result.state));
    writeMemory('investigation_contact_available', selection !== null);
    writeMemory('investigation_contact_changed', selection?.changed ?? false);
    writeMemory('investigation_contact_id', selection?.contact.id ?? null);
    writeMemory('investigation_contact_position', selection ? { ...selection.contact.lastKnownPosition } : null);
    writeMemory('investigation_contact_confidence', selection?.contact.confidence ?? 0);
    writeMemory('investigation_contact_stage', selection?.contact.stage ?? 'none');
    writeMemory('investigation_contact_distance', selection?.contact.distanceMeters ?? 0);
    writeMemory('investigation_contact_score', selection?.score ?? 0);
    const reasonRu = selection?.reasonRu ?? 'Подходящих контактов для доразведки нет.';
    const reason = selection
      ? `Contact ${selection.contact.id} selected for investigation: ${selection.reason}.`
      : 'No subjective contact is eligible for investigation.';
    ensureMutable();
    trace = trace.map((item) => item.nodeId === execution.nodeId
      ? { ...item, reason, reasonRu }
      : item);
  }

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
  return changed ? { ...result, blackboard, effects, trace } : result;
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
  return directionDegrees(origin, target);
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

function readContactInvestigationSettings(
  parameters: AiNodeParameters | undefined,
): ContactInvestigationSettings {
  return normalizeContactInvestigationSettings({
    minimumStage: readStage(parameters?.minimumStage, 'cue'),
    minimumConfidence: readNumber(parameters?.minimumConfidence, 15),
    completionStage: readStage(parameters?.completionStage, 'identified'),
    searchArcDegrees: readNumber(parameters?.searchArcDegrees, 120),
    maximumContactAgeSeconds: readNumber(parameters?.maximumContactAgeSeconds, 10),
    minimumHoldSeconds: readNumber(parameters?.minimumHoldSeconds, 1.2),
    preferredInvestigationSeconds: readNumber(parameters?.preferredInvestigationSeconds, 3),
    maximumInvestigationSeconds: readNumber(parameters?.maximumInvestigationSeconds, 5),
    revisitDelaySeconds: readNumber(parameters?.revisitDelaySeconds, 4),
    switchAdvantagePercent: readNumber(parameters?.switchAdvantagePercent, 25),
    urgentCloserMeters: readNumber(parameters?.urgentCloserMeters, 12),
    urgentCloserRatio: readNumber(parameters?.urgentCloserRatio, 0.6),
    reactToFreshFire: readBoolean(parameters?.reactToFreshFire, true),
    confidenceWeight: readNumber(parameters?.confidenceWeight, 0.3),
    proximityWeight: readNumber(parameters?.proximityWeight, 0.25),
    freshnessWeight: readNumber(parameters?.freshnessWeight, 0.2),
    urgencyWeight: readNumber(parameters?.urgencyWeight, 0.2),
    uncertaintyPenaltyWeight: readNumber(parameters?.uncertaintyPenaltyWeight, 0.15),
    currentContactBonus: readNumber(parameters?.currentContactBonus, 10),
  });
}

function directionDegrees(from: { x: number; y: number }, to: { x: number; y: number }): number | null {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) <= 1e-9 && Math.abs(deltaY) <= 1e-9) return null;
  return normalizeDegrees(Math.atan2(deltaY, deltaX) * 180 / Math.PI);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function readStage(value: unknown, fallback: ContactInvestigationSettings['minimumStage']): ContactInvestigationSettings['minimumStage'] {
  return value === 'cue' || value === 'suspicion' || value === 'contact' || value === 'identified' || value === 'confirmed'
    ? value
    : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
