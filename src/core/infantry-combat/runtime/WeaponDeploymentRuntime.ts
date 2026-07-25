import type { BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { TacticalMap } from '../../map/MapModel';
import type { UnitModel } from '../../units/UnitModel';
import type { InfantryWeaponInstanceV1 } from './InfantryCombatRuntimeTypes';
import { getWeaponAnchor } from './MuzzleGeometry';
import {
  MAX_WEAPON_DEPLOYMENT_RESULTS,
  WEAPON_DEPLOYMENT_SCHEMA_VERSION,
  type WeaponDeploymentActionResultV1,
  type WeaponDeploymentActionV1,
  type WeaponDeploymentAnchorV1,
  type WeaponDeploymentRuntimeV1,
} from './WeaponDeploymentTypes';

export const DEPLOYMENT_ANCHOR_POSITION_TOLERANCE_METRES = 0.01;
export const DEPLOYED_TRAVERSE_EPSILON_RADIANS = 1e-9;

export function createWeaponDeploymentRuntime(): WeaponDeploymentRuntimeV1 {
  return {
    schemaVersion: WEAPON_DEPLOYMENT_SCHEMA_VERSION,
    mode: 'portable',
    anchor: null,
    traverseCenterRadians: null,
    deployedAtSeconds: null,
    nextActionSequence: 1,
    activeAction: null,
    lastActionResult: null,
    actionResults: [],
    revision: 0,
    invalidationReason: null,
  };
}

export function normalizeWeaponDeploymentRuntime(value: unknown): WeaponDeploymentRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== WEAPON_DEPLOYMENT_SCHEMA_VERSION) return createWeaponDeploymentRuntime();
  const requestedMode = value.mode === 'deploying' || value.mode === 'deployed' || value.mode === 'undeploying'
    ? value.mode
    : 'portable';
  const anchor = normalizeAnchor(value.anchor);
  const activeAction = normalizeAction(value.activeAction);
  let mode = requestedMode;
  if ((mode === 'deployed' || mode === 'undeploying') && !anchor) mode = 'portable';
  if ((mode === 'deploying' || mode === 'undeploying') && !activeAction) mode = mode === 'undeploying' && anchor ? 'deployed' : 'portable';
  const results = normalizeResults(value.actionResults);
  const lastActionResult = normalizeResult(value.lastActionResult) ?? results.at(-1) ?? null;
  return {
    schemaVersion: WEAPON_DEPLOYMENT_SCHEMA_VERSION,
    mode,
    anchor: mode === 'portable' || mode === 'deploying' ? null : anchor,
    traverseCenterRadians: mode === 'portable' || mode === 'deploying' ? null : nullableFinite(value.traverseCenterRadians),
    deployedAtSeconds: mode === 'portable' || mode === 'deploying' ? null : nullableNonNegative(value.deployedAtSeconds),
    nextActionSequence: integer(value.nextActionSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    activeAction: mode === 'deploying' || mode === 'undeploying' ? activeAction : null,
    lastActionResult,
    actionResults: lastActionResult ? [structuredClone(lastActionResult)] : [],
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    invalidationReason: nullableText(value.invalidationReason),
  };
}

export function serializeWeaponDeploymentRuntime(value: WeaponDeploymentRuntimeV1): WeaponDeploymentRuntimeV1 {
  return normalizeWeaponDeploymentRuntime(structuredClone(value));
}

export function captureWeaponDeploymentAnchor(map: TacticalMap, unit: UnitModel): WeaponDeploymentAnchorV1 {
  const point = getWeaponAnchor(map, unit);
  return {
    xMetres: point.xMetres,
    yMetres: point.yMetres,
    zMetres: point.zMetres,
    facingRadians: normalizeRadians(unit.facingRadians),
    posture: unit.behaviorRuntime.posture,
  };
}

export function deploymentAnchorStillValid(map: TacticalMap, unit: UnitModel, anchor: WeaponDeploymentAnchorV1): boolean {
  const current = captureWeaponDeploymentAnchor(map, unit);
  return Math.hypot(current.xMetres - anchor.xMetres, current.yMetres - anchor.yMetres, current.zMetres - anchor.zMetres)
      <= DEPLOYMENT_ANCHOR_POSITION_TOLERANCE_METRES
    && current.posture === anchor.posture;
}

export function isTargetWithinDeployedTraverse(
  weapon: InfantryWeaponInstanceV1,
  target: BallisticPoint3,
): boolean {
  const deployment = weapon.deployment;
  if (deployment.mode !== 'deployed' || !deployment.anchor || deployment.traverseCenterRadians === null) return true;
  const dx = target.xMetres - deployment.anchor.xMetres;
  const dy = target.yMetres - deployment.anchor.yMetres;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= DEPLOYED_TRAVERSE_EPSILON_RADIANS) return false;
  const arc = weapon.resolved.weapon.deployedTraverseArcRadians;
  if (!Number.isFinite(arc) || arc <= 0) return false;
  const targetYaw = Math.atan2(dy, dx);
  const halfArc = Math.min(Math.PI * 2, arc) / 2;
  return Math.abs(normalizeSignedRadians(targetYaw - deployment.traverseCenterRadians)) <= halfArc + DEPLOYED_TRAVERSE_EPSILON_RADIANS;
}

