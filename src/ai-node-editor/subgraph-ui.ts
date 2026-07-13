import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../core/ai/contracts/AiSubgraphRegistry';
import type { AiPortDefinition } from '../core/ai/contracts/AiPortTypes';

export interface SubgraphChoice {
  readonly id: string;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly inputs: readonly AiPortDefinition[];
  readonly outputs: readonly AiPortDefinition[];
}

export function listSubgraphChoices(): SubgraphChoice[] {
  return DEFAULT_AI_SUBGRAPH_REGISTRY.list().map((definition) => ({
    id: definition.id,
    label: definition.label,
    labelRu: definition.labelRu,
    description: definition.description,
    descriptionRu: definition.descriptionRu,
    inputs: definition.inputs.map((item) => ({ ...item })),
    outputs: definition.outputs.map((item) => ({ ...item })),
  }));
}

export function getSubgraphChoice(id: string): SubgraphChoice | undefined {
  return listSubgraphChoices().find((choice) => choice.id === id);
}

export function getSubgraphGraph(id: string): unknown {
  return DEFAULT_AI_SUBGRAPH_REGISTRY.get(id)?.graph;
}
