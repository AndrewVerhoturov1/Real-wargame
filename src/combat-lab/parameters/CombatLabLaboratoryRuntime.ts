import {
  getCombatLabQuickParameterDescriptor,
  isCombatLabQuickParameterId,
} from './CombatLabQuickParameterRegistry';
import {
  normalizeQuickParameterValue,
  type CombatLabQuickParameterIdV1,
} from './CombatLabQuickParameterTypes';

export interface CombatLabLaboratoryPointV1 {
  readonly xMetres: number;
  readonly yMetres: number;
}

export interface CombatLabLaboratoryAreaV1 {
  readonly areaId: string;
  readonly titleRu: string;
  readonly vertices: readonly CombatLabLaboratoryPointV1[];
}

export type CombatLabLaboratoryTargetV1 =
  | Readonly<{ kind: 'participant'; roleId: string }>
  | Readonly<{ kind: 'participants'; roleIds: readonly string[] }>
  | Readonly<{ kind: 'area'; areaId: string }>;

export interface CombatLabLaboratoryOverrideV1 {
  readonly overrideId: string;
  readonly parameterId: CombatLabQuickParameterIdV1;
  readonly target: CombatLabLaboratoryTargetV1;
  readonly value: number;
  readonly enabled: boolean;
}

export interface CombatLabLaboratoryStateV1 {
  readonly schemaVersion: 1;
  readonly areas: readonly CombatLabLaboratoryAreaV1[];
  readonly overrides: readonly CombatLabLaboratoryOverrideV1[];
}

export interface CombatLabLaboratoryTargetContextV1 {
  readonly roleId: string;
  readonly xMetres: number;
  readonly yMetres: number;
}

export interface CombatLabLaboratoryResolvedValueV1 {
  readonly parameterId: CombatLabQuickParameterIdV1;
  readonly baselineValue: number;
  readonly effectiveValue: number;
  readonly effectiveOverrideId: string | null;
  readonly appliedOverrideIds: readonly string[];
}

export function createEmptyCombatLabLaboratoryState(): CombatLabLaboratoryStateV1 {
  return Object.freeze({ schemaVersion: 1, areas: Object.freeze([]), overrides: Object.freeze([]) });
}

export function normalizeCombatLabLaboratoryState(value: unknown): CombatLabLaboratoryStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) return createEmptyCombatLabLaboratoryState();
  const rawAreas = Array.isArray(value.areas) ? value.areas : [];
  const rawOverrides = Array.isArray(value.overrides) ? value.overrides : [];
  const areas = rawAreas.map(normalizeArea);
  const areaIds = new Set(areas.map((area) => area.areaId));
  const overrides = rawOverrides.map((item) => normalizeOverride(item, areaIds));
  assertUnique(areas.map((area) => area.areaId), 'Laboratory areaId');
  assertUnique(overrides.map((item) => item.overrideId), 'Laboratory overrideId');
  return freezeState({ schemaVersion: 1, areas, overrides });
}

export function upsertCombatLabLaboratoryArea(
  state: CombatLabLaboratoryStateV1,
  area: CombatLabLaboratoryAreaV1,
): CombatLabLaboratoryStateV1 {
  const normalized = normalizeArea(area);
  const index = state.areas.findIndex((candidate) => candidate.areaId === normalized.areaId);
  const areas = [...state.areas];
  if (index >= 0) areas[index] = normalized;
  else areas.push(normalized);
  return freezeState({ ...state, areas });
}

export function removeCombatLabLaboratoryArea(
  state: CombatLabLaboratoryStateV1,
  areaId: string,
): CombatLabLaboratoryStateV1 {
  const normalizedAreaId = nonEmpty(areaId, 'Laboratory areaId');
  const usedBy = state.overrides.filter((item) => item.target.kind === 'area' && item.target.areaId === normalizedAreaId);
  if (usedBy.length > 0) {
    throw new Error(`Laboratory area ${normalizedAreaId} is used by ${usedBy.length} override(s).`);
  }
  const areas = state.areas.filter((area) => area.areaId !== normalizedAreaId);
  if (areas.length === state.areas.length) return state;
  return freezeState({ ...state, areas });
}

