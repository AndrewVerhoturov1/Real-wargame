import { distance, type GridPosition } from '../geometry';

export type PressureZoneType = 'open_area_pressure' | 'unknown_risk' | 'debug';
export type PressureZoneShape = 'circle' | 'rect';

export interface PressureZoneData {
  id: string;
  label: string;
  labelRu?: string;
  type: PressureZoneType;
  shape: PressureZoneShape;
  x: number;
  y: number;
  radiusCells?: number;
  widthCells?: number;
  heightCells?: number;
  strength: number;
  stressPerSecond: number;
  reason: string;
  reasonRu?: string;
}

export interface PressureZone {
  id: string;
  labels: {
    en: string;
    ru: string;
  };
  type: PressureZoneType;
  shape: PressureZoneShape;
  x: number;
  y: number;
  radiusCells: number;
  widthCells: number;
  heightCells: number;
  strength: number;
  stressPerSecond: number;
  reasons: {
    en: string;
    ru: string;
  };
}

export interface PressureReport {
  zone: PressureZone;
  rawPressure: number;
  stressPerSecond: number;
  reason: string;
}

export function normalizePressureZones(data: PressureZoneData[]): PressureZone[] {
  return data.map((zone) => ({
    id: zone.id,
    labels: {
      en: zone.label,
      ru: zone.labelRu ?? zone.label,
    },
    type: zone.type,
    shape: zone.shape,
    x: zone.x,
    y: zone.y,
    radiusCells: zone.radiusCells ?? 0,
    widthCells: zone.widthCells ?? 0,
    heightCells: zone.heightCells ?? 0,
    strength: clampPercent(zone.strength),
    stressPerSecond: Math.max(0, zone.stressPerSecond),
    reasons: {
      en: zone.reason,
      ru: zone.reasonRu ?? zone.reason,
    },
  }));
}

export function getPressureReportAtPosition(
  position: GridPosition,
  zones: PressureZone[],
): PressureReport | null {
  let strongest: PressureReport | null = null;

  for (const zone of zones) {
    if (!isPositionInsidePressureZone(position, zone)) {
      continue;
    }

    const report: PressureReport = {
      zone,
      rawPressure: zone.strength,
      stressPerSecond: zone.stressPerSecond,
      reason: zone.reasons.en,
    };

    if (!strongest || report.rawPressure > strongest.rawPressure) {
      strongest = report;
    }
  }

  return strongest;
}

function isPositionInsidePressureZone(position: GridPosition, zone: PressureZone): boolean {
  if (zone.shape === 'circle') {
    return distance(position, { x: zone.x, y: zone.y }) <= zone.radiusCells;
  }

  const halfWidth = zone.widthCells / 2;
  const halfHeight = zone.heightCells / 2;

  return (
    position.x >= zone.x - halfWidth &&
    position.x <= zone.x + halfWidth &&
    position.y >= zone.y - halfHeight &&
    position.y <= zone.y + halfHeight
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
