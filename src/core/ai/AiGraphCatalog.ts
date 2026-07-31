import bundledGraph from '../../data/ai/soldier_default_survival_graph.json';
import type { AiGraph } from './AiGraph';
import type { UnitModel } from '../units/UnitModel';
import {
  DEFAULT_UNIT_AI_GRAPH_ID,
  readUnitAiBrainBinding,
  type UnitAiBrainBindingV1,
} from '../units/UnitAiBrainBinding';

export const AI_GRAPH_EDITOR_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
export const AI_GRAPH_CATALOG_STORAGE_KEY = 'real-wargame.ai-node-editor.graph-catalog.v1';
export const AI_GRAPH_CATALOG_SCHEMA_VERSION = 1 as const;

export interface AiGraphCatalogV1 {
  readonly schemaVersion: 1;
  readonly graphs: readonly AiGraph[];
}

export interface AiGraphCatalogEntryV1 {
  readonly graphId: string;
  readonly titleRu: string;
  readonly graph: AiGraph;
  readonly source: 'bundled' | 'saved' | 'current_editor' | 'scene';
}

export interface AiRuntimeGraphCatalogSnapshotV1 {
  readonly catalog: AiGraphCatalogV1;
  readonly sourceRevision: string;
  readonly graphsById: ReadonlyMap<string, AiGraph>;
}

export interface AiRuntimeGraphSnapshotV1 {
  readonly graph: AiGraph;
  readonly sourceRevision: string;
}

const installedCatalogs = new WeakMap<object, AiGraphCatalogV1>();
const installedSnapshots = new WeakMap<object, AiRuntimeGraphCatalogSnapshotV1>();
let browserCatalogCache: { readonly revision: string; readonly catalog: AiGraphCatalogV1 } | null = null;

export function createAiGraphCatalog(graphs: readonly AiGraph[] = []): AiGraphCatalogV1 {
  const unique = new Map<string, AiGraph>();
  addGraph(unique, bundledGraph as AiGraph);
  for (const graph of graphs) addGraph(unique, graph);
  return Object.freeze({
    schemaVersion: 1,
    graphs: Object.freeze([...unique.values()].map((graph) => deepFreeze(structuredClone(graph)))),
  });
}

export function normalizeAiGraphCatalog(value: unknown): AiGraphCatalogV1 {
  if (!isRecord(value) || !Array.isArray(value.graphs)) return createAiGraphCatalog();
  return createAiGraphCatalog(value.graphs.filter(isAiGraph));
}

export function mergeAiGraphCatalog(
  catalog: AiGraphCatalogV1,
  graph: AiGraph,
): AiGraphCatalogV1 {
  return createAiGraphCatalog([...catalog.graphs, graph]);
}

export function resolveAiGraphCatalogEntry(
  catalog: AiGraphCatalogV1,
  graphId: string,
): AiGraph {
  const normalizedId = graphId.trim();
  const graph = catalog.graphs.find((candidate) => candidate.id === normalizedId);
  if (!graph) throw new Error(`Граф Graph v2 «${normalizedId || 'без идентификатора'}» отсутствует в каталоге сцены.`);
  return graph;
}

export function hasAiGraphCatalogEntry(catalog: AiGraphCatalogV1, graphId: string): boolean {
  return catalog.graphs.some((graph) => graph.id === graphId);
}

export function listAvailableAiGraphCatalogEntries(storage: Storage | null = safeLocalStorage()): readonly AiGraphCatalogEntryV1[] {
  const entries = new Map<string, AiGraphCatalogEntryV1>();
  const bundled = bundledGraph as AiGraph;
  entries.set(bundled.id, Object.freeze({
    graphId: bundled.id,
    titleRu: bundled.nameRu ?? bundled.name,
    graph: deepFreeze(structuredClone(bundled)),
    source: 'bundled',
  }));

  const saved = readStorageJson(storage, AI_GRAPH_CATALOG_STORAGE_KEY);
  const savedGraphs = isRecord(saved) && Array.isArray(saved.graphs)
    ? saved.graphs.filter(isAiGraph)
    : Array.isArray(saved) ? saved.filter(isAiGraph) : [];
  for (const graph of savedGraphs) entries.set(graph.id, catalogEntry(graph, 'saved'));

  const current = readStorageJson(storage, AI_GRAPH_EDITOR_STORAGE_KEY);
  if (isAiGraph(current)) entries.set(current.id, catalogEntry(current, 'current_editor'));
  return Object.freeze([...entries.values()]);
}

export function listMergedAiGraphCatalogEntries(
  sceneCatalog: AiGraphCatalogV1,
  storage: Storage | null = safeLocalStorage(),
): readonly AiGraphCatalogEntryV1[] {
  const entries = new Map<string, AiGraphCatalogEntryV1>();
  const normalizedSceneCatalog = normalizeAiGraphCatalog(sceneCatalog);
  for (const graph of normalizedSceneCatalog.graphs) {
    entries.set(graph.id, catalogEntry(graph, 'scene'));
  }
  for (const entry of listAvailableAiGraphCatalogEntries(storage)) {
    if (!entries.has(entry.graphId)) entries.set(entry.graphId, entry);
  }
  return Object.freeze([...entries.values()]);
}

export function readAvailableAiGraphCatalog(storage: Storage | null = safeLocalStorage()): AiGraphCatalogV1 {
  return createAiGraphCatalog(listAvailableAiGraphCatalogEntries(storage).map((entry) => entry.graph));
}

