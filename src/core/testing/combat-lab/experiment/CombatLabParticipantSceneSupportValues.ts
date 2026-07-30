import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';

export function nextStableId(prefix: string, used: ReadonlySet<string>): string {
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new CombatLabParticipantSceneError('combat_lab_participant_id_exhausted', `Не удалось создать свободный идентификатор с префиксом «${prefix}».`);
}

export function replaceUnitIdentity(value: unknown, sourceUnitId: string, targetUnitId: string): Record<string, unknown> {
  const replaced = replaceIdentityValue(value, sourceUnitId, targetUnitId);
  if (!isRecord(replaced)) throw new CombatLabParticipantSceneError('combat_lab_participant_duplicate_invalid', 'Исходная запись бойца повреждена.');
  return replaced;
}

function replaceIdentityValue(value: unknown, sourceUnitId: string, targetUnitId: string): unknown {
  if (typeof value === 'string') {
    if (value === sourceUnitId) return targetUnitId;
    if (value.startsWith(`${sourceUnitId}:`)) return `${targetUnitId}${value.slice(sourceUnitId.length)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceIdentityValue(item, sourceUnitId, targetUnitId));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceIdentityValue(child, sourceUnitId, targetUnitId)]));
}

export function requireStableId(value: string, label: string): string {
  const id = value.trim();
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(id)) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_id_invalid', `${label} должен содержать только латинские буквы, цифры, двоеточие, дефис или подчёркивание.`);
  }
  return id;
}

export function requireText(value: string, messageRu: string): string {
  const text = value.trim();
  if (!text) throw new CombatLabParticipantSceneError('combat_lab_participant_title_invalid', messageRu);
  return text;
}

export function assertFinite(value: number, messageRu: string): void {
  if (!Number.isFinite(value)) throw new CombatLabParticipantSceneError('combat_lab_participant_number_invalid', messageRu);
}

export function assertFiniteRange(value: number, minimum: number, maximum: number, messageRu: string): void {
  assertFinite(value, messageRu);
  if (value < minimum || value > maximum) throw new CombatLabParticipantSceneError('combat_lab_participant_number_out_of_range', messageRu);
}

export function assertIntegerRange(value: number, minimum: number, maximum: number, messageRu: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new CombatLabParticipantSceneError('combat_lab_participant_integer_out_of_range', messageRu);
}

export function normalizeDegrees(value: number): number {
  assertFinite(value, 'Направление бойца должно быть конечным числом.');
  return ((value % 360) + 360) % 360;
}

export function degreesToRadians(value: number): number { return (value * Math.PI) / 180; }
export function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value)) + 1); }
export function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function deepFreeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
