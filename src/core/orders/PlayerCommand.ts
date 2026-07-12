import type { GridPosition } from '../geometry';

export type PlayerCommandType = 'move_to_position';
export type PlayerCommandStatus = 'active' | 'completed' | 'blocked' | 'cancelled';

export interface PlayerCommand {
  readonly id: string;
  readonly unitId: string;
  readonly type: PlayerCommandType;
  readonly target: GridPosition;
  readonly status: PlayerCommandStatus;
  readonly revision: number;
  readonly issuedAtMs: number;
  readonly reason: string;
  readonly reasonRu: string;
}

export function createPlayerMoveCommand(
  unitId: string,
  target: GridPosition,
  previous: PlayerCommand | null = null,
  nowMs = Date.now(),
): PlayerCommand {
  const revision = (previous?.revision ?? 0) + 1;
  return {
    id: `${unitId}:player-command:${revision}:${Math.max(0, Math.round(nowMs))}`,
    unitId,
    type: 'move_to_position',
    target: { ...target },
    status: 'active',
    revision,
    issuedAtMs: nowMs,
    reason: 'Player movement command issued.',
    reasonRu: 'Игрок отдал приказ движения.',
  };
}

export function updatePlayerCommandStatus(
  command: PlayerCommand,
  status: PlayerCommandStatus,
  reason: string,
  reasonRu = reason,
): PlayerCommand {
  if (
    command.status === status
    && command.reason === reason
    && command.reasonRu === reasonRu
  ) {
    return command;
  }

  return {
    ...command,
    target: { ...command.target },
    status,
    revision: command.revision + 1,
    reason,
    reasonRu,
  };
}

export function isPlayerCommandOutstanding(command: PlayerCommand | null): boolean {
  return command?.status === 'active' || command?.status === 'blocked';
}
