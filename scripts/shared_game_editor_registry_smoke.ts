import assert from 'node:assert/strict';
import { GameEditorRegistry } from '../src/game-editors/GameEditorRegistry';
import { GameEditorWorkspace } from '../src/game-editors/GameEditorWorkspace';
import type {
  GameEditorDefinition,
  GameEditorInstallation,
  GameEditorMountContext,
} from '../src/game-editors/GameEditorTypes';

class FakeHost {
  replaceCount = 0;
  replaceChildren(..._nodes: unknown[]): void {
    this.replaceCount += 1;
  }
}

class FakeEditorHost {
  readonly dataset: Record<string, string> = {};
  readonly addedListeners: string[] = [];
  readonly removedListeners: string[] = [];
  innerHTML = '';
  replaceCount = 0;

  addEventListener(type: string, _listener: EventListenerOrEventListenerObject): void {
    this.addedListeners.push(type);
  }

  removeEventListener(type: string, _listener: EventListenerOrEventListenerObject): void {
    this.removedListeners.push(type);
  }

  querySelectorAll<T extends Element>(_selector: string): T[] {
    return [];
  }

  querySelector<T extends Element>(_selector: string): T | null {
    return null;
  }

  replaceChildren(..._nodes: unknown[]): void {
    this.replaceCount += 1;
    this.innerHTML = '';
  }
}

const noopInstallation = (): GameEditorInstallation => ({ destroy(): void {} });
const definitions: GameEditorDefinition[] = [
  embedded('worldSecond', 'world', 20),
  embedded('soldierFirst', 'soldier', 10),
  embedded('worldFirst', 'world', 10),
  embedded('behaviorFirst', 'behavior', 10),
];
const registry = new GameEditorRegistry(definitions);
assert.deepEqual(
  registry.list().map((definition) => definition.id),
  ['behaviorFirst', 'soldierFirst', 'worldFirst', 'worldSecond'],
  'definitions must be sorted by group, order and stable id',
);
assert.throws(() => registry.register(embedded('worldFirst', 'world', 99)), /already registered/);
assert.throws(() => new GameEditorRegistry([{
  id: 'missingMount', labelRu: 'Нет mount', group: 'world', order: 1,
  activationFor: () => 'embedded',
}]), /no mount function/);
assert.throws(() => new GameEditorRegistry([{
  id: 'missingRoute', labelRu: 'Нет route', group: 'behavior', order: 1,
  activationFor: () => 'route',
}]), /no route factory/);

let allowClose = false;
let firstDestroyCount = 0;
let secondDestroyCount = 0;
const lifecycleRegistry = new GameEditorRegistry([
  {
    id: 'first', labelRu: 'Первый', group: 'behavior', order: 1,
    activationFor: () => 'embedded',
    mount: () => ({
      beforeClose: () => allowClose,
      destroy: () => { firstDestroyCount += 1; },
    }),
  },
  {
    id: 'second', labelRu: 'Второй', group: 'behavior', order: 2,
    activationFor: () => 'embedded',
    mount: () => ({ destroy: () => { secondDestroyCount += 1; } }),
  },
]);
const host = new FakeHost();
const workspace = new GameEditorWorkspace(host as unknown as HTMLElement, lifecycleRegistry, 'ai-editor');
assert.equal((await workspace.open({ editorId: 'first' })).kind, 'mounted');
assert.equal(workspace.activeEditorId, 'first');
assert.equal((await workspace.open({ editorId: 'second' })).kind, 'refused');
assert.equal(workspace.activeEditorId, 'first');
assert.equal(firstDestroyCount, 0, 'refused switch must preserve the current installation');
allowClose = true;
assert.equal((await workspace.open({ editorId: 'second' })).kind, 'mounted');
assert.equal(firstDestroyCount, 1, 'accepted switch must destroy the previous installation once');
workspace.destroy();
workspace.destroy();
assert.equal(secondDestroyCount, 1, 'workspace destroy must be idempotent');
await assert.rejects(workspace.open({ editorId: 'first' }), /destroyed/);

