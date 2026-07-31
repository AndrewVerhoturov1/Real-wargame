import type { UnitAiControl, UnitData, UnitModel } from './UnitModel';

export const UNIT_AI_BRAIN_BINDING_SCHEMA_VERSION = 1 as const;
export const DEFAULT_UNIT_AI_GRAPH_ID = 'soldier_clean_workspace_graph';

export type UnitAiBrainBindingV1 =
  | { readonly schemaVersion: 1; readonly kind: 'manual'; readonly graphId?: never }
  | { readonly schemaVersion: 1; readonly kind: 'graph'; readonly graphId: string };

/** Serialized compatibility input. The schemaVersion is optional only while importing old scenes. */
export type UnitAiBrainBindingInputV1 =
  | { readonly schemaVersion?: 1; readonly kind: 'manual'; readonly graphId?: never }
  | { readonly schemaVersion?: 1; readonly kind: 'graph'; readonly graphId: string };

declare module './UnitModel' {
  interface UnitData {
    aiBrain?: UnitAiBrainBindingInputV1;
  }

  interface UnitModel {
    /** Optional only for in-memory units created by legacy constructors; readers normalize it immediately. */
    aiBrain?: UnitAiBrainBindingV1;
  }
}

export function createUnitManualBrainBinding(): UnitAiBrainBindingV1 {
  return Object.freeze({ schemaVersion: 1, kind: 'manual' });
}

export function createUnitGraphBrainBinding(graphId: string): UnitAiBrainBindingV1 {
  const normalized = normalizeGraphId(graphId);
  return Object.freeze({ schemaVersion: 1, kind: 'graph', graphId: normalized });
}

export function normalizeUnitAiBrainBinding(
  value: unknown,
  legacyAiControl: UnitAiControl | string | undefined = 'graph',
): UnitAiBrainBindingV1 {
  if (isRecord(value)) {
    if (value.kind === 'manual') return createUnitManualBrainBinding();
    if (value.kind === 'graph') return createUnitGraphBrainBinding(readRequiredGraphId(value.graphId));
  }
  return legacyAiControl === 'manual'
    ? createUnitManualBrainBinding()
    : createUnitGraphBrainBinding(DEFAULT_UNIT_AI_GRAPH_ID);
}

export function serializeUnitAiBrainBinding(
  binding: UnitAiBrainBindingV1 | undefined,
  legacyAiControl: UnitAiControl | string | undefined = 'graph',
): UnitAiBrainBindingV1 {
  const normalized = normalizeUnitAiBrainBinding(binding, legacyAiControl);
  return normalized.kind === 'manual'
    ? createUnitManualBrainBinding()
    : createUnitGraphBrainBinding(normalized.graphId);
}

export function readUnitAiBrainBinding(unit: Pick<UnitModel, 'aiControl'> & Partial<Pick<UnitModel, 'aiBrain'>>): UnitAiBrainBindingV1 {
  return normalizeUnitAiBrainBinding(unit.aiBrain, unit.aiControl);
}

export function installUnitAiBrainBinding(
  unit: Pick<UnitModel, 'aiControl'> & Partial<Pick<UnitModel, 'aiBrain'>>,
  binding: UnitAiBrainBindingV1,
): UnitAiBrainBindingV1 {
  const normalized = serializeUnitAiBrainBinding(binding);
  unit.aiBrain = normalized;
  unit.aiControl = normalized.kind === 'manual' ? 'manual' : 'graph';
  return normalized;
}

export function installUnitAiBrainBindingFromData(
  unit: UnitModel,
  data: Pick<UnitData, 'aiControl' | 'aiBrain'>,
): UnitAiBrainBindingV1 {
  return installUnitAiBrainBinding(unit, normalizeUnitAiBrainBinding(data.aiBrain, data.aiControl));
}

export function isUnitGraphBrainBinding(binding: UnitAiBrainBindingV1): binding is Extract<UnitAiBrainBindingV1, { kind: 'graph' }> {
  return binding.kind === 'graph';
}

function readRequiredGraphId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Для мозга Graph v2 требуется точный идентификатор графа.');
  return normalizeGraphId(value);
}

function normalizeGraphId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('Идентификатор графа Graph v2 не может быть пустым.');
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
