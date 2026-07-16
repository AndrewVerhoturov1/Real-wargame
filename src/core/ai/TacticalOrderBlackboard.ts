import type { TacticalOrderIntent } from '../orders/TacticalOrderIntent';
import type { UnitModel } from '../units/UnitModel';
import type { AiGraphRunnerBlackboard } from './AiGraphRunner';

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
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & TacticalOrderRuntimeMemoryCarrier;
  const values: AiGraphRunnerBlackboard = {
    player_order_preset: intent.presetId,
    player_order_navigation_profile: intent.navigationProfileId,
    player_order_attention_policy: intent.attentionPolicy,
    player_order_contact_policy: intent.contactPolicy,
    player_order_fire_policy: intent.firePolicy,
    player_order_resume_after_interruption: intent.resumeAfterTemporaryInterruption,
  };
  if (runtime.aiRuntimeSession) {
    runtime.aiRuntimeSession = {
      ...runtime.aiRuntimeSession,
      blackboardMemory: {
        ...runtime.aiRuntimeSession.blackboardMemory,
        ...values,
      },
    } as typeof runtime.aiRuntimeSession;
    return;
  }
  runtime.aiGraphMemory = {
    ...(runtime.aiGraphMemory ?? {}),
    ...values,
  };
}
