import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { emitPerceptionSound } from '../perception/PerceptionSound';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { resolveMovementMaterialFactors, type MovementMaterialFactors } from './MovementMaterialAdapter';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  isMovementGait,
  profileIdForGait,
  resolveMovementProfile,
  resolveMovementProfileIdAlias,
  type MovementGait,
  type MovementProfile,
  type MovementProfileAuthoritySource,
  type MovementProfileMigrationInfo,
  type MovementProfileSource,
  type MovementWeaponPreparationState,
} from './MovementProfiles';

export type MovementForcedFallbackReason =
  | 'missing_profile'
  | 'insufficient_stamina'
  | 'stamina_fallback'
  | 'wound_restriction'
  | 'suppression_restriction'
  | 'physical_capability'
  | 'minimum_speed'
  | 'impassable_material'
  | 'profile_stop';

export interface MovementRuntimeDiagnostics {
  speedCellsPerSecond: number;
  baseSpeedCellsPerSecond: number;
  /** Kept for diagnostic compatibility. Numeric gait tuning lives in profiles, so this is always 1. */
  gaitMultiplier: number;
  profileMultiplier: number;
  postureMultiplier: number;
  abilityMultiplier: number;
  woundMultiplier: number;
  staminaMultiplier: number;
  surfaceMultiplier: number;
  materialSource: MovementMaterialFactors['source'];
  noiseLoudness: number;
  visualMovementMultiplier: number;
  lateralVisibility: number;
  observationFocusMultiplier: number;
  observationDirectMultiplier: number;
  observationPeripheralMultiplier: number;
  observationRearMultiplier: number;
  stationaryTargetMultiplier: number;
  movingTargetMultiplier: number;
  observationScanSpeedMultiplier: number;
  stealthSkillShare: number;
}

export interface MovementRuntimeState {
  requestedProfileId: string;
  effectiveProfileId: string;
  requestedProfileSource: MovementProfileAuthoritySource;
  effectiveProfileSource: MovementProfileAuthoritySource;
  requestedGait: MovementGait;
  actualGait: MovementGait;
  stamina: number;
  forcedFallbackReason: MovementForcedFallbackReason | null;
  migrationInfo: MovementProfileMigrationInfo | null;
  distanceSinceSoundMeters: number;
  emittedSoundCount: number;
  movementSequence: number;
  isMoving: boolean;
  startElapsedSeconds: number;
  stopElapsedSeconds: number;
  lastMovementPosture: UnitPosture | null;
  weaponPreparation: MovementWeaponPreparationState | null;
  weaponPreparationRevision: number;
  velocityCellsPerSecond: GridPosition;
  diagnostics: MovementRuntimeDiagnostics;
}

export interface MovementStep {
  maxDistanceCells: number;
  activeSeconds: number;
  profile: MovementProfile;
  gait: MovementGait;
  staminaStart: number;
  staminaEnd: number;
  speedCellsPerSecond: number;
  materialFactors: MovementMaterialFactors;
}

interface MovementExecution {
  profile: MovementProfile;
  gait: MovementGait;
  source: MovementProfileAuthoritySource;
  reason: MovementForcedFallbackReason | null;
  stop: boolean;
}

const REQUIRED_GAIT_POSTURES: Partial<Record<MovementGait, UnitPosture>> = {
  crawl: 'prone',
  crouch_walk: 'crouched',
  sprint: 'standing',
};

