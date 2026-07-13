import type { AiBlackboardValue } from '../core/ai/AiBlackboard';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../core/ai/contracts/AiNodeContractRegistry';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../core/ai/contracts/AiSubgraphRegistry';
import type { AiParameterDefinition } from '../core/ai/contracts/AiNodeContract';
import { areAiPortKindsCompatible, type AiPortValueKind } from '../core/ai/contracts/AiPortTypes';

export interface ContractUiNode {
  readonly id: string;
  readonly type: string;
  readonly parameters: Record<string, AiBlackboardValue>;
  readonly inputBindings?: Readonly<Record<string, unknown>>;
  readonly outputBindings?: Readonly<Record<string, unknown>>;
}

export function createContractDefaultParameters(type: string): Record<string, AiBlackboardValue> {
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(type);
  if (!contract) return {};
  return Object.fromEntries(
    contract.parameters
      .filter((parameter) => parameter.defaultValue !== undefined)
      .map((parameter) => [parameter.id, cloneValue(parameter.defaultValue as AiBlackboardValue)]),
  );
}

export function describeNodeRu(node: ContractUiNode): string {
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
  if (!contract) return node.type;
  const p = node.parameters;
  if (node.type === 'BlackboardValueAbove') {
    const comparison = p.comparison === 'below' ? 'ниже' : 'выше';
    return `Если ${String(p.sourceKey ?? 'значение')} ${comparison} ${String(p.threshold ?? '?')}`;
  }
  if (node.type === 'FlagCheck') return `Если «${String(p.flagKey ?? 'флаг')}» = ${p.expected === false ? 'нет' : 'да'}`;
  if (node.type === 'DistanceCheck') return `Если расстояние ${String(p.comparison ?? 'ближе')} ${String(p.thresholdMeters ?? '?')} м`;
  if (node.type === 'Wait') return `Ждать ${String(p.durationSeconds ?? 0)} сек.`;
  if (node.type === 'WaitForEvent') return `Ждать событие «${String(p.eventType ?? '')}»`;
  if (node.type === 'Timeout') return `Ограничить дочерний шаг: ${String(p.timeoutSeconds ?? 0)} сек.`;
  if (node.type === 'Retry') return `Повторить до ${String(p.maxAttempts ?? 1)} попыток`;
  if (node.type === 'MoveToBlackboardPosition') return `Двигаться к «${String(p.targetKey ?? 'позиция')}»`;
  if (node.type === 'Subgraph') return `Выполнить подграф «${String(p.subgraphId ?? '')}»`;
  return contract.descriptionRu;
}

export function renderNodePorts(node: ContractUiNode, escape: (value: string) => string): string {
  const ports = getNodePortDefinitions(node.type, node.parameters);
  if (ports.inputs.length === 0 && ports.outputs.length === 0) return '';
  const inputs = ports.inputs.map((port) => `
    <button class="typed-port input ${port.required ? 'required' : 'optional'}"
      data-typed-port-kind="input" data-node-id="${escape(node.id)}" data-port-id="${escape(port.id)}" data-value-kind="${port.kind}"
      title="${escape(port.labelRu)} · ${port.kind}${port.required ? ' · обязательно' : ' · необязательно'}">
      <span>${escape(port.labelRu)}</span><b>${port.kind}</b>
    </button>`).join('');
  const outputs = ports.outputs.map((port) => `
    <button class="typed-port output"
      data-typed-port-kind="output" data-node-id="${escape(node.id)}" data-port-id="${escape(port.id)}" data-value-kind="${port.kind}"
      title="${escape(port.labelRu)} · ${port.kind}">
      <span>${escape(port.labelRu)}</span><b>${port.kind}</b>
    </button>`).join('');
  return `<div class="typed-port-list"><div class="typed-port-column inputs">${inputs}</div><div class="typed-port-column outputs">${outputs}</div></div>`;
}

export function renderContractParameters(node: ContractUiNode, escape: (value: string) => string): string {
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
  if (!contract || contract.parameters.length === 0) return '<p class="toolbar-note">У этой ноды нет настраиваемых параметров.</p>';
  return contract.parameters
    .filter((parameter) => node.type !== 'Subgraph' || parameter.id !== 'subgraphId')
    .map((parameter) => renderParameter(parameter, node.parameters[parameter.id], escape))
    .join('');
}

