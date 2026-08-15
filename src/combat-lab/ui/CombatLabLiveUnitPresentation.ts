import { isPhysicalActionChannelAvailable } from '../../core/actions/PhysicalActionCoordinator';
import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import { getEffectiveCombatCapabilities } from '../../core/infantry-combat/runtime';
import type { UnitModel } from '../../core/units/UnitModel';
import {
  resolveCombatLabSelectedUnitProfileLinks,
  type CombatLabSourceProfileLink,
} from '../game-editors/CombatLabGameEditorLinks';

export type CombatLabLiveUnitCurrentActionKind =
  | 'dead'
  | 'unconscious'
  | 'posture_transition'
  | 'first_aid'
  | 'reload'
  | 'ammo_transfer'
  | 'deploy'
  | 'undeploy'
  | 'fire'
  | 'move'
  | 'runtime'
  | 'waiting';

export interface CombatLabLiveUnitCurrentActionV1 {
  readonly kind: CombatLabLiveUnitCurrentActionKind;
  readonly labelRu: string;
  readonly detailRu: string | null;
}

export type CombatLabWeaponReadinessKind =
  | 'ready'
  | 'no_weapon'
  | 'empty'
  | 'reloading'
  | 'deploying'
  | 'undeploying'
  | 'engaged'
  | 'action_locked'
  | 'incapable';

export interface CombatLabWeaponReadinessV1 {
  readonly kind: CombatLabWeaponReadinessKind;
  readonly labelRu: string;
  readonly reasonRu: string;
}

export interface CombatLabLiveUnitWeaponV1 {
  readonly weaponLabelRu: string;
  readonly weaponDefinitionId: string;
  readonly roundsLoaded: number;
  readonly roundsReserve: number;
  readonly deploymentMode: string;
}

export interface CombatLabLiveUnitWoundV1 {
  readonly zone: string;
  readonly zoneLabelRu: string;
  readonly severity: string;
  readonly severityLabelRu: string;
  readonly bleedingState: string;
  readonly bleedingLabelRu: string;
  readonly hitCount: number;
}

export interface CombatLabLiveUnitSnapshotV1 {
  readonly unitId: string;
  readonly labelRu: string;
  readonly sideLabelRu: string;
  readonly typeLabelRu: string;
  readonly roleLabelRu: string | null;
  readonly archetypeId: string | null;
  readonly capabilityLabelRu: string;
  readonly alive: boolean;
  readonly conscious: boolean;
  readonly health: number;
  readonly morale: number;
  readonly suppression: number;
  readonly fatigue: number;
  readonly stress: number;
  readonly posture: UnitPosture;
  readonly postureLabelRu: string;
  readonly playerOrderLabelRu: string;
  readonly currentAction: CombatLabLiveUnitCurrentActionV1;
  readonly weapon: CombatLabLiveUnitWeaponV1 | null;
  readonly weaponReadiness: CombatLabWeaponReadinessV1;
  readonly wounds: readonly CombatLabLiveUnitWoundV1[];
  readonly bloodLoss: number;
  readonly firstAidCharges: number;
  readonly profileLinks: readonly CombatLabSourceProfileLink[];
  readonly presentationKey: string;
}

export interface CombatLabLiveUnitPresentationContext {
  readonly roleLabelRu?: string | null;
}

