import {
  type VegetationMaterialDefinition,
  getVegetationMaterial,
  legacyForestLayerToVegetationMaterialId,
  vegetationMaterialIdToLegacyForestLayer,
} from './EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from './EnvironmentProfileRuntime';

export type VegetationKind = 'none' | 'sparse_forest' | 'dense_forest';
export type VegetationLayerKind = 0 | 1 | 2;

export interface VegetationCellLike {
  readonly terrain?: string;
  readonly forest?: number;
  readonly vegetationMaterialId?: string;
}

/**
 * Compatibility facade for older consumers. New code should use the canonical
 * VegetationMaterialDefinition fields directly.
 */
export interface VegetationDefinition extends VegetationMaterialDefinition {
  readonly layer: VegetationLayerKind;
  readonly presentation: VegetationMaterialDefinition['presentation'] & {
    readonly color: number;
    readonly detailDensity: number;
  };
  readonly movement: VegetationMaterialDefinition['movement'] & {
    readonly baseResistance: number;
  };
}

export function getVegetationDefinitionRevision(domain: 'presentation' | 'visibility' | 'fire' | 'movement' = 'presentation'): number {
  return getActiveEnvironmentProfile().revisions[domain];
}

/** @deprecated Use getVegetationDefinitionRevision(domain). */
export const VEGETATION_DEFINITION_REVISION = 1;

export function normalizeVegetationLayer(value: number | undefined): VegetationLayerKind {
  return vegetationMaterialIdToLegacyForestLayer(legacyForestLayerToVegetationMaterialId(value));
}

export function resolveCellVegetationLayer(cell: VegetationCellLike | null | undefined): VegetationLayerKind {
  return vegetationMaterialIdToLegacyForestLayer(resolveCellVegetationKind(cell));
}

export function resolveVegetationKind(value: number | string | undefined): VegetationKind {
  const id = typeof value === 'string' ? value : legacyForestLayerToVegetationMaterialId(value);
  if (id === 'dense_forest') return 'dense_forest';
  if (id === 'sparse_forest') return 'sparse_forest';
  return 'none';
}

export function resolveCellVegetationKind(cell: VegetationCellLike | null | undefined): VegetationKind {
  const materialId = cell?.vegetationMaterialId;
  const explicit = normalizeVegetationLayer(cell?.forest);
  if (materialId === 'none' || materialId === 'sparse_forest' || materialId === 'dense_forest') {
    const canonicalLayer = vegetationMaterialIdToLegacyForestLayer(materialId);
    // Transitional compatibility: old callers may still mutate `forest` directly.
    // A mismatch is interpreted as that legacy write; canonical setters keep both
    // projections synchronized, while custom material IDs remain authoritative.
    if (explicit !== canonicalLayer) return resolveVegetationKind(explicit);
    return resolveVegetationKind(materialId);
  }
  if (materialId) return resolveVegetationKind(materialId);
  if (explicit > 0) return resolveVegetationKind(explicit);
  return cell?.terrain === 'forest' ? 'sparse_forest' : 'none';
}

export function resolveVegetationDefinition(value: VegetationKind | number | string | undefined): VegetationDefinition {
  const material = getVegetationMaterial(getActiveEnvironmentProfile(), typeof value === 'number' ? legacyForestLayerToVegetationMaterialId(value) : value);
  return withCompatibilityAliases(material);
}

export function resolveCellVegetationDefinition(cell: VegetationCellLike | null | undefined): VegetationDefinition {
  return resolveVegetationDefinition(resolveCellVegetationKind(cell));
}

function withCompatibilityAliases(material: VegetationMaterialDefinition): VegetationDefinition {
  const layer = vegetationMaterialIdToLegacyForestLayer(material.id);
  return {
    ...material,
    layer,
    presentation: {
      ...material.presentation,
      color: material.presentation.colorTint,
      detailDensity: layer === 2 ? 7 : layer === 1 ? 3 : 0,
    },
    movement: {
      ...material.movement,
      baseResistance: material.movement.resistance,
    },
  };
}