export function createMovementRuntime(
  requestedProfileId = DEFAULT_MOVEMENT_PROFILE_ID,
  requestedGait: MovementGait = 'walk',
  input?: unknown,
): MovementRuntimeState {
  const record = isRecord(input) ? input : {};
  const diagnostics = isRecord(record.diagnostics) ? record.diagnostics : {};
  const requestedAlias = resolveMovementProfileIdAlias(string(record.requestedProfileId, requestedProfileId));
  const effectiveAlias = resolveMovementProfileIdAlias(string(record.effectiveProfileId, requestedAlias.id));
  const sourceMigration = normalizeAuthoritySource(record.requestedProfileSource, input === undefined ? 'default' : 'default');
  const effectiveSourceMigration = normalizeAuthoritySource(record.effectiveProfileSource, sourceMigration.source);
  const migrationInfo = normalizeMigrationInfo(record.migrationInfo)
    ?? requestedAlias.migrationInfo
    ?? effectiveAlias.migrationInfo
    ?? sourceMigration.migrationInfo
    ?? effectiveSourceMigration.migrationInfo
    ?? legacyRuntimeMigration(record);
  const normalizedRequestedGait = isMovementGait(record.requestedGait) ? record.requestedGait : requestedGait;
  const normalizedActualGait = isMovementGait(record.actualGait) ? record.actualGait : normalizedRequestedGait;
  return {
    requestedProfileId: requestedAlias.id,
    effectiveProfileId: effectiveAlias.id,
    requestedProfileSource: sourceMigration.source,
    effectiveProfileSource: effectiveSourceMigration.source,
    requestedGait: normalizedRequestedGait,
    actualGait: normalizedActualGait,
    stamina: finite(record.stamina, 100, 0, 100),
    forcedFallbackReason: forcedFallbackReason(record.forcedFallbackReason),
    migrationInfo,
    distanceSinceSoundMeters: finite(record.distanceSinceSoundMeters, 0, 0, 1_000_000),
    emittedSoundCount: integer(record.emittedSoundCount, 0, 0, 1_000_000_000),
    movementSequence: integer(record.movementSequence, 0, 0, 1_000_000_000),
    isMoving: record.isMoving === true,
    startElapsedSeconds: finite(record.startElapsedSeconds, 0, 0, 60),
    stopElapsedSeconds: finite(record.stopElapsedSeconds, 0, 0, 60),
    lastMovementPosture: postureOrNull(record.lastMovementPosture),
    weaponPreparation: normalizeWeaponPreparation(record.weaponPreparation),
    weaponPreparationRevision: integer(record.weaponPreparationRevision, 0, 0, Number.MAX_SAFE_INTEGER),
    velocityCellsPerSecond: vector(record.velocityCellsPerSecond),
    diagnostics: {
      speedCellsPerSecond: finite(diagnostics.speedCellsPerSecond, 0, 0, 100),
      baseSpeedCellsPerSecond: finite(diagnostics.baseSpeedCellsPerSecond, 0, 0, 100),
      gaitMultiplier: 1,
      profileMultiplier: finite(diagnostics.profileMultiplier, 1, 0, 10),
      postureMultiplier: finite(diagnostics.postureMultiplier, 1, 0, 10),
      abilityMultiplier: finite(diagnostics.abilityMultiplier, 1, 0, 10),
      woundMultiplier: finite(diagnostics.woundMultiplier, 1, 0, 10),
      staminaMultiplier: finite(diagnostics.staminaMultiplier, 1, 0, 10),
      surfaceMultiplier: finite(diagnostics.surfaceMultiplier, 1, 0, 10),
      materialSource: diagnostics.materialSource === 'material_profile_provider' ? 'material_profile_provider' : 'legacy_fallback',
      noiseLoudness: finite(diagnostics.noiseLoudness, 0, 0, 4),
      visualMovementMultiplier: finite(diagnostics.visualMovementMultiplier, 1, 0, 5),
      lateralVisibility: finite(diagnostics.lateralVisibility, 1, 0, 5),
      observationFocusMultiplier: finite(diagnostics.observationFocusMultiplier, 1, 0, 4),
      observationDirectMultiplier: finite(diagnostics.observationDirectMultiplier, 1, 0, 4),
      observationPeripheralMultiplier: finite(diagnostics.observationPeripheralMultiplier, 1, 0, 4),
      observationRearMultiplier: finite(diagnostics.observationRearMultiplier, 1, 0, 4),
      stationaryTargetMultiplier: finite(diagnostics.stationaryTargetMultiplier, 1, 0, 4),
      movingTargetMultiplier: finite(diagnostics.movingTargetMultiplier, 1, 0, 4),
      observationScanSpeedMultiplier: finite(diagnostics.observationScanSpeedMultiplier, 1, 0.05, 4),
      stealthSkillShare: finite(diagnostics.stealthSkillShare, 0.45, 0, 1),
    },
  };
}

export function setMovementProfileRequest(
  state: SimulationState,
  unit: UnitModel,
  profileId: string,
  source: MovementProfileSource,
  gait?: MovementGait,
): void {
  const resolution = state.movementProfiles.resolveProfile(profileId);
  const alias = resolveMovementProfileIdAlias(profileId);
  setMovementRequest(unit, resolution.profile.id, source, gait ?? resolution.profile.preferredGait);
  if (alias.migrationInfo) unit.movementRuntime.migrationInfo = alias.migrationInfo;
  if (resolution.fallbackReason) unit.movementRuntime.forcedFallbackReason = 'missing_profile';
}

export function setMovementRequest(
  unit: UnitModel,
  profileId: string,
  source: MovementProfileSource,
  gait?: MovementGait,
): void {
  const alias = resolveMovementProfileIdAlias(profileId || DEFAULT_MOVEMENT_PROFILE_ID);
  unit.movementRuntime.requestedProfileId = alias.id;
  unit.movementRuntime.requestedProfileSource = source;
  unit.movementRuntime.effectiveProfileSource = source;
  unit.movementRuntime.effectiveProfileId = alias.id;
  if (gait) unit.movementRuntime.requestedGait = gait;
  unit.movementRuntime.startElapsedSeconds = 0;
  unit.movementRuntime.forcedFallbackReason = null;
  unit.movementRuntime.migrationInfo = alias.migrationInfo;
  cancelMovementWeaponPreparation(unit);
}