export function buildCombatLabLiveUnitSnapshot(
  unit: UnitModel,
  context: CombatLabLiveUnitPresentationContext = {},
): CombatLabLiveUnitSnapshotV1 {
  const capabilities = getEffectiveCombatCapabilities(unit);
  const combat = unit.infantryCombatRuntime;
  const weapon = buildWeapon(unit);
  const weaponReadiness = resolveWeaponReadiness(unit);
  const currentAction = resolveCurrentAction(unit);
  const wounds = Object.freeze(combat.wounds.slots.map((slot) => Object.freeze({
    zone: slot.zone,
    zoneLabelRu: woundZoneLabelRu(slot.zone),
    severity: slot.severity,
    severityLabelRu: woundSeverityLabelRu(slot.severity),
    bleedingState: slot.bleedingState,
    bleedingLabelRu: bleedingLabelRu(slot.bleedingState),
    hitCount: slot.hitCount,
  })));
  const profileLinks = resolveCombatLabSelectedUnitProfileLinks(unit);
  const fatigue = combat.physiology.fatigue.fatigue;
  const snapshot = {
    unitId: unit.id,
    labelRu: unit.labels.ru,
    sideLabelRu: unit.side === 'blue' ? 'Синие' : 'Красные',
    typeLabelRu: unitTypeLabelRu(unit.type),
    roleLabelRu: context.roleLabelRu ?? null,
    archetypeId: unit.soldier.archetypeId ?? unit.behaviorProfile ?? null,
    capabilityLabelRu: capabilityLabelRu(unit, capabilities.alive, capabilities.conscious),
    alive: capabilities.alive,
    conscious: capabilities.conscious,
    health: unit.soldier.condition.health,
    morale: unit.soldier.condition.morale,
    suppression: unit.behaviorRuntime.suppression,
    fatigue,
    stress: unit.behaviorRuntime.stress,
    posture: unit.behaviorRuntime.posture,
    postureLabelRu: postureLabelRu(unit.behaviorRuntime.posture),
    playerOrderLabelRu: playerOrderLabelRu(unit),
    currentAction,
    weapon,
    weaponReadiness,
    wounds,
    bloodLoss: combat.physiology.blood.bloodLoss,
    firstAidCharges: combat.medical.firstAidCharges,
    profileLinks,
  } as const;
  return Object.freeze({
    ...snapshot,
    presentationKey: presentationKey(snapshot),
  });
}

function buildWeapon(unit: UnitModel): CombatLabLiveUnitWeaponV1 | null {
  const combat = unit.infantryCombatRuntime;
  const weapon = combat.primaryWeapon;
  if (!weapon) return null;
  const ammoDefinitionId = weapon.resolved.ammoDefinitionRef.definitionId;
  const roundsReserve = combat.ammoInventory.reserves
    .filter((entry) => entry.ammoDefinitionId === ammoDefinitionId)
    .reduce((sum, entry) => sum + entry.rounds, 0);
  return Object.freeze({
    weaponLabelRu: weapon.resolved.weapon.nameRu,
    weaponDefinitionId: weapon.resolved.weaponDefinitionRef.definitionId,
    roundsLoaded: weapon.roundsInWeapon,
    roundsReserve,
    deploymentMode: weapon.deployment.mode,
  });
}

function resolveWeaponReadiness(unit: UnitModel): CombatLabWeaponReadinessV1 {
  const combat = unit.infantryCombatRuntime;
  const weapon = combat.primaryWeapon;
  if (!weapon) return readiness('no_weapon', 'Нет оружия', 'У бойца нет основного оружия в боевом runtime.');

  const capabilities = getEffectiveCombatCapabilities(unit);
  if (!capabilities.canUseWeapon) {
    return readiness('incapable', 'Не может использовать', capabilities.alive
      ? 'Текущее физическое состояние не позволяет пользоваться оружием.'
      : 'Боец не является боеспособным.');
  }

  const reload = combat.ammoInventory.activeReload;
  if (reload) return readiness('reloading', 'Перезарядка', 'Идёт штатное действие перезарядки.');

  const deployment = weapon.deployment;
  if (deployment.activeAction?.kind === 'deploy' || deployment.mode === 'deploying') {
    return readiness('deploying', 'Разворачивается', 'Оружие находится в процессе развёртывания.');
  }
  if (deployment.activeAction?.kind === 'undeploy' || deployment.mode === 'undeploying') {
    return readiness('undeploying', 'Сворачивается', 'Оружие находится в процессе сворачивания.');
  }

  const fireTask = combat.activeFireTask;
  if (fireTask && !isTerminalFirePhase(fireTask.phase)) {
    return readiness('engaged', fireTask.phase === 'firing' ? 'Ведёт огонь' : 'Занято огневой задачей', fireTask.resultRu ?? 'Выполняется штатная огневая задача.');
  }

  if (weapon.roundsInWeapon <= 0) {
    return readiness('empty', 'Пусто', 'В оружии нет готовых к выстрелу патронов.');
  }

  if (!isPhysicalActionChannelAvailable(unit, 'weapon')) {
    return readiness('action_locked', 'Заблокировано действием', 'Канал оружия занят текущим физическим действием.');
  }

  return readiness('ready', 'Готово', deployment.mode === 'deployed'
    ? 'Оружие развёрнуто и доступно для штатной огневой команды.'
    : 'Оружие доступно для штатной огневой команды.');
}

