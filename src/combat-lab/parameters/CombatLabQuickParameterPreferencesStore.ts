import { isCombatLabQuickParameterId } from './CombatLabQuickParameterRegistry';
import type { CombatLabQuickParameterIdV1 } from './CombatLabQuickParameterTypes';

const STORAGE_KEY = 'real-wargame.combat-lab.quick-parameters.v1';

export interface CombatLabQuickParameterPreferencesV1 {
  readonly schemaVersion: 1;
  readonly byExperimentAndRole: Readonly<Record<string, readonly string[]>>;
}

export interface CombatLabQuickParameterPreferencesStoreOptionsV1 {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  readonly storageKey?: string;
}

export class CombatLabQuickParameterPreferencesStore {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly storageKey: string;
  private preferences: CombatLabQuickParameterPreferencesV1;

  constructor(options: CombatLabQuickParameterPreferencesStoreOptionsV1 = {}) {
    this.storage = options.storage === undefined ? safeLocalStorage() : options.storage;
    this.storageKey = options.storageKey ?? STORAGE_KEY;
    this.preferences = this.read();
  }

  get(
    experimentId: string,
    roleId: string,
    defaultIds: readonly CombatLabQuickParameterIdV1[],
  ): readonly CombatLabQuickParameterIdV1[] {
    const key = buildCombatLabQuickParameterPreferenceKey(experimentId, roleId);
    const stored = this.preferences.byExperimentAndRole[key];
    if (stored !== undefined) return sanitizeIds(stored);
    const initial = sanitizeIds(defaultIds);
    this.set(experimentId, roleId, initial);
    return initial;
  }

  set(
    experimentId: string,
    roleId: string,
    ids: readonly string[],
  ): readonly CombatLabQuickParameterIdV1[] {
    const key = buildCombatLabQuickParameterPreferenceKey(experimentId, roleId);
    const normalized = sanitizeIds(ids);
    this.preferences = Object.freeze({
      schemaVersion: 1,
      byExperimentAndRole: Object.freeze({
        ...this.preferences.byExperimentAndRole,
        [key]: normalized,
      }),
    });
    this.write();
    return normalized;
  }

  removeRole(experimentId: string, roleId: string): void {
    const key = buildCombatLabQuickParameterPreferenceKey(experimentId, roleId);
    if (!(key in this.preferences.byExperimentAndRole)) return;
    const next = { ...this.preferences.byExperimentAndRole };
    delete next[key];
    this.preferences = Object.freeze({ schemaVersion: 1, byExperimentAndRole: Object.freeze(next) });
    this.write();
  }

  snapshot(): CombatLabQuickParameterPreferencesV1 {
    return this.preferences;
  }

  reset(): void {
    this.preferences = emptyPreferences();
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      // Storage is optional; in-memory preferences stay reset.
    }
  }

  private read(): CombatLabQuickParameterPreferencesV1 {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return emptyPreferences();
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.byExperimentAndRole)) {
        return emptyPreferences();
      }
      const byExperimentAndRole: Record<string, readonly string[]> = {};
      for (const [key, ids] of Object.entries(parsed.byExperimentAndRole)) {
        if (!Array.isArray(ids)) continue;
        byExperimentAndRole[key] = sanitizeIds(ids.filter((item): item is string => typeof item === 'string'));
      }
      return Object.freeze({ schemaVersion: 1, byExperimentAndRole: Object.freeze(byExperimentAndRole) });
    } catch {
      return emptyPreferences();
    }
  }

  private write(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch {
      // Storage errors must not break the editor.
    }
  }
}

export function buildCombatLabQuickParameterPreferenceKey(experimentId: string, roleId: string): string {
  return `${encodeURIComponent(experimentId)}::${encodeURIComponent(roleId)}`;
}

function sanitizeIds(ids: readonly string[]): readonly CombatLabQuickParameterIdV1[] {
  const seen = new Set<CombatLabQuickParameterIdV1>();
  const result: CombatLabQuickParameterIdV1[] = [];
  for (const id of ids) {
    if (!isCombatLabQuickParameterId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return Object.freeze(result);
}

function emptyPreferences(): CombatLabQuickParameterPreferencesV1 {
  return Object.freeze({ schemaVersion: 1, byExperimentAndRole: Object.freeze({}) });
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
