import type { GridPosition } from '../geometry';

export interface MoveOrder {
  type: 'move';
  target: GridPosition;
  issuedAtMs: number;
}

export function createMoveOrder(target: GridPosition): MoveOrder {
  return {
    type: 'move',
    target,
    issuedAtMs: Date.now(),
  };
}
