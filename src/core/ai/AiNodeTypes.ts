import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from './contracts/AiNodeContractRegistry';
import type { AiNodeCategory } from './contracts/AiNodeContract';

export type { AiNodeCategory } from './contracts/AiNodeContract';

export const LEGACY_MOVEMENT_MODE_LABEL = 'Movement Mode' as const;
export const LEGACY_MOVEMENT_MODE_LABEL_RU = 'Режим движения' as const;

export interface AiNodeTypeDefinition {
  readonly type: string;
  readonly category: AiNodeCategory;
  readonly label: string;
  readonly description: string;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly canHaveChildren: boolean;
}

export const AI_NODE_TYPE_DEFINITIONS = Object.fromEntries(
  DEFAULT_AI_NODE_CONTRACT_REGISTRY.list().map((contract) => [
    contract.type,
    {
      type: contract.type,
      category: contract.category,
      label: contract.type === 'SetMovementMode' ? LEGACY_MOVEMENT_MODE_LABEL : contract.label,
      description: contract.description,
      labelRu: contract.type === 'SetMovementMode' ? LEGACY_MOVEMENT_MODE_LABEL_RU : contract.labelRu,
      descriptionRu: contract.descriptionRu,
      canHaveChildren: contract.childPolicy !== 'none',
    },
  ]),
) as Readonly<Record<string, AiNodeTypeDefinition>>;

export type AiNodeType = string;

export function isAiNodeType(value: string): value is AiNodeType {
  return DEFAULT_AI_NODE_CONTRACT_REGISTRY.has(value);
}

export function getAiNodeTypeDefinition(type: AiNodeType): AiNodeTypeDefinition {
  const definition = AI_NODE_TYPE_DEFINITIONS[type];
  if (!definition) throw new Error(`Unknown AI node type: ${type}`);
  return definition;
}
