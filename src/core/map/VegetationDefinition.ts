export type VegetationKind = 'none' | 'sparse_forest' | 'dense_forest';
export type VegetationLayerKind = 0 | 1 | 2;

export interface VegetationCellLike {
  readonly terrain?: string;
  readonly forest?: number;
}

export interface VegetationDefinition {
  readonly id: VegetationKind;
  readonly layer: VegetationLayerKind;
  readonly presentation: {
    readonly color: number;
    readonly opacity: number;
    readonly detailDensity: number;
  };
  readonly visibility: {
    readonly transmissionLossPerMeter: number;
    readonly minimumTransmission: number;
    readonly targetConcealment: number;
    readonly localConcealment: number;
  };
  readonly fire: {
    readonly transmissionLossPerMeter: number;
    readonly protectionPerMeter: number;
    readonly maximumProtection: number;
    readonly densityWeight: number;
  };
  readonly movement: {
    readonly baseResistance: number;
    readonly tacticalConcealment: number;
  };
}

export const VEGETATION_DEFINITION_REVISION = 1;

export const VEGETATION_DEFINITIONS: Readonly<Record<VegetationKind, VegetationDefinition>> = {
  none: {
    id: 'none',
    layer: 0,
    presentation: { color: 0x000000, opacity: 0, detailDensity: 0 },
    visibility: {
      transmissionLossPerMeter: 0,
      minimumTransmission: 0.04,
      targetConcealment: 0,
      localConcealment: 0,
    },
    fire: {
      transmissionLossPerMeter: 0,
      protectionPerMeter: 0,
      maximumProtection: 0,
      densityWeight: 0,
    },
    movement: { baseResistance: 1, tacticalConcealment: 0 },
  },
  sparse_forest: {
    id: 'sparse_forest',
    layer: 1,
    // Previous alpha 118/255, multiplied by three and clamped to one.
    presentation: { color: 0x225637, opacity: 1, detailDensity: 3 },
    visibility: {
      transmissionLossPerMeter: 0.035,
      minimumTransmission: 0.04,
      targetConcealment: 35,
      localConcealment: 52,
    },
    fire: {
      transmissionLossPerMeter: 0.018,
      protectionPerMeter: 0.8,
      maximumProtection: 42,
      densityWeight: 0.8,
    },
    movement: { baseResistance: 1.25, tacticalConcealment: 0.35 },
  },
  dense_forest: {
    id: 'dense_forest',
    layer: 2,
    // Previous alpha 165/255, multiplied by three and clamped to one.
    presentation: { color: 0x133a25, opacity: 1, detailDensity: 7 },
    visibility: {
      transmissionLossPerMeter: 0.075,
      minimumTransmission: 0.04,
      targetConcealment: 65,
      localConcealment: 82,
    },
    fire: {
      transmissionLossPerMeter: 0.04,
      protectionPerMeter: 1.7,
      maximumProtection: 68,
      densityWeight: 1.7,
    },
    movement: { baseResistance: 1.45, tacticalConcealment: 0.6 },
  },
};

export function normalizeVegetationLayer(value: number | undefined): VegetationLayerKind {
  const rounded = Number.isFinite(value) ? Math.round(value as number) : 0;
  if (rounded <= 0) return 0;
  if (rounded >= 2) return 2;
  return 1;
}

/**
 * Canonical compatibility rule: the explicit forest layer wins. Legacy cells
 * with terrain='forest' and forest=0 are interpreted as sparse forest.
 */
export function resolveCellVegetationLayer(cell: VegetationCellLike | null | undefined): VegetationLayerKind {
  const explicit = normalizeVegetationLayer(cell?.forest);
  if (explicit > 0) return explicit;
  return cell?.terrain === 'forest' ? 1 : 0;
}

export function resolveVegetationKind(value: number | undefined): VegetationKind {
  const layer = normalizeVegetationLayer(value);
  if (layer === 2) return 'dense_forest';
  if (layer === 1) return 'sparse_forest';
  return 'none';
}

export function resolveCellVegetationKind(cell: VegetationCellLike | null | undefined): VegetationKind {
  return resolveVegetationKind(resolveCellVegetationLayer(cell));
}

export function resolveVegetationDefinition(
  value: VegetationKind | number | undefined,
): VegetationDefinition {
  const kind = typeof value === 'string' ? value : resolveVegetationKind(value);
  return VEGETATION_DEFINITIONS[kind];
}

export function resolveCellVegetationDefinition(
  cell: VegetationCellLike | null | undefined,
): VegetationDefinition {
  return VEGETATION_DEFINITIONS[resolveCellVegetationKind(cell)];
}
