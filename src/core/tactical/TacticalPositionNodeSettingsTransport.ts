import type { TacticalPositionTargetSpec } from '../ai/tactical/TacticalQuery';
import { normalizeTacticalPositionSearchSettings, type TacticalPositionSearchSettings } from './TacticalPositionNodeSettings';

const SETTINGS_FIELD = 'nodeSearchSettings';
type TransportTarget = TacticalPositionTargetSpec & { readonly nodeSearchSettings?: TacticalPositionSearchSettings };

export function attachTacticalPositionSearchSettings(
  target: TacticalPositionTargetSpec,
  settings: TacticalPositionSearchSettings,
): TacticalPositionTargetSpec {
  return Object.freeze({
    ...target,
    ...('point' in target && target.point ? { point: Object.freeze({ ...target.point }) } : {}),
    [SETTINGS_FIELD]: normalizeTacticalPositionSearchSettings(settings),
  }) as TacticalPositionTargetSpec;
}

export function readTacticalPositionSearchSettings(
  target: TacticalPositionTargetSpec | null | undefined,
): TacticalPositionSearchSettings | undefined {
  if (!target || typeof target !== 'object') return undefined;
  const value = (target as TransportTarget)[SETTINGS_FIELD];
  return value ? normalizeTacticalPositionSearchSettings(value) : undefined;
}
