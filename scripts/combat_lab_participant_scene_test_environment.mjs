import assert from 'node:assert/strict';
import { loadTypescriptModule, makeSceneUnit } from './combat_lab_participant_test_support.mjs';

function emptyInfantryRuntime() {
  return {
    primaryWeapon: null,
    ammoInventory: { loadoutRef: null, reserves: [], revision: 0, activeReload: null, activeTransfer: null, appliedTransferIds: [] },
    medical: { firstAidCharges: 0, maximumFirstAidCharges: 0, activeFirstAidAction: null },
    wounds: { slots: [], appliedImpactIds: [] },
    physiology: {
      blood: {
        bloodLoss: 0,
        pendingBloodLoss: 0,
        currentBleedingRatePerSecond: 0,
        state: 'stable',
        lastAppliedDelta: 0,
        lastStateChangeSeconds: 0,
      },
      fatigue: { fatigue: 0 },
    },
    suppression: { level: 0 },
    activeFireTask: null,
  };
}

function normalizeUnits(records, scale = 1) {
  return records.map((record) => {
    const infantry = structuredClone(record.runtime?.infantryCombat ?? emptyInfantryRuntime());
    if (!infantry.ammoInventory) infantry.ammoInventory = emptyInfantryRuntime().ammoInventory;
    if (!infantry.medical) infantry.medical = emptyInfantryRuntime().medical;
    if (!infantry.wounds) infantry.wounds = emptyInfantryRuntime().wounds;
    if (!infantry.physiology) infantry.physiology = emptyInfantryRuntime().physiology;
    if (!infantry.suppression) infantry.suppression = emptyInfantryRuntime().suppression;
    return {
      id: record.id,
      labels: { en: record.label ?? record.id, ru: record.labelRu ?? record.label ?? record.id },
      type: record.type,
      side: record.side === 'red' ? 'red' : 'blue',
      aiControl: record.aiControl === 'manual' ? 'manual' : 'graph',
      position: { x: (record.x + 0.5) * scale, y: (record.y + 0.5) * scale },
      speedCellsPerSecond: (record.speedCellsPerSecond ?? 0.5) * scale,
      playerCommand: structuredClone(record.playerCommand ?? null),
      plan: record.plan ?? null,
      order: structuredClone(record.runtime?.moveOrder ?? null),
      heldItem: record.heldItem ?? 'long_item',
      facingRadians: ((record.facingDegrees ?? 0) * Math.PI) / 180,
      viewRangeCells: (record.viewRangeCells ?? 7) * scale,
      behaviorProfile: record.behaviorProfile ?? 'default',
      behaviorSettings: structuredClone(record.behavior ?? {}),
      behaviorRuntime: {
        posture: record.runtime?.posture ?? record.initialState?.posture ?? 'standing',
        previousPosture: record.runtime?.posture ?? record.initialState?.posture ?? 'standing',
        stress: record.runtime?.stress ?? 0,
        suppression: record.runtime?.suppression ?? 0,
        ammo: record.runtime?.ammo ?? 0,
        weaponReady: record.runtime?.weaponReady ?? false,
        physicalAction: structuredClone(record.runtime?.physicalAction ?? null),
        physicalActionCoordinator: structuredClone(record.runtime?.physicalActionCoordinator ?? { activeLeases: [] }),
        aiRuntimeSession: null,
        aiRouteStatusState: null,
      },
      soldier: {
        traits: structuredClone(record.soldier?.traits ?? {}),
        condition: { health: record.soldier?.condition?.health ?? record.initialState?.health ?? 100 },
      },
      attentionSettings: {
        defaultMode: 'observe',
        profiles: { observe: { directAngleDegrees: record.viewAngleDegrees ?? 90 } },
        vision: {},
        nearAwarenessRangeMeters: 1,
        nearMinimumVisibilityQuality: 0,
      },
      playerAttentionProfileId: null,
      tacticalPositionSettings: {},
      tacticalPositionSettingsRevision: 0,
      initialState: {
        posture: record.initialState?.posture ?? 'standing',
        stress: 0,
        suppression: 0,
        ammo: 0,
        weaponReady: false,
        fatigue: 0,
        morale: 100,
        confusion: 0,
        health: record.initialState?.health ?? 100,
      },
      tacticalKnowledge: {},
      perceptionKnowledge: {},
      movementRuntime: structuredClone(record.runtime?.movement ?? { isMoving: false, velocityCellsPerSecond: { x: 0, y: 0 }, weaponPreparation: null }),
      infantryCombatRuntime: infantry,
      unitRoleNavigationProfileId: null,
      playerNavigationProfileId: null,
      navigationMovementMode: null,
      activeNavigationProfileId: 'normal',
      activeNavigationProfileSource: 'default',
      unitRoleMovementProfileId: null,
    };
  });
}

