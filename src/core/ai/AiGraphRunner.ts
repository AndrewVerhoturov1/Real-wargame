import {
  runAiGraph as runLegacyAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerInput,
  type AiGraphRunnerResult,
} from './AiGraphRunnerLegacy';

export * from './AiGraphRunnerLegacy';

/**
 * Preserves the selected field position's required posture next to its position.
 * This keeps a ditch, low wall or reverse-slope point from losing its tactical
 * meaning when Graph v2 passes the winner into a later movement/action node.
 */
export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  const result = runLegacyAiGraph(input);
  if (!result.ok) return result;

  let blackboard = result.blackboard;
  let effects = result.effects;
  let changed = false;
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
    const postureKey = `${writeTo}_posture`;
    if (!changed) {
      blackboard = { ...result.blackboard };
      effects = [...result.effects];
      changed = true;
    }
    blackboard[postureKey] = posture;
    (effects as AiGraphEffect[]).push({
      type: 'write_memory',
      key: postureKey,
      value: posture,
    });
  }

  return changed ? { ...result, blackboard, effects } : result;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
