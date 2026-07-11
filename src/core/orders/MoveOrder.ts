import type { GridPosition } from '../geometry';

export type MoveOrderSource = 'player' | 'ai';

export interface MoveOrderOptions {
  readonly source?: MoveOrderSource;
  readonly ownerToken?: string;
}

export interface MoveOrder {
  type: 'move';
  target: GridPosition;
  issuedAtMs: number;
  source?: MoveOrderSource;
  ownerToken?: string;
}

export function createMoveOrder(target: GridPosition, options: MoveOrderOptions = {}): MoveOrder {
  return {
    type: 'move',
    target,
    issuedAtMs: Date.now(),
    source: options.source,
    ownerToken: options.ownerToken,
  };
}
