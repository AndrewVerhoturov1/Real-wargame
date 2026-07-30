import type {
  CombatLabActionV1,
  CombatLabCancelActionTargetV1,
  CombatLabExperimentV1,
  CombatLabFireModeV1,
  CombatLabPostureV1,
  CombatLabTacticalOrderPresetV1,
} from '../../core/testing/combat-lab/experiment';

export type CombatLabActionCatalogGroupV1 = 'movement' | 'posture' | 'fire' | 'weapon' | 'support' | 'wait' | 'cancel';

export interface CombatLabActionDescriptorV1 {
  readonly id: string;
  readonly group: CombatLabActionCatalogGroupV1;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly requiresMarker: boolean;
  readonly requiresOtherRole: boolean;
  readonly actionKind: CombatLabActionV1['kind'];
  readonly fireMode?: CombatLabFireModeV1;
  readonly posture?: CombatLabPostureV1;
  readonly tacticalOrderPresetId?: CombatLabTacticalOrderPresetV1;
  readonly cancelTarget?: CombatLabCancelActionTargetV1;
  readonly waitMode?: 'time' | 'condition';
}

export interface CombatLabActionBuildOptionsV1 {
  readonly targetRoleId?: string | null;
  readonly markerId?: string | null;
  readonly helperRoleId?: string | null;
  readonly finalFacingMarkerId?: string | null;
  readonly waitSeconds?: number;
}

const DESCRIPTORS: readonly CombatLabActionDescriptorV1[] = Object.freeze([
  descriptor('move', 'movement', 'Двигаться', 'Обычный тактический приказ движения.', 'move', { tacticalOrderPresetId: 'move', requiresMarker: true }),
  descriptor('recon', 'movement', 'Разведка', 'Осторожное движение с активным поиском контактов.', 'move', { tacticalOrderPresetId: 'recon', requiresMarker: true }),
  descriptor('assault', 'movement', 'Штурм', 'Решительное продвижение с боевым профилем.', 'move', { tacticalOrderPresetId: 'assault', requiresMarker: true }),
  descriptor('face', 'movement', 'Повернуться', 'Повернуть бойца к выбранной точке.', 'face', { requiresMarker: true }),
  descriptor('stand', 'posture', 'Встать', 'Перейти в положение стоя.', 'posture', { posture: 'standing' }),
  descriptor('crouch', 'posture', 'Пригнуться', 'Перейти в положение пригнувшись.', 'posture', { posture: 'crouched' }),
  descriptor('prone', 'posture', 'Лечь', 'Перейти в положение лёжа.', 'posture', { posture: 'prone' }),
  descriptor('fire-single', 'fire', 'Одиночный выстрел', 'Открыть одиночный огонь по бойцу или метке.', 'fire', { fireMode: 'single', requiresOtherRole: true }),
  descriptor('fire-short', 'fire', 'Короткая очередь', 'Открыть огонь короткой очередью.', 'fire', { fireMode: 'short_burst', requiresOtherRole: true }),
  descriptor('fire-long', 'fire', 'Длинная очередь', 'Открыть огонь длинной очередью.', 'fire', { fireMode: 'long_burst', requiresOtherRole: true }),
  descriptor('fire-suppress', 'fire', 'Подавлять область', 'Вести подавляющий огонь по круглой области.', 'fire', { fireMode: 'suppress', requiresMarker: true }),
  descriptor('reload', 'weapon', 'Перезарядить', 'Запустить штатную перезарядку оружия.', 'reload'),
  descriptor('deploy', 'weapon', 'Установить оружие', 'Установить оружие на опору.', 'deploy'),
  descriptor('undeploy', 'weapon', 'Снять оружие', 'Снять оружие с опоры.', 'undeploy'),
  descriptor('transfer', 'support', 'Передать патроны', 'Передать патроны другому бойцу.', 'transfer', { requiresOtherRole: true }),
  descriptor('first-aid', 'support', 'Оказать первую помощь', 'Оказать первую помощь другому бойцу.', 'first_aid', { requiresOtherRole: true }),
  descriptor('wait-time', 'wait', 'Ждать заданное время', 'Приостановить дорожку на заданное время.', 'wait', { waitMode: 'time' }),
  descriptor('wait-condition', 'wait', 'Ждать условие', 'Ждать выполнения выбранного условия.', 'wait', { waitMode: 'condition' }),
  cancelDescriptor('cancel-movement', 'Прекратить движение', 'movement'),
  cancelDescriptor('cancel-fire', 'Прекратить огонь', 'fire'),
  cancelDescriptor('cancel-reload', 'Отменить перезарядку', 'reload'),
  cancelDescriptor('cancel-deployment', 'Отменить установку оружия', 'deployment'),
  cancelDescriptor('cancel-transfer', 'Отменить передачу патронов', 'transfer'),
  cancelDescriptor('cancel-first-aid', 'Отменить первую помощь', 'first_aid'),
]);

export function listCombatLabActionDescriptors(): readonly CombatLabActionDescriptorV1[] { return DESCRIPTORS; }

