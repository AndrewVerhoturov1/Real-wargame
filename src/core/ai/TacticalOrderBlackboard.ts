import {
  MOVEMENT_PROFILE_MEMORY_KEYS,
  resolveMovementProfile,
} from '../movement/MovementProfileContract';
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
  intent: TacticalOrderIntent | null = unit.playerCommand?.intent ?? null,
  additionalValues: AiGraphRunnerBlackboard = {},
): void {
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & TacticalOrderRuntimeMemoryCarrier;
  const memory = runtime.aiRuntimeSession?.blackboardMemory ?? runtime.aiGraphMemory ?? {};
  const resolved = resolveMovementProfile({
    hardSafetyProfileId: memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId],
    hardSafetyReason: memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason],
    aiOverrideProfileId: memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId],
    aiOverrideOwnerToken: memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken],
    playerOrderProfileId: intent?.movementProfileId,
    unitRoleProfileId: unit.unitRoleMovementProfileId,
  });
  const requestedProfileId = intent?.movementProfileId
    ?? unit.unitRoleMovementProfileId
    ?? resolved.profileId;
  const values: AiGraphRunnerBlackboard = {
    ...additionalValues,
    [MOVEMENT_PROFILE_MEMORY_KEYS.requestedProfileId]: requestedProfileId,
    [MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId]: resolved.profileId,
    [MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource]: resolved.source,
    [MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback]: resolved.forcedFallback,
    [MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason]: resolved.forcedReason ?? '',
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
