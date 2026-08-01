import { mountAttentionProfileEditor } from '../ai-node-editor/AttentionProfileEditorIntegration';
import { mountCombatCatalogEditor } from '../ai-node-editor/CombatCatalogEditor';
import { mountDirectionalTerrainProfileEditor } from '../ai-node-editor/DirectionalTerrainProfileEditor';
import { mountEnvironmentProfileEditor } from '../ai-node-editor/EnvironmentProfileEditorIntegration';
import {
  mountConditionProfileEditor,
  mountPerceptionProfileEditor,
  mountSoldierArchetypeEditor,
} from '../ai-node-editor/GameplayTuningProfileEditorIntegration';
import { mountMovementProfileEditor } from '../ai-node-editor/MovementProfileEditorIntegration';
import {
  mountNavigationProfileEditor,
  mountSoldierDataEditor,
} from '../ai-node-editor/NavigationProfileEditor';
import { mountTacticalPositionProfileEditor } from '../ai-node-editor/TacticalPositionProfileEditor';
import { GameEditorRegistry } from './GameEditorRegistry';
import type {
  GameEditorDefinition,
  GameEditorInstallation,
  GameEditorMountContext,
  GameEditorOpenRequest,
} from './GameEditorTypes';

export interface DefaultGameEditorRegistryOptions {
  /** Existing graph root owned by the AI editor composition layer. */
  readonly mountBehaviorGraph?: (context: GameEditorMountContext) => GameEditorInstallation;
}

export function createDefaultGameEditorRegistry(
  options: DefaultGameEditorRegistryOptions = {},
): GameEditorRegistry {
  const definitions: readonly GameEditorDefinition[] = [
    {
      id: 'behaviorGraph',
      labelRu: 'Граф поведения',
      group: 'behavior',
      order: 10,
      activationFor: (surface) => surface === 'combat-lab'
        ? 'route'
        : options.mountBehaviorGraph ? 'embedded' : 'hidden',
      mount: options.mountBehaviorGraph,
      route: behaviorGraphRoute,
    },
    {
      id: 'routeProfiles',
      labelRu: 'Профили маршрута',
      group: 'behavior',
      order: 20,
      activationFor: () => 'embedded',
      mount: mountNavigationProfileEditor,
    },
    {
      id: 'tacticalPositions',
      labelRu: 'Тактические позиции',
      group: 'behavior',
      order: 30,
      activationFor: () => 'embedded',
      mount: mountTacticalPositionProfileEditor,
    },
    {
      id: 'soldierData',
      labelRu: 'Данные бойца',
      group: 'soldier',
      order: 10,
      activationFor: () => 'embedded',
      mount: mountSoldierDataEditor,
    },
    {
      id: 'soldierArchetypes',
      labelRu: 'Архетипы бойцов',
      group: 'soldier',
      order: 15,
      activationFor: () => 'embedded',
      mount: mountSoldierArchetypeEditor,
    },
    {
      id: 'attentionProfiles',
      labelRu: 'Профили внимания',
      group: 'soldier',
      order: 20,
      activationFor: () => 'embedded',
      mount: mountAttentionProfileEditor,
    },
    {
      id: 'perceptionProfiles',
      labelRu: 'Профили восприятия',
      group: 'soldier',
      order: 25,
      activationFor: () => 'embedded',
      mount: mountPerceptionProfileEditor,
    },
    {
      id: 'movementProfiles',
      labelRu: 'Профили движения',
      group: 'soldier',
      order: 30,
      activationFor: () => 'embedded',
      mount: mountMovementProfileEditor,
    },
    {
      id: 'weapons',
      labelRu: 'Вооружение',
      group: 'combat',
      order: 10,
      activationFor: () => 'embedded',
      mount: mountCombatCatalogEditor,
    },
    {
      id: 'conditionProfiles',
      labelRu: 'Ранения и подавление',
      group: 'combat',
      order: 20,
      activationFor: () => 'embedded',
      mount: mountConditionProfileEditor,
    },
    {
      id: 'environmentProfiles',
      labelRu: 'Профили местности',
      group: 'world',
      order: 10,
      activationFor: () => 'embedded',
      mount: mountEnvironmentProfileEditor,
    },
    {
      id: 'directionalTerrain',
      labelRu: 'Направленный рельеф',
      group: 'world',
      order: 20,
      activationFor: () => 'embedded',
      mount: mountDirectionalTerrainProfileEditor,
    },
  ];
  return new GameEditorRegistry(definitions);
}

function behaviorGraphRoute(request: GameEditorOpenRequest): string {
  const baseRoute = '/ai-node-editor.html';
  const search = new URLSearchParams();
  search.set('editor', 'behaviorGraph');
  if (request.returnTo) search.set('returnTo', request.returnTo);
  if (request.selectedUnitId) search.set('selectedUnitId', request.selectedUnitId);
  return `${baseRoute}?${search.toString()}`;
}