const loadouts = new Map([
  ['published@1', { loadoutTemplateId: 'published', revision: 1, status: 'published', primary: { definition: { definitionId: 'rifle', revision: 1 }, loadedRounds: 5 }, reserveRoundsByAmmoDefinitionId: { ball: 20 }, maximumReserveRoundsByAmmoDefinitionId: { ball: 40 }, firstAidCharges: 2 }],
  ['alternate@1', { loadoutTemplateId: 'alternate', revision: 1, status: 'published', primary: { definition: { definitionId: 'smg', revision: 1 }, loadedRounds: 30 }, reserveRoundsByAmmoDefinitionId: { pistol: 60 }, maximumReserveRoundsByAmmoDefinitionId: { pistol: 90 }, firstAidCharges: 1 }],
  ['draft@1', { loadoutTemplateId: 'draft', revision: 1, status: 'draft', primary: { definition: { definitionId: 'rifle', revision: 1 }, loadedRounds: 5 }, reserveRoundsByAmmoDefinitionId: { ball: 20 }, maximumReserveRoundsByAmmoDefinitionId: { ball: 40 }, firstAidCharges: 1 }],
  ['archived@1', { loadoutTemplateId: 'archived', revision: 1, status: 'archived', primary: { definition: { definitionId: 'rifle', revision: 1 }, loadedRounds: 5 }, reserveRoundsByAmmoDefinitionId: { ball: 20 }, maximumReserveRoundsByAmmoDefinitionId: { ball: 40 }, firstAidCharges: 1 }],
]);
const weapons = {
  rifle: { weaponDefinitionId: 'rifle', revision: 1, status: 'published', nameRu: 'Винтовка', weaponClass: 'rifle', ammo: { definitionId: 'ball', revision: 1 }, capacityRounds: 5 },
  smg: { weaponDefinitionId: 'smg', revision: 1, status: 'published', nameRu: 'ППШ', weaponClass: 'submachine_gun', ammo: { definitionId: 'pistol', revision: 1 }, capacityRounds: 35 },
};
const ammo = {
  ball: { ammoDefinitionId: 'ball', revision: 1, status: 'published' },
  pistol: { ammoDefinitionId: 'pistol', revision: 1, status: 'published' },
};
const registry = {
  resolveLoadout: (ref) => {
    const value = loadouts.get(`${ref.definitionId}@${ref.revision}`);
    if (!value) throw new Error('missing');
    return value;
  },
  resolveWeapon: (ref) => weapons[ref.definitionId],
  resolveAmmo: (ref) => ammo[ref.definitionId],
};

function equipPrimaryWeaponFromLoadout(unit, selectedRegistry, ref) {
  const loadout = selectedRegistry.resolveLoadout(ref);
  const weapon = selectedRegistry.resolveWeapon(loadout.primary.definition);
  const ammunition = selectedRegistry.resolveAmmo(weapon.ammo);
  unit.infantryCombatRuntime.primaryWeapon = {
    weaponInstanceId: `${unit.id}:${weapon.weaponDefinitionId}`,
    roundsInWeapon: loadout.primary.loadedRounds,
    resolved: { weapon, ammo: ammunition, ammoDefinitionRef: weapon.ammo },
    operatorProfile: { shootingSkill: 0.5, proficiencyByWeaponClass: { [weapon.weaponClass]: 'trained' } },
    deployment: { activeAction: null },
  };
  unit.infantryCombatRuntime.ammoInventory = {
    loadoutRef: { definitionId: loadout.loadoutTemplateId, revision: loadout.revision },
    reserves: Object.entries(loadout.maximumReserveRoundsByAmmoDefinitionId).map(([ammoDefinitionId, maximumRounds]) => ({
      ammoDefinitionId,
      rounds: loadout.reserveRoundsByAmmoDefinitionId[ammoDefinitionId] ?? 0,
      maximumRounds,
    })),
    revision: 1,
    activeReload: null,
    activeTransfer: null,
    appliedTransferIds: [],
  };
  unit.infantryCombatRuntime.medical = {
    firstAidCharges: loadout.firstAidCharges,
    maximumFirstAidCharges: loadout.firstAidCharges,
    activeFirstAidAction: null,
  };
  return { ok: true };
}

function createUnitWoundRuntime() { return { slots: [], appliedImpactIds: [] }; }
function createUnitPhysiologyRuntime(seconds = 0) {
  return {
    blood: { bloodLoss: 0, pendingBloodLoss: 0, currentBleedingRatePerSecond: 0, state: 'stable', lastAppliedDelta: 0, lastStateChangeSeconds: seconds },
    fatigue: { fatigue: 0 },
  };
}
function aggregateWoundCandidate(runtime, candidate) {
  const next = structuredClone(runtime);
  const slot = next.slots.find((entry) => entry.zone === candidate.zone && entry.severity === candidate.severity);
  if (slot) slot.hitCount += 1;
  else next.slots.push({ zone: candidate.zone, severity: candidate.severity, hitCount: 1, bleedingRatePerSecond: candidate.bleedingRatePerSecond });
  return { runtime: next };
}
function totalWoundBleedingRatePerSecond(runtime) { return runtime.slots.reduce((sum, slot) => sum + (slot.bleedingRatePerSecond ?? 0) * slot.hitCount, 0); }
function deriveBloodState(loss) { return loss >= 0.9 ? 'dead' : loss >= 0.6 ? 'unconscious' : loss > 0 ? 'bleeding' : 'stable'; }
function applyInitialStateToRuntime(unit) {
  unit.playerCommand = null;
  unit.plan = null;
  unit.order = null;
  unit.behaviorRuntime.physicalAction = null;
  unit.behaviorRuntime.physicalActionCoordinator = { activeLeases: [] };
  unit.movementRuntime = { isMoving: false, velocityCellsPerSecond: { x: 0, y: 0 }, weaponPreparation: null };
  unit.infantryCombatRuntime = emptyInfantryRuntime();
}


