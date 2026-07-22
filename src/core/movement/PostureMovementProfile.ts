import type { UnitPosture } from '../behavior/BehaviorModel';
import type { MovementGait } from './MovementProfiles';

export function movementProfileIdForPosture(posture: UnitPosture): string {
  if (posture === 'prone') return 'crawl';
  if (posture === 'crouched') return 'crouched_move';
  return 'normal_walk';
}

export function movementGaitForPosture(posture: UnitPosture): MovementGait {
  if (posture === 'prone') return 'crawl';
  if (posture === 'crouched') return 'crouch_walk';
  return 'walk';
}
