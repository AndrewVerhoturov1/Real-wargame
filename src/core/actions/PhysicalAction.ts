import type { UnitBehaviorRuntime } from '../behavior/BehaviorModel';
import type { PostureTransitionActionV1 } from './PostureTransition';
import type { WeaponReloadActionV1 } from './WeaponReload';

export const PHYSICAL_ACTION_SCHEMA_VERSION = 1 as const;
export const POSTURE_TRANSITION_ACTION_TYPE = 'posture_transition' as const;
export const WEAPON_RELOAD_ACTION_TYPE = 'weapon_reload' as const;

export type PhysicalActionStatus = 'running' | 'completed' | 'cancelled' | 'failed';
export type PhysicalActionOwnerSource =
  | 'player'
  | 'player_command'
  | 'movement'
  | 'tactical_position'
  | 'test'
  | 'system'
  | 'future_ai';

export interface PhysicalActionOwner {
  readonly source: PhysicalActionOwnerSource;
  readonly id: string;
}

export interface PhysicalActionBaseV1 {
  readonly schemaVersion: typeof PHYSICAL_ACTION_SCHEMA_VERSION;
  readonly id: string;
  readonly sequence: number;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly startedSeconds: number;
  readonly durationSeconds: number;
  progress: number;
  status: PhysicalActionStatus;
  readonly reasonCode: string;
  readonly reasonRu: string;
  resultCode: string | null;
  resultRu: string | null;
}

export type UnitPhysicalAction = PostureTransitionActionV1 | WeaponReloadActionV1;

export interface PhysicalActionCommandResult {
  readonly accepted: boolean;
  readonly action: UnitPhysicalAction | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

declare module '../behavior/BehaviorModel' {
  interface UnitBehaviorRuntime {
    physicalAction?: UnitPhysicalAction | null;
  }
}

export function isPhysicalActionRunning(
  unit: { readonly behaviorRuntime: Pick<UnitBehaviorRuntime, 'physicalAction'> },
): boolean {
  return unit.behaviorRuntime.physicalAction?.status === 'running';
}

export function serializeUnitPhysicalAction(
  action: UnitPhysicalAction | null | undefined,
): UnitPhysicalAction | undefined {
  if (!action) return undefined;
  return {
    ...action,
    owner: { ...action.owner },
  };
}

export function acceptedPhysicalAction(
  action: UnitPhysicalAction | null,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  return { accepted: true, action, reasonCode, reasonRu };
}

export function rejectedPhysicalAction(
  action: UnitPhysicalAction | null,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  return { accepted: false, action, reasonCode, reasonRu };
}

export function normalizePhysicalActionOwner(
  value: Partial<PhysicalActionOwner> | Record<string, unknown>,
  fallbackId = 'system',
): PhysicalActionOwner {
  const source = normalizePhysicalActionOwnerSource(value.source);
  return {
    source,
    id: cleanPhysicalActionText(value.id, fallbackId || source),
  };
}

export function normalizePhysicalActionOwnerSource(value: unknown): PhysicalActionOwnerSource {
  if (
    value === 'player'
    || value === 'player_command'
    || value === 'movement'
    || value === 'tactical_position'
    || value === 'test'
    || value === 'system'
    || value === 'future_ai'
  ) return value;
  return 'system';
}

export function normalizePhysicalActionStatus(value: unknown): PhysicalActionStatus {
  if (value === 'completed' || value === 'cancelled' || value === 'failed') return value;
  return 'running';
}

export function cleanPhysicalActionText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function nullablePhysicalActionText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function finitePhysicalActionNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function finiteNonNegativePhysicalActionNumber(value: unknown, fallback: number): number {
  return Math.max(0, finitePhysicalActionNumber(value, fallback));
}

export function finitePositivePhysicalActionNumber(value: unknown, fallback: number): number {
  const normalized = finitePhysicalActionNumber(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

export function physicalActionInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finitePhysicalActionNumber(value, fallback))));
}

export function clampPhysicalActionProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function isPhysicalActionRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
