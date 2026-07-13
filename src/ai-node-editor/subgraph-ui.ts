import type { AiGraphV2 } from '../core/ai/AiGraph';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../core/ai/contracts/AiSubgraphRegistry';

export interface SubgraphChoice {
  readonly id: string;
  readonly name: string;
  readonly nameRu: string;
  readonly descriptionRu: string;
}

export function listSubgraphChoices(): readonly SubgraphChoice[] {
  return DEFAULT_AI_SUBGRAPH_REGISTRY.list().map(({ id, name, nameRu, descriptionRu }) => ({ id, name, nameRu, descriptionRu }));
}

export function getSubgraphChoice(id: string): SubgraphChoice | undefined {
  return listSubgraphChoices().find((choice) => choice.id === id);
}

export function cloneSubgraphGraph(id: string): AiGraphV2 | undefined {
  const graph = DEFAULT_AI_SUBGRAPH_REGISTRY.get(id)?.graph;
  return graph ? JSON.parse(JSON.stringify(graph)) as AiGraphV2 : undefined;
}

export function renderSubgraphSelect(selectedId: string, escape: (value: string) => string): string {
  return `<label class="inspector-field subgraph-picker">Подграф
    <select id="subgraph-choice">${listSubgraphChoices().map((choice) => `<option value="${escape(choice.id)}" ${choice.id === selectedId ? 'selected' : ''}>${escape(choice.nameRu)} · ${escape(choice.id)}</option>`).join('')}</select>
  </label>`;
}

export function renderGraphBreadcrumb(items: readonly string[], escape: (value: string) => string): string {
  return `<nav class="graph-breadcrumb" aria-label="Путь подграфа">${items.map((item, index) => `<span>${index > 0 ? '→ ' : ''}${escape(item)}</span>`).join('')}</nav>`;
}