export function upsertCombatLabLaboratoryOverride(
  state: CombatLabLaboratoryStateV1,
  override: CombatLabLaboratoryOverrideV1,
): CombatLabLaboratoryStateV1 {
  const normalized = normalizeOverride(override, new Set(state.areas.map((area) => area.areaId)));
  const index = state.overrides.findIndex((candidate) => candidate.overrideId === normalized.overrideId);
  const overrides = [...state.overrides];
  if (index >= 0) overrides[index] = normalized;
  else overrides.push(normalized);
  return freezeState({ ...state, overrides });
}

export function removeCombatLabLaboratoryOverride(
  state: CombatLabLaboratoryStateV1,
  overrideId: string,
): CombatLabLaboratoryStateV1 {
  const normalizedOverrideId = nonEmpty(overrideId, 'Laboratory overrideId');
  const overrides = state.overrides.filter((item) => item.overrideId !== normalizedOverrideId);
  if (overrides.length === state.overrides.length) return state;
  return freezeState({ ...state, overrides });
}

export function listApplicableCombatLabLaboratoryOverrides(
  state: CombatLabLaboratoryStateV1,
  parameterId: CombatLabQuickParameterIdV1,
  context: CombatLabLaboratoryTargetContextV1,
): readonly CombatLabLaboratoryOverrideV1[] {
  const normalizedContext = normalizeTargetContext(context);
  const areaById = new Map(state.areas.map((area) => [area.areaId, area] as const));
  return Object.freeze(state.overrides.filter((item) => (
    item.enabled
    && item.parameterId === parameterId
    && targetMatches(item.target, normalizedContext, areaById)
  )));
}

export function resolveCombatLabLaboratoryValue(
  state: CombatLabLaboratoryStateV1,
  parameterId: CombatLabQuickParameterIdV1,
  context: CombatLabLaboratoryTargetContextV1,
  baselineValue: number,
): CombatLabLaboratoryResolvedValueV1 {
  const descriptor = getCombatLabQuickParameterDescriptor(parameterId);
  const baseline = normalizeQuickParameterValue(descriptor, baselineValue);
  const applicable = listApplicableCombatLabLaboratoryOverrides(state, parameterId, context);
  const winner = applicable.at(-1) ?? null;
  return Object.freeze({
    parameterId,
    baselineValue: baseline,
    effectiveValue: winner?.value ?? baseline,
    effectiveOverrideId: winner?.overrideId ?? null,
    appliedOverrideIds: Object.freeze(applicable.map((item) => item.overrideId)),
  });
}

function targetMatches(
  target: CombatLabLaboratoryTargetV1,
  context: CombatLabLaboratoryTargetContextV1,
  areaById: ReadonlyMap<string, CombatLabLaboratoryAreaV1>,
): boolean {
  if (target.kind === 'participant') return target.roleId === context.roleId;
  if (target.kind === 'participants') return target.roleIds.includes(context.roleId);
  const area = areaById.get(target.areaId);
  return area ? pointInPolygon(context.xMetres, context.yMetres, area.vertices) : false;
}

function pointInPolygon(x: number, y: number, vertices: readonly CombatLabLaboratoryPointV1[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if (pointOnSegment(x, y, a.xMetres, a.yMetres, b.xMetres, b.yMetres)) return true;
    const crosses = (a.yMetres > y) !== (b.yMetres > y)
      && x < ((b.xMetres - a.xMetres) * (y - a.yMetres)) / (b.yMetres - a.yMetres) + a.xMetres;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < 0) return false;
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return dot <= lengthSquared + 1e-9;
}

function normalizeArea(value: unknown): CombatLabLaboratoryAreaV1 {
  if (!isRecord(value)) throw new Error('Invalid Laboratory area.');
  const areaId = nonEmpty(value.areaId, 'Laboratory areaId');
  const titleRu = nonEmpty(value.titleRu ?? areaId, 'Laboratory area title');
  if (!Array.isArray(value.vertices) || value.vertices.length < 3) {
    throw new Error(`Laboratory area ${areaId} must contain at least three vertices.`);
  }
  const vertices = value.vertices.map((point) => {
    if (!isRecord(point)) throw new Error(`Laboratory area ${areaId} contains an invalid vertex.`);
    return Object.freeze({
      xMetres: finite(point.xMetres, `Laboratory area ${areaId} xMetres`),
      yMetres: finite(point.yMetres, `Laboratory area ${areaId} yMetres`),
    });
  });
  return Object.freeze({ areaId, titleRu, vertices: Object.freeze(vertices) });
}