let combatCatalogReads = 0;
const storageValues = new Map<string, string>();
const fakeStorage = {
  getItem(key: string): string | null {
    if (key === 'real-wargame.combat-catalog.bundle.v1') combatCatalogReads += 1;
    return storageValues.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storageValues.set(key, value);
  },
  removeItem(key: string): void {
    storageValues.delete(key);
  },
};
(globalThis as unknown as { window: unknown }).window = {
  localStorage: fakeStorage,
  confirm: () => true,
  prompt: () => null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const { createDefaultGameEditorRegistry } = await import('../src/game-editors/createDefaultGameEditorRegistry');
assert.equal(combatCatalogReads, 0, 'importing the shared platform must not load combat catalog storage');

const defaultRegistry = createDefaultGameEditorRegistry();
assert.equal(combatCatalogReads, 0, 'creating the default registry must not load combat catalog storage');
assert.equal(defaultRegistry.list().length, 12, 'all twelve shared editors must be registered exactly once');
assert.deepEqual(
  ['perceptionProfiles', 'soldierArchetypes', 'conditionProfiles'].map((id) => defaultRegistry.require(id).id),
  ['perceptionProfiles', 'soldierArchetypes', 'conditionProfiles'],
  'gameplay tuning editor ids must resolve through the one shared registry',
);
assert.equal(defaultRegistry.require('behaviorGraph').activationFor('ai-editor'), 'hidden');
assert.equal(defaultRegistry.require('behaviorGraph').activationFor('combat-lab'), 'route');
assert.match(
  defaultRegistry.require('behaviorGraph').route!({
    editorId: 'behaviorGraph',
    returnTo: '/combat-lab.html?tab=settings',
    selectedUnitId: 'blue-1',
  }),
  /^\/ai-node-editor\.html\?editor=behaviorGraph&returnTo=%2Fcombat-lab\.html%3Ftab%3Dsettings&selectedUnitId=blue-1$/,
);

const weaponsDefinition = defaultRegistry.require('weapons');
assert.ok(weaponsDefinition.mount, 'weapons editor must expose a direct mount function');
const firstWeaponsHost = new FakeEditorHost();
const firstWeaponsInstallation = weaponsDefinition.mount!({
  host: firstWeaponsHost as unknown as HTMLElement,
  surface: 'ai-editor',
  request: { editorId: 'weapons' },
  requestClose: () => undefined,
});
assert.equal(combatCatalogReads, 1, 'combat catalog storage must load on the first real mount');
assert.match(firstWeaponsHost.innerHTML, /data-combat-catalog-editor/);
assert.deepEqual(firstWeaponsHost.addedListeners, ['click', 'input', 'change']);
firstWeaponsInstallation.destroy();
firstWeaponsInstallation.destroy();
assert.deepEqual(
  firstWeaponsHost.removedListeners,
  ['click', 'input', 'change'],
  'destroy must remove each host listener exactly once',
);
assert.equal(firstWeaponsHost.replaceCount, 1, 'destroy must clear the mounted host exactly once');
assert.equal(firstWeaponsHost.dataset.combatCatalogWorkbench, undefined);

const secondWeaponsHost = new FakeEditorHost();
const secondWeaponsInstallation = weaponsDefinition.mount!({
  host: secondWeaponsHost as unknown as HTMLElement,
  surface: 'ai-editor',
  request: { editorId: 'weapons' },
  requestClose: () => undefined,
});
assert.equal(combatCatalogReads, 1, 'reopening must reuse the authoritative in-memory combat catalog registry');
assert.match(secondWeaponsHost.innerHTML, /data-combat-catalog-editor/);
secondWeaponsInstallation.destroy();

const graphHostRegistry = createDefaultGameEditorRegistry({
  mountBehaviorGraph: (_context: GameEditorMountContext) => noopInstallation(),
});
assert.equal(graphHostRegistry.require('behaviorGraph').activationFor('ai-editor'), 'embedded');

console.log('Shared game editor registry smoke passed.');

function embedded(
  id: string,
  group: GameEditorDefinition['group'],
  order: number,
): GameEditorDefinition {
  return {
    id,
    labelRu: id,
    group,
    order,
    activationFor: () => 'embedded',
    mount: noopInstallation,
  };
}
