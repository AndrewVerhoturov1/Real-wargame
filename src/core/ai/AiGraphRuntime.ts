import { readAiSimulationExecutionContext } from './AiSimulationExecutionContext';
import {
  runAiGraphRuntime as runLegacyAiGraphRuntime,
  type AiGraphRuntimeInput,
  type AiGraphRuntimeResult,
} from './AiGraphRuntimeLegacy';
import { generateSimulationTacticalPositions } from '../tactical/SimulationTacticalPositionGraphHost';

export * from './AiGraphRuntimeLegacy';

/**
 * Runtime extension bound to the exact trusted scheduler context. There is no
 * fallback lookup by unit id; diagnostic calls without a simulation context do
 * not start tactical-position computation.
 */
export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  const context = readAiSimulationExecutionContext(input.unitId);
  if (!context) return runLegacyAiGraphRuntime(input);
  return runLegacyAiGraphRuntime({
    ...input,
    tacticalHost: {
      ...input.tacticalHost,
      generateCoverCandidates: (request) => generateSimulationTacticalPositions(
        context.state,
        context.unit,
        request,
      ),
    },
  });
}