export function preparePhysicalMovementStep(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
  canTranslate: boolean,
  _postureMultiplier: number,
  woundMultiplier: number,
): MovementStep {
  const runtime = unit.movementRuntime;
  const requestedResolution = state.movementProfiles.resolveProfile(runtime.requestedProfileId);
  let requestedProfile = requestedResolution.profile;
  if (requestedResolution.fallbackReason) {
    runtime.migrationInfo ??= {
      fromProfileId: runtime.requestedProfileId,
      toProfileId: requestedProfile.id,
      reason: 'runtime_normalization',
    };
  }

  const weaponBlockedSeconds = consumeMovementWeaponPreparation(unit, deltaSeconds);
  const execution = resolveExecution(state, unit, requestedProfile);
  let profile = execution.profile;
  let gait = execution.gait;
  let fallbackReason = execution.reason ?? (requestedResolution.fallbackReason ? 'missing_profile' : null);
  const movementOwnsPosture = canTranslate || runtime.isMoving || runtime.weaponPreparation !== null;
  if (movementOwnsPosture) applyMovementPosture(unit, profile, gait);
  const postureMultiplier = postureSpeedMultiplier(unit.behaviorRuntime.posture);
  let materialFactors = resolveMovementMaterialFactors(state, unit, unit.position, profile);
  if (!materialFactors.passable || materialFactors.speedMultiplier <= 0) {
    fallbackReason = 'impassable_material';
  }

  runtime.effectiveProfileId = profile.id;
  runtime.effectiveProfileSource = fallbackReason ? 'hard_safety' : execution.source;
  runtime.forcedFallbackReason = fallbackReason;
  runtime.actualGait = gait;

  if (weaponBlockedSeconds > 0) {
    runtime.stamina = recoverStamina(runtime.stamina, profile, weaponBlockedSeconds, false);
  }
  const movementSeconds = Math.max(0, deltaSeconds - weaponBlockedSeconds);
  const shouldMove = canTranslate && !execution.stop && materialFactors.passable && movementSeconds > 0;
  if (!shouldMove) {
    runtime.isMoving = false;
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
    runtime.stopElapsedSeconds += Math.max(0, deltaSeconds);
    runtime.startElapsedSeconds = 0;
    runtime.stamina = recoverStamina(runtime.stamina, profile, movementSeconds, false);
    publishDiagnostics(runtime, unit, profile, postureMultiplier, woundMultiplier, materialFactors, 0, runtime.stamina);
    return zeroStep(profile, gait, runtime.stamina, materialFactors);
  }

  const previousStart = runtime.startElapsedSeconds;
  runtime.startElapsedSeconds += movementSeconds;
  runtime.stopElapsedSeconds = 0;
  const activeSeconds = Math.max(0, runtime.startElapsedSeconds - Math.max(previousStart, profile.settings.speed.startDelaySeconds));
  if (activeSeconds <= 0) {
    runtime.isMoving = false;
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
    publishDiagnostics(runtime, unit, profile, postureMultiplier, woundMultiplier, materialFactors, 0, runtime.stamina);
    return zeroStep(profile, gait, runtime.stamina, materialFactors);
  }

  const staminaStart = runtime.stamina;
  let staminaEnd = staminaStart;
  let maxDistanceCells = 0;
  let weightedStamina = 0;
  const drain = profile.settings.stamina.drainPerSecond;
  const canCrossThreshold = fallbackReason === null
    && drain > 0
    && profile.settings.stamina.fallbackThreshold > 0
    && staminaStart > profile.settings.stamina.fallbackThreshold
    && staminaStart - drain * activeSeconds < profile.settings.stamina.fallbackThreshold;

  if (canCrossThreshold) {
    const requestedSeconds = clamp(
      (staminaStart - profile.settings.stamina.fallbackThreshold) / drain,
      0,
      activeSeconds,
    );
    const requestedSegment = evaluateMovementSegment(
      state,
      unit,
      profile,
      requestedSeconds,
      staminaStart,
      woundMultiplier,
      materialFactors,
    );
    maxDistanceCells += requestedSegment.distanceCells;
    weightedStamina += requestedSegment.averageStamina * requestedSeconds;
    staminaEnd = requestedSegment.staminaEnd;

    const fallbackExecution = resolveConfiguredFallback(state, unit, profile, 'stamina_fallback');
    profile = fallbackExecution.profile;
    gait = fallbackExecution.gait;
    fallbackReason = fallbackExecution.reason;
    runtime.effectiveProfileId = profile.id;
    runtime.effectiveProfileSource = 'hard_safety';
    runtime.forcedFallbackReason = fallbackReason;
    runtime.actualGait = gait;
    if (movementOwnsPosture) applyMovementPosture(unit, profile, gait);
    materialFactors = resolveMovementMaterialFactors(state, unit, unit.position, profile);
    const fallbackSeconds = activeSeconds - requestedSeconds;
    const fallbackSegment = evaluateMovementSegment(
      state,
      unit,
      profile,
      fallbackSeconds,
      staminaEnd,
      woundMultiplier,
      materialFactors,
    );
    maxDistanceCells += fallbackSegment.distanceCells;
    weightedStamina += fallbackSegment.averageStamina * fallbackSeconds;
    staminaEnd = fallbackSegment.staminaEnd;
  } else {
    const segment = evaluateMovementSegment(
      state,
      unit,
      profile,
      activeSeconds,
      staminaStart,
      woundMultiplier,
      materialFactors,
    );
    maxDistanceCells = segment.distanceCells;
    weightedStamina = segment.averageStamina * activeSeconds;
    staminaEnd = segment.staminaEnd;
  }

  const averageStamina = activeSeconds > 0 ? weightedStamina / activeSeconds : staminaStart;
  const averageSpeed = activeSeconds > 0 ? maxDistanceCells / activeSeconds : 0;
  publishDiagnostics(
    runtime,
    unit,
    profile,
    postureSpeedMultiplier(unit.behaviorRuntime.posture),
    woundMultiplier,
    materialFactors,
    averageSpeed,
    averageStamina,
  );
  return {
    maxDistanceCells: Math.max(0, maxDistanceCells),
    activeSeconds,
    profile,
    gait,
    staminaStart,
    staminaEnd,
    speedCellsPerSecond: Math.max(0, averageSpeed),
    materialFactors,
  };
}

