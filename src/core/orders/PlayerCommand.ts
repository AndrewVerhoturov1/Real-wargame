import type { GridPosition } from '../geometry';
import type { NavigationMovementMode } from '../navigation/NavigationProfiles';

export type PlayerCommandType = 'move_to_position';
export type PlayerCommandStatus = 'active' | 'completed' | 'blocked' | 'cancelled';

export interface PlayerCommand {
  readonly id: string;
  readonly unitId: string;
  readonly type: PlayerCommandType;
  readonly target: GridPosition;
  readonly movementMode?: NavigationMovementMode;
  readonly navigationProfileId?: string;
  readonly finalFacingRadians?: number;
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
  movementMode: NavigationMovementMode = 'normal',
  navigationProfileId: string | null = null,
  finalFacingRadians: number | null = null,
): PlayerCommand {
  const revision = (previous?.revision ?? 0) + 1;
  return {
    id: `${unitId}:player-command:${revision}:${Math.max(0, Math.round(nowMs))}`,
    unitId,
    type: 'move_to_position',
    target: { ...target },
    movementMode,
    navigationProfileId: normalizeNavigationProfileId(navigationProfileId),
    finalFacingRadians: normalizeOptionalRadians(finalFacingRadians),
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

export function updatePlayerCommandNavigationProfile(
  command: PlayerCommand,
  profileId: string | null,
): PlayerCommand {
  const navigationProfileId = normalizeNavigationProfileId(profileId);
  if (command.navigationProfileId === navigationProfileId) return command;
  return {
    ...command,
    target: { ...command.target },
    navigationProfileId,
    revision: command.revision + 1,
    reason: `Player navigation profile changed to ${navigationProfileId}.`,
    reasonRu: `Профиль маршрута игрока изменён: ${navigationProfileId}.`,
  };
}

export function isPlayerCommandOutstanding(command: PlayerCommand | null): boolean {
  return command?.status === 'active' || command?.status === 'blocked';
}

function normalizeOptionalRadians(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

function normalizeNavigationProfileId(value: string | null | undefined): string {
  return value?.trim() || 'normal';
}
