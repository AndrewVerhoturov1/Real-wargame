import type { TerrainKind } from '../core/map/MapModel';

export interface TerrainStyle {
  fill: number;
  label: string;
}

export const TERRAIN_STYLE: Record<TerrainKind, TerrainStyle> = {
  field: {
    fill: 0x7f8d53,
    label: 'Field',
  },
  forest: {
    fill: 0x2f6b3f,
    label: 'Forest',
  },
  road: {
    fill: 0xa07a4a,
    label: 'Road',
  },
  swamp: {
    fill: 0x3d6f73,
    label: 'Swamp',
  },
};
