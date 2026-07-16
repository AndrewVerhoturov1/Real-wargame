import type { TacticalOrderIntent } from '../orders/TacticalOrderIntent';
import type { UnitModel } from '../units/UnitModel';
import type { AiGraphRunnerBlackboard } from './AiGraphRunner';
import { reconcileMovementProfileRuntime } from './MovementProfileRuntimeResolver';

interface TacticalOrderRuntimeMemoryCarrier {
  aiGraphMemory?: AiGraphRunnerBlackboard;
  aiRuntimeSession?: {
    blackboardMemory: AiGraphRunnerBlackboard;
  } | null;
}

export function publishTacticalOrderIntentToAiMemory(
  unit: UnitModel,
  intent: TacticalOrderIntent,
): void {
  const values: AiGraphRunnerBlackboard = {
    player_order_preset: intent.presetId,
    player_order_navigation_profile: intent.navigationProfileId,
    player_order_movement_profile: intent.movementProfileId,
    player_order_attention_policy: intent.attentionPolicy,
    player_order_contact_policy: intent.contactPolicy,
    player_order_fire_policy: intent.firePolicy,
    player_order_resume_after_interruption: intent.resumeAfterTemporaryInterruption,
  };
  publishMovementProfileStateToAiMemory(unit, intent, values);
}

export function publishMovementProfileStateToAiMemory(
  unit: UnitModel,
  _intent: TacticalOrderIntent | null = unit.playerCommand?.intent ?? null,
  additionalValues: AiGraphRunnerBlackboard = {},
): void {
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & TacticalOrderRuntimeMemoryCarrier;
  const memory = runtime.aiRuntimeSession?.blackboardMemory ?? runtime.aiGraphMemory ?? {};
  Object.assign(memory, additionalValues);
  if (!runtime.aiRuntimeSession) runtime.aiGraphMemory = memory;
  reconcileMovementProfileRuntime(unit);
}
