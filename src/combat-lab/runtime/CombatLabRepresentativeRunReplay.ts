import type { CombatLabRepresentativeRunV1 } from '../../core/testing/combat-lab/experiment/CombatLabBatchContracts';
import type { CombatLabExperimentVisualController } from './CombatLabExperimentVisualController';

export function replayCombatLabRepresentativeRun(
  controller: CombatLabExperimentVisualController,
  representative: CombatLabRepresentativeRunV1,
): void {
  validateRepresentative(representative);
  controller.stop();
  controller.reset(representative.seed);
  controller.setRepresentativeContext(Object.freeze({
    runIndex: representative.runIndex,
    stopReason: representative.stopReason,
  }));
}

function validateRepresentative(value: CombatLabRepresentativeRunV1): void {
  if (!Number.isInteger(value.runIndex) || value.runIndex < 0) {
    throw new Error('Combat Lab representative runIndex must be a non-negative integer.');
  }
  if (!Number.isFinite(value.seed)) {
    throw new Error('Combat Lab representative seed must be finite.');
  }
  if (!value.stopReason.trim()) {
    throw new Error('Combat Lab representative stopReason must be non-empty.');
  }
  if (!Number.isFinite(value.simulatedSeconds) || value.simulatedSeconds < 0) {
    throw new Error('Combat Lab representative simulatedSeconds must be non-negative.');
  }
  if (!value.eventDigest.trim() || !value.finalStateDigest.trim()) {
    throw new Error('Combat Lab representative digests must be non-empty.');
  }
}
