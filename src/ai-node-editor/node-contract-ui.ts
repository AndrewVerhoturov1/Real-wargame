import type { AiNode } from '../core/ai/AiGraph';
import type { AiNodeContract, AiParameterDefinition } from '../core/ai/contracts/AiNodeContract';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../core/ai/contracts/AiNodeContractRegistry';
import type { AiPortDefinition, AiPortValueKind } from '../core/ai/contracts/AiPortTypes';
import { areAiPortKindsCompatible } from '../core/ai/contracts/AiPortTypes';
import { listMovementProfileSelectorEntries } from './MovementProfileSelectorProvider';
import { getSubgraphChoice } from './subgraph-ui';
import {
  isTacticalPositionParameterContainer,
  readTacticalPositionParameterFields,
  renderTacticalPositionParameterFields,
} from './tactical-position-node-ui';

export interface NodeContractUiModel {
  readonly contract?: AiNodeContract;
  readonly inputs: readonly AiPortDefinition[];
  readonly outputs: readonly AiPortDefinition[];
}

export function getNodeContractUiModel(node: Pick<AiNode, 'id' | 'type' | 'parameters'>): NodeContractUiModel {
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(String(node.type));
  if (node.type === 'Subgraph') {
    const id = typeof node.parameters?.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
    const subgraph = getSubgraphChoice(id);
    if (subgraph) return { contract, inputs: subgraph.inputs, outputs: subgraph.outputs };
  }
  return { contract, inputs: contract?.inputs ?? [], outputs: contract?.outputs ?? [] };
}

export function canConnectPorts(output: AiPortDefinition, input: AiPortDefinition): boolean {
  return areAiPortKindsCompatible(output.kind, input.kind);
}

export function explainPortIncompatibilityRu(
  outputKind: AiPortValueKind,
  inputKind: AiPortValueKind,
  outputLabel: string,
  inputLabel: string,
): string {
  if (outputKind === inputKind) return '';
  return `Нельзя передать «${outputLabel}» во вход «${inputLabel}»: тип ${portKindRu(outputKind)} несовместим с типом ${portKindRu(inputKind)}.`;
}

export function renderContractParameterFields(node: Pick<AiNode, 'id' | 'type' | 'parameters'>): string {
  if (node.type === 'CreateTacticalPositionCandidates') {
    return renderTacticalPositionParameterFields(node.parameters);
  }
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(String(node.type));
  if (!contract || contract.parameters.length === 0) return '<p class="toolbar-note">У этой ноды нет настраиваемых параметров.</p>';
  const registered = contract.parameters.map((parameter) => renderParameter(parameter, node.parameters?.[parameter.id])).join('');
  return node.type === 'SetSearchSector'
    ? `${registered}${renderSearchSectorDirectionFields(node.parameters)}`
    : registered;
}

