import type { UnitPosture } from '../behavior/BehaviorModel';

/** Canonical eye/silhouette height for a human soldier in each posture. */
export function soldierPostureHeightMeters(posture: UnitPosture): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.7;
}