export function commitPhysicalMovementStep(
  state: SimulationState,
  unit: UnitModel,
  step: MovementStep,
  from: GridPosition,
  to: GridPosition,
  deltaSeconds: number,
): void {
  const runtime = unit.movementRuntime;
  const distanceCells = Math.hypot(to.x - from.x, to.y - from.y);
  const ratio = step.maxDistanceCells > 0 ? clamp(distanceCells / step.maxDistanceCells, 0, 1) : 0;
  runtime.stamina = clamp(step.staminaStart + (step.staminaEnd - step.staminaStart) * ratio, 0, 100);
  runtime.isMoving = distanceCells > 0.000001;
  runtime.actualGait = step.gait;
  if (deltaSeconds > 0 && runtime.isMoving) {
    runtime.velocityCellsPerSecond = { x: (to.x - from.x) / deltaSeconds, y: (to.y - from.y) / deltaSeconds };
    emitMovementSounds(state, unit, step.profile, step.materialFactors, from, to, deltaSeconds);
  } else {
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
  }
}

export interface MovementWeaponPreparationRequest {
  contactId: string;
  ownerToken: string;
}

export interface MovementWeaponPreparationHandle {
  ownerToken: string;
  revision: number;
}

export function requestMovementWeaponPreparation(
  state: SimulationState,
  unit: UnitModel,
  request: MovementWeaponPreparationRequest,
): { allowed: boolean; reasonRu: string; handle: MovementWeaponPreparationHandle | null } {
  const runtime = unit.movementRuntime;
  const profile = resolveMovementProfile(state.movementProfiles, runtime.effectiveProfileId || runtime.requestedProfileId);
  const current = runtime.weaponPreparation;
  if (current && current.ownerToken === request.ownerToken && current.contactId === request.contactId) {
    if (current.remainingSeconds > 1e-9) {
      return {
        allowed: false,
        reasonRu: 'Боец останавливается и подготавливает оружие после движения.',
        handle: { ownerToken: current.ownerToken, revision: current.revision },
      };
    }
    const handle = { ownerToken: current.ownerToken, revision: current.revision };
    cancelMovementWeaponPreparation(unit, handle);
    return { allowed: true, reasonRu: '', handle };
  }
  if (!runtime.isMoving || profile.settings.weapon.allowFireWhileMoving) {
    if (current) cancelMovementWeaponPreparation(unit, { ownerToken: current.ownerToken, revision: current.revision });
    return { allowed: true, reasonRu: '', handle: null };
  }

  if (!current || current.ownerToken !== request.ownerToken || current.contactId !== request.contactId) {
    runtime.weaponPreparationRevision += 1;
    runtime.weaponPreparation = {
      ownerToken: request.ownerToken,
      contactId: request.contactId,
      orderIssuedAtMs: unit.order?.issuedAtMs ?? null,
      remainingSeconds: profile.settings.speed.stopDelaySeconds + profile.settings.weapon.readyDelayAfterStopSeconds,
      revision: runtime.weaponPreparationRevision,
    };
  }
  const pending = runtime.weaponPreparation;
  if (pending && pending.remainingSeconds > 1e-9) {
    return {
      allowed: false,
      reasonRu: 'Боец останавливается и подготавливает оружие после движения.',
      handle: { ownerToken: pending.ownerToken, revision: pending.revision },
    };
  }
  const handle = pending ? { ownerToken: pending.ownerToken, revision: pending.revision } : null;
  if (pending) cancelMovementWeaponPreparation(unit, handle ?? undefined);
  return { allowed: true, reasonRu: '', handle };
}

