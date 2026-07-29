import type { CombatLabExperimentVisualController } from './CombatLabExperimentVisualController';

/**
 * Structural visual-side contract. The Stage 10 batch DTO is assignable to it
 * without coupling this worker branch to the batch worker files.
 */
export interface CombatLabRepresentativeRunV1 {
  readonly runIndex: number;
  readonly seed: number;
  readonly success: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
}

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
