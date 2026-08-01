import assert from 'node:assert/strict';
import { GameEditorRegistry } from '../src/game-editors/GameEditorRegistry';
import { GameEditorWorkspace } from '../src/game-editors/GameEditorWorkspace';
import { createDefaultGameEditorRegistry } from '../src/game-editors/createDefaultGameEditorRegistry';
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

const defaultRegistry = createDefaultGameEditorRegistry();
assert.equal(defaultRegistry.list().length, 9, 'all nine existing editors must be registered exactly once');
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
