import type { SimulationState } from '../../simulation/SimulationState';
import { COMBAT_LAB_METRIC_IDS } from './CombatLabContracts';

export interface CombatLabMetricCollectorV1 {
  readonly initialCommittedShots: number;
  readonly initialImpacts: number;
  readonly initialWoundImpactCount: number;
  readonly initialSuppressionEvents: number;
  readonly initialBloodLoss: number;
  readonly initialFirstAidStages: number;
  readonly initialOverflowCount: number;
  readonly initialResizeCount: number;
  maximumSuppression: number;
  maximumActionCompletionSeconds: number;
  maximumReloadCompletionSeconds: number;
  maximumDeployCompletionSeconds: number;
  transferRounds: number;
}

export function createCombatLabMetricCollector(state: SimulationState): CombatLabMetricCollectorV1 {
  return {
    initialCommittedShots: state.infantryCombatProjectiles.committedShots.length,
    initialImpacts: state.infantryCombatProjectiles.impacts.length,
    initialWoundImpactCount: woundImpactCount(state),
    initialSuppressionEvents: suppressionEventCount(state),
    initialBloodLoss: bloodLoss(state),
    initialFirstAidStages: firstAidStages(state),
    initialOverflowCount: overflowCount(state),
    initialResizeCount: resizeCount(state),
    maximumSuppression: maximumSuppression(state),
    maximumActionCompletionSeconds: 0,
    maximumReloadCompletionSeconds: 0,
    maximumDeployCompletionSeconds: 0,
    transferRounds: 0,
  };
}

export function observeCombatLabMetrics(state: SimulationState, collector: CombatLabMetricCollectorV1): void {
  collector.maximumSuppression = Math.max(collector.maximumSuppression, maximumSuppression(state));
  for (const unit of state.units) {
    const coordinatorResult = unit.behaviorRuntime.physicalActionCoordinator.lastResult;
    if (coordinatorResult) {
      collector.maximumActionCompletionSeconds = Math.max(
        collector.maximumActionCompletionSeconds,
        durationFrom(coordinatorResult),
      );
    }
    const ammoResult = unit.infantryCombatRuntime.ammoInventory.lastActionResult;
    if (ammoResult) {
      const record = ammoResult as unknown as Record<string, unknown>;
      const duration = durationFrom(record);
      const actionType = text(record.actionType, text(record.kind, ''));
      if (actionType.includes('reload') || text(record.actionId, '').includes('reload')) {
        collector.maximumReloadCompletionSeconds = Math.max(collector.maximumReloadCompletionSeconds, duration);
      }
      if (actionType.includes('transfer') || text(record.actionId, '').includes('transfer')) {
        collector.transferRounds = Math.max(collector.transferRounds, finite(record.roundsChanged));
      }
    }
    const deploymentResults = unit.infantryCombatRuntime.primaryWeapon?.deployment.actionResults ?? [];
    for (const result of deploymentResults) {
      collector.maximumDeployCompletionSeconds = Math.max(
        collector.maximumDeployCompletionSeconds,
        durationFrom(result as unknown as Record<string, unknown>),
      );
    }
  }
}

export function finalizeCombatLabMetrics(
  state: SimulationState,
  collector: CombatLabMetricCollectorV1,
): Record<string, number> {
  observeCombatLabMetrics(state, collector);
  const projectiles = state.infantryCombatProjectiles;
  const committedShots = projectiles.committedShots.slice(collector.initialCommittedShots);
  const impacts = projectiles.impacts.slice(collector.initialImpacts);
  const hitProjectileIds = new Set(impacts.filter((impact) => impact.hitType === 'unit').map((impact) => impact.projectileId));
  const terminatedProjectileIds = new Set(projectiles.terminations.map((termination) => termination.projectileId));
  const misses = committedShots.filter((shot) => terminatedProjectileIds.has(`${shot.shotId}:projectile`) && !hitProjectileIds.has(`${shot.shotId}:projectile`)).length;
  const metrics = Object.fromEntries(COMBAT_LAB_METRIC_IDS.map((id) => [id, 0])) as Record<string, number>;
  metrics.shotsCommitted = committedShots.length;
  metrics.roundsConsumed = committedShots.reduce((sum, shot) => sum + Math.max(0, shot.roundsBefore - shot.roundsAfter), 0);
  metrics.projectilesCreated = Math.max(0, projectiles.diagnostics.spawnCount - collector.initialCommittedShots);
  metrics.hits = hitProjectileIds.size;
  metrics.misses = Math.max(misses, metrics.shotsCommitted - metrics.hits - projectiles.activeProjectiles.length);
  metrics.bodyImpacts = impacts.filter((impact) => impact.hitType === 'unit').length;

  for (const unit of state.units) {
    for (const slot of unit.infantryCombatRuntime.wounds.slots) {
      const count = Math.max(1, slot.impactIds.length);
      metrics[`woundsByZone.${slot.zone}`] = (metrics[`woundsByZone.${slot.zone}`] ?? 0) + count;
      metrics[`woundsBySeverity.${slot.severity}`] = (metrics[`woundsBySeverity.${slot.severity}`] ?? 0) + count;
    }
  }
  metrics.suppressionEvents = Math.max(0, suppressionEventCount(state) - collector.initialSuppressionEvents);
  metrics.maximumSuppression = round(collector.maximumSuppression);
  metrics.actionCompletionSeconds = round(collector.maximumActionCompletionSeconds);
  metrics.reloadCompletionSeconds = round(collector.maximumReloadCompletionSeconds);
  metrics.deployCompletionSeconds = round(collector.maximumDeployCompletionSeconds);
  metrics.transferRounds = collector.transferRounds;
  metrics.bloodLost = round(Math.max(0, bloodLoss(state) - collector.initialBloodLoss));
  metrics.firstAidStagesCompleted = Math.max(0, firstAidStages(state) - collector.initialFirstAidStages);
  metrics.overflowCount = Math.max(0, overflowCount(state) - collector.initialOverflowCount);
  metrics.bufferResizeCount = Math.max(0, resizeCount(state) - collector.initialResizeCount);
  return metrics;
}

function woundImpactCount(state: SimulationState): number {
  return state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.wounds.slots.reduce((slotSum, slot) => slotSum + slot.impactIds.length, 0), 0);
}
function suppressionEventCount(state: SimulationState): number {
  return state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.suppression.appliedEventIds.length, 0);
}
function maximumSuppression(state: SimulationState): number {
  return state.units.reduce((maximum, unit) => Math.max(maximum, unit.infantryCombatRuntime.suppression.suppressionLevel), 0);
}
function bloodLoss(state: SimulationState): number {
  return state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.physiology.blood.bloodLoss, 0);
}
function firstAidStages(state: SimulationState): number {
  return state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.medical.appliedFirstAidActionIds.length, 0);
}
function overflowCount(state: SimulationState): number {
  const diagnostics = state.infantryCombatProjectiles.diagnostics;
  return diagnostics.eventOverflowCount + diagnostics.suppressionEventOverflowCount;
}
function resizeCount(state: SimulationState): number {
  return state.infantryCombatProjectiles.diagnostics.poolResizeCount;
}
function durationFrom(value: unknown): number {
  if (!isRecord(value)) return 0;
  const started = finite(value.startedSeconds ?? value.requestedSeconds);
  const ended = finite(value.endedSeconds ?? value.completedSeconds);
  return ended >= started ? ended - started : 0;
}
function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