export function readContractParameters(container: ParentNode, node: ContractUiNode): Record<string, AiBlackboardValue> {
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
  const next = { ...node.parameters };
  if (!contract) return next;
  for (const parameter of contract.parameters) {
    const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-contract-param="${cssEscape(parameter.id)}"]`);
    if (!field) continue;
    next[parameter.id] = readParameterValue(field, parameter);
  }
  return next;
}

export function getPortKind(
  type: string,
  direction: 'input' | 'output',
  portId: string,
  parameters: Readonly<Record<string, AiBlackboardValue>> = {},
): AiPortValueKind | undefined {
  return getNodePortDefinitions(type, parameters)[direction === 'input' ? 'inputs' : 'outputs']
    .find((port) => port.id === portId)?.kind;
}

export function getNodePortDefinitions(
  type: string,
  parameters: Readonly<Record<string, AiBlackboardValue>> = {},
) {
  if (type === 'Subgraph' && typeof parameters.subgraphId === 'string') {
    const subgraph = DEFAULT_AI_SUBGRAPH_REGISTRY.get(parameters.subgraphId);
    if (subgraph) return { inputs: subgraph.inputs, outputs: subgraph.outputs };
  }
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(type);
  return { inputs: contract?.inputs ?? [], outputs: contract?.outputs ?? [] };
}

export function explainPortConnectionRu(outputKind: AiPortValueKind, inputKind: AiPortValueKind): string {
  return areAiPortKindsCompatible(outputKind, inputKind)
    ? `Можно соединить ${outputKind} → ${inputKind}.`
    : `Нельзя передать «${kindRu(outputKind)}» во вход «${kindRu(inputKind)}».`;
}

export function canConnectPorts(outputKind: AiPortValueKind, inputKind: AiPortValueKind): boolean {
  return areAiPortKindsCompatible(outputKind, inputKind);
}

function renderParameter(parameter: AiParameterDefinition, current: AiBlackboardValue | undefined, escape: (value: string) => string): string {
  const value = current ?? parameter.defaultValue ?? '';
  const required = parameter.required ? '<em class="required-marker">обязательно</em>' : '<em>необязательно</em>';
  const range = parameter.kind === 'number'
    ? `<small>${parameter.minimum !== undefined ? `от ${parameter.minimum}` : ''}${parameter.maximum !== undefined ? ` до ${parameter.maximum}` : ''}</small>`
    : '';
  const help = escape(parameter.descriptionRu ?? parameter.labelRu);
  if (parameter.kind === 'boolean') {
    return `<label class="contract-parameter" title="${help}"><span>${escape(parameter.labelRu)} ${required}</span><input data-contract-param="${escape(parameter.id)}" type="checkbox" ${value === true ? 'checked' : ''}/>${range}</label>`;
  }
  if (parameter.kind === 'enum') {
    return `<label class="contract-parameter" title="${help}"><span>${escape(parameter.labelRu)} ${required}</span><select data-contract-param="${escape(parameter.id)}">${(parameter.options ?? []).map((option) => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.labelRu)}</option>`).join('')}</select>${range}</label>`;
  }
  const type = parameter.kind === 'number' ? 'number' : 'text';
  const min = parameter.minimum !== undefined ? `min="${parameter.minimum}"` : '';
  const max = parameter.maximum !== undefined ? `max="${parameter.maximum}"` : '';
  const step = parameter.integer ? 'step="1"' : parameter.kind === 'number' ? 'step="any"' : '';
  return `<label class="contract-parameter" title="${help}"><span>${escape(parameter.labelRu)} ${required}</span><input data-contract-param="${escape(parameter.id)}" type="${type}" ${min} ${max} ${step} value="${escape(String(value ?? ''))}"/>${range}</label>`;
}

function readParameterValue(field: HTMLInputElement | HTMLSelectElement, parameter: AiParameterDefinition): AiBlackboardValue {
  if (parameter.kind === 'boolean' && field instanceof HTMLInputElement) return field.checked;
  if (parameter.kind === 'number') {
    const value = Number(field.value);
    return Number.isFinite(value) ? (parameter.integer ? Math.round(value) : value) : Number(parameter.defaultValue ?? 0);
  }
  return field.value;
}

function kindRu(kind: AiPortValueKind): string {
  return ({ number: 'Число', boolean: 'Да/нет', string: 'Текст', position: 'Позиция', unitId: 'Боец', objectId: 'Объект', slotId: 'Место', event: 'Событие', plan: 'План', route: 'Маршрут' } as const)[kind];
}

function cloneValue(value: AiBlackboardValue): AiBlackboardValue {
  return typeof value === 'object' && value !== null ? { ...value } : value;
}

function cssEscape(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}
