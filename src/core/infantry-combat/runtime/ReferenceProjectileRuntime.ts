import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type ProjectileImpactV1,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ReferenceProjectileRuntimeStateV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';

export function createReferenceProjectileRuntimeState(): ReferenceProjectileRuntimeStateV1 {
  return {
    schemaVersion: REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: 0,
    activeProjectiles: [],
    committedShots: [],
    impacts: [],
    terminations: [],
    appliedImpactIds: [],
    diagnostics: {
      fixedSubstepsExecuted: 0,
      sweptTraceCount: 0,
      unitCheckCount: 0,
      objectCandidateCount: 0,
      capRejectionCount: 0,
      lastImpactId: null,
      lastTerminationId: null,
    },
  };
}

export function normalizeReferenceProjectileRuntimeState(value: unknown): ReferenceProjectileRuntimeStateV1 {
  if (!isRecord(value) || value.schemaVersion !== REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION) {
    return createReferenceProjectileRuntimeState();
  }
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : {};
  return {
    schemaVersion: REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION,
    fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    accumulatorSeconds: finiteNonNegative(value.accumulatorSeconds, 0),
    activeProjectiles: readArray(value.activeProjectiles).map(normalizeProjectile).filter(isPresent).slice(0, MAX_STAGE3_ACTIVE_PROJECTILES).sort(compareProjectiles),
    committedShots: readArray(value.committedShots).map(normalizeCommitRecord).filter(isPresent).sort(compareCommitRecords).slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES),
    impacts: readArray(value.impacts).map(normalizeImpact).filter(isPresent).sort(compareImpacts).slice(-MAX_STAGE3_IMPACT_ENTRIES),
    terminations: readArray(value.terminations).map(normalizeTermination).filter(isPresent).sort(compareTerminations).slice(-MAX_STAGE3_TERMINATION_ENTRIES),
    appliedImpactIds: canonicalStrings(readArray(value.appliedImpactIds)).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS),
    diagnostics: {
      fixedSubstepsExecuted: integer(diagnostics.fixedSubstepsExecuted, 0, 0, Number.MAX_SAFE_INTEGER),
      sweptTraceCount: integer(diagnostics.sweptTraceCount, 0, 0, Number.MAX_SAFE_INTEGER),
      unitCheckCount: integer(diagnostics.unitCheckCount, 0, 0, Number.MAX_SAFE_INTEGER),
      objectCandidateCount: integer(diagnostics.objectCandidateCount, 0, 0, Number.MAX_SAFE_INTEGER),
      capRejectionCount: integer(diagnostics.capRejectionCount, 0, 0, Number.MAX_SAFE_INTEGER),
      lastImpactId: nullableText(diagnostics.lastImpactId),
      lastTerminationId: nullableText(diagnostics.lastTerminationId),
    },
  };
}

export function serializeReferenceProjectileRuntimeState(
  value: ReferenceProjectileRuntimeStateV1,
): ReferenceProjectileRuntimeStateV1 {
  return structuredClone(normalizeReferenceProjectileRuntimeState(value));
}

export function appendBoundedCommitRecord(
  state: ReferenceProjectileRuntimeStateV1,
  record: ShotCommitRecordV1,
  activeShotIds: ReadonlySet<string>,
): ShotCommitRecordV1[] {
  const next = [...state.committedShots.map((item) => structuredClone(item)), structuredClone(record)].sort(compareCommitRecords);
  while (next.length > MAX_STAGE3_COMMIT_LEDGER_ENTRIES) {
    const removableIndex = next.findIndex((item) => !activeShotIds.has(item.shotId));
    next.splice(removableIndex >= 0 ? removableIndex : 0, 1);
  }
  return next;
}

