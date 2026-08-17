import type { GameEditorGroup } from '../../game-editors/GameEditorTypes';
import type { PolygonGlobalEditorId } from './PolygonGlobalEditorParity';

export type PolygonVisibleEditorId = PolygonGlobalEditorId | 'surfaceTypes';

export const POLYGON_GLOBAL_EDITOR_GROUPS = Object.freeze([
  Object.freeze({ group: 'behavior' as const, ids: Object.freeze(['routeProfiles', 'tacticalPositions'] as const) }),
  Object.freeze({
    group: 'soldier' as const,
    ids: Object.freeze(['soldierArchetypes', 'attentionProfiles', 'perceptionProfiles', 'movementProfiles'] as const),
  }),
  Object.freeze({ group: 'combat' as const, ids: Object.freeze(['weapons', 'conditionProfiles'] as const) }),
  Object.freeze({
    group: 'world' as const,
    ids: Object.freeze(['surfaceTypes', 'environmentProfiles', 'directionalTerrain'] as const),
  }),
] satisfies ReadonlyArray<{
  readonly group: GameEditorGroup;
  readonly ids: readonly PolygonVisibleEditorId[];
}>);
