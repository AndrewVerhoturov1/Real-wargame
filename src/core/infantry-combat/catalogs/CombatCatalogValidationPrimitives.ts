import type { CatalogValidationIssue, CatalogValidationResult } from './CombatCatalogTypes';

export type Issues = CatalogValidationIssue[];
export const COMBAT_CATALOG_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export function objectAt(value: unknown, path: string, issues: Issues): Record<string, unknown> | null {
  if (!isObject(value)) {
    add(issues, path, 'invalid_type', 'Поле должно быть объектом.');
    return null;
  }
  return value;
}

export function exact(value: unknown, expected: number, path: string, code: string, issues: Issues): void {
  const parsed = finite(value, path, issues);
  if (parsed !== null && parsed !== expected) add(issues, path, code, `Поддерживается только версия ${expected}.`);
}

export function id(value: unknown, path: string, issues: Issues): string | null {
  if (typeof value !== 'string' || !COMBAT_CATALOG_ID_PATTERN.test(value)) {
    add(issues, path, 'invalid_id', 'ID должен соответствовать /^[a-z][a-z0-9_]{2,63}$/.');
    return null;
  }
  return value;
}

export function string(value: unknown, path: string, issues: Issues, nonEmpty: boolean): string | null {
  if (typeof value !== 'string' || (nonEmpty && value.trim().length === 0)) {
    add(issues, path, 'invalid_string', 'Поле должно быть строкой требуемого вида.');
    return null;
  }
  return value;
}

export function boolean(value: unknown, path: string, issues: Issues): boolean | null {
  if (typeof value !== 'boolean') {
    add(issues, path, 'invalid_type', 'Поле должно быть логическим значением.');
    return null;
  }
  return value;
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, issues: Issues): T | null {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    add(issues, path, 'invalid_enum', `Допустимые значения: ${allowed.join(', ')}.`);
    return null;
  }
  return value as T;
}

export function positive(value: unknown, path: string, issues: Issues): number | null {
  const parsed = finite(value, path, issues);
  if (parsed !== null && parsed <= 0) {
    add(issues, path, 'non_positive_number', 'Значение должно быть больше нуля.');
    return null;
  }
  return parsed;
}

export function nonNegative(value: unknown, path: string, issues: Issues): number | null {
  const parsed = finite(value, path, issues);
  if (parsed !== null && parsed < 0) {
    add(issues, path, 'negative_number', 'Значение не может быть отрицательным.');
    return null;
  }
  return parsed;
}

export function integer(value: unknown, minimum: number, path: string, issues: Issues): number | null {
  const parsed = finite(value, path, issues);
  if (parsed !== null && (!Number.isInteger(parsed) || parsed < minimum)) {
    add(issues, path, 'invalid_integer', `Значение должно быть целым числом не меньше ${minimum}.`);
    return null;
  }
  return parsed;
}

export function finite(value: unknown, path: string, issues: Issues): number | null {
  if (typeof value !== 'number') {
    add(issues, path, 'invalid_type', 'Поле должно быть числом.');
    return null;
  }
  if (!Number.isFinite(value)) {
    add(issues, path, 'non_finite_number', 'Число должно быть конечным.');
    return null;
  }
  return value;
}

export function definitionRef(value: unknown, path: string, issues: Issues): void {
  const ref = objectAt(value, path, issues);
  if (!ref) return;
  id(ref.definitionId, `${path}.definitionId`, issues);
  integer(ref.revision, 1, `${path}.revision`, issues);
}

export function integerRecord(value: unknown, path: string, issues: Issues): void {
  const record = objectAt(value, path, issues);
  if (!record) return;
  for (const key of Object.keys(record).sort()) {
    id(key, `${path}.${key}`, issues);
    integer(record[key], 0, `${path}.${key}`, issues);
  }
}

export function numberRecord(value: unknown, keys: readonly string[], path: string, issues: Issues): void {
  const record = objectAt(value, path, issues);
  if (!record) return;
  for (const key of keys) nonNegative(record[key], `${path}.${key}`, issues);
}

export function readRef(value: unknown): { definitionId: string; revision: number } | null {
  return isObject(value) && typeof value.definitionId === 'string' && Number.isInteger(value.revision)
    ? { definitionId: value.definitionId, revision: value.revision as number }
    : null;
}

export function validIdRevision(value: Record<string, unknown>, idField: string): boolean {
  return typeof value[idField] === 'string' && COMBAT_CATALOG_ID_PATTERN.test(value[idField] as string)
    && typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 1;
}

export function refKey(definitionId: string, revision: number): string {
  return `${definitionId}@${revision}`;
}

export function finish(issues: Issues): CatalogValidationResult {
  const unique = new Map<string, CatalogValidationIssue>();
  for (const issue of issues) unique.set(`${issue.path}\u0000${issue.code}\u0000${issue.messageRu}`, issue);
  const sorted = [...unique.values()].sort((left, right) => compare(left.path, right.path)
    || compare(left.code, right.code) || compare(left.messageRu, right.messageRu));
  return { valid: sorted.length === 0, issues: sorted };
}

export function add(issues: Issues, path: string, code: string, messageRu: string): void {
  issues.push({ path, code, severity: 'error', messageRu });
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
