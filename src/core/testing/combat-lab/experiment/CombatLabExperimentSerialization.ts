import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
} from './CombatLabExperimentContracts';
import { normalizeCombatLabParticipantParameters } from './CombatLabParticipantParameters';
import {
  validateCombatLabExperiment,
  type CombatLabExperimentIssueV1,
} from './CombatLabExperimentValidation';

const UI_ONLY_KEYS = new Set([
  'ui',
  'uiState',
  'editorState',
  'authoringState',
  'selectionState',
  'historyState',
  'runtimeSnapshot',
]);
const LEGACY_ONLY_KEYS = new Set(['selectableAs']);

export function serializeCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): string {
  const migrated = migrateCombatLabExperimentV1(experiment as unknown as Record<string, unknown>);
  return JSON.stringify(normalizeCombatLabExperimentValue(migrated), null, 2);
}

export function parseCombatLabExperiment(
  json: string,
): {
  readonly experiment: CombatLabExperimentV1 | null;
  readonly issues: readonly CombatLabExperimentIssueV1[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return failure('combat_lab_experiment_json_invalid', 'Файл эксперимента содержит повреждённый JSON.');
  }
  if (!isRecord(parsed)) {
    return failure('combat_lab_experiment_root_invalid', 'Корнем JSON эксперимента должен быть объект.');
  }
  try {
    const experiment = migrateCombatLabExperimentV1(parsed);
    const issues = validateCombatLabExperiment(experiment);
    return {
      experiment: issues.some((issue) => issue.severity === 'error') ? null : experiment,
      issues,
    };
  } catch {
    return failure('combat_lab_experiment_shape_invalid', 'Структура JSON эксперимента не соответствует формату Stage 10.');
  }
}

export function migrateCombatLabExperimentV1(value: Record<string, unknown>): CombatLabExperimentV1 {
  const source = structuredClone(value) as Record<string, unknown>;
  const roles = Array.isArray(source.roles) ? source.roles : [];
  source.roles = roles.map((role, index) => migrateParticipantRole(role, index));
  return source as unknown as CombatLabExperimentV1;
}

export function normalizeCombatLabExperimentValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCombatLabExperimentValue);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (!isRecord(value)) {
    if (typeof value === 'number') return Number.isFinite(value) ? canonicalNumber(value) : null;
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareText)) {
    if (UI_ONLY_KEYS.has(key) || LEGACY_ONLY_KEYS.has(key)) continue;
    const child = value[key];
    if (child !== undefined) normalized[key] = normalizeCombatLabExperimentValue(child);
  }
  return normalized;
}

function migrateParticipantRole(value: unknown, index: number): CombatLabExperimentRoleV1 {
  if (!isRecord(value)) throw new Error(`Invalid participant at roles[${index}].`);
  return Object.freeze({
    roleId: text(value.roleId),
    unitId: text(value.unitId),
    titleRu: text(value.titleRu),
    parameters: normalizeCombatLabParticipantParameters(value.parameters),
  });
}

function failure(code: string, messageRu: string): {
  readonly experiment: null;
  readonly issues: readonly CombatLabExperimentIssueV1[];
} {
  return {
    experiment: null,
    issues: [{ severity: 'error', code, messageRu, path: '$' }],
  };
}

function canonicalNumber(value: number): number {
  if (Object.is(value, -0)) return 0;
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
