import type { AiBlackboardDefaults } from '../AiBlackboard';
import type { AiGraphV2 } from '../AiGraph';
import type { AiPortDefinition } from './AiPortTypes';
import takeCoverGraph from '../../../data/ai/subgraphs/take_cover.json';
import reloadWeaponGraph from '../../../data/ai/subgraphs/reload_weapon.json';
import reactToFireGraph from '../../../data/ai/subgraphs/react_to_fire.json';
import moveAndObserveGraph from '../../../data/ai/subgraphs/move_and_observe.json';

export type AiSubgraphCancelPolicy = 'cancel_child';

export interface AiSubgraphPortDefinition extends AiPortDefinition {
  readonly memoryKey: string;
}

export interface AiSubgraphDefinition {
  readonly id: string;
  readonly name: string;
  readonly nameRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly inputs: readonly AiSubgraphPortDefinition[];
  readonly outputs: readonly AiSubgraphPortDefinition[];
  readonly localMemoryDefaults: AiBlackboardDefaults;
  readonly cancelPolicy: AiSubgraphCancelPolicy;
  readonly graph: AiGraphV2;
}

export interface AiSubgraphRegistryIssue {
  readonly severity: 'error';
  readonly code: 'UNKNOWN_SUBGRAPH_REFERENCE' | 'RECURSIVE_SUBGRAPH_REFERENCE';
  readonly subgraphId: string;
  readonly referencedSubgraphId?: string;
  readonly message: string;
  readonly messageRu: string;
}

export class AiSubgraphRegistry {
  private readonly definitions = new Map<string, AiSubgraphDefinition>();

  register(definition: AiSubgraphDefinition): this {
    if (this.definitions.has(definition.id)) {
      throw new Error(`AI subgraph already registered: ${definition.id}`);
    }
    this.definitions.set(definition.id, freezeDefinition(definition));
    return this;
  }

  get(id: string): AiSubgraphDefinition | undefined {
    return this.definitions.get(id);
  }

  require(id: string): AiSubgraphDefinition {
    const definition = this.get(id);
    if (!definition) throw new Error(`AI subgraph is not registered: ${id}`);
    return definition;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): readonly AiSubgraphDefinition[] {
    return [...this.definitions.values()];
  }

