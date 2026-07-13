import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, replacements) {
  let content = await readFile(path, 'utf8');
  let changed = false;
  for (const { label, from, to } of replacements) {
    if (content.includes(to)) continue;
    if (!content.includes(from)) throw new Error(`Missing patch anchor for ${label} in ${path}`);
    content = content.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, content, 'utf8');
  return changed;
}

const perceptionChanged = await patch('src/core/perception/PerceptionSystem.ts', [
  {
    label: 'preserve contact between scheduled checks',
    from: `    if (!due[attention.zone]) {
      if (diagnostics) diagnostics.skippedNotDueCount += 1;
      continue;
    }`,
    to: `    if (!due[attention.zone]) {
      if (diagnostics) diagnostics.skippedNotDueCount += 1;
      const existingContactId = contactIdForStimulus(stimulus.id);
      if (unit.perceptionKnowledge.contacts.some((item) => item.id === existingContactId)) {
        updatedContacts.add(existingContactId);
      }
      continue;
    }`,
  },
]);

const unitModelChanged = await patch('src/core/units/UnitModel.ts', [
  {
    label: 'restore incapacitation after active AI order',
    from: `    applyInitialStateToRuntime(model, false);
    if (unit.runtime?.weapon) replaceWeaponRuntime(model, unit.runtime.weapon);
    if (unit.runtime?.combat) replaceCombatRuntime(model, unit.runtime.combat);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);`,
    to: `    applyInitialStateToRuntime(model, false);
    if (unit.runtime?.weapon) replaceWeaponRuntime(model, unit.runtime.weapon);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);
    if (unit.runtime?.combat) replaceCombatRuntime(model, unit.runtime.combat);`,
  },
]);

const damageChanged = await patch('src/core/combat/CombatDamage.ts', [
  {
    label: 'health zero incapacitates',
    from: `  const capability = resolveCapability(previousCapability, input.zone, roll, energyFactor);
  const healthLoss = resolveHealthLoss(input.zone, energyFactor, roll);
  unit.soldier.condition.health = Math.max(0, Math.round(unit.soldier.condition.health - healthLoss));
  if (capability === 'dead') unit.soldier.condition.health = 0;
  runtime.capability = capability;`,
    to: `  let capability = resolveCapability(previousCapability, input.zone, roll, energyFactor);
  const healthLoss = resolveHealthLoss(input.zone, energyFactor, roll);
  unit.soldier.condition.health = Math.max(0, Math.round(unit.soldier.condition.health - healthLoss));
  if (capability === 'dead') unit.soldier.condition.health = 0;
  if (unit.soldier.condition.health <= 0 && capability !== 'dead' && capability !== 'incapacitated') {
    capability = 'incapacitated';
  }
  runtime.capability = capability;`,
  },
]);

const decisionChanged = await patch('src/core/combat/CombatDecision.ts', [
  {
    label: 'contact ranking import',
    from: `import type { PerceptionContactMemory } from '../perception/PerceptionContact';`,
    to: `import { contactStageRank, type PerceptionContactMemory } from '../perception/PerceptionContact';`,
  },
  {
    label: 'smooth terrain import',
    from: `import type { SimulationState } from '../simulation/SimulationState';`,
    to: `import type { SimulationState } from '../simulation/SimulationState';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';`,
  },
  {
    label: 'best direct fire contact',
    from: `export function evaluateFireRequest(
  state: SimulationState,`,
    to: `export function findBestDirectFireContact(
  state: SimulationState,
  shooter: UnitModel,
): PerceptionContactMemory | null {
  return shooter.perceptionKnowledge.contacts
    .filter((contact) => {
      if (!contact.sourceUnitId || !contact.visibleNow) return false;
      if (contact.stage !== 'identified' && contact.stage !== 'confirmed') return false;
      const target = state.units.find((unit) => unit.id === contact.sourceUnitId);
      return Boolean(target && areUnitsHostile(shooter, target) && isUnitCombatCapable(target));
    })
    .sort((left, right) => (
      contactStageRank(right.stage) - contactStageRank(left.stage)
      || right.confidence - left.confidence
      || right.lastUpdatedSeconds - left.lastUpdatedSeconds
    ))[0] ?? null;
}

export function evaluateFireRequest(
  state: SimulationState,`,
  },
  {
    label: 'smooth muzzle ground',
    from: `function getGroundHeightMetres(state: SimulationState, position: GridPosition): number {
  const cell = state.map.cells[Math.floor(position.y) * state.map.width + Math.floor(position.x)];
  return (cell?.height ?? 0) * 2;
}`,
    to: `function getGroundHeightMetres(state: SimulationState, position: GridPosition): number {
  return sampleSmoothHeightLevel(state.map, position.x, position.y) * 2;
}`,
  },
]);

const aiBridgeChanged = await patch('src/core/ai/AiGameBridge.ts', [
  {
    label: 'direct fire contact import',
    from: `import { requestFireAction } from '../combat/FireAction';`,
    to: `import { findBestDirectFireContact } from '../combat/CombatDecision';
import { requestFireAction } from '../combat/FireAction';`,
  },
  {
    label: 'AI direct fire target selection',
    from: `    const contact = getBestPerceptionContact(unit);
    if (contact) requestFireAction(state, unit, contact.id);`,
    to: `    const contact = findBestDirectFireContact(state, unit);
    if (contact) requestFireAction(state, unit, contact.id);`,
  },
]);

const workspaceChanged = await patch('src/ui/TacticalWorkspace.ts', [
  {
    label: 'workspace direct fire contact import',
    from: `import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getFireAction, requestFireAction } from '../core/combat/FireAction';
import { getBestPerceptionContact } from '../core/perception/PerceptionSystem';`,
    to: `import { getCombatRuntime } from '../core/combat/CombatDamage';
import { findBestDirectFireContact } from '../core/combat/CombatDecision';
import { getFireAction, requestFireAction } from '../core/combat/FireAction';`,
  },
  {
    label: 'manual direct fire target selection',
    from: `    const contact = unit ? getBestPerceptionContact(unit) : null;`,
    to: `    const contact = unit ? findBestDirectFireContact(state, unit) : null;`,
  },
  {
    label: 'manual fire button target selection',
    from: `    const bestFireContact = unit ? getBestPerceptionContact(unit) : null;`,
    to: `    const bestFireContact = unit ? findBestDirectFireContact(state, unit) : null;`,
  },
]);

const smokeChanged = await patch('scripts/combat_foundation_smoke.ts', [
  {
    label: 'remove direct fire tick import',
    from: `import {
  getFireAction,
  requestFireAction,
  tickFireAction,
} from '../src/core/combat/FireAction';`,
    to: `import {
  getFireAction,
  requestFireAction,
} from '../src/core/combat/FireAction';`,
  },
  {
    label: 'simulation tick import',
    from: `import { createInitialState } from '../src/core/simulation/SimulationState';`,
    to: `import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';`,
  },
  {
    label: 'stateful fire real simulation loop',
    from: `    state.simulationTimeSeconds += 0.05;
    tickFireAction(state, blue, 0.05);`,
    to: `    tickSimulation(state, 0.05);`,
  },
]);

console.log(JSON.stringify({ perceptionChanged, unitModelChanged, damageChanged, decisionChanged, aiBridgeChanged, workspaceChanged, smokeChanged }));