export function invalidateWeaponDeployment(
  weapon: InfantryWeaponInstanceV1,
  reason: string,
): boolean {
  const deployment = weapon.deployment;
  if (deployment.mode === 'portable' && !deployment.activeAction && !deployment.anchor) return false;
  deployment.mode = 'portable';
  deployment.anchor = null;
  deployment.traverseCenterRadians = null;
  deployment.deployedAtSeconds = null;
  deployment.activeAction = null;
  deployment.invalidationReason = cleanText(reason, 'deployment_invalidated');
  deployment.revision = Math.min(Number.MAX_SAFE_INTEGER, deployment.revision + 1);
  return true;
}

export function appendDeploymentResult(runtime: WeaponDeploymentRuntimeV1, result: WeaponDeploymentActionResultV1): boolean {
  const existing = runtime.actionResults.find((entry) => entry.actionId === result.actionId);
  if (existing) {
    runtime.lastActionResult = structuredClone(existing);
    return false;
  }
  runtime.actionResults = [structuredClone(result)].slice(-MAX_WEAPON_DEPLOYMENT_RESULTS);
  runtime.lastActionResult = structuredClone(result);
  return true;
}

export function normalizeSignedRadians(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let result = value % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function normalizeRadians(value: number): number {
  const signed = normalizeSignedRadians(value);
  return signed < 0 ? signed + Math.PI * 2 : signed;
}

function normalizeAction(value: unknown): WeaponDeploymentActionV1 | null {
  if (!isRecord(value) || value.schemaVersion !== WEAPON_DEPLOYMENT_SCHEMA_VERSION) return null;
  if (value.kind !== 'deploy' && value.kind !== 'undeploy') return null;
  const actionId = cleanText(value.actionId, '');
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !weaponInstanceId || !ownerToken) return null;
  return {
    schemaVersion: WEAPON_DEPLOYMENT_SCHEMA_VERSION,
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    kind: value.kind,
    weaponInstanceId,
    owner: normalizeOwner(value.owner),
    ownerToken,
    actionHandle: normalizeHandle(value.actionHandle),
    helperUnitId: nullableText(value.helperUnitId),
    helperActionHandle: normalizeHandle(value.helperActionHandle),
    helperValidationCode: nullableText(value.helperValidationCode),
    requiredBaseWorkSeconds: finiteNonNegative(value.requiredBaseWorkSeconds, 0),
    completedBaseWorkSeconds: finiteNonNegative(value.completedBaseWorkSeconds, 0),
    startedSeconds: finiteNonNegative(value.startedSeconds, 0),
    lastAdvancedSeconds: finiteNonNegative(value.lastAdvancedSeconds, 0),
    anchorBeforeAction: normalizeAnchor(value.anchorBeforeAction),
  };
}

function normalizeResults(value: unknown): WeaponDeploymentActionResultV1[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, WeaponDeploymentActionResultV1>();
  for (const item of value) {
    const normalized = normalizeResult(item);
    if (normalized) byId.set(normalized.actionId, normalized);
  }
  return [...byId.values()]
    .sort((left, right) => left.endedSeconds - right.endedSeconds || compareText(left.actionId, right.actionId))
    .slice(-MAX_WEAPON_DEPLOYMENT_RESULTS);
}

function normalizeResult(value: unknown): WeaponDeploymentActionResultV1 | null {
  if (!isRecord(value) || (value.kind !== 'deploy' && value.kind !== 'undeploy')) return null;
  if (value.status !== 'completed' && value.status !== 'cancelled' && value.status !== 'failed') return null;
  const actionId = cleanText(value.actionId, '');
  if (!actionId) return null;
  return {
    actionId,
    kind: value.kind,
    status: value.status,
    resultCode: cleanText(value.resultCode, 'deployment_action_result'),
    resultRu: cleanText(value.resultRu, 'Действие с пулемётом завершено.'),
    endedSeconds: finiteNonNegative(value.endedSeconds, 0),
  };
}

function normalizeAnchor(value: unknown): WeaponDeploymentAnchorV1 | null {
  if (!isRecord(value)) return null;
  const xMetres = finiteOrNull(value.xMetres);
  const yMetres = finiteOrNull(value.yMetres);
  const zMetres = finiteOrNull(value.zMetres);
  const facingRadians = finiteOrNull(value.facingRadians);
  const posture = value.posture === 'standing' || value.posture === 'crouched' || value.posture === 'prone' ? value.posture : null;
  if (xMetres === null || yMetres === null || zMetres === null || facingRadians === null || !posture) return null;
  return { xMetres, yMetres, zMetres, facingRadians: normalizeRadians(facingRadians), posture };
}

function normalizeHandle(value: unknown) {
  if (!isRecord(value)) return null;
  const actionId = cleanText(value.actionId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !ownerToken) return null;
  return {
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    revision: integer(value.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    ownerToken,
  };
}

function normalizeOwner(value: unknown) {
  if (!isRecord(value)) return { source: 'system' as const, id: 'weapon-deployment' };
  const source = value.source === 'player' || value.source === 'player_command' || value.source === 'movement'
    || value.source === 'tactical_position' || value.source === 'test' || value.source === 'graph_v2'
    || value.source === 'future_ai' ? value.source : 'system';
  return { source, id: cleanText(value.id, 'weapon-deployment') };
}

function finiteOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function nullableFinite(value: unknown): number | null { return finiteOrNull(value); }
function nullableNonNegative(value: unknown): number | null { const number = finiteOrNull(value); return number === null ? null : Math.max(0, number); }
function finiteNonNegative(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, number)); }
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
