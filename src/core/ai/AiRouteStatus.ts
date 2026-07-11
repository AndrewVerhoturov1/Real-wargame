import { distance, type GridPosition } from '../geometry';

export type AiRouteStatus =
  | 'idle'
  | 'moving'
  | 'stalled'
  | 'blocked'
  | 'arrived'
  | 'player_override'
  | 'target_lost'
  | 'order_missing'
  | 'cancelled';

export type AiRouteAbortCode =
  | 'route_blocked'
  | 'player_order_replaced'
  | 'target_lost'
  | 'owned_order_missing';

export interface AiRouteStatusSettings {
  readonly stuckTimeoutMs: number;
  readonly minimumProgressCells: number;
  readonly abortOnTargetLost: boolean;
}

export interface AiRouteStatusState {
  readonly version: 1;
  readonly ownerToken: string;
  readonly target: GridPosition;
  readonly startedAtMs: number;
  readonly lastCheckedAtMs: number;
  readonly lastProgressAtMs: number;
  readonly lastDistanceCells: number;
  readonly status: AiRouteStatus;
  readonly abortCode?: AiRouteAbortCode;
  readonly abortReason?: string;
  readonly abortReasonRu?: string;
}

export interface AiRouteStatusStartInput {
  readonly nowMs: number;
  readonly position: GridPosition;
  readonly target: GridPosition;
  readonly ownerToken: string;
}

export interface AiRouteStatusInput extends AiRouteStatusStartInput {
  readonly acceptanceRadiusCells: number;
  readonly activeOrderSource: 'player' | 'ai' | null;
  readonly activeOrderToken: string | null;
  readonly targetAvailable: boolean;
  readonly paused: boolean;
  readonly settings: AiRouteStatusSettings;
  readonly previousState?: AiRouteStatusState;
}

export interface AiRouteStatusResult {
  readonly state: AiRouteStatusState;
  readonly status: AiRouteStatus;
  readonly noProgressMs: number;
  readonly distanceRemainingCells: number;
  readonly abortCode?: AiRouteAbortCode;
  readonly abortReason?: string;
  readonly abortReasonRu?: string;
  readonly shouldForceRuntimeTick: boolean;
  readonly shouldCancelRuntime: boolean;
}

export function createAiRouteStatusState(input: AiRouteStatusStartInput): AiRouteStatusState {
  return {
    version: 1,
    ownerToken: input.ownerToken,
    target: { ...input.target },
    startedAtMs: input.nowMs,
    lastCheckedAtMs: input.nowMs,
    lastProgressAtMs: input.nowMs,
    lastDistanceCells: distance(input.position, input.target),
    status: 'moving',
  };
}

