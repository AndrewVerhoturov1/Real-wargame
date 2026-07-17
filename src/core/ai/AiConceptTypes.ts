import type { AiBlackboardValue } from './AiBlackboard';

export type AiConceptKind = 'value' | 'check' | 'action' | 'object';
export type AiConceptReadiness = 'ready' | 'simplified' | 'hidden' | 'planned' | 'deprecated' | 'debug';
export type AiConceptValueType = 'boolean' | 'percent' | 'number' | 'meters' | 'degrees' | 'position' | 'action' | 'text';
export type AiConceptCategory = 'soldier' | 'condition' | 'danger' | 'perception' | 'cover' | 'route' | 'order' | 'memory' | 'decision' | 'tactical' | 'action';
export type AiConceptMapFocus = 'unit' | 'threat' | 'cover' | 'route' | 'memory' | 'position' | 'none';

export interface AiConceptNodeTemplate {
  readonly nodeType: string;
  readonly label: string;
  readonly labelRu: string;
  readonly parameters: Readonly<Record<string, AiBlackboardValue>>;
}

export interface AiConceptDefinition {
  readonly key: string;
  readonly kind: AiConceptKind;
  readonly category: AiConceptCategory;
  readonly valueType?: AiConceptValueType;
  readonly nullable?: boolean;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly readiness: AiConceptReadiness;
  readonly readinessExplanation: string;
  readonly readinessExplanationRu: string;
  readonly source: string;
  readonly sourceRu: string;
  readonly defaultValue?: AiBlackboardValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly mapFocus: AiConceptMapFocus;
  readonly nodeTemplates: readonly AiConceptNodeTemplate[];
  readonly aliases?: readonly string[];
}

export interface AiBlackboardValidationReport {
  readonly valid: boolean;
  readonly unknownKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly typeMismatches: readonly string[];
}

export const threshold = (key: string): AiConceptNodeTemplate => ({
  nodeType: 'BlackboardValueAbove', label: 'Create numeric threshold', labelRu: 'Создать числовой порог',
  parameters: { sourceKey: key, comparison: 'above', threshold: 60, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const stableThreshold = (key: string): AiConceptNodeTemplate => ({
  nodeType: 'StableThreshold', label: 'Create stable threshold', labelRu: 'Создать стабильный порог',
  parameters: { sourceKey: key, enterThreshold: 70, exitThreshold: 45, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const score = (key: string): AiConceptNodeTemplate => ({
  nodeType: 'ParameterScore', label: 'Use in branch score', labelRu: 'Использовать в оценке ветки',
  parameters: { sourceKey: key, direction: 'positive', weight: 1, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const flag = (key: string): AiConceptNodeTemplate => ({
  nodeType: 'FlagCheck', label: 'Create flag check', labelRu: 'Создать проверку флага',
  parameters: { flagKey: key, expected: true, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const moveTo = (key: string): AiConceptNodeTemplate => ({
  nodeType: 'SetAction', label: 'Move to this position', labelRu: 'Двигаться к этой точке',
  parameters: { action: 'move_to', targetKey: key, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const numericNodes = (key: string): readonly AiConceptNodeTemplate[] => [threshold(key), stableThreshold(key), score(key)];
export const tacticalCheck = (key: string, label: string, labelRu: string): AiConceptNodeTemplate => ({
  nodeType: 'TacticalCheck', label, labelRu,
  parameters: { checkKind: key, expected: true, cooldownSeconds: 0, cooldownTiming: 'after' },
});
export const actionNode = (key: string, labelRu: string, targetKey?: string): AiConceptNodeTemplate => ({
  nodeType: 'SetAction', label: `Create ${key} action`, labelRu: `Создать действие «${labelRu}»`,
  parameters: { action: key, ...(targetKey ? { targetKey } : {}), cooldownSeconds: 0, cooldownTiming: 'after' },
});

export function formatAiConceptValue(concept: AiConceptDefinition, value: AiBlackboardValue | undefined, language: 'ru' | 'en'): string {
  if (value === undefined) return language === 'ru' ? 'нет данных' : 'no data';
  if (value === null) return language === 'ru' ? 'нет' : 'none';
  if (typeof value === 'boolean') return language === 'ru' ? (value ? 'Да' : 'Нет') : (value ? 'Yes' : 'No');
  if (typeof value === 'object') return `${round(value.x)}, ${round(value.y)}`;
  if (typeof value === 'number') {
    const shown = round(value);
    if (concept.valueType === 'percent') return `${shown} / 100`;
    if (concept.valueType === 'meters') return `${shown} ${language === 'ru' ? 'м' : 'm'}`;
    if (concept.valueType === 'degrees') return value < 0 ? (language === 'ru' ? 'не определено' : 'undefined') : `${shown}°`;
    return String(shown);
  }
  return String(value);
}

export function matchesAiConceptValueType(value: AiBlackboardValue, valueType?: AiConceptValueType, nullable = false): boolean {
  if (value === null) return nullable || valueType === 'position' || valueType === 'text' || valueType === 'action';
  if (!valueType) return true;
  if (valueType === 'boolean') return typeof value === 'boolean';
  if (valueType === 'position') return typeof value === 'object' && typeof value.x === 'number' && typeof value.y === 'number';
  if (valueType === 'text' || valueType === 'action') return typeof value === 'string';
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value: number): number { return Math.round(value * 10) / 10; }