  validateReferences(): readonly AiSubgraphRegistryIssue[] {
    const issues: AiSubgraphRegistryIssue[] = [];
    const adjacency = new Map<string, string[]>();
    for (const definition of this.definitions.values()) {
      const refs = collectReferences(definition.graph);
      adjacency.set(definition.id, refs);
      for (const referencedId of refs) {
        if (!this.definitions.has(referencedId)) {
          issues.push({
            severity: 'error',
            code: 'UNKNOWN_SUBGRAPH_REFERENCE',
            subgraphId: definition.id,
            referencedSubgraphId: referencedId,
            message: `Subgraph ${definition.id} references unknown subgraph ${referencedId}.`,
            messageRu: `Подграф «${definition.nameRu}» ссылается на неизвестный подграф ${referencedId}.`,
          });
        }
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const reported = new Set<string>();
    const visit = (id: string, path: readonly string[]): void => {
      if (visiting.has(id)) {
        const cycleStart = path.indexOf(id);
        const cycle = [...path.slice(Math.max(0, cycleStart)), id];
        const key = cycle.join('>');
        if (!reported.has(key)) {
          reported.add(key);
          issues.push({
            severity: 'error',
            code: 'RECURSIVE_SUBGRAPH_REFERENCE',
            subgraphId: id,
            referencedSubgraphId: id,
            message: `Recursive subgraph reference is forbidden: ${cycle.join(' -> ')}.`,
            messageRu: `Рекурсивная ссылка подграфов запрещена: ${cycle.join(' → ')}.`,
          });
        }
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const next of adjacency.get(id) ?? []) {
        if (this.definitions.has(next)) visit(next, [...path, id]);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of adjacency.keys()) visit(id, []);
    return issues;
  }
}

const positionPort = (id: string, label: string, labelRu: string, memoryKey: string, required = true): AiSubgraphPortDefinition => ({
  id, kind: 'position', label, labelRu, memoryKey, required,
});

export const DEFAULT_AI_SUBGRAPH_REGISTRY = new AiSubgraphRegistry()
  .register({
    id: 'take_cover',
    name: 'Take Cover',
    nameRu: 'Занять укрытие',
    description: 'Move to a supplied cover position and return the reached position.',
    descriptionRu: 'Двигаться к переданной точке укрытия и вернуть достигнутую позицию.',
    inputs: [positionPort('cover_position', 'Cover position', 'Позиция укрытия', 'best_cover_position')],
    outputs: [positionPort('reached_position', 'Reached position', 'Достигнутая позиция', 'self_position')],
    localMemoryDefaults: { subgraph_private: 'take_cover_local' },
    cancelPolicy: 'cancel_child',
    graph: takeCoverGraph as unknown as AiGraphV2,
  })
  .register({
    id: 'reload_weapon',
    name: 'Reload Weapon',
    nameRu: 'Перезарядить оружие',
    description: 'Safely perform a stateful weapon reload.',
    descriptionRu: 'Безопасно выполнить длительную перезарядку оружия.',
    inputs: [], outputs: [], localMemoryDefaults: { subgraph_private: 'reload_local' }, cancelPolicy: 'cancel_child',
    graph: reloadWeaponGraph as unknown as AiGraphV2,
  })
  .register({
    id: 'react_to_fire',
    name: 'React to Fire',
    nameRu: 'Реагировать на обстрел',
    description: 'Lower posture and use the take-cover subgraph.',
    descriptionRu: 'Снизить позу и выполнить подграф занятия укрытия.',
    inputs: [positionPort('cover_position', 'Cover position', 'Позиция укрытия', 'best_cover_position')], outputs: [],
    localMemoryDefaults: { subgraph_private: 'react_to_fire_local' }, cancelPolicy: 'cancel_child',
    graph: reactToFireGraph as unknown as AiGraphV2,
  })
  .register({
    id: 'move_and_observe',
    name: 'Move and Observe',
    nameRu: 'Двигаться и наблюдать',
    description: 'Enable observation attention and move to the destination.',
    descriptionRu: 'Включить наблюдение и двигаться к переданной точке.',
    inputs: [positionPort('destination', 'Destination', 'Точка назначения', 'destination_position')], outputs: [positionPort('reached_position', 'Reached position', 'Достигнутая позиция', 'self_position')],
    localMemoryDefaults: { subgraph_private: 'move_and_observe_local' }, cancelPolicy: 'cancel_child',
    graph: moveAndObserveGraph as unknown as AiGraphV2,
  });

function collectReferences(graph: AiGraphV2): string[] {
  const refs = new Set(graph.subgraphRefs ?? []);
  for (const node of graph.nodes) {
    if (node.type === 'Subgraph' && typeof node.parameters?.subgraphId === 'string') refs.add(node.parameters.subgraphId);
  }
  return [...refs];
}

function freezeDefinition(definition: AiSubgraphDefinition): AiSubgraphDefinition {
  return Object.freeze({
    ...definition,
    inputs: Object.freeze(definition.inputs.map((item) => Object.freeze({ ...item }))),
    outputs: Object.freeze(definition.outputs.map((item) => Object.freeze({ ...item }))),
    localMemoryDefaults: Object.freeze(cloneDefaults(definition.localMemoryDefaults)),
  });
}

function cloneDefaults(value: AiBlackboardDefaults): AiBlackboardDefaults {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

function cloneValue<T>(value: T): T {
  if (typeof value === 'object' && value !== null && 'x' in value && 'y' in value) return { ...value } as T;
  return value;
}
