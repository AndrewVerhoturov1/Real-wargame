export interface GridPosition {
  x: number;
  y: number;
}

export interface WorldPosition {
  x: number;
  y: number;
}

export function distance(a: GridPosition, b: GridPosition): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function moveToward(
  current: GridPosition,
  target: GridPosition,
  maxDistance: number,
): GridPosition {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);

  if (length === 0 || length <= maxDistance) {
    return { ...target };
  }

  const ratio = maxDistance / length;
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio,
  };
}
