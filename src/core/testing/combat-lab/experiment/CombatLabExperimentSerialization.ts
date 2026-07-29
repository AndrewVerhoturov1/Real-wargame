import type { CombatLabExperimentV1 } from './CombatLabExperimentContracts';
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

export function serializeCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): string {
  return JSON.stringify(normalizeCombatLabExperimentValue(experiment), null, 2);
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
    return {
      experiment: null,
      issues: [{
        severity: 'error',
        code: 'combat_lab_experiment_json_invalid',
        messageRu: 'Файл эксперимента содержит повреждённый JSON.',
        path: '$',
      }],
    };
  }
  if (!isRecord(parsed)) {
    return {
      experiment: null,
      issues: [{
        severity: 'error',
        code: 'combat_lab_experiment_root_invalid',
        messageRu: 'Корнем JSON эксперимента должен быть объект.',
        path: '$',
      }],
    };
  }
  const experiment = parsed as unknown as CombatLabExperimentV1;
  try {
    const issues = validateCombatLabExperiment(experiment);
    return {
      experiment: issues.some((issue) => issue.severity === 'error') ? null : experiment,
      issues,
    };
  } catch {
    return {
      experiment: null,
      issues: [{
        severity: 'error',
        code: 'combat_lab_experiment_shape_invalid',
        messageRu: 'Структура JSON эксперимента не соответствует формату Stage 10.',
        path: '$',
      }],
    };
  }
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
    if (UI_ONLY_KEYS.has(key)) continue;
    const child = value[key];
    if (child !== undefined) normalized[key] = normalizeCombatLabExperimentValue(child);
  }
  return normalized;
}

function canonicalNumber(value: number): number {
  if (Object.is(value, -0)) return 0;
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
