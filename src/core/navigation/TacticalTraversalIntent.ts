export type TacticalTraversalIntentPresetId = 'move' | 'recon' | 'assault';

export interface TacticalTraversalIntentWeights {
  readonly time: number;
  readonly danger: number;
  readonly suppression: number;
  readonly visibility: number;
  readonly noise: number;
  readonly stamina: number;
  readonly protection: number;
  readonly concealment: number;
  readonly weaponReadiness: number;
  readonly threatAttention: number;
}

const WEIGHTS: Readonly<Record<TacticalTraversalIntentPresetId, TacticalTraversalIntentWeights>> = {
  move: {
    time: 1,
    danger: 1.25,
    suppression: 1.1,
    visibility: 0.55,
    noise: 0.35,
    stamina: 0.35,
    protection: 0.75,
    concealment: 0.4,
    weaponReadiness: 0.45,
    threatAttention: 0.55,
  },
  recon: {
    time: 0.7,
    danger: 1.5,
    suppression: 1.25,
    visibility: 1.45,
    noise: 1.25,
    stamina: 0.4,
    protection: 0.9,
    concealment: 1.15,
    weaponReadiness: 0.55,
    threatAttention: 1.25,
  },
  assault: {
    time: 1.55,
    danger: 1.1,
    suppression: 1.2,
    visibility: 0.2,
    noise: 0.18,
    stamina: 0.55,
    protection: 0.6,
    concealment: 0.15,
    weaponReadiness: 1.35,
    threatAttention: 1.1,
  },
};

export function resolveTacticalTraversalIntentWeights(
  presetId: string,
): TacticalTraversalIntentWeights {
  if (presetId === 'recon' || presetId === 'assault') return WEIGHTS[presetId];
  return WEIGHTS.move;
}
