import assert from 'node:assert/strict';
import { GameEditorRegistry } from '../src/game-editors/GameEditorRegistry';
import type { GameEditorDefinition } from '../src/game-editors/GameEditorTypes';
import { getSafeGameEditorReturnTarget } from '../src/game-editors/GameEditorReturnTarget';
import { listCombatLabGameEditorGroups } from '../src/combat-lab/game-editors/CombatLabGameEditorCatalogue';
import { resolveCombatLabSelectedUnitProfileLinks } from '../src/combat-lab/game-editors/CombatLabGameEditorLinks';
import type { UnitModel } from '../src/core/units/UnitModel';

assert.equal(
  getSafeGameEditorReturnTarget('/combat-lab.html?tab=settings#catalogue'),
  '/combat-lab.html?tab=settings#catalogue',
);
for (const unsafe of [
  'https://example.com/',
  '//example.com/combat-lab.html',
  '/\\evil',
  'javascript:alert(1)',
  '/admin.html',
]) {
  assert.equal(getSafeGameEditorReturnTarget(unsafe), null, `unsafe return target must be rejected: ${unsafe}`);
}

const definitions: GameEditorDefinition[] = [
  embedded('futureWorldEditor', 'world', 40),
  embedded('soldierEditor', 'soldier', 10),
  route('behaviorGraph', 'behavior', 10),
  embedded('combatEditor', 'combat', 10),
];
const registry = new GameEditorRegistry(definitions);
const groups = listCombatLabGameEditorGroups(registry);
assert.deepEqual(groups.map((group) => group.group), ['behavior', 'soldier', 'combat', 'world']);
assert.deepEqual(
  groups.flatMap((group) => group.items.map((item) => item.definition.id)),
  ['behaviorGraph', 'soldierEditor', 'combatEditor', 'futureWorldEditor'],
  'catalogue must discover every definition from the shared registry without a copied id list',
);
assert.equal(groups[0]!.items[0]!.activation, 'route');
assert.equal(groups[1]!.items[0]!.activation, 'embedded');

const unit = {
  id: 'blue-1',
  playerAttentionProfileId: 'focused-observe',
  activeNavigationProfileId: 'careful',
  movementRuntime: {
    effectiveProfileId: 'normal_walk',
    requestedProfileId: 'normal_walk',
  },
} as unknown as UnitModel;
assert.deepEqual(resolveCombatLabSelectedUnitProfileLinks(unit), [
  {
    editorId: 'routeProfiles',
    profileId: 'careful',
    labelRu: 'Профиль маршрута',
  },
  {
    editorId: 'movementProfiles',
    profileId: 'normal_walk',
    labelRu: 'Профиль движения',
  },
  {
    editorId: 'attentionProfiles',
    profileId: 'focused-observe',
    labelRu: 'Профиль внимания',
  },
]);
assert.deepEqual(resolveCombatLabSelectedUnitProfileLinks({
  id: 'empty',
  movementRuntime: {
    effectiveProfileId: '',
    requestedProfileId: '',
  },
} as UnitModel), [
  {
    editorId: 'routeProfiles',
    profileId: null,
    labelRu: 'Профиль маршрута',
  },
  {
    editorId: 'movementProfiles',
    profileId: null,
    labelRu: 'Профиль движения',
  },
]);

console.log('Combat Lab game-editor behavior smoke passed.');

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
    mount: () => ({ destroy(): void {} }),
  };
}

function route(
  id: string,
  group: GameEditorDefinition['group'],
  order: number,
): GameEditorDefinition {
  return {
    id,
    labelRu: id,
    group,
    order,
    activationFor: () => 'route',
    route: () => '/ai-node-editor.html',
  };
}
