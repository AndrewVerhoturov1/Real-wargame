import assert from 'node:assert/strict';
import {
  buildCombatLabBuiltInExperiment,
  listCombatLabScenarioDefinitions,
  parseCombatLabExperiment,
  readCombatLabParticipantInitialDraft,
  serializeCombatLabExperiment,
  updateCombatLabParticipantInitialState,
} from '../src/core/testing/combat-lab';
import {
  listMergedAiGraphCatalogEntries,
  readAiGraphCatalogFromScene,
  resolveAiGraphCatalogEntry,
} from '../src/core/ai/AiGraphCatalog';
import { CombatLabSceneEditorAdapter } from '../src/combat-lab/editor/CombatLabSceneEditorAdapter';
import type { CombatLabWorkspaceServices } from '../src/combat-lab/CombatLabWorkspaceServices';
import { formatProductionUnitEditorGraphOptionLabel } from '../src/ui/ProductionUnitEditor';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

async function main(): Promise<void> {
  const definition = listCombatLabScenarioDefinitions()[0];
  assert.ok(definition, 'Combat Lab must expose at least one built-in scenario.');
  const base = buildCombatLabBuiltInExperiment(definition.scenarioId, 17);
  const role = base.roles[0];
  assert.ok(role, 'Built-in experiment must contain a participant.');
  const customGraph = {
    version: 2 as const,
    id: 'imported-custom-graph',
    name: 'Imported custom graph',
    nameRu: 'Импортированный пользовательский граф',
    rootNodeId: 'root',
    nodes: [{ id: 'root', type: 'sequence' as const, title: 'Root', children: [] }],
  };
  const prepared = updateCombatLabParticipantInitialState(base, role.roleId, {
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: customGraph.id },
    aiGraphDefinition: customGraph,
  });
  const parsed = parseCombatLabExperiment(serializeCombatLabExperiment(prepared));
  assert.ok(parsed.experiment, parsed.issues.map((issue) => issue.messageRu).join('\n'));
  let experiment = parsed.experiment!;

  const emptyStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: emptyStorage, configurable: true });
  const sceneCatalog = readAiGraphCatalogFromScene(experiment.sceneSnapshot);
  const mergedEntries = listMergedAiGraphCatalogEntries(sceneCatalog, emptyStorage);
  assert.equal(mergedEntries.filter((entry) => entry.graphId === customGraph.id).length, 1, 'Scene and browser entries must deduplicate by exact graphId.');
  const mergedCustom = mergedEntries.find((entry) => entry.graphId === customGraph.id);
  assert.ok(mergedCustom, 'The imported scene graph must be visible with empty browser storage.');
  assert.equal(mergedCustom.titleRu, customGraph.nameRu);
  assert.equal(formatProductionUnitEditorGraphOptionLabel(mergedCustom), `${customGraph.nameRu} · ${customGraph.id}`);

  const services = {
    draft: { get: () => experiment },
    participantMutations: {
      get: (roleId: string) => ({ initial: readCombatLabParticipantInitialDraft(experiment, roleId) }),
      update: (roleId: string, mutate: (context: { initial: ReturnType<typeof readCombatLabParticipantInitialDraft> }) => { scenePatch: Parameters<typeof updateCombatLabParticipantInitialState>[2] }) => {
        const context = { initial: readCombatLabParticipantInitialDraft(experiment, roleId) };
        const mutation = mutate(context);
        experiment = updateCombatLabParticipantInitialState(experiment, roleId, mutation.scenePatch);
        return experiment;
      },
    },
  } as unknown as CombatLabWorkspaceServices;
  const adapter = new CombatLabSceneEditorAdapter({ services, roleId: role.roleId });
  const options = adapter.listGraphOptions();
  const customOption = options.find((entry) => entry.graphId === customGraph.id);
  assert.ok(customOption, 'Combat Lab adapter must merge the current scene catalog into editor options.');
  assert.equal(customOption.titleRu, customGraph.nameRu);
  const selected = adapter.read();
  assert.ok(selected);
  assert.deepEqual(selected.aiBrain, { schemaVersion: 1, kind: 'graph', graphId: customGraph.id });

  adapter.update({ titleRu: 'Переименованный боец' });
  const afterUnrelatedEdit = readAiGraphCatalogFromScene(experiment.sceneSnapshot);
  assert.equal(resolveAiGraphCatalogEntry(afterUnrelatedEdit, customGraph.id).id, customGraph.id, 'Editing another participant field must preserve the scene graph catalog.');
  const reparsed = parseCombatLabExperiment(serializeCombatLabExperiment(experiment));
  assert.ok(reparsed.experiment, reparsed.issues.map((issue) => issue.messageRu).join('\n'));
  const restored = reparsed.experiment!;
  const restoredInitial = readCombatLabParticipantInitialDraft(restored, role.roleId);
  assert.deepEqual(restoredInitial.aiBrain, { schemaVersion: 1, kind: 'graph', graphId: customGraph.id });
  assert.equal(resolveAiGraphCatalogEntry(readAiGraphCatalogFromScene(restored.sceneSnapshot), restoredInitial.aiBrain.kind === 'graph' ? restoredInitial.aiBrain.graphId : '').id, customGraph.id);

  assert.equal(options.find((entry) => entry.graphId === 'missing-graph'), undefined, 'A missing graph must not silently fall back to another option.');
  assert.throws(() => resolveAiGraphCatalogEntry(readAiGraphCatalogFromScene(restored.sceneSnapshot), 'missing-graph'), /отсутствует/);

  console.log('Combat Lab scene graph editor roundtrip behavior smoke passed.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
