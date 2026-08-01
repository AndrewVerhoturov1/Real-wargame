import type { SoldierCondition, SoldierTraits } from '../behavior/BehaviorModel';

declare module '../behavior/BehaviorModel' {
  interface SoldierTraits extends Record<string, number> {}
  interface SoldierCondition extends Record<string, number> {}
}

export type GameplayTuningSoldierTraits = SoldierTraits;
export type GameplayTuningSoldierCondition = SoldierCondition;
