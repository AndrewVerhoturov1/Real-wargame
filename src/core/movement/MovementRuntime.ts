import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';
import { emitPerceptionSound } from '../perception/PerceptionSound';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  isMovementGait,
  resolveMovementProfile,
  type MovementGait,
  type MovementProfile,
  type MovementProfileSource,
} from './MovementProfiles';

export interface MovementRuntimeDiagnostics {
  speedCellsPerSecond: number;
  baseSpeedCellsPerSecond: number;
  gaitMultiplier: number;
  profileMultiplier: number;
  postureMultiplier: number;
  abilityMultiplier: number;
  woundMultiplier: number;
  staminaMultiplier: number;
  surfaceMultiplier: number;
  noiseLoudness: number;
  visualMovementMultiplier: number;
  lateralVisibility: number;
  observationFocusMultiplier: number;
  observationDirectMultiplier: number;
  observationPeripheralMultiplier: number;
  observationRearMultiplier: number;
  stationaryTargetMultiplier: number;
  movingTargetMultiplier: number;
  stealthSkillShare: number;
}

export interface MovementRuntimeState {
  requestedProfileId: string;
  effectiveProfileId: string;
  requestedProfileSource: MovementProfileSource;
  effectiveProfileSource: MovementProfileSource;
  requestedGait: MovementGait;
  actualGait: MovementGait;
  stamina: number;
  forcedFallbackReason: string | null;
  distanceSinceSoundMeters: number;
  emittedSoundCount: number;
  movementSequence: number;
  isMoving: boolean;
  startElapsedSeconds: number;
  stopElapsedSeconds: number;
  lastMovementPosture: UnitPosture | null;
  weaponStopRequested: boolean;
  weaponReadyAtSeconds: number | null;
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
}

interface GaitDefinition {
  speedMultiplier: number;
  posture: UnitPosture;
  postureRequired: boolean;
  staminaDrainPerSecond: number;
  readyDelayAfterStopSeconds: number;
  observation: MovementProfile['observation'];
}

const NEUTRAL_GAIT_OBSERVATION: MovementProfile['observation'] = {
  focusMultiplier: 1,
  directMultiplier: 1,
  peripheralMultiplier: 1,
  rearMultiplier: 1,
  stationaryTargetMultiplier: 1,
  movingTargetMultiplier: 1,
};

const RUN_GAIT_OBSERVATION: MovementProfile['observation'] = {
  focusMultiplier: 0.7,
  directMultiplier: 0.62,
  peripheralMultiplier: 0.48,
  rearMultiplier: 0.38,
  stationaryTargetMultiplier: 0.64,
  movingTargetMultiplier: 0.8,
};

const SPRINT_GAIT_OBSERVATION: MovementProfile['observation'] = {
  focusMultiplier: 0.5,
  directMultiplier: 0.42,
  peripheralMultiplier: 0.3,
  rearMultiplier: 0.22,
  stationaryTargetMultiplier: 0.45,
  movingTargetMultiplier: 0.65,
};

const GAITS: Record<MovementGait, GaitDefinition> = {
  crawl: { speedMultiplier: 0.7, posture: 'prone', postureRequired: true, staminaDrainPerSecond: 0, readyDelayAfterStopSeconds: 0.05, observation: NEUTRAL_GAIT_OBSERVATION },
  crouch_walk: { speedMultiplier: 0.9, posture: 'crouched', postureRequired: true, staminaDrainPerSecond: 0, readyDelayAfterStopSeconds: 0.08, observation: NEUTRAL_GAIT_OBSERVATION },
  walk: { speedMultiplier: 1, posture: 'standing', postureRequired: false, staminaDrainPerSecond: 0, readyDelayAfterStopSeconds: 0.1, observation: NEUTRAL_GAIT_OBSERVATION },
  run: { speedMultiplier: 1.65, posture: 'standing', postureRequired: false, staminaDrainPerSecond: 10, readyDelayAfterStopSeconds: 0.35, observation: RUN_GAIT_OBSERVATION },
  sprint: { speedMultiplier: 2.15, posture: 'standing', postureRequired: true, staminaDrainPerSecond: 22, readyDelayAfterStopSeconds: 0.75, observation: SPRINT_GAIT_OBSERVATION },
};