const validationSupport = {
  asRecord: (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null,
  text: (value) => typeof value === 'string' ? value : '',
  finite: (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback,
  error: (code, messageRu, path) => ({ severity: 'error', code, messageRu, path }),
  warning: (code, messageRu, path) => ({ severity: 'warning', code, messageRu, path }),
  collectUniqueIds: (items, key, path, code, label, issues) => {
    const ids = new Set();
    items.forEach((item, index) => {
      const value = item?.[key];
      if (typeof value !== 'string' || !value || ids.has(value)) issues.push({ severity: 'error', code, messageRu: label, path: `${path}[${index}].${key}` });
      else ids.add(value);
    });
    return ids;
  },
  missingReference: (issues, code, messageRu, path) => issues.push({ severity: 'error', code, messageRu, path }),
  readSceneUnits: (experiment) => experiment.sceneSnapshot.units,
  validateFiniteRange: () => {},
  conditionsOfStep: () => [],
  detectDependencyCycles: () => {},
};
const validationRules = {
  isConditionInitiallyTrue: () => false,
  validateActionWarnings: () => {},
  validateBatchConfig: () => {},
  validateConditionReferences: () => {},
  validateMarkers: () => {},
  validateRepeat: () => {},
  validateSeed: () => {},
  validateStep: () => {},
  validateStopCondition: () => {},
};

const stubs = {
  '../../../units/UnitModel': {
    normalizeUnits,
    normalizeUnitSide: (side) => side === 'red' ? 'red' : 'blue',
    applyInitialStateToRuntime,
  },
  '../../../infantry-combat/catalogs/CombatCatalogRegistry': {
    CombatCatalogRegistry: class {},
    createDefaultCombatCatalogRegistry: () => registry,
  },
  '../../../infantry-combat/runtime': {
    aggregateWoundCandidate,
    createUnitPhysiologyRuntime,
    createUnitWoundRuntime,
    deriveBloodState,
    equipPrimaryWeaponFromLoadout,
    normalizeUnitPhysiologyRuntime: structuredClone,
    normalizeUnitSuppressionRuntime: structuredClone,
    normalizeUnitWoundRuntime: structuredClone,
    serializeUnitPhysiologyRuntime: structuredClone,
    serializeUnitSuppressionRuntime: structuredClone,
    serializeUnitWoundRuntime: structuredClone,
    serializeInfantryCombatUnitRuntime: structuredClone,
    totalWoundBleedingRatePerSecond,
  },
  '../../../ai/runtime/AiRuntimeSnapshot': { buildAiRuntimeSceneSnapshot: () => null, serializeMoveOrder: structuredClone },
  '../../../actions/PhysicalActionCoordinatorSerialization': { serializePhysicalActionCoordinatorState: structuredClone },
  '../../../actions/PostureTransition': { serializeUnitPhysicalAction: structuredClone },
  '../../../combat/CombatDamage': { getCombatRuntime: () => ({}) },
  '../../../combat/WeaponModel': { getWeaponRuntime: () => ({}) },
  '../../../movement/MovementRuntime': { serializeMovementRuntime: structuredClone },
  '../../../tactical/TacticalPositionSettings': { serializeTacticalPositionSettings: () => ({}) },
  './CombatLabExperimentValidation': { validateCombatLabExperiment: () => [] },
  './CombatLabExperimentValidationSupport': validationSupport,
  './CombatLabExperimentValidationRules': validationRules,
};

const initialRuntime = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabParticipantInitialRuntime.ts', stubs);
const scene = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabParticipantSceneRuntime.ts', stubs);
const removal = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabParticipantRemoval.ts', stubs);
const validationStubs = { ...stubs };
delete validationStubs['./CombatLabExperimentValidation'];
const validation = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts', validationStubs);
function assertValid(experiment, label) {
  const errors = validation.validateCombatLabExperiment(experiment).filter((issue) => issue.severity === 'error');
  assert.deepEqual(errors, [], `${label}: ${errors.map((issue) => `${issue.path}: ${issue.messageRu}`).join('; ')}`);
}


export { initialRuntime, scene, removal, registry, normalizeUnits, assertValid };
