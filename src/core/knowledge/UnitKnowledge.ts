import { distance } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

const MAX_DANGER_ROWS = 6;

/** @deprecated Compatibility shape only. Legacy cover discovery was removed. */
export interface KnowledgeCover {
  id: string;
  labelRu: string;
  kindRu: string;
  x: number;
  y: number;
  distanceMeters: number;
  quality: number;
  sourceRu: string;
  visibleNow: boolean;
  currentCover: boolean;
}

export interface KnowledgeDanger {
  id: string;
  labelRu: string;
  x: number;
  y: number;
  distanceMeters: number;
  sourceRu: string;
  confidenceRu: string;
  visibleNow: boolean;
  strength: number;
}

export interface UnitKnowledgeReport {
  viewRangeMeters: number;
  knownAreaMeters: number;
  /** Always empty. Tactical positions come from the shared awareness fields. */
  nearbyCovers: KnowledgeCover[];
  /** Always empty. Tactical positions come from the shared awareness fields. */
  planCovers: KnowledgeCover[];
  dangers: KnowledgeDanger[];
}

/**
 * Compatibility report for the remaining knowledge panel.
 *
 * It intentionally performs no map-object, forest-cell, LOS, or full-map cover
 * search. Threat rows are read only from this soldier's subjective memory.
 */
export function buildUnitKnowledgeReport(
  state: SimulationState,
  unit: UnitModel,
): UnitKnowledgeReport {
  const viewRangeMeters = unit.viewRangeCells * state.map.metersPerCell;
  const dangers = unit.tacticalKnowledge.threats
    .slice(0, MAX_DANGER_ROWS)
    .map((threat): KnowledgeDanger => ({
      id: threat.id,
      labelRu: threat.labelRu,
      x: threat.x,
      y: threat.y,
      distanceMeters: distance(unit.position, threat) * state.map.metersPerCell,
      sourceRu: threat.visibleNow ? 'вижу сейчас' : threatSourceLabel(threat.source),
      confidenceRu: confidenceLabel(threat.confidence),
      visibleNow: threat.visibleNow,
      strength: Math.max(threat.strength, threat.suppression),
    }));
  return {
    viewRangeMeters,
    knownAreaMeters: viewRangeMeters,
    nearbyCovers: [],
    planCovers: [],
    dangers,
  };
}

function confidenceLabel(value: number): string {
  if (value >= 75) return 'высокая';
  if (value >= 40) return 'средняя';
  return 'низкая';
}

function threatSourceLabel(source: UnitModel['tacticalKnowledge']['threats'][number]['source']): string {
  if (source === 'seen') return 'видел ранее';
  if (source === 'heard') return 'слышал';
  if (source === 'reported') return 'получил сообщение';
  return 'определил по огню';
}