export function updateAiRouteStatus(input: AiRouteStatusInput): AiRouteStatusResult {
  const settings = normalizeSettings(input.settings);
  const hasReusableState = isReusableState(input.previousState, input.ownerToken, input.target);
  const previous = hasReusableState
    ? input.previousState
    : createAiRouteStatusState(input);
  const remaining = distance(input.position, input.target);

  if (input.paused) {
    return makeResult(previous, Math.max(0, previous.lastCheckedAtMs - previous.lastProgressAtMs), remaining, false, false);
  }

  if (remaining <= Math.max(0, finiteOr(input.acceptanceRadiusCells, 0))) {
    const state = transition(previous, input.nowMs, remaining, 'arrived');
    return makeResult(state, Math.max(0, input.nowMs - previous.lastProgressAtMs), remaining, false, false);
  }

  if (input.activeOrderSource === 'player') {
    return abortResult(
      previous,
      input.nowMs,
      remaining,
      'player_override',
      'player_order_replaced',
      'The player replaced the active AI movement order.',
      'Новый приказ игрока заменил активное движение ИИ.',
      false,
    );
  }

  if (input.activeOrderToken !== input.ownerToken) {
    return abortResult(
      previous,
      input.nowMs,
      remaining,
      'order_missing',
      'owned_order_missing',
      'The owned AI movement order disappeared before arrival.',
      'Собственный приказ движения ИИ исчез до достижения цели.',
      false,
    );
  }

  if (!input.targetAvailable && settings.abortOnTargetLost) {
    return abortResult(
      previous,
      input.nowMs,
      remaining,
      'target_lost',
      'target_lost',
      'The configured movement target is no longer available.',
      'Цель движения исчезла из памяти бойца.',
      true,
    );
  }

  if (!hasReusableState) {
    return makeResult(previous, 0, remaining, false, false);
  }

  const progressCells = previous.lastDistanceCells - remaining;
  if (progressCells >= settings.minimumProgressCells) {
    const state: AiRouteStatusState = {
      ...previous,
      lastCheckedAtMs: input.nowMs,
      lastProgressAtMs: input.nowMs,
      lastDistanceCells: remaining,
      status: 'moving',
      abortCode: undefined,
      abortReason: undefined,
      abortReasonRu: undefined,
    };
    return makeResult(state, 0, remaining, false, false);
  }

  const noProgressMs = Math.max(0, input.nowMs - previous.lastProgressAtMs);
  if (settings.stuckTimeoutMs > 0 && noProgressMs >= settings.stuckTimeoutMs) {
    const seconds = (noProgressMs / 1000).toFixed(1).replace(/\.0$/, '');
    return abortResult(
      previous,
      input.nowMs,
      remaining,
      'blocked',
      'route_blocked',
      `Route blocked: the soldier made no meaningful progress for ${seconds} seconds.`,
      `Маршрут заблокирован: боец не продвигается ${seconds} сек.`,
      true,
    );
  }

  const state = transition(previous, input.nowMs, previous.lastDistanceCells, 'stalled');
  return makeResult(state, noProgressMs, remaining, false, false);
}

function abortResult(
  previous: AiRouteStatusState,
  nowMs: number,
  remaining: number,
  status: Extract<AiRouteStatus, 'blocked' | 'player_override' | 'target_lost' | 'order_missing'>,
  abortCode: AiRouteAbortCode,
  abortReason: string,
  abortReasonRu: string,
  shouldCancelRuntime: boolean,
): AiRouteStatusResult {
  const state: AiRouteStatusState = {
    ...previous,
    lastCheckedAtMs: nowMs,
    status,
    abortCode,
    abortReason,
    abortReasonRu,
  };
  return makeResult(
    state,
    Math.max(0, nowMs - previous.lastProgressAtMs),
    remaining,
    true,
    shouldCancelRuntime,
  );
}

function transition(
  previous: AiRouteStatusState,
  nowMs: number,
  lastDistanceCells: number,
  status: AiRouteStatus,
): AiRouteStatusState {
  return {
    ...previous,
    lastCheckedAtMs: nowMs,
    lastDistanceCells,
    status,
    abortCode: undefined,
    abortReason: undefined,
    abortReasonRu: undefined,
  };
}

function makeResult(
  state: AiRouteStatusState,
  noProgressMs: number,
  distanceRemainingCells: number,
  shouldForceRuntimeTick: boolean,
  shouldCancelRuntime: boolean,
): AiRouteStatusResult {
  return {
    state,
    status: state.status,
    noProgressMs,
    distanceRemainingCells,
    abortCode: state.abortCode,
    abortReason: state.abortReason,
    abortReasonRu: state.abortReasonRu,
    shouldForceRuntimeTick,
    shouldCancelRuntime,
  };
}

function normalizeSettings(value: AiRouteStatusSettings): AiRouteStatusSettings {
  return {
    stuckTimeoutMs: Math.max(0, finiteOr(value.stuckTimeoutMs, 2500)),
    minimumProgressCells: Math.max(0, finiteOr(value.minimumProgressCells, 0.05)),
    abortOnTargetLost: value.abortOnTargetLost !== false,
  };
}

function isReusableState(
  value: AiRouteStatusState | undefined,
  ownerToken: string,
  target: GridPosition,
): value is AiRouteStatusState {
  return value?.version === 1
    && value.ownerToken === ownerToken
    && Number.isFinite(value.target.x)
    && Number.isFinite(value.target.y)
    && value.target.x === target.x
    && value.target.y === target.y
    && Number.isFinite(value.lastCheckedAtMs)
    && Number.isFinite(value.lastProgressAtMs)
    && Number.isFinite(value.lastDistanceCells);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
