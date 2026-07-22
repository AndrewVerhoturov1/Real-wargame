import {
  add, compare, isObject, refKey, validIdRevision, type Issues,
} from './CombatCatalogValidationPrimitives';

export * from './CombatCatalogValidationPrimitives';

export const STATUSES = ['draft', 'published', 'archived'] as const;
export const WEAPON_CLASSES = ['rifle', 'submachine_gun', 'machine_gun', 'pistol'] as const;
export const FIRE_MODES = ['single', 'short_burst', 'long_burst', 'suppress'] as const;
export const AUTOMATIC_MODES = new Set(['short_burst', 'long_burst', 'suppress']);
export const RELOAD_KINDS = ['open', 'load', 'close'] as const;
export const PROFICIENCIES = ['untrained', 'trained', 'specialist'] as const;
export const ROLES = ['rifleman', 'submachine_gunner', 'machine_gunner', 'assistant_machine_gunner'] as const;
export const POSTURES = ['standing', 'crouched', 'prone'] as const;

export function orderedArray(value: unknown, idField: string, path: string, issues: Issues): unknown[] {
  if (!Array.isArray(value)) {
    add(issues, path, 'invalid_type', 'Поле должно быть массивом.');
    return [];
  }
  return [...value].sort((left, right) => compare(sortKey(left, idField), sortKey(right, idField)));
}

export function duplicateRevisions(entries: unknown[], idField: string, path: string, issues: Issues): void {
  const seen = new Set<string>();
  for (const raw of entries) if (isObject(raw) && validIdRevision(raw, idField)) {
    const key = refKey(raw[idField] as string, raw.revision as number);
    if (seen.has(key)) add(issues, `${path}[${key}]`, 'duplicate_definition_revision', 'Сочетание ID и ревизии должно быть уникальным.');
    seen.add(key);
  }
}

export function entryPath(group: string, value: unknown, idField: string, index: number): string {
  if (!isObject(value)) return `$.${group}[#${index}]`;
  const entryId = typeof value[idField] === 'string' ? value[idField] : `#${index}`;
  const revision = Number.isInteger(value.revision) ? value.revision : '?';
  return `$.${group}[${entryId}@${revision}]`;
}

export function uniqueEnumArray<T extends string>(
  value: unknown, allowed: readonly T[], path: string, duplicateCode: string, issues: Issues,
): T[] | null {
  if (!Array.isArray(value)) {
    add(issues, path, 'invalid_type', 'Поле должно быть массивом.');
    return null;
  }
  const result: T[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !(allowed as readonly string[]).includes(entry)) {
      add(issues, `${path}[${index}]`, 'invalid_enum', `Допустимые значения: ${allowed.join(', ')}.`);
      return;
    }
    const parsed = entry as T;
    if (seen.has(parsed)) add(issues, `${path}[${index}]`, duplicateCode, 'Значения массива должны быть уникальны.');
    seen.add(parsed);
    result.push(parsed);
  });
  return result;
}

function sortKey(value: unknown, idField: string): string {
  if (!isObject(value)) return `~${stable(value)}`;
  const entryId = typeof value[idField] === 'string' ? value[idField] : '~';
  const revision = typeof value.revision === 'number' && Number.isFinite(value.revision)
    ? String(value.revision).padStart(12, '0')
    : '~';
  return `${entryId}\u0000${revision}\u0000${stable(value)}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value) ?? String(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