export function getCombatLabActionDescriptor(id: string): CombatLabActionDescriptorV1 {
  const descriptor = DESCRIPTORS.find((candidate) => candidate.id === id);
  if (!descriptor) throw new Error(`Неизвестное действие Combat Lab: ${id}.`);
  return descriptor;
}

export function createCombatLabActionFromCatalog(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  descriptorId: string,
  options: CombatLabActionBuildOptionsV1 = {},
): CombatLabActionV1 {
  const descriptor = getCombatLabActionDescriptor(descriptorId);
  const targetRoleId = options.targetRoleId ?? experiment.roles.find((role) => role.roleId !== actorRoleId)?.roleId ?? actorRoleId;
  const markerId = options.markerId ?? experiment.markers[0]?.markerId ?? null;
  switch (descriptor.actionKind) {
    case 'move':
      if (!markerId) throw new Error('Сначала создайте метку назначения.');
      return { kind: 'move', actorRoleId, markerId, tacticalOrderPresetId: descriptor.tacticalOrderPresetId ?? 'move', finalFacingMarkerId: options.finalFacingMarkerId ?? null };
    case 'face':
      if (!markerId) throw new Error('Сначала создайте метку направления.');
      return { kind: 'face', actorRoleId, markerId };
    case 'posture': return { kind: 'posture', actorRoleId, targetPosture: descriptor.posture ?? 'standing' };
    case 'fire': {
      const mode = descriptor.fireMode ?? 'single';
      if (mode === 'suppress') {
        if (!markerId) throw new Error('Для подавления требуется круглая область.');
        return { kind: 'fire', actorRoleId, target: { kind: 'marker', markerId }, mode, targetRadiusMetres: 5, minimumSolutionQuality: 0.5, minimumPerceptionQuality: 0.5, forceFire: false };
      }
      return { kind: 'fire', actorRoleId, target: markerId && options.markerId !== null ? { kind: 'marker', markerId } : { kind: 'role', roleId: targetRoleId }, mode, targetRadiusMetres: 0.5, minimumSolutionQuality: 0.5, minimumPerceptionQuality: 0.5, forceFire: false };
    }
    case 'reload': return { kind: 'reload', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'deploy': return { kind: 'deploy', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'undeploy': return { kind: 'undeploy', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'transfer': return { kind: 'transfer', sourceRoleId: actorRoleId, targetRoleId, requestedRounds: 30 };
    case 'first_aid': return { kind: 'first_aid', actorRoleId, targetRoleId, zone: null };
    case 'wait': return { kind: 'wait', durationSeconds: descriptor.waitMode === 'condition' ? null : Math.max(0.1, options.waitSeconds ?? 1) };
    case 'cancel_action': return { kind: 'cancel_action', actorRoleId, target: descriptor.cancelTarget ?? 'movement' };
    case 'stop_fire': return { kind: 'cancel_action', actorRoleId, target: 'fire' };
  }
}

export function findCombatLabActionDescriptorForAction(action: CombatLabActionV1): CombatLabActionDescriptorV1 {
  const id = action.kind === 'move'
    ? action.tacticalOrderPresetId ?? 'move'
    : action.kind === 'face' ? 'face'
      : action.kind === 'posture' ? action.targetPosture === 'standing' ? 'stand' : action.targetPosture === 'crouched' ? 'crouch' : 'prone'
        : action.kind === 'fire' ? action.mode === 'single' ? 'fire-single' : action.mode === 'short_burst' ? 'fire-short' : action.mode === 'long_burst' ? 'fire-long' : 'fire-suppress'
          : action.kind === 'cancel_action' ? cancelDescriptorId(action.target)
            : action.kind === 'stop_fire' ? 'cancel-fire'
              : action.kind === 'first_aid' ? 'first-aid'
                : action.kind === 'wait' ? action.durationSeconds === null ? 'wait-condition' : 'wait-time'
                  : action.kind;
  return getCombatLabActionDescriptor(id);
}

function cancelDescriptorId(target: CombatLabCancelActionTargetV1): string {
  return target === 'first_aid' ? 'cancel-first-aid' : `cancel-${target}`;
}

function descriptor(
  id: string,
  group: CombatLabActionCatalogGroupV1,
  labelRu: string,
  descriptionRu: string,
  actionKind: CombatLabActionV1['kind'],
  options: Partial<Omit<CombatLabActionDescriptorV1, 'id' | 'group' | 'labelRu' | 'descriptionRu' | 'actionKind' | 'requiresMarker' | 'requiresOtherRole'>> & { requiresMarker?: boolean; requiresOtherRole?: boolean } = {},
): CombatLabActionDescriptorV1 {
  return Object.freeze({ id, group, labelRu, descriptionRu, actionKind, requiresMarker: options.requiresMarker ?? false, requiresOtherRole: options.requiresOtherRole ?? false, ...options });
}

function cancelDescriptor(id: string, labelRu: string, target: CombatLabCancelActionTargetV1): CombatLabActionDescriptorV1 {
  return descriptor(id, 'cancel', labelRu, 'Остановить соответствующее активное действие.', 'cancel_action', { cancelTarget: target });
}
