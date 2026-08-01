import type { SoldierCondition, SoldierTraits } from '../behavior/BehaviorModel';

declare module '../behavior/BehaviorModel' {
  interface SoldierTraits extends Record<string, number> {}
  interface SoldierCondition extends Record<string, number> {}
}

declare global {
  interface Array<T> {
    at(index: number): T | undefined;
  }
}

export type GameplayTuningSoldierTraits = SoldierTraits;
export type GameplayTuningSoldierCondition = SoldierCondition;