export function cancelMovementWeaponPreparation(
  unit: UnitModel,
  expected?: Partial<MovementWeaponPreparationHandle> & { contactId?: string },
): boolean {
  const current = unit.movementRuntime.weaponPreparation;
  if (!current) return false;
  if (expected?.ownerToken !== undefined && current.ownerToken !== expected.ownerToken) return false;
  if (expected?.revision !== undefined && current.revision !== expected.revision) return false;
  if (expected?.contactId !== undefined && current.contactId !== expected.contactId) return false;
  unit.movementRuntime.weaponPreparation = null;
  return true;
}

export function getMovementWeaponPreparation(unit: UnitModel): MovementWeaponPreparationState | null {
  const value = unit.movementRuntime.weaponPreparation;
  return value ? { ...value } : null;
}

export function getMovementAimPreparationMultiplier(state: SimulationState, unit: UnitModel): number {
  const profile = resolveMovementProfile(state.movementProfiles, unit.movementRuntime.effectiveProfileId || unit.movementRuntime.requestedProfileId);
  return Math.max(0.25, profile.settings.weapon.aimPreparationMultiplier + profile.settings.weapon.weaponPreparationPenalty);
}

export function getMovementTargetVisibilityMultiplier(unit: UnitModel): number {
  return Math.max(0.05, unit.movementRuntime.diagnostics.visualMovementMultiplier);
}

export function getMovementObservationTargetMultiplier(unit: UnitModel, targetMoving: boolean): number {
  const diagnostics = unit.movementRuntime.diagnostics;
  const profileMultiplier = unit.movementRuntime.isMoving
    ? (targetMoving ? diagnostics.movingTargetMultiplier : diagnostics.stationaryTargetMultiplier)
    : 1;
  return Math.max(0.05, profileMultiplier);
}

export function serializeMovementRuntime(runtime: MovementRuntimeState): MovementRuntimeState {
  return {
    ...runtime,
    migrationInfo: runtime.migrationInfo ? { ...runtime.migrationInfo } : null,
    weaponPreparation: runtime.weaponPreparation ? { ...runtime.weaponPreparation } : null,
    velocityCellsPerSecond: { ...runtime.velocityCellsPerSecond },
    diagnostics: { ...runtime.diagnostics },
  };
}

function resolveExecution(state: SimulationState, unit: UnitModel, requestedProfile: MovementProfile): MovementExecution {
  const runtime = unit.movementRuntime;
  const restrictionReason = profileRestrictionReason(state, unit, requestedProfile);
  if (restrictionReason) return resolveConfiguredFallback(state, unit, requestedProfile, restrictionReason);

  const alreadyFallback = runtime.forcedFallbackReason === 'stamina_fallback' || runtime.forcedFallbackReason === 'insufficient_stamina';
  const continuingRequested = runtime.isMoving
    && runtime.effectiveProfileId === requestedProfile.id
    && runtime.actualGait === runtime.requestedGait
    && runtime.forcedFallbackReason === null;
  const staminaSettings = requestedProfile.settings.stamina;
  const needed = alreadyFallback
    ? staminaSettings.resumeThreshold
    : continuingRequested
      ? staminaSettings.fallbackThreshold
      : staminaSettings.minimumToStart;
  if (staminaSettings.drainPerSecond > 0 && runtime.stamina + 1e-9 < needed) {
    return resolveConfiguredFallback(state, unit, requestedProfile, alreadyFallback ? 'stamina_fallback' : 'insufficient_stamina');
  }
  return {
    profile: requestedProfile,
    gait: runtime.requestedGait,
    source: runtime.requestedProfileSource,
    reason: null,
    stop: false,
  };
}

function resolveConfiguredFallback(
  state: SimulationState,
  unit: UnitModel,
  requestedProfile: MovementProfile,
  reason: MovementForcedFallbackReason,
): MovementExecution {
  if (requestedProfile.settings.restrictions.fallbackRule === 'stop') {
    return { profile: requestedProfile, gait: unit.movementRuntime.requestedGait, source: 'hard_safety', reason: 'profile_stop', stop: true };
  }
  const fallbackId = requestedProfile.settings.restrictions.fallbackRule === 'profile'
    ? requestedProfile.fallbackProfileId
    : slowerProfileId(unit.movementRuntime.requestedGait);
  const fallbackProfile = resolveMovementProfile(state.movementProfiles, fallbackId ?? DEFAULT_MOVEMENT_PROFILE_ID);
  return {
    profile: fallbackProfile,
    gait: fallbackProfile.preferredGait,
    source: 'hard_safety',
    reason,
    stop: false,
  };
}