function normalizeOverride(
  value: unknown,
  areaIds: ReadonlySet<string>,
): CombatLabLaboratoryOverrideV1 {
  if (!isRecord(value)) throw new Error('Invalid Laboratory override.');
  const overrideId = nonEmpty(value.overrideId, 'Laboratory overrideId');
  const rawParameterId = nonEmpty(value.parameterId, `Laboratory override ${overrideId} parameterId`);
  if (!isCombatLabQuickParameterId(rawParameterId)) {
    throw new Error(`Laboratory override ${overrideId} references unsupported parameter ${rawParameterId}.`);
  }
  const descriptor = getCombatLabQuickParameterDescriptor(rawParameterId);
  const target = normalizeTarget(value.target, areaIds, overrideId);
  return Object.freeze({
    overrideId,
    parameterId: rawParameterId,
    target,
    value: normalizeQuickParameterValue(descriptor, finite(value.value, `Laboratory override ${overrideId} value`)),
    enabled: value.enabled !== false,
  });
}

function normalizeTarget(
  value: unknown,
  areaIds: ReadonlySet<string>,
  overrideId: string,
): CombatLabLaboratoryTargetV1 {
  if (!isRecord(value)) throw new Error(`Laboratory override ${overrideId} has invalid target.`);
  if (value.kind === 'participant') {
    return Object.freeze({ kind: 'participant', roleId: nonEmpty(value.roleId, 'Laboratory roleId') });
  }
  if (value.kind === 'participants') {
    if (!Array.isArray(value.roleIds)) throw new Error(`Laboratory override ${overrideId} requires roleIds.`);
    const roleIds = value.roleIds.map((item) => nonEmpty(item, 'Laboratory roleId'));
    if (roleIds.length === 0) throw new Error(`Laboratory override ${overrideId} requires at least one roleId.`);
    assertUnique(roleIds, `Laboratory override ${overrideId} roleId`);
    return Object.freeze({ kind: 'participants', roleIds: Object.freeze(roleIds) });
  }
  if (value.kind === 'area') {
    const areaId = nonEmpty(value.areaId, 'Laboratory areaId');
    if (!areaIds.has(areaId)) throw new Error(`Laboratory override ${overrideId} references missing area ${areaId}.`);
    return Object.freeze({ kind: 'area', areaId });
  }
  throw new Error(`Laboratory override ${overrideId} has unsupported target kind.`);
}

function normalizeTargetContext(value: CombatLabLaboratoryTargetContextV1): CombatLabLaboratoryTargetContextV1 {
  return Object.freeze({
    roleId: nonEmpty(value.roleId, 'Laboratory target roleId'),
    xMetres: finite(value.xMetres, 'Laboratory target xMetres'),
    yMetres: finite(value.yMetres, 'Laboratory target yMetres'),
  });
}

function freezeState(value: {
  readonly schemaVersion: 1;
  readonly areas: readonly CombatLabLaboratoryAreaV1[];
  readonly overrides: readonly CombatLabLaboratoryOverrideV1[];
}): CombatLabLaboratoryStateV1 {
  return Object.freeze({
    schemaVersion: 1,
    areas: Object.freeze(value.areas.map((area) => Object.freeze({
      ...area,
      vertices: Object.freeze(area.vertices.map((point) => Object.freeze({ ...point }))),
    }))),
    overrides: Object.freeze(value.overrides.map((item) => Object.freeze({
      ...item,
      target: item.target.kind === 'participants'
        ? Object.freeze({ ...item.target, roleIds: Object.freeze([...item.target.roleIds]) })
        : Object.freeze({ ...item.target }),
    }))),
  });
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} must be unique: ${value}.`);
    seen.add(value);
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
