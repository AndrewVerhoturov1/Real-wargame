import { readAiSimulationExecutionContext } from './AiSimulationExecutionContext';
import {
  runAiGraphRuntime as runLegacyAiGraphRuntime,
  type AiGraphRuntimeInput,
  type AiGraphRuntimeResult,
} from './AiGraphRuntimeLegacy';
import { generateSimulationTacticalPositions } from '../tactical/SimulationTacticalPositionGraphHost';
import { occupiedTacticalPositionPosture } from '../tactical/TacticalPositionOccupation';

export * from './AiGraphRuntimeLegacy';

/**
 * Runtime extension bound to the exact trusted scheduler context. There is no
 * fallback lookup by unit id; diagnostic calls without a simulation context do
 * not start tactical-position computation.
 */
export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  const context = readAiSimulationExecutionContext(input.unitId);
  if (!context) return runLegacyAiGraphRuntime(input);
  const result = runLegacyAiGraphRuntime({
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

  const occupiedPosture = occupiedTacticalPositionPosture(context.unit);
  if (!occupiedPosture) return result;
  const graphPosture = occupiedPosture === 'standing'
    ? 'stand'
    : occupiedPosture === 'crouched'
      ? 'crouch'
      : 'prone';
  const effects = result.effects.filter((effect) => (
    effect.type !== 'set_posture' || effect.posture === graphPosture
  ));
  return effects.length === result.effects.length ? result : { ...result, effects };
}