function profileRestrictionReason(state: SimulationState, unit: UnitModel, profile: MovementProfile): MovementForcedFallbackReason | null {
  const restrictions = profile.settings.restrictions;
  const woundSeverity = clamp(1 - unit.soldier.condition.health / 100, 0, 1);
  if (woundSeverity > restrictions.maximumWoundSeverity) return 'wound_restriction';
  if ((!restrictions.allowedWhileSuppressed && unit.behaviorRuntime.suppression > 0)
    || unit.behaviorRuntime.suppression > restrictions.maximumSuppressionPercent) return 'suppression_restriction';
  const physicalCapability = clamp(unit.soldier.condition.speed / 100, 0, 1);
  if (physicalCapability < restrictions.minimumPhysicalCapability) return 'physical_capability';
  const soldierSpeedMeters = unit.speedCellsPerSecond * state.map.metersPerCell * physicalCapability;
  if (soldierSpeedMeters < restrictions.minimumSoldierSpeedMetersPerSecond) return 'minimum_speed';
  return null;
}

function evaluateMovementSegment(
  state: SimulationState,
  unit: UnitModel,
  profile: MovementProfile,
  seconds: number,
  staminaStart: number,
  woundMultiplier: number,
  materialFactors: MovementMaterialFactors,
): { distanceCells: number; staminaEnd: number; averageStamina: number } {
  if (seconds <= 0) return { distanceCells: 0, staminaEnd: staminaStart, averageStamina: staminaStart };
  const drainRate = profile.settings.stamina.drainPerSecond;
  const recoveryRate = drainRate <= 0 ? profile.settings.stamina.recoveryPerSecond * 0.35 : 0;
  const staminaEnd = clamp(staminaStart + (recoveryRate - drainRate) * seconds, 0, 100);
  const averageStamina = (staminaStart + staminaEnd) / 2;
  const staminaMultiplier = averageStaminaSpeedMultiplier(profile, staminaStart, staminaEnd);
  const abilityMultiplier = Math.max(0.35, unit.soldier.condition.speed / 100);
  const postureMultiplier = postureSpeedMultiplier(unit.behaviorRuntime.posture);
  const profileSurfaceMultiplier = profile.settings.surface.materialSpeedMultiplier;
  const speed = unit.speedCellsPerSecond
    * profile.settings.speed.speedMultiplier
    * postureMultiplier
    * abilityMultiplier
    * woundMultiplier
    * staminaMultiplier
    * materialFactors.speedMultiplier
    * profileSurfaceMultiplier;
  const minimumCellsPerSecond = profile.settings.speed.minimumSpeedMetersPerSecond / Math.max(0.001, state.map.metersPerCell);
  return {
    distanceCells: Math.max(0, Math.max(minimumCellsPerSecond, speed) * seconds),
    staminaEnd,
    averageStamina,
  };
}

function applyMovementPosture(unit: UnitModel, profile: MovementProfile, gait: MovementGait): void {
  const runtime = unit.movementRuntime;
  const structuralPosture = REQUIRED_GAIT_POSTURES[gait];
  const desired = structuralPosture ?? (profile.stancePolicy === 'adaptive' ? unit.behaviorRuntime.posture : profile.stancePolicy);
  const required = structuralPosture !== undefined || profile.stancePolicy !== 'adaptive';
  const externallyChanged = runtime.lastMovementPosture !== null && unit.behaviorRuntime.posture !== runtime.lastMovementPosture;
  if (!required && externallyChanged) {
    runtime.lastMovementPosture = null;
    return;
  }
  if (unit.behaviorRuntime.posture === desired) {
    runtime.lastMovementPosture = desired;
    return;
  }
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = desired;
  unit.behaviorRuntime.postureChangedBecause = `physical movement gait: ${gait}`;
  runtime.lastMovementPosture = desired;
}