function normalizeProjectile(value: unknown): ProjectileStateV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const position = normalizePoint(value.position);
  const velocity = normalizeDirection(value.velocityMetresPerSecond);
  const ammo = normalizeAmmo(value.ammoSnapshot);
  if (!projectileId || !shotId || !shooterId || !position || !velocity || !ammo) return null;
  return {
    schemaVersion: 1,
    projectileId,
    shotId,
    shooterId,
    ammoSnapshot: ammo,
    position,
    velocityMetresPerSecond: velocity,
    ageSeconds: finiteNonNegative(value.ageSeconds, 0),
    maximumLifetimeSeconds: finitePositive(value.maximumLifetimeSeconds, ammo.maximumLifetimeSeconds),
    bodyPenetrationBudget: finiteNonNegative(value.bodyPenetrationBudget, ammo.bodyPenetrationBudget),
    impactSequence: integer(value.impactSequence, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeCommitRecord(value: unknown): ShotCommitRecordV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const fireTaskId = cleanText(value.fireTaskId, '');
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  const weaponDefinitionRef = normalizeRef(value.weaponDefinitionRef);
  const ammoDefinitionRef = normalizeRef(value.ammoDefinitionRef);
  const muzzlePosition = normalizePoint(value.muzzlePosition);
  const initialVelocity = normalizeDirection(value.initialVelocityMetresPerSecond);
  if (!shotId || !shooterId || !fireTaskId || !weaponInstanceId || !weaponDefinitionRef || !ammoDefinitionRef || !muzzlePosition || !initialVelocity) return null;
  return {
    schemaVersion: 1,
    shotId,
    shooterId,
    fireTaskId,
    weaponInstanceId,
    weaponDefinitionRef,
    ammoDefinitionRef,
    committedSimulationSeconds: finiteNonNegative(value.committedSimulationSeconds, 0),
    muzzlePosition,
    initialVelocityMetresPerSecond: initialVelocity,
    roundsBefore: integer(value.roundsBefore, 0, 0, Number.MAX_SAFE_INTEGER),
    roundsAfter: integer(value.roundsAfter, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeImpact(value: unknown): ProjectileImpactV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const impactId = cleanText(value.impactId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const shooterId = cleanText(value.shooterId, '');
  const point = normalizePoint(value.point);
  const impactType = value.impactType;
  if (!impactId || !projectileId || !shotId || !shooterId || !point || (impactType !== 'terrain' && impactType !== 'object' && impactType !== 'unit')) return null;
  return {
    schemaVersion: 1,
    impactId,
    projectileId,
    shotId,
    shooterId,
    impactType,
    simulationSeconds: finiteNonNegative(value.simulationSeconds, 0),
    point,
    hitObjectId: nullableText(value.hitObjectId),
    hitUnitId: nullableText(value.hitUnitId),
    hitZone: value.hitZone === 'head' || value.hitZone === 'torso' || value.hitZone === 'limbs' ? value.hitZone : null,
    materialId: nullableText(value.materialId),
    normal: normalizeDirection(value.normal),
    velocityBeforeImpact: normalizeDirection(value.velocityBeforeImpact) ?? { x: 0, y: 0, z: 0 },
  };
}

function normalizeTermination(value: unknown): ProjectileTerminationV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const terminationId = cleanText(value.terminationId, '');
  const projectileId = cleanText(value.projectileId, '');
  const shotId = cleanText(value.shotId, '');
  const reason = value.reason;
  const point = normalizePoint(value.point);
  if (!terminationId || !projectileId || !shotId || !point || (reason !== 'impact' && reason !== 'lifetime' && reason !== 'out_of_bounds')) return null;
  return {
    schemaVersion: 1,
    terminationId,
    projectileId,
    shotId,
    reason,
    simulationSeconds: finiteNonNegative(value.simulationSeconds, 0),
    point,
  };
}

function normalizeAmmo(value: unknown): ProjectileStateV1['ammoSnapshot'] | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!cleanText(value.ammoDefinitionId, '') || integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER) <= 0) return null;
  if (value.status !== 'published' && value.status !== 'archived') return null;
  if (finitePositive(value.muzzleVelocityMetersPerSecond, 0) <= 0 || finitePositive(value.maximumLifetimeSeconds, 0) <= 0) return null;
  return structuredClone(value as unknown as ProjectileStateV1['ammoSnapshot']);
}

function normalizeRef(value: unknown): ShotCommitRecordV1['weaponDefinitionRef'] | null {
  if (!isRecord(value)) return null;
  const definitionId = cleanText(value.definitionId, '');
  const revision = integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER);
  return definitionId && revision > 0 ? { definitionId, revision } : null;
}

function normalizePoint(value: unknown): ProjectileStateV1['position'] | null {
  if (!isRecord(value) || !isFiniteNumber(value.xMetres) || !isFiniteNumber(value.yMetres) || !isFiniteNumber(value.zMetres)) return null;
  return { xMetres: value.xMetres, yMetres: value.yMetres, zMetres: value.zMetres };
}

function normalizeDirection(value: unknown): ProjectileStateV1['velocityMetresPerSecond'] | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return compareText(left.projectileId, right.projectileId);
}

function compareCommitRecords(left: ShotCommitRecordV1, right: ShotCommitRecordV1): number {
  return left.committedSimulationSeconds - right.committedSimulationSeconds || compareText(left.shotId, right.shotId);
}

function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.impactId, right.impactId);
}

function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId);
}

function canonicalStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => cleanText(value, '')).filter(Boolean))].sort(compareText);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function finitePositive(value: unknown, fallback: number): number {
  const numeric = isFiniteNumber(value) ? value : fallback;
  return numeric > 0 ? numeric : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, isFiniteNumber(value) ? value : fallback);
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = isFiniteNumber(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