function renderParameter(parameter: AiParameterDefinition, value: unknown): string {
  const actual = value ?? parameter.defaultValue ?? '';
  const required = parameter.required ? '<b class="contract-required">required · обязательно</b>' : '<span class="contract-optional">необязательно</span>';
  const range = parameter.kind === 'number'
    ? `<small>${parameter.minimum !== undefined ? `min ${parameter.minimum}` : ''}${parameter.maximum !== undefined ? ` · max ${parameter.maximum}` : ''}</small>`
    : '';
  const attrs = `${parameter.minimum !== undefined ? ` min="${parameter.minimum}"` : ''}${parameter.maximum !== undefined ? ` max="${parameter.maximum}"` : ''}${parameter.integer ? ' step="1"' : parameter.kind === 'number' ? ' step="any"' : ''}`;
  let control = '';
  if (parameter.selector === 'movement_profile_registry') {
    control = renderMovementProfileRegistrySelector(parameter.id, String(actual));
  } else if (parameter.kind === 'boolean') {
    control = `<input class="contract-parameter-field" data-param-id="${escapeAttribute(parameter.id)}" data-param-kind="boolean" type="checkbox" ${actual === true ? 'checked' : ''} />`;
  } else if (parameter.kind === 'enum') {
    control = `<select class="contract-parameter-field" data-param-id="${escapeAttribute(parameter.id)}" data-param-kind="enum">${(parameter.options ?? []).map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === actual ? 'selected' : ''}>${escapeHtml(option.labelRu)} · ${escapeHtml(option.value)}</option>`).join('')}</select>`;
  } else {
    const type = parameter.kind === 'number' ? 'number' : 'text';
    control = `<input class="contract-parameter-field" data-param-id="${escapeAttribute(parameter.id)}" data-param-kind="${escapeAttribute(parameter.kind)}" type="${type}" value="${escapeAttribute(String(actual))}"${attrs} />`;
  }
  return `<label class="inspector-field contract-parameter"><span>${escapeHtml(parameter.labelRu)} ${required}</span>${control}${range}${parameter.descriptionRu ? `<small>${escapeHtml(parameter.descriptionRu)}</small>` : ''}</label>`;
}

function renderSearchSectorDirectionFields(parameters: AiNode['parameters']): string {
  const centerSource = parameters?.centerSource === 'blackboard_position' ? 'blackboard_position' : 'fixed';
  const originPositionKey = typeof parameters?.originPositionKey === 'string' && parameters.originPositionKey.length > 0
    ? parameters.originPositionKey
    : 'self_position';
  const targetPositionKey = typeof parameters?.targetPositionKey === 'string' && parameters.targetPositionKey.length > 0
    ? parameters.targetPositionKey
    : 'suspected_enemy_position';
  return `
    <label class="inspector-field contract-parameter">
      <span>Источник направления <span class="contract-optional">необязательно</span></span>
      <select class="contract-parameter-field" data-param-id="centerSource" data-param-kind="enum">
        <option value="fixed" ${centerSource === 'fixed' ? 'selected' : ''}>Фиксированный угол · fixed</option>
        <option value="blackboard_position" ${centerSource === 'blackboard_position' ? 'selected' : ''}>Позиция из памяти · blackboard_position</option>
      </select>
      <small>Фиксированный угол использует поле «Центральное направление». Позиция из памяти вычисляет направление на субъективный контакт.</small>
    </label>
    <label class="inspector-field contract-parameter">
      <span>Ключ позиции бойца <span class="contract-optional">необязательно</span></span>
      <input class="contract-parameter-field" data-param-id="originPositionKey" data-param-kind="string" type="text" value="${escapeAttribute(originPositionKey)}" />
      <small>Обычно self_position.</small>
    </label>
    <label class="inspector-field contract-parameter">
      <span>Ключ позиции цели <span class="contract-optional">необязательно</span></span>
      <input class="contract-parameter-field" data-param-id="targetPositionKey" data-param-kind="string" type="text" value="${escapeAttribute(targetPositionKey)}" />
      <small>Для следов противника используйте suspected_enemy_position.</small>
    </label>`;
}

export function readContractParameterFields(container: ParentNode, fallback: Record<string, unknown>): Record<string, unknown> {
  if (isTacticalPositionParameterContainer(container)) {
    return readTacticalPositionParameterFields(container, fallback);
  }
  const next: Record<string, unknown> = { ...fallback };
  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.contract-parameter-field').forEach((field) => {
    const id = field.dataset.paramId;
    if (!id) return;
    const kind = field.dataset.paramKind;
    next[id] = kind === 'boolean' && field instanceof HTMLInputElement
      ? field.checked
      : kind === 'number'
        ? Number(field.value)
        : field.value;
  });
  return next;
}

function renderMovementProfileRegistrySelector(parameterId: string, selectedId: string): string {
  const profiles = listMovementProfileSelectorEntries();
  const options = profiles.map((profile) => `<option value="${escapeAttribute(profile.id)}" ${profile.id === selectedId ? 'selected' : ''}>${escapeHtml(profile.nameRu)} · ${escapeHtml(profile.id)}</option>`);
  if (selectedId && !profiles.some((profile) => profile.id === selectedId)) {
    options.unshift(`<option value="${escapeAttribute(selectedId)}" selected>Недоступен: ${escapeHtml(selectedId)}</option>`);
  }
  return `<select class="contract-parameter-field movement-profile-registry-selector" data-param-id="${escapeAttribute(parameterId)}" data-param-kind="string" data-selector="movement_profile_registry">${options.join('')}</select>`;
}

function portKindRu(kind: AiPortValueKind): string {
  return ({ number: 'число', boolean: 'да/нет', string: 'текст', position: 'позиция', unitId: 'боец', objectId: 'объект', slotId: 'место', event: 'событие', plan: 'план', route: 'маршрут', tacticalQuery: 'тактический запрос' } as const)[kind];
}
function escapeHtml(value: string): string { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value); }