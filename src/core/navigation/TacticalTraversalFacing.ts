import type { GridPosition } from '../geometry';
import type { MovementProfile } from '../movement/MovementProfileTypes';
import type { TacticalTraversalProfile } from './TacticalTraversalProfile';
import type {
  TacticalTraversalAttentionPolicy,
  TacticalTraversalBodyFacingPolicy,
} from './TacticalTraversalPlan';

export interface TacticalTraversalReferenceThreat {
  readonly id: string;
  readonly position: GridPosition;
}

export interface TacticalTraversalFacingResult {
  readonly bodyFacingPolicy: TacticalTraversalBodyFacingPolicy;
  readonly attentionPolicy: TacticalTraversalAttentionPolicy;
  readonly bodyFacingRadians: number;
  readonly attentionCenterRadians: number;
  readonly attentionArcRadians: number | null;
  readonly reasonCodes: readonly string[];
}

export function resolveTacticalTraversalFacing(input: {
  readonly from: GridPosition;
  readonly to: GridPosition;
  readonly movementProfile: MovementProfile;
  readonly intentPresetId: string;
  readonly referenceThreat: TacticalTraversalReferenceThreat | null;
  readonly profile: TacticalTraversalProfile;
}): TacticalTraversalFacingResult {
  const routeHeading = direction(input.from, input.to, 0);
  const threatHeading = input.referenceThreat
    ? direction(input.from, input.referenceThreat.position, routeHeading)
    : null;
  const structuralRouteFacing = input.movementProfile.preferredGait === 'run'
    || input.movementProfile.preferredGait === 'sprint'
    || input.movementProfile.preferredGait === 'crawl';
  let bodyFacingPolicy: TacticalTraversalBodyFacingPolicy = 'route_heading';
  let bodyFacingRadians = routeHeading;
  const reasons = [`route_heading:${round(routeHeading)}`];

  if (!structuralRouteFacing && threatHeading !== null) {
    const delta = signedAngle(threatHeading - routeHeading);
    if (Math.abs(delta) > input.profile.bodyDirectionDeadbandRadians) {
      bodyFacingPolicy = 'threat_biased';
      bodyFacingRadians = normalize(routeHeading + clamp(
        delta,
        -input.profile.maximumThreatBiasedBodyAngleRadians,
        input.profile.maximumThreatBiasedBodyAngleRadians,
      ));
      reasons.push('body_threat_bias_limited');
    }
  } else if (structuralRouteFacing) {
    reasons.push('body_route_physics_constraint');
  }

  let attentionPolicy: TacticalTraversalAttentionPolicy = 'route_heading';
  let attentionCenterRadians = routeHeading;
  let attentionArcRadians: number | null = null;
  if (input.intentPresetId === 'recon') {
    attentionPolicy = 'search_sector';
    attentionCenterRadians = threatHeading === null
      ? routeHeading
      : blendAngles(routeHeading, threatHeading, 0.65);
    attentionArcRadians = input.profile.searchAttentionArcRadians;
    reasons.push('attention_recon_search');
  } else if (threatHeading !== null && input.intentPresetId === 'assault') {
    attentionPolicy = 'reference_threat';
    attentionCenterRadians = threatHeading;
    reasons.push('attention_assault_reference_threat');
  } else if (threatHeading !== null) {
    attentionPolicy = 'blended';
    attentionCenterRadians = blendAngles(routeHeading, threatHeading, 0.45);
    reasons.push('attention_route_threat_blend');
  }

  return {
    bodyFacingPolicy,
    attentionPolicy,
    bodyFacingRadians: normalize(bodyFacingRadians),
    attentionCenterRadians: normalize(attentionCenterRadians),
    attentionArcRadians,
    reasonCodes: reasons,
  };
}

function direction(from: GridPosition, to: GridPosition, fallback: number): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy) < 1e-6 ? fallback : normalize(Math.atan2(dy, dx));
}

function blendAngles(a: number, b: number, share: number): number {
  const delta = signedAngle(b - a);
  return normalize(a + delta * clamp(share, 0, 1));
}

function signedAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalize(value: number): number {
  const full = Math.PI * 2;
  const result = value % full;
  return result < 0 ? result + full : result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
