export const COMBAT_LAB_RESET_AND_START_EVENT = 'combat-lab:reset-and-start' as const;

export interface CombatLabResetAndStartRequestV1 {
  readonly seed: number;
}

export interface CombatLabResetAndStartControllerV1 {
  reset(seed?: number): void;
  start(): void;
}

export function normalizeCombatLabResetAndStartSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function requestCombatLabResetAndStart(
  target: EventTarget,
  seed: number,
): boolean {
  const detail: CombatLabResetAndStartRequestV1 = Object.freeze({
    seed: normalizeCombatLabResetAndStartSeed(seed),
  });
  return target.dispatchEvent(new CustomEvent<CombatLabResetAndStartRequestV1>(
    COMBAT_LAB_RESET_AND_START_EVENT,
    { bubbles: true, detail },
  ));
}

export function readCombatLabResetAndStartRequest(
  event: Event,
): CombatLabResetAndStartRequestV1 | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isRecord(detail) || typeof detail.seed !== 'number') return null;
  return Object.freeze({ seed: normalizeCombatLabResetAndStartSeed(detail.seed) });
}

export function executeCombatLabResetAndStart(
  controller: CombatLabResetAndStartControllerV1,
  request: CombatLabResetAndStartRequestV1,
  canRun: () => boolean,
): boolean {
  if (!canRun()) return false;
  controller.reset(normalizeCombatLabResetAndStartSeed(request.seed));
  controller.start();
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
