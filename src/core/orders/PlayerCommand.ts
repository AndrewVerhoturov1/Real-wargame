import type { GridPosition } from '../geometry';
import { normalizeMovementProfileId } from '../movement/MovementProfileContract';
import type { NavigationMovementMode } from '../navigation/NavigationProfiles';
import {
  createTacticalOrderIntent,
  normalizeTacticalOrderIntent,
  withTacticalOrderMovementProfile,
  withTacticalOrderNavigationProfile,
  type TacticalOrderIntent,
  type TacticalOrderPresetId,
} from './TacticalOrderIntent';

export type PlayerCommandType = 'move_to_position';
export type PlayerCommandStatus = 'active' | 'completed' | 'blocked' | 'cancelled';

export interface PlayerCommand {
  readonly id: string;
  readonly unitId: string;
  readonly type: PlayerCommandType;
  readonly target: GridPosition;
  readonly intent: TacticalOrderIntent;
  readonly movementMode?: NavigationMovementMode;
  readonly navigationProfileId?: string;
  readonly movementProfileId?: string;
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
  intentOrMovementMode: TacticalOrderIntent | NavigationMovementMode = 'normal',
  navigationProfileId: string | null = null,
  finalFacingRadians: number | null = null,
): PlayerCommand {
  const revision = (previous?.revision ?? 0) + 1;
  const intent = resolveCreatedIntent(intentOrMovementMode, navigationProfileId);
  const movementMode = normalizeMovementMode(intent.navigationProfileId);
  return {
    id: `${unitId}:player-command:${revision}:${Math.max(0, Math.round(nowMs))}`,
    unitId,
    type: 'move_to_position',
    target: { ...target },
    intent,
    movementMode,
    navigationProfileId: intent.navigationProfileId,
    movementProfileId: intent.movementProfileId,
    finalFacingRadians: normalizeOptionalRadians(finalFacingRadians),
    status: 'active',
    revision,
    issuedAtMs: nowMs,
    reason: `Player tactical order issued: ${intent.presetId}.`,
    reasonRu: `Игрок отдал тактический приказ: ${intent.presetId}.`,
  };
}

export function normalizePlayerCommand(value: unknown, fallbackUnitId = ''): PlayerCommand | null {
  if (!isRecord(value)) return null;
  const target = normalizeGridPosition(value.target);
  if (!target) return null;
  const unitId = cleanText(value.unitId, fallbackUnitId);
  if (!unitId) return null;
  const intent = normalizeTacticalOrderIntent(value.intent);
  const revision = normalizeNonNegativeInteger(value.revision, 1);
  const issuedAtMs = normalizeFiniteNumber(value.issuedAtMs, 0);
  const type: PlayerCommandType = value.type === 'move_to_position' ? value.type : 'move_to_position';
  const status = normalizeStatus(value.status);
  const navigationProfileId = typeof value.navigationProfileId === 'string' && value.navigationProfileId.trim()
    ? value.navigationProfileId.trim()
    : intent.navigationProfileId;
  const movementProfileId = normalizeMovementProfileId(value.movementProfileId, intent.movementProfileId);
  const normalizedIntent = withTacticalOrderMovementProfile(
    withTacticalOrderNavigationProfile(intent, navigationProfileId),
    movementProfileId,
  );
  return {
    id: cleanText(value.id, `${unitId}:player-command:${revision}:${Math.max(0, Math.round(issuedAtMs))}`),
    unitId,
    type,
    target,
    intent: normalizedIntent,
    movementMode: normalizeMovementMode(value.movementMode ?? normalizedIntent.navigationProfileId),
    navigationProfileId: normalizedIntent.navigationProfileId,
    movementProfileId: normalizedIntent.movementProfileId,
    finalFacingRadians: normalizeOptionalRadians(value.finalFacingRadians),
    status,
    revision,
    issuedAtMs,
    reason: cleanText(value.reason, 'Player movement command restored.'),
    reasonRu: cleanText(value.reasonRu, 'Приказ игрока восстановлен.'),
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
    intent: normalizeTacticalOrderIntent(command.intent),
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
    intent: withTacticalOrderNavigationProfile(command.intent, navigationProfileId),
    movementMode: normalizeMovementMode(navigationProfileId),
    navigationProfileId,
    revision: command.revision + 1,
    reason: `Player navigation profile changed to ${navigationProfileId}.`,
    reasonRu: `Профиль маршрута игрока изменён: ${navigationProfileId}.`,
  };
}

export function updatePlayerCommandMovementProfile(
  command: PlayerCommand,
  profileId: string | null,
): PlayerCommand {
  const movementProfileId = normalizeMovementProfileId(profileId, command.intent.movementProfileId);
  if (command.movementProfileId === movementProfileId) return command;
  return {
    ...command,
    target: { ...command.target },
    intent: withTacticalOrderMovementProfile(command.intent, movementProfileId),
    movementProfileId,
    revision: command.revision + 1,
    reason: `Player movement profile changed to ${movementProfileId}.`,
    reasonRu: `Физический профиль движения игрока изменён: ${movementProfileId}.`,
  };
}

export function isPlayerCommandOutstanding(command: PlayerCommand | null): boolean {
  return command?.status === 'active' || command?.status === 'blocked';
}

function resolveCreatedIntent(
  value: TacticalOrderIntent | NavigationMovementMode,
  navigationProfileId: string | null,
): TacticalOrderIntent {
  if (typeof value === 'object' && value !== null) return normalizeTacticalOrderIntent(value);
  const presetId = presetForLegacyMovementMode(value);
  return withTacticalOrderNavigationProfile(
    createTacticalOrderIntent(presetId),
    normalizeNavigationProfileId(navigationProfileId ?? value),
  );
}

function presetForLegacyMovementMode(value: NavigationMovementMode): TacticalOrderPresetId {
  if (value === 'attack') return 'assault';
  if (value === 'cautious' || value === 'stealth') return 'recon';
  return 'move';
}

function normalizeMovementMode(value: unknown): NavigationMovementMode {
  if (
    value === 'normal'
    || value === 'fast'
    || value === 'stealth'
    || value === 'attack'
    || value === 'cautious'
    || value === 'retreat'
    || value === 'direct'
  ) return value;
  return 'normal';
}

function normalizeStatus(value: unknown): PlayerCommandStatus {
  if (value === 'completed' || value === 'blocked' || value === 'cancelled') return value;
  return 'active';
}

function normalizeOptionalRadians(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

function normalizeNavigationProfileId(value: string | null | undefined): string {
  return value?.trim() || 'normal';
}

function normalizeGridPosition(value: unknown): GridPosition | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null;
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
