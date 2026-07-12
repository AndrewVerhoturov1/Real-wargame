import { distance, type GridPosition } from '../geometry';

export type PressureZoneType = 'open_area_pressure' | 'unknown_risk' | 'debug';
export type PressureZoneShape = 'circle' | 'rect';
export type PressureZoneMode = 'area' | 'directional_fire';
export type ThreatKnowledgeSource = 'objective' | 'seen' | 'heard' | 'reported' | 'fire_pressure';

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
  rotationDegrees?: number;
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
  knowledgeConfidence?: number;
  uncertaintyCells?: number;
  knowledgeSource?: ThreatKnowledgeSource;
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
  rotationDegrees?: number;
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
  knowledgeConfidence?: number;
  uncertaintyCells?: number;
  knowledgeSource?: ThreatKnowledgeSource;
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

export function normalizePressureZones(
  data: PressureZoneData[],
  sourceToRuntimeCellScale = 1,
): PressureZone[] {
  const scale = normalizeScale(sourceToRuntimeCellScale);
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
      x: zone.x * scale,
      y: zone.y * scale,
      radiusCells: Math.max(0, zone.radiusCells ?? 0) * scale,
      widthCells: Math.max(0, zone.widthCells ?? 0) * scale,
      heightCells: Math.max(0, zone.heightCells ?? 0) * scale,
      rotationDegrees: normalizeDegrees(zone.rotationDegrees ?? 0),
      strength: clampPercent(zone.strength),
      suppression: settings.suppression,
      stressPerSecond: Math.max(0, zone.stressPerSecond),
      directionDegrees: settings.directionDegrees,
      arcDegrees: settings.arcDegrees,
      rangeCells: settings.rangeCells * scale,
      minRangeCells: settings.minRangeCells * scale,
      falloffPercent: settings.falloffPercent,
      enabled: settings.enabled,
      sourceVisible: settings.sourceVisible,
      sourceKnown: settings.sourceKnown,
      knowledgeConfidence: clampPercent(zone.knowledgeConfidence ?? (settings.sourceVisible ? 100 : settings.sourceKnown ? 75 : 45)),
      uncertaintyCells: Math.max(0, zone.uncertaintyCells ?? (settings.sourceVisible ? 0.15 : 1.5)) * scale,
      knowledgeSource: zone.knowledgeSource ?? (settings.sourceVisible ? 'seen' : settings.sourceKnown ? 'reported' : 'fire_pressure'),
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

  const rotation = -degreesToRadians(zone.rotationDegrees ?? 0);
  const dx = position.x - zone.x;
  const dy = position.y - zone.y;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= zone.widthCells / 2 && Math.abs(localY) <= zone.heightCells / 2;
}

export function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}
