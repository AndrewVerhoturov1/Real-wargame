import { distance, type GridPosition } from '../geometry';

export type PressureZoneType = 'open_area_pressure' | 'unknown_risk' | 'debug';
export type PressureZoneShape = 'circle' | 'rect';
export type PressureZoneMode = 'area' | 'directional_fire';

export interface DirectionalThreatSettings {
  mode: PressureZoneMode;
  suppression: number;
  directionDegrees: number;
  arcDegrees: number;
  rangeCells: number;
  minRangeCells: number;
  falloffPercent: number;
  enabled: boolean;
  sourceVisible: boolean;
  sourceKnown: boolean;
}

export interface PressureZoneData {
  id: string;
  label: string;
  labelRu?: string;
  type: PressureZoneType;
  shape: PressureZoneShape;
  mode?: PressureZoneMode;
  x: number;
  y: number;
  radiusCells?: number;
  widthCells?: number;
  heightCells?: number;
  strength: number;
  suppression?: number;
  stressPerSecond: number;
  directionDegrees?: number;
  arcDegrees?: number;
  rangeCells?: number;
  minRangeCells?: number;
  falloffPercent?: number;
  enabled?: boolean;
  sourceVisible?: boolean;
  sourceKnown?: boolean;
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
  mode?: PressureZoneMode;
  x: number;
  y: number;
  radiusCells: number;
  widthCells: number;
  heightCells: number;
  strength: number;
  suppression?: number;
  stressPerSecond: number;
  directionDegrees?: number;
  arcDegrees?: number;
  rangeCells?: number;
  minRangeCells?: number;
  falloffPercent?: number;
  enabled?: boolean;
  sourceVisible?: boolean;
  sourceKnown?: boolean;
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
  return data.map((zone) => {
    const settings = resolvePressureZoneSettings(zone);
    return {
      id: zone.id,
      labels: {
        en: zone.label,
        ru: zone.labelRu ?? zone.label,
      },
      type: zone.type,
      shape: zone.shape,
      mode: settings.mode,
      x: zone.x,
      y: zone.y,
      radiusCells: zone.radiusCells ?? 0,
      widthCells: zone.widthCells ?? 0,
      heightCells: zone.heightCells ?? 0,
      strength: clampPercent(zone.strength),
      suppression: settings.suppression,
      stressPerSecond: Math.max(0, zone.stressPerSecond),
      directionDegrees: settings.directionDegrees,
      arcDegrees: settings.arcDegrees,
      rangeCells: settings.rangeCells,
      minRangeCells: settings.minRangeCells,
      falloffPercent: settings.falloffPercent,
      enabled: settings.enabled,
      sourceVisible: settings.sourceVisible,
      sourceKnown: settings.sourceKnown,
      reasons: {
        en: zone.reason,
        ru: zone.reasonRu ?? zone.reason,
      },
    };
  });
}

export function resolvePressureZoneSettings(zone: PressureZoneData | PressureZone): DirectionalThreatSettings {
  const radiusCells = zone.radiusCells ?? 0;
  return {
    mode: zone.mode ?? 'area',
    suppression: clampPercent(zone.suppression ?? zone.strength),
    directionDegrees: normalizeDegrees(zone.directionDegrees ?? 0),
    arcDegrees: clamp(zone.arcDegrees ?? 45, 1, 360),
    rangeCells: Math.max(0.5, zone.rangeCells ?? Math.max(radiusCells, 8)),
    minRangeCells: Math.max(0, zone.minRangeCells ?? 0),
    falloffPercent: clampPercent(zone.falloffPercent ?? 50),
    enabled: zone.enabled ?? true,
    sourceVisible: zone.sourceVisible ?? true,
    sourceKnown: zone.sourceKnown ?? true,
  };
}

export function getPressureReportAtPosition(
  position: GridPosition,
  zones: PressureZone[],
): PressureReport | null {
  let strongest: PressureReport | null = null;

  for (const zone of zones) {
    const settings = resolvePressureZoneSettings(zone);
    if (!settings.enabled || settings.mode !== 'area' || !isPositionInsidePressureZone(position, zone)) continue;

    const report: PressureReport = {
      zone,
      rawPressure: zone.strength,
      stressPerSecond: zone.stressPerSecond,
      reason: zone.reasons.en,
    };

    if (!strongest || report.rawPressure > strongest.rawPressure) strongest = report;
  }

  return strongest;
}

export function isPositionInsidePressureZone(position: GridPosition, zone: PressureZone): boolean {
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

export function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