function resolveCurrentAction(unit: UnitModel): CombatLabLiveUnitCurrentActionV1 {
  const capabilities = getEffectiveCombatCapabilities(unit);
  if (!capabilities.alive) return action('dead', 'Погиб', unit.behaviorRuntime.reason || null);
  if (!capabilities.conscious) return action('unconscious', 'Без сознания', unit.behaviorRuntime.reason || null);

  const posture = unit.behaviorRuntime.physicalAction;
  if (posture?.status === 'running') {
    return action('posture_transition', `Меняет позу → ${postureLabelRu(posture.targetPosture)}`, posture.reasonRu || null);
  }

  const combat = unit.infantryCombatRuntime;
  const firstAid = combat.medical.activeFirstAidAction;
  if (firstAid) return action('first_aid', 'Оказывает первую помощь', `Цель: ${firstAid.targetUnitId}`);

  const reload = combat.ammoInventory.activeReload;
  if (reload) {
    return action('reload', reload.status === 'waiting_for_locomotion' ? 'Ждёт остановки для перезарядки' : 'Перезаряжается', `Этап: ${reload.stageId}`);
  }

  const transfer = combat.ammoInventory.activeTransfer;
  if (transfer && transfer.phase === 'working') {
    return action('ammo_transfer', 'Передаёт боеприпасы', `${transfer.sourceUnitId} → ${transfer.targetUnitId}`);
  }

  const deployment = combat.primaryWeapon?.deployment.activeAction;
  if (deployment) {
    return deployment.kind === 'deploy'
      ? action('deploy', 'Разворачивает оружие', null)
      : action('undeploy', 'Сворачивает оружие', null);
  }

  const fireTask = combat.activeFireTask;
  if (fireTask && !isTerminalFirePhase(fireTask.phase)) {
    const label = fireTask.phase === 'aiming'
      ? 'Целится'
      : fireTask.phase === 'firing'
        ? 'Стреляет'
        : fireTask.phase === 'recovery'
          ? 'Восстанавливается после огня'
          : 'Выполняет огневую задачу';
    return action('fire', label, fireTask.resultRu ?? null);
  }

  if (unit.movementRuntime.isMoving) {
    return action('move', 'Движется', unit.playerCommand?.reasonRu ?? unit.behaviorRuntime.reason ?? null);
  }

  const runtimeAction = cleanRuntimeAction(unit.behaviorRuntime.currentAction);
  if (runtimeAction) return action('runtime', runtimeAction, unit.behaviorRuntime.reason || null);
  return action('waiting', 'Ожидает', unit.behaviorRuntime.reason || null);
}

function playerOrderLabelRu(unit: UnitModel): string {
  const command = unit.playerCommand;
  if (!command) return 'Нет приказа игрока';
  const preset = command.intent.presetId === 'assault'
    ? 'Штурм'
    : command.intent.presetId === 'recon'
      ? 'Разведка'
      : 'Движение';
  const status = command.status === 'active'
    ? 'выполняется'
    : command.status === 'completed'
      ? 'выполнен'
      : command.status === 'blocked'
        ? 'заблокирован'
        : 'отменён';
  return `${preset} · ${status}`;
}