export function createMovementRuntime(
  requestedProfileId = DEFAULT_MOVEMENT_PROFILE_ID,
  requestedGait: MovementGait = 'walk',
  input?: unknown,
): MovementRuntimeState {
  const record = isRecord(input) ? input : {};
  const diagnostics = isRecord(record.diagnostics) ? record.diagnostics : {};
  const effectiveProfileId = string(record.effectiveProfileId, requestedProfileId);
  const source = movementSource(record.effectiveProfileSource, input === undefined ? 'default' : 'migration');
  return {
    requestedProfileId: string(record.requestedProfileId, requestedProfileId),
    effectiveProfileId,
    requestedProfileSource: movementSource(record.requestedProfileSource, source),
    effectiveProfileSource: source,
    requestedGait: isMovementGait(record.requestedGait) ? record.requestedGait : requestedGait,
    actualGait: isMovementGait(record.actualGait) ? record.actualGait : requestedGait,
    stamina: finite(record.stamina, 100, 0, 100),
    forcedFallbackReason: typeof record.forcedFallbackReason === 'string' ? record.forcedFallbackReason : null,
    distanceSinceSoundMeters: finite(record.distanceSinceSoundMeters, 0, 0, 1_000_000),
    emittedSoundCount: Math.max(0, Math.floor(finite(record.emittedSoundCount, 0, 0, 1_000_000_000))),
    movementSequence: Math.max(0, Math.floor(finite(record.movementSequence, 0, 0, 1_000_000_000))),
    isMoving: record.isMoving === true,
    startElapsedSeconds: finite(record.startElapsedSeconds, 0, 0, 60),
    stopElapsedSeconds: finite(record.stopElapsedSeconds, 0, 0, 60),
    lastMovementPosture: postureOrNull(record.lastMovementPosture),
    weaponStopRequested: record.weaponStopRequested === true,
    weaponReadyAtSeconds: typeof record.weaponReadyAtSeconds === 'number' && Number.isFinite(record.weaponReadyAtSeconds)
      ? Math.max(0, record.weaponReadyAtSeconds)
      : null,
    velocityCellsPerSecond: vector(record.velocityCellsPerSecond),
    diagnostics: {
      speedCellsPerSecond: finite(diagnostics.speedCellsPerSecond, 0, 0, 100),
      baseSpeedCellsPerSecond: finite(diagnostics.baseSpeedCellsPerSecond, 0, 0, 100),
      gaitMultiplier: finite(diagnostics.gaitMultiplier, 1, 0, 10),
      profileMultiplier: finite(diagnostics.profileMultiplier, 1, 0, 10),
      postureMultiplier: finite(diagnostics.postureMultiplier, 1, 0, 10),
      abilityMultiplier: finite(diagnostics.abilityMultiplier, 1, 0, 10),
      woundMultiplier: finite(diagnostics.woundMultiplier, 1, 0, 10),
      staminaMultiplier: finite(diagnostics.staminaMultiplier, 1, 0, 10),
      surfaceMultiplier: finite(diagnostics.surfaceMultiplier, 1, 0, 10),
      noiseLoudness: finite(diagnostics.noiseLoudness, 0, 0, 2),
      visualMovementMultiplier: finite(diagnostics.visualMovementMultiplier, 1, 0, 4),
      lateralVisibility: finite(diagnostics.lateralVisibility, 0, 0, 4),
      observationFocusMultiplier: finite(diagnostics.observationFocusMultiplier, 1, 0, 4),
      observationDirectMultiplier: finite(diagnostics.observationDirectMultiplier, 1, 0, 4),
      observationPeripheralMultiplier: finite(diagnostics.observationPeripheralMultiplier, 1, 0, 4),
      observationRearMultiplier: finite(diagnostics.observationRearMultiplier, 1, 0, 4),
      stationaryTargetMultiplier: finite(diagnostics.stationaryTargetMultiplier, 1, 0, 4),
      movingTargetMultiplier: finite(diagnostics.movingTargetMultiplier, 1, 0, 4),
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
  const profile = resolveMovementProfile(state.movementProfiles, profileId);
  setMovementRequest(unit, profile.id, source, gait ?? profile.defaultGait);
}

export function setMovementRequest(
  unit: UnitModel,
  profileId: string,
  source: MovementProfileSource,
  gait?: MovementGait,
): void {
  unit.movementRuntime.requestedProfileId = profileId || DEFAULT_MOVEMENT_PROFILE_ID;
  unit.movementRuntime.requestedProfileSource = source;
  unit.movementRuntime.effectiveProfileSource = source;
  if (gait) unit.movementRuntime.requestedGait = gait;
  unit.movementRuntime.startElapsedSeconds = 0;
  unit.movementRuntime.forcedFallbackReason = null;
}

export function preparePhysicalMovementStep(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
  canTranslate: boolean,
  postureMultiplier: number,
  woundMultiplier: number,
): MovementStep {
  const runtime = unit.movementRuntime;
  const profile = resolveMovementProfile(state.movementProfiles, runtime.requestedProfileId);
  const requestedGait = runtime.requestedGait;
  const missingProfile = profile.id !== runtime.requestedProfileId;
  let gait = missingProfile ? profile.defaultGait : requestedGait;
  let fallbackReason: string | null = missingProfile ? 'missing_profile' : null;
  const physicalCapability = Math.max(0, Math.min(1, unit.soldier.condition.speed / 100));
  const wounded = unit.soldier.condition.health < 55;
  const suppressed = unit.behaviorRuntime.suppression >= 55;

  if ((wounded && !profile.restrictions.allowedWhenWounded)
    || (suppressed && !profile.restrictions.allowedWhenSuppressed)
    || physicalCapability < profile.restrictions.minimumPhysicalCapability) {
    gait = profile.restrictions.safeFallbackGait;
    fallbackReason = wounded ? 'wounded_restriction' : suppressed ? 'suppression_restriction' : 'physical_capability';
  }

  const strenuousRequested = requestedGait === 'run' || requestedGait === 'sprint';
  const continuingRequested = runtime.isMoving
    && runtime.actualGait === requestedGait
    && runtime.forcedFallbackReason === null;
  const requiredStamina = continuingRequested
    ? profile.stamina.downgradeThreshold
    : profile.stamina.minimumToStart;
  if (fallbackReason === null && strenuousRequested && runtime.stamina + 1e-9 < requiredStamina) {
    gait = profile.stamina.fallbackGait;
    fallbackReason = continuingRequested ? 'stamina_downgrade' : 'insufficient_stamina';
  }

  runtime.effectiveProfileId = profile.id;
  runtime.effectiveProfileSource = fallbackReason ? 'fallback' : runtime.requestedProfileSource;
  runtime.forcedFallbackReason = fallbackReason;
  runtime.actualGait = gait;
  const movementOwnsPosture = canTranslate || runtime.isMoving;
  if (movementOwnsPosture) applyMovementPosture(unit, profile, gait);
  postureMultiplier = postureSpeedMultiplier(unit.behaviorRuntime.posture);

  const surfaceMultiplier = resolvePhysicalSurfaceMultiplier(state, unit.position);
  const gaitDefinition = GAITS[gait];
  const shouldMove = canTranslate && !runtime.weaponStopRequested && surfaceMultiplier > 0;
  if (!shouldMove || deltaSeconds <= 0) {
    runtime.isMoving = false;
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
    runtime.stopElapsedSeconds += Math.max(0, deltaSeconds);
    runtime.startElapsedSeconds = 0;
    runtime.stamina = Math.min(100, runtime.stamina + profile.stamina.recoveryPerSecond * Math.max(0, deltaSeconds));
    publishDiagnostics(runtime, unit, profile, gaitDefinition, postureMultiplier, woundMultiplier, surfaceMultiplier, 0, runtime.stamina);
    return {
      maxDistanceCells: 0,
      activeSeconds: 0,
      profile,
      gait,
      staminaStart: runtime.stamina,
      staminaEnd: runtime.stamina,
      speedCellsPerSecond: 0,
    };
  }

  const previousStart = runtime.startElapsedSeconds;
  runtime.startElapsedSeconds += deltaSeconds;
  runtime.stopElapsedSeconds = 0;
  const activeSeconds = Math.max(0, runtime.startElapsedSeconds - Math.max(previousStart, profile.movement.startSeconds));
  if (activeSeconds <= 0) {
    runtime.isMoving = false;
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
    publishDiagnostics(runtime, unit, profile, gaitDefinition, postureMultiplier, woundMultiplier, surfaceMultiplier, 0, runtime.stamina);
    return {
      maxDistanceCells: 0,
      activeSeconds: 0,
      profile,
      gait,
      staminaStart: runtime.stamina,
      staminaEnd: runtime.stamina,
      speedCellsPerSecond: 0,
    };
  }

  const staminaStart = runtime.stamina;
  const segments: Array<{ gait: MovementGait; seconds: number }> = [];
  const initialDrain = GAITS[gait].staminaDrainPerSecond * profile.stamina.drainMultiplier;
  const crossesDowngrade = fallbackReason === null
    && (gait === 'run' || gait === 'sprint')
    && initialDrain > 0
    && staminaStart > profile.stamina.downgradeThreshold
    && staminaStart - initialDrain * activeSeconds < profile.stamina.downgradeThreshold;

  if (crossesDowngrade) {
    const requestedSeconds = clamp(
      (staminaStart - profile.stamina.downgradeThreshold) / initialDrain,
      0,
      activeSeconds,
    );
    if (requestedSeconds > 0) segments.push({ gait, seconds: requestedSeconds });
    const fallbackSeconds = activeSeconds - requestedSeconds;
    gait = profile.stamina.fallbackGait;
    if (fallbackSeconds > 0) segments.push({ gait, seconds: fallbackSeconds });
    fallbackReason = 'stamina_downgrade';
    runtime.effectiveProfileSource = 'fallback';
    runtime.forcedFallbackReason = fallbackReason;
    runtime.actualGait = gait;
    if (movementOwnsPosture) applyMovementPosture(unit, profile, gait);
  } else {
    segments.push({ gait, seconds: activeSeconds });
  }

  let staminaCursor = staminaStart;
  let maxDistanceCells = 0;
  let weightedStamina = 0;
  for (const segment of segments) {
    const result = evaluateMovementSegment(
      unit,
      profile,
      segment.gait,
      segment.seconds,
      staminaCursor,
      physicalCapability,
      woundMultiplier,
      surfaceMultiplier,
    );
    staminaCursor = result.staminaEnd;
    maxDistanceCells += result.distanceCells;
    weightedStamina += result.averageStamina * segment.seconds;
  }
  const staminaEnd = staminaCursor;
  const averageStamina = activeSeconds > 0 ? weightedStamina / activeSeconds : staminaStart;
  const averageSpeed = activeSeconds > 0 ? maxDistanceCells / activeSeconds : 0;
  const finalDefinition = GAITS[gait];
  const finalPostureMultiplier = postureSpeedMultiplier(unit.behaviorRuntime.posture);
  publishDiagnostics(
    runtime,
    unit,
    profile,
    finalDefinition,
    finalPostureMultiplier,
    woundMultiplier,
    surfaceMultiplier,
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
    emitMovementSounds(state, unit, step.profile, from, to, deltaSeconds);
  } else {
    runtime.velocityCellsPerSecond = { x: 0, y: 0 };
  }
}

export function requestMovementWeaponPreparation(
  state: SimulationState,
  unit: UnitModel,
): { allowed: boolean; reasonRu: string } {
  const runtime = unit.movementRuntime;
  const profile = resolveMovementProfile(state.movementProfiles, runtime.effectiveProfileId || runtime.requestedProfileId);
  if (runtime.isMoving && profile.weapon.allowFireWhileMoving) return { allowed: true, reasonRu: '' };
  if (runtime.isMoving || runtime.weaponStopRequested) {
    if (!runtime.weaponStopRequested) {
      const gaitDelay = GAITS[runtime.actualGait].readyDelayAfterStopSeconds;
      runtime.weaponStopRequested = true;
      runtime.weaponReadyAtSeconds = state.simulationTimeSeconds
        + profile.movement.stopSeconds
        + Math.max(profile.weapon.readyDelayAfterStopSeconds, gaitDelay);
    }
    if (state.simulationTimeSeconds + 1e-9 < (runtime.weaponReadyAtSeconds ?? 0)) {
      return { allowed: false, reasonRu: 'Боец останавливается и подготавливает оружие после движения.' };
    }
    runtime.weaponStopRequested = false;
    runtime.weaponReadyAtSeconds = null;
  }
  return { allowed: true, reasonRu: '' };
}

export function getMovementAimPreparationMultiplier(state: SimulationState, unit: UnitModel): number {
  const profile = resolveMovementProfile(state.movementProfiles, unit.movementRuntime.effectiveProfileId || unit.movementRuntime.requestedProfileId);
  return Math.max(0.25, profile.weapon.aimPreparationMultiplier);
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
  return JSON.parse(JSON.stringify(runtime)) as MovementRuntimeState;
}

function evaluateMovementSegment(
  unit: UnitModel,
  profile: MovementProfile,
  gait: MovementGait,
  seconds: number,
  staminaStart: number,
  physicalCapability: number,
  woundMultiplier: number,
  surfaceMultiplier: number,
): { distanceCells: number; staminaEnd: number; averageStamina: number } {
  const definition = GAITS[gait];
  const drainRate = definition.staminaDrainPerSecond * profile.stamina.drainMultiplier;
  const recoveryRate = drainRate <= 0 ? profile.stamina.recoveryPerSecond * 0.35 : 0;
  const staminaEnd = clamp(staminaStart + (recoveryRate - drainRate) * seconds, 0, 100);
  const averageStamina = (staminaStart + staminaEnd) / 2;
  const staminaMultiplier = 0.82 + averageStamina * 0.0018;
  const abilityMultiplier = Math.max(0.35, physicalCapability);
  const posture = definition.postureRequired ? definition.posture : unit.behaviorRuntime.posture;
  const speed = unit.speedCellsPerSecond
    * definition.speedMultiplier
    * profile.movement.speedMultiplier
    * postureSpeedMultiplier(posture)
    * abilityMultiplier
    * woundMultiplier
    * staminaMultiplier
    * surfaceMultiplier;
  return { distanceCells: Math.max(0, speed * seconds), staminaEnd, averageStamina };
}

function applyMovementPosture(unit: UnitModel, profile: MovementProfile, gait: MovementGait): void {
  const runtime = unit.movementRuntime;
  const gaitDefinition = GAITS[gait];
  const desired = gaitDefinition.postureRequired ? gaitDefinition.posture : profile.movement.preferredPosture;
  const required = gaitDefinition.postureRequired || profile.movement.postureRequired;
  if (!profile.movement.autoPosture) return;
  const externallyChanged = runtime.lastMovementPosture !== null
    && unit.behaviorRuntime.posture !== runtime.lastMovementPosture;
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
  gait: GaitDefinition,
  postureMultiplier: number,
  woundMultiplier: number,
  surfaceMultiplier: number,
  speed: number,
  stamina: number,
): void {
  const ability = Math.max(0.35, unit.soldier.condition.speed / 100);
  runtime.diagnostics = {
    speedCellsPerSecond: speed,
    baseSpeedCellsPerSecond: unit.speedCellsPerSecond,
    gaitMultiplier: gait.speedMultiplier,
    profileMultiplier: profile.movement.speedMultiplier,
    postureMultiplier,
    abilityMultiplier: ability,
    woundMultiplier,
    staminaMultiplier: 0.82 + stamina * 0.0018,
    surfaceMultiplier,
    noiseLoudness: profile.signature.soundLoudness,
    visualMovementMultiplier: profile.signature.visualMovementMultiplier,
    lateralVisibility: profile.signature.lateralVisibilityMultiplier,
    observationFocusMultiplier: profile.observation.focusMultiplier * gait.observation.focusMultiplier,
    observationDirectMultiplier: profile.observation.directMultiplier * gait.observation.directMultiplier,
    observationPeripheralMultiplier: profile.observation.peripheralMultiplier * gait.observation.peripheralMultiplier,
    observationRearMultiplier: profile.observation.rearMultiplier * gait.observation.rearMultiplier,
    stationaryTargetMultiplier: profile.observation.stationaryTargetMultiplier * gait.observation.stationaryTargetMultiplier,
    movingTargetMultiplier: profile.observation.movingTargetMultiplier * gait.observation.movingTargetMultiplier,
    stealthSkillShare: profile.signature.stealthSkillShare,
  };
}

function emitMovementSounds(
  state: SimulationState,
  unit: UnitModel,
  profile: MovementProfile,
  from: GridPosition,
  to: GridPosition,
  deltaSeconds: number,
): void {
  const runtime = unit.movementRuntime;
  const distanceCells = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceMeters = distanceCells * state.map.metersPerCell;
  if (distanceMeters <= 0) return;
  const interval = profile.signature.soundIntervalMeters;
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
    emitPerceptionSound(state, {
      id: `${unit.id}:movement:${runtime.movementSequence}`,
      kind: 'movement',
      sourceId: unit.id,
      labelRu: 'Шум движения бойца',
      position: { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction },
      loudness: profile.signature.soundLoudness,
      createdSeconds: state.simulationTimeSeconds - deltaSeconds + deltaSeconds * fraction,
      durationSeconds: 1.2,
    });
    accumulator = 0;
  }
  runtime.distanceSinceSoundMeters = accumulator + Math.max(0, remaining);
}

function resolvePhysicalSurfaceMultiplier(state: SimulationState, position: GridPosition): number {
  const cell = getCell(state.map, Math.floor(position.x), Math.floor(position.y));
  if (!cell) return 0;
  const terrain = cell.terrain === 'road' ? 1.08
    : cell.terrain === 'rough' ? 0.78
      : cell.terrain === 'swamp' ? 0.55
        : cell.terrain === 'water' ? 0
          : 1;
  const vegetation = 1 / Math.max(1, resolveCellVegetationDefinition(cell).movement.baseResistance);
  return clamp(terrain * vegetation, 0, 1.2);
}

function postureSpeedMultiplier(posture: UnitPosture): number {
  if (posture === 'prone') return 0.25;
  if (posture === 'crouched') return 0.65;
  return 1;
}

function movementSource(value: unknown, fallback: MovementProfileSource): MovementProfileSource {
  return value === 'default' || value === 'unit' || value === 'player' || value === 'ai' || value === 'fallback' || value === 'migration'
    ? value
    : fallback;
}

function postureOrNull(value: unknown): UnitPosture | null {
  return value === 'standing' || value === 'crouched' || value === 'prone' ? value : null;
}

function vector(value: unknown): GridPosition {
  if (!isRecord(value)) return { x: 0, y: 0 };
  return { x: finite(value.x, 0, -100, 100), y: finite(value.y, 0, -100, 100) };
}

function string(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
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