function publishDiagnostics(
  runtime: MovementRuntimeState,
  unit: UnitModel,
  profile: MovementProfile,
  postureMultiplier: number,
  woundMultiplier: number,
  materialFactors: MovementMaterialFactors,
  speed: number,
  stamina: number,
): void {
  const settings = profile.settings;
  const ability = Math.max(0.35, unit.soldier.condition.speed / 100);
  const staminaMultiplier = instantaneousStaminaSpeedMultiplier(profile, stamina);
  const fatigue = clamp((100 - stamina) / 100, 0, 1);
  const noiseSurface = settings.noise.surfacePolicy === 'material_profile_adapter' ? materialFactors.noiseMultiplier : 1;
  runtime.diagnostics = {
    speedCellsPerSecond: speed,
    baseSpeedCellsPerSecond: unit.speedCellsPerSecond,
    gaitMultiplier: 1,
    profileMultiplier: settings.speed.speedMultiplier,
    postureMultiplier,
    abilityMultiplier: ability,
    woundMultiplier,
    staminaMultiplier,
    surfaceMultiplier: materialFactors.speedMultiplier * settings.surface.materialSpeedMultiplier,
    materialSource: materialFactors.source,
    noiseLoudness: settings.noise.loudness
      * (1 + fatigue * settings.noise.fatigueMultiplier)
      * noiseSurface
      * settings.surface.materialNoiseMultiplier,
    visualMovementMultiplier: settings.visibility.movementVisibilityMultiplier
      * materialFactors.visibilityMultiplier
      * (1 + settings.visibility.openTerrainExposureBonus * Math.max(0, materialFactors.visibilityMultiplier - 1)),
    lateralVisibility: settings.visibility.lateralMovementMultiplier,
    observationFocusMultiplier: settings.attention.focusMultiplier,
    observationDirectMultiplier: settings.attention.directAttentionMultiplier,
    observationPeripheralMultiplier: settings.attention.peripheralMultiplier,
    observationRearMultiplier: settings.attention.rearAwarenessMultiplier,
    stationaryTargetMultiplier: settings.attention.stationaryTargetDetectionMultiplier,
    movingTargetMultiplier: settings.attention.movingTargetDetectionMultiplier,
    observationScanSpeedMultiplier: settings.attention.scanSpeedMultiplier,
    stealthSkillShare: settings.visibility.usesStealthSkill ? settings.visibility.stealthSkillShare : 0,
  };
}

function emitMovementSounds(
  state: SimulationState,
  unit: UnitModel,
  profile: MovementProfile,
  materialFactors: MovementMaterialFactors,
  from: GridPosition,
  to: GridPosition,
  deltaSeconds: number,
): void {
  const runtime = unit.movementRuntime;
  const distanceCells = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceMeters = distanceCells * state.map.metersPerCell;
  if (distanceMeters <= 0) return;
  const interval = profile.settings.noise.eventSpacingMeters;
  let remaining = distanceMeters;
  let consumed = 0;
  let accumulator = runtime.distanceSinceSoundMeters;
  while (accumulator + remaining + 1e-9 >= interval) {
    const needed = interval - accumulator;
    consumed += needed;
    remaining -= needed;
    const fraction = clamp(consumed / distanceMeters, 0, 1);
    runtime.movementSequence += 1;
    runtime.emittedSoundCount += 1;
    const fatigue = clamp((100 - runtime.stamina) / 100, 0, 1);
    const noiseSurface = profile.settings.noise.surfacePolicy === 'material_profile_adapter' ? materialFactors.noiseMultiplier : 1;
    emitPerceptionSound(state, {
      id: `${unit.id}:movement:${runtime.movementSequence}`,
      kind: 'movement',
      sourceId: unit.id,
      labelRu: 'Шум движения бойца',
      position: { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction },
      loudness: profile.settings.noise.loudness
        * (1 + fatigue * profile.settings.noise.fatigueMultiplier)
        * noiseSurface
        * profile.settings.surface.materialNoiseMultiplier,
      createdSeconds: state.simulationTimeSeconds - deltaSeconds + deltaSeconds * fraction,
      durationSeconds: 1.2,
    });
    accumulator = 0;
  }
  runtime.distanceSinceSoundMeters = accumulator + Math.max(0, remaining);
}

function consumeMovementWeaponPreparation(unit: UnitModel, deltaSeconds: number): number {
  const pending = unit.movementRuntime.weaponPreparation;
  if (!pending || deltaSeconds <= 0) return 0;
  const blockedSeconds = Math.min(deltaSeconds, Math.max(0, pending.remainingSeconds));
  pending.remainingSeconds = Math.max(0, pending.remainingSeconds - blockedSeconds);
  if (pending.remainingSeconds <= 1e-9) {
    unit.movementRuntime.weaponPreparation = null;
  }
  return blockedSeconds;
}

function instantaneousStaminaSpeedMultiplier(profile: MovementProfile, stamina: number): number {
  const threshold = profile.settings.stamina.fallbackThreshold;
  const low = profile.settings.speed.lowStaminaSpeedMultiplier;
  if (threshold <= 0 || stamina >= threshold) return 1;
  return low + (1 - low) * clamp(stamina / threshold, 0, 1);
}