function capabilityLabelRu(unit: UnitModel, alive: boolean, conscious: boolean): string {
  if (!alive) return 'Погиб';
  if (!conscious) return 'Без сознания';
  const slots = unit.infantryCombatRuntime.wounds.slots;
  if (slots.some((slot) => slot.severity === 'critical')) return 'Критически ранен';
  if (slots.some((slot) => slot.severity === 'severe')) return 'Тяжело ранен';
  if (slots.length > 0) return 'Ранен';
  return 'Боеспособен';
}

function readiness(kind: CombatLabWeaponReadinessKind, labelRu: string, reasonRu: string): CombatLabWeaponReadinessV1 {
  return Object.freeze({ kind, labelRu, reasonRu });
}

function action(kind: CombatLabLiveUnitCurrentActionKind, labelRu: string, detailRu: string | null): CombatLabLiveUnitCurrentActionV1 {
  return Object.freeze({ kind, labelRu, detailRu });
}

function isTerminalFirePhase(phase: string): boolean {
  return phase === 'completed' || phase === 'cancelled' || phase === 'denied' || phase === 'failed';
}

function postureLabelRu(posture: UnitPosture): string {
  if (posture === 'crouched') return 'Пригнувшись';
  if (posture === 'prone') return 'Лёжа';
  return 'Стоя';
}

function unitTypeLabelRu(type: UnitModel['type']): string {
  if (type === 'scout_team') return 'Разведчик';
  if (type === 'support_team') return 'Поддержка';
  return 'Пехотинец';
}

function woundZoneLabelRu(zone: string): string {
  if (zone === 'head') return 'Голова';
  if (zone === 'torso') return 'Корпус';
  if (zone === 'arms') return 'Руки';
  if (zone === 'legs') return 'Ноги';
  return zone;
}

function woundSeverityLabelRu(severity: string): string {
  if (severity === 'critical') return 'Критическое';
  if (severity === 'severe') return 'Тяжёлое';
  return 'Лёгкое';
}

function bleedingLabelRu(state: string): string {
  if (state === 'critical') return 'критическое кровотечение';
  if (state === 'severe') return 'сильное кровотечение';
  if (state === 'stopped') return 'кровотечение остановлено';
  return 'без кровотечения';
}

function cleanRuntimeAction(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized === 'waiting') return null;
  const labels: Record<string, string> = {
    change_posture: 'Меняет позу',
    moving: 'Движется',
    aiming: 'Целится',
    firing: 'Стреляет',
    reloading: 'Перезаряжается',
    dead: 'Погиб',
    incapacitated: 'Выведен из строя',
  };
  return labels[normalized] ?? normalized.replaceAll('_', ' ');
}

function presentationKey(snapshot: Omit<CombatLabLiveUnitSnapshotV1, 'presentationKey'>): string {
  return JSON.stringify({
    unitId: snapshot.unitId,
    role: snapshot.roleLabelRu,
    capability: snapshot.capabilityLabelRu,
    health: snapshot.health,
    morale: snapshot.morale,
    suppression: snapshot.suppression,
    fatigue: snapshot.fatigue,
    stress: snapshot.stress,
    posture: snapshot.posture,
    order: snapshot.playerOrderLabelRu,
    action: snapshot.currentAction,
    weapon: snapshot.weapon,
    readiness: snapshot.weaponReadiness,
    wounds: snapshot.wounds,
    bloodLoss: snapshot.bloodLoss,
    firstAidCharges: snapshot.firstAidCharges,
    profileLinks: snapshot.profileLinks.map((link) => [link.editorId, link.profileId, link.labelRu]),
  });
}
