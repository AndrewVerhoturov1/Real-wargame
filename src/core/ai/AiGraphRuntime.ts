import { generateRegisteredTacticalPositions } from '../tactical/TacticalPositionProvider';
import {
  runAiGraphRuntime as runLegacyAiGraphRuntime,
  type AiGraphRuntimeInput,
  type AiGraphRuntimeResult,
} from './AiGraphRuntimeLegacy';

export * from './AiGraphRuntimeLegacy';

/**
 * Adds the application-owned tactical-position provider without changing the
 * legacy runtime implementation. The provider returns prepared or bounded data
 * only; it never performs a synchronous full-map fallback.
 */
export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  if (input.tacticalHost?.generateCoverCandidates) return runLegacyAiGraphRuntime(input);
  return runLegacyAiGraphRuntime({
    ...input,
    tacticalHost: {
      ...(input.tacticalHost ?? {}),
      generateCoverCandidates: (request) => generateRegisteredTacticalPositions(input.unitId, request) ?? {
        candidates: [],
        elapsedMs: 0,
        stopReason: {
          code: 'host_unavailable',
          reason: 'No active simulation registered a prepared tactical-position provider.',
          reasonRu: 'Активная симуляция не зарегистрировала подготовленный источник тактических позиций.',
        },
      },
    },
  });
}