function averageStaminaSpeedMultiplier(profile: MovementProfile, start: number, end: number): number {
  if (Math.abs(start - end) <= 1e-12) return instantaneousStaminaSpeedMultiplier(profile, start);
  const threshold = profile.settings.stamina.fallbackThreshold;
  const low = profile.settings.speed.lowStaminaSpeedMultiplier;
  if (threshold <= 0) return 1;
  const primitive = (value: number): number => {
    const stamina = clamp(value, 0, 100);
    if (stamina >= threshold) {
      const below = low * threshold + (1 - low) * threshold / 2;
      return below + (stamina - threshold);
    }
    return low * stamina + (1 - low) * stamina * stamina / (2 * threshold);
  };
  return Math.abs(primitive(end) - primitive(start)) / Math.abs(end - start);
}

function recoverStamina(stamina: number, profile: MovementProfile, deltaSeconds: number, moving: boolean): number {
  const factor = moving ? 0.35 : 1;
  return clamp(stamina + profile.settings.stamina.recoveryPerSecond * factor * Math.max(0, deltaSeconds), 0, 100);
}

function slowerProfileId(gait: MovementGait): string {
  if (gait === 'sprint') return 'run';
  if (gait === 'run') return 'normal_walk';
  if (gait === 'walk') return 'crouched_move';
  if (gait === 'crouch_walk') return 'crawl';
  return profileIdForGait(gait);
}

function zeroStep(profile: MovementProfile, gait: MovementGait, stamina: number, materialFactors: MovementMaterialFactors): MovementStep {
  return {
    maxDistanceCells: 0,
    activeSeconds: 0,
    profile,
    gait,
    staminaStart: stamina,
    staminaEnd: stamina,
    speedCellsPerSecond: 0,
    materialFactors,
  };
}

function normalizeAuthoritySource(value: unknown, fallback: MovementProfileAuthoritySource): {
  source: MovementProfileAuthoritySource;
  migrationInfo: MovementProfileMigrationInfo | null;
} {
  if (value === 'hard_safety' || value === 'ai_override' || value === 'player_order' || value === 'unit_role' || value === 'default') {
    return { source: value, migrationInfo: null };
  }
  const migrated = value === 'ai' ? 'ai_override'
    : value === 'player' ? 'player_order'
      : value === 'unit' ? 'unit_role'
        : value === 'fallback' ? 'hard_safety'
          : value === 'migration' ? 'default'
            : fallback;
  return {
    source: migrated,
    migrationInfo: typeof value === 'string' && value !== migrated
      ? { fromProfileId: `source:${value}`, toProfileId: `source:${migrated}`, reason: 'legacy_source' }
      : null,
  };
}

function legacyRuntimeMigration(record: Record<string, any>): MovementProfileMigrationInfo | null {
  if (record.weaponStopRequested === true || typeof record.weaponReadyAtSeconds === 'number') {
    return { fromProfileId: 'weaponReadyAtSeconds', toProfileId: 'remaining_weapon_preparation', reason: 'runtime_normalization' };
  }
  return null;
}

function normalizeWeaponPreparation(value: unknown): MovementWeaponPreparationState | null {
  if (!isRecord(value)) return null;
  const ownerToken = string(value.ownerToken, '');
  const contactId = string(value.contactId, '');
  if (!ownerToken || !contactId) return null;
  return {
    ownerToken,
    contactId,
    orderIssuedAtMs: typeof value.orderIssuedAtMs === 'number' && Number.isFinite(value.orderIssuedAtMs) ? value.orderIssuedAtMs : null,
    remainingSeconds: finite(value.remainingSeconds, 0, 0, 60),
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeMigrationInfo(value: unknown): MovementProfileMigrationInfo | null {
  if (!isRecord(value)) return null;
  if (typeof value.fromProfileId !== 'string' || typeof value.toProfileId !== 'string') return null;
  const reason = value.reason === 'legacy_alias' || value.reason === 'legacy_source' || value.reason === 'runtime_normalization'
    ? value.reason
    : 'runtime_normalization';
  return { fromProfileId: value.fromProfileId, toProfileId: value.toProfileId, reason };
}

function forcedFallbackReason(value: unknown): MovementForcedFallbackReason | null {
  return value === 'missing_profile'
    || value === 'insufficient_stamina'
    || value === 'stamina_fallback'
    || value === 'wound_restriction'
    || value === 'suppression_restriction'
    || value === 'physical_capability'
    || value === 'minimum_speed'
    || value === 'impassable_material'
    || value === 'profile_stop'
    ? value
    : null;
}

function postureSpeedMultiplier(posture: UnitPosture): number {
  if (posture === 'prone') return 0.25;
  if (posture === 'crouched') return 0.65;
  return 1;
}

function postureOrNull(value: unknown): UnitPosture | null {
  return value === 'standing' || value === 'crouched' || value === 'prone' ? value : null;
}

function vector(value: unknown): GridPosition {
  if (!isRecord(value)) return { x: 0, y: 0 };
  return { x: finite(value.x, 0, -100, 100), y: finite(value.y, 0, -100, 100) };
}

function string(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(finite(value, fallback, min, max));
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
