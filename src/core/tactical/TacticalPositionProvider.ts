import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from '../ai/tactical/TacticalQuery';
import type { UnitModel } from '../units/UnitModel';

/**
 * Pure AI-facing adapter over application-owned prepared tactical fields.
 * Implementations may schedule asynchronous preparation, but this call itself
 * must remain bounded and must never perform a full-map calculation.
 */
export interface TacticalPositionProvider {
  generate(
    unit: UnitModel,
    request: TacticalQueryGenerationRequest,
  ): TacticalQueryGenerationResult;
}
