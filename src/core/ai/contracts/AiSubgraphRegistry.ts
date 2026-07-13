import type { AiBlackboardValue } from '../AiBlackboard';
import type { AiGraphV2 } from '../AiGraph';
import type { AiPortDefinition } from './AiPortTypes';
import takeCoverGraph from '../../../data/ai/subgraphs/take_cover.json';
import reloadWeaponGraph from '../../../data/ai/subgraphs/reload_weapon.json';
import reactToFireGraph from '../../../data/ai/subgraphs/react_to_fire.json';
import moveAndObserveGraph from '../../../data/ai/subgraphs/move_and_observe.json';

export type AiSubgraphCancelPolicy = 'cancel_child';

export interface AiSubgraphDefinition {
  readonly id: string;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly inputs: readonly AiPortDefinition[];
  readonly outputs: readonly AiPortDefinition[];
  readonly localMemoryDefaults: Readonly<Record<string, AiBlackboardValue>>;
  readonly cancelPolicy: AiSubgraphCancelPolicy;
  readonly graph: AiGraphV2;
}

export class AiSubgraphRegistry {
  private readonly definitions = new Map<string, AiSubgraphDefinition>();

  register(definition: AiSubgraphDefinition): this {
    if (this.definitions.has(definition.id)) throw new Error(`Subgraph ${definition.id} is already registered.`);
    this.definitions.set(definition.id, cloneDefinition(definition));
    return this;
  }

  get(id: string): AiSubgraphDefinition | undefined {
    const value = this.definitions.get(id);
    return value ? cloneDefinition(value) : undefined;
  }

  require(id: string): AiSubgraphDefinition {
    const value = this.get(id);
    if (!value) throw new Error(`Unknown AI subgraph: ${id}.`);
    return value;
  }

  list(): AiSubgraphDefinition[] {
    return [...this.definitions.values()].map(cloneDefinition);
  }

  assertNoRecursiveReferences(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string, path: string[]): void => {
      if (visiting.has(id)) throw new Error(`Recursive AI subgraph reference: ${[...path, id].join(' -> ')}.`);
      if (visited.has(id)) return;
      const definition = this.definitions.get(id);
      if (!definition) throw new Error(`Unknown AI subgraph reference: ${id}.`);
      visiting.add(id);
      for (const childId of definition.graph.subgraphRefs) visit(childId, [...path, id]);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this.definitions.keys()) visit(id, []);
  }
}

const port = (id: string, kind: AiPortDefinition['kind'], label: string, labelRu: string, required = false): AiPortDefinition => ({ id, kind, label, labelRu, required });

export const DEFAULT_AI_SUBGRAPH_REGISTRY = new AiSubgraphRegistry()
  .register({
    id: 'take_cover', label: 'Take Cover', labelRu: 'Занять укрытие',
    description: 'Moves to an explicitly supplied cover position.', descriptionRu: 'Движется к явно переданной позиции укрытия.',
    inputs: [port('cover_position', 'position', 'Cover position', 'Позиция укрытия', true)],
    outputs: [port('reached_position', 'position', 'Reached position', 'Достигнутая позиция', true)],
    localMemoryDefaults: {}, cancelPolicy: 'cancel_child', graph: takeCoverGraph as AiGraphV2,
  })
  .register({
    id: 'reload_weapon', label: 'Reload Weapon', labelRu: 'Перезарядить оружие',
    description: 'Completes a timed reload.', descriptionRu: 'Выполняет длительную перезарядку.',
    inputs: [], outputs: [port('success', 'boolean', 'Success', 'Успех')],
    localMemoryDefaults: {}, cancelPolicy: 'cancel_child', graph: reloadWeaponGraph as AiGraphV2,
  })
  .register({
    id: 'react_to_fire', label: 'React to Fire', labelRu: 'Реагировать на обстрел',
    description: 'Changes posture and takes cover.', descriptionRu: 'Меняет позу и занимает укрытие.',
    inputs: [port('cover_position', 'position', 'Cover position', 'Позиция укрытия', true), port('threat_event', 'event', 'Threat event', 'Событие угрозы')],
    outputs: [port('reached_position', 'position', 'Reached position', 'Достигнутая позиция')],
    localMemoryDefaults: {}, cancelPolicy: 'cancel_child', graph: reactToFireGraph as AiGraphV2,
  })
  .register({
    id: 'move_and_observe', label: 'Move and Observe', labelRu: 'Двигаться и наблюдать',
    description: 'Enables observation attention and moves to a destination.', descriptionRu: 'Включает режим наблюдения и движется к цели.',
    inputs: [port('destination', 'position', 'Destination', 'Точка назначения', true)],
    outputs: [port('reached_position', 'position', 'Reached position', 'Достигнутая позиция')],
    localMemoryDefaults: {}, cancelPolicy: 'cancel_child', graph: moveAndObserveGraph as AiGraphV2,
  });

DEFAULT_AI_SUBGRAPH_REGISTRY.assertNoRecursiveReferences();

function cloneDefinition(value: AiSubgraphDefinition): AiSubgraphDefinition {
  return {
    ...value,
    inputs: value.inputs.map((item) => ({ ...item })),
    outputs: value.outputs.map((item) => ({ ...item })),
    localMemoryDefaults: cloneRecord(value.localMemoryDefaults),
    graph: JSON.parse(JSON.stringify(value.graph)) as AiGraphV2,
  };
}
function cloneRecord(value: Readonly<Record<string, AiBlackboardValue>>): Record<string, AiBlackboardValue> {
  const result: Record<string, AiBlackboardValue> = {};
  for (const [key, item] of Object.entries(value)) result[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  return result;
}
