import {
  runAiGraph as runLegacyAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerInput,
  type AiGraphRunnerResult,
  type AiGraphTacticalHost,
} from './AiGraphRunnerLegacy';
import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from './tactical/TacticalQuery';

export * from './AiGraphRunnerLegacy';

/**
 * Adds stateful tactical request identity and preserves the selected position's
 * required posture. The exact tactical host still belongs to the simulation's
 * AiGameBridge; this wrapper never discovers a provider by unit id.
 */
export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  const queryKeys = input.graph.nodes
    .filter((node) => node.type === 'CreateCoverCandidates')
    .map((node) => readString(node.parameters?.queryKey, 'cover_query'));
  const result = runLegacyAiGraph({
    ...input,
    tacticalHost: wrapStatefulTacticalHost(input, queryKeys),
  });

  let blackboard = result.blackboard;
  let effects = result.effects;
  let changed = false;
  const writeMemory = (key: string, value: string | null): void => {
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
      if (posture !== 'standing' && posture !== 'crouched' && posture !== 'prone') continue;
      writeMemory(`${writeTo}_posture`, posture);
    }
  }

  return changed ? { ...result, blackboard, effects } : result;
}

function wrapStatefulTacticalHost(
  input: AiGraphRunnerInput,
  queryKeys: readonly string[],
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
      return generate({
        ...request,
        queryKey,
        requestId: typeof stored === 'string' && stored.length > 0 ? stored : undefined,
      });
    },
  };
}

export function tacticalRequestMemoryKey(queryKey: string): string {
  return `${queryKey}_request_id`;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
