import type { AiBlackboardValue } from '../AiBlackboard';

export type AiPortValueKind =
  | 'number' | 'boolean' | 'string' | 'position' | 'unitId'
  | 'objectId' | 'slotId' | 'event' | 'plan' | 'route' | 'tacticalQuery';

export interface AiPortDefinition {
  readonly id: string;
  readonly kind: AiPortValueKind;
  readonly label: string;
  readonly labelRu: string;
  readonly description?: string;
  readonly descriptionRu?: string;
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly multiple?: boolean;
}
export type AiInputBinding =
  | { readonly source: 'literal'; readonly value: AiBlackboardValue }
  | { readonly source: 'blackboard'; readonly key: string }
  | { readonly source: 'node'; readonly nodeId: string; readonly port: string }
  | { readonly source: 'subgraphInput'; readonly port: string };
export type AiOutputBinding =
  | { readonly target: 'blackboard'; readonly key: string }
  | { readonly target: 'subgraphOutput'; readonly port: string };
export type AiNodeInputBindings = Readonly<Record<string, AiInputBinding>>;
export type AiNodeOutputBindings = Readonly<Record<string, AiOutputBinding>>;
export function areAiPortKindsCompatible(outputKind: AiPortValueKind, inputKind: AiPortValueKind): boolean { return outputKind === inputKind; }
export function inferAiPortValueKind(value: unknown): AiPortValueKind | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (isPosition(value)) return 'position';
  return undefined;
}
export function isAiInputBinding(value: unknown): value is AiInputBinding {
  if (!isRecord(value) || typeof value.source !== 'string') return false;
  if (value.source === 'literal') return isSerializableLiteral(value.value);
  if (value.source === 'blackboard') return isNonEmptyString(value.key);
  if (value.source === 'node') return isNonEmptyString(value.nodeId) && isNonEmptyString(value.port);
  if (value.source === 'subgraphInput') return isNonEmptyString(value.port);
  return false;
}
export function isAiOutputBinding(value: unknown): value is AiOutputBinding {
  if (!isRecord(value) || typeof value.target !== 'string') return false;
  if (value.target === 'blackboard') return isNonEmptyString(value.key);
  if (value.target === 'subgraphOutput') return isNonEmptyString(value.port);
  return false;
}
function isSerializableLiteral(value: unknown): value is AiBlackboardValue { return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || isPosition(value); }
function isPosition(value: unknown): value is { readonly x: number; readonly y: number } { return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y); }
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