export function installAiGraphCatalog(owner: object, value: unknown): AiGraphCatalogV1 {
  const catalog = normalizeAiGraphCatalog(value);
  installedCatalogs.set(owner, catalog);
  installedSnapshots.delete(owner);
  return catalog;
}

export function getInstalledAiGraphCatalog(owner: object): AiGraphCatalogV1 {
  return installedCatalogs.get(owner) ?? readBrowserAiGraphCatalog();
}

export function addGraphToInstalledCatalog(owner: object, graph: AiGraph): AiGraphCatalogV1 {
  const catalog = mergeAiGraphCatalog(getInstalledAiGraphCatalog(owner), graph);
  installedCatalogs.set(owner, catalog);
  installedSnapshots.delete(owner);
  return catalog;
}

export function resolveRuntimeGraphCatalogSnapshot(owner?: object | null): AiRuntimeGraphCatalogSnapshotV1 {
  if (owner) {
    const cached = installedSnapshots.get(owner);
    if (cached) return cached;
    const snapshot = buildRuntimeSnapshot(getInstalledAiGraphCatalog(owner));
    installedSnapshots.set(owner, snapshot);
    return snapshot;
  }
  return buildRuntimeSnapshot(readBrowserAiGraphCatalog());
}

export function resolveRuntimeGraphSnapshotForUnit(
  owner: object | null | undefined,
  unit: Pick<UnitModel, 'id' | 'aiControl'> & Partial<Pick<UnitModel, 'aiBrain'>>,
  catalogSnapshot: AiRuntimeGraphCatalogSnapshotV1 = resolveRuntimeGraphCatalogSnapshot(owner),
): AiRuntimeGraphSnapshotV1 {
  const binding = readUnitAiBrainBinding(unit);
  if (binding.kind !== 'graph') throw new Error(`Боец «${unit.id}» находится в режиме ручного управления.`);
  const graph = catalogSnapshot.graphsById.get(binding.graphId);
  if (!graph) throw new Error(`Для бойца «${unit.id}» не найден граф Graph v2 «${binding.graphId}».`);
  return Object.freeze({
    graph,
    sourceRevision: `${catalogSnapshot.sourceRevision}:${binding.graphId}`,
  });
}

export function validateUnitAiBrainBindingAgainstCatalog(
  binding: UnitAiBrainBindingV1,
  catalog: AiGraphCatalogV1,
): string | null {
  if (binding.kind === 'manual') return null;
  return hasAiGraphCatalogEntry(catalog, binding.graphId)
    ? null
    : `Граф Graph v2 «${binding.graphId}» отсутствует в каталоге сцены.`;
}

export function readAiGraphCatalogFromScene(scene: unknown): AiGraphCatalogV1 {
  return isRecord(scene) ? normalizeAiGraphCatalog(scene.aiGraphCatalog) : createAiGraphCatalog();
}

export function writeAiGraphCatalogToScene<T extends Record<string, unknown>>(
  scene: T,
  catalog: AiGraphCatalogV1,
): T & { readonly aiGraphCatalog: AiGraphCatalogV1 } {
  return { ...scene, aiGraphCatalog: normalizeAiGraphCatalog(catalog) };
}

export function resetAiGraphCatalogRuntimeForTests(): void {
  browserCatalogCache = null;
}

function readBrowserAiGraphCatalog(): AiGraphCatalogV1 {
  const entries = listAvailableAiGraphCatalogEntries();
  const revision = JSON.stringify(entries.map((entry) => [entry.graphId, entry.graph]));
  if (browserCatalogCache?.revision === revision) return browserCatalogCache.catalog;
  const catalog = createAiGraphCatalog(entries.map((entry) => entry.graph));
  browserCatalogCache = { revision, catalog };
  return catalog;
}

function buildRuntimeSnapshot(catalog: AiGraphCatalogV1): AiRuntimeGraphCatalogSnapshotV1 {
  const graphsById = new Map(catalog.graphs.map((graph) => [graph.id, graph] as const));
  const sourceRevision = stableCatalogRevision(catalog);
  return Object.freeze({ catalog, sourceRevision, graphsById });
}

function stableCatalogRevision(catalog: AiGraphCatalogV1): string {
  let hash = 2166136261;
  const source = JSON.stringify(catalog.graphs.map((graph) => graph));
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ai-graph-catalog-v1-${(hash >>> 0).toString(16)}`;
}

function catalogEntry(graph: AiGraph, source: AiGraphCatalogEntryV1['source']): AiGraphCatalogEntryV1 {
  const clone = deepFreeze(structuredClone(graph));
  return Object.freeze({ graphId: clone.id, titleRu: clone.nameRu ?? clone.name, graph: clone, source });
}

function addGraph(target: Map<string, AiGraph>, graph: AiGraph): void {
  if (!isAiGraph(graph)) return;
  target.set(graph.id, graph);
}

function isAiGraph(value: unknown): value is AiGraph {
  return isRecord(value)
    && (value.version === 1 || value.version === 2)
    && typeof value.id === 'string'
    && value.id.trim().length > 0
    && typeof value.name === 'string'
    && typeof value.rootNodeId === 'string'
    && Array.isArray(value.nodes);
}

function readStorageJson(storage: Storage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void DEFAULT_UNIT_AI_GRAPH_ID;
