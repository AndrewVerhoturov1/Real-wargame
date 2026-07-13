export type AiStateId = 'Idle' | 'FollowingOrder' | 'Contact' | 'Suppressed';
export type AiParentStateId = 'Normal' | 'Combat';
export type AiStateNodeId = AiParentStateId | AiStateId;

export type AiTransitionTrigger =
  | 'move_order_received'
  | 'order_completed'
  | 'order_cancelled'
  | 'enemy_spotted'
  | 'combat_contact'
  | 'suppression_critical'
  | 'suppression_stable'
  | 'manual';

export type AiConditionOperator =
  | 'truthy'
  | 'falsy'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface AiConditionBinding {
  readonly id: string;
  readonly key: string;
  readonly operator: AiConditionOperator;
  readonly value?: string | number | boolean | null;
  readonly label: string;
  readonly labelRu: string;
}

export interface AiStateDefinition {
  readonly id: AiStateNodeId;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly parentStateId?: AiParentStateId;
  readonly allowedUtilityBranches?: readonly string[];
  readonly minimumDurationMs?: number;
}

export interface AiStateTransition {
  readonly id: string;
  readonly from: AiStateId | '*';
  readonly to: AiStateId;
  readonly priority: number;
  readonly trigger: AiTransitionTrigger;
  readonly guards: readonly AiConditionBinding[];
  readonly reason: string;
  readonly reasonRu: string;
  readonly minimumSourceDurationMs?: number;
  readonly emergency?: boolean;
}

export interface AiStateMachineDefinition {
  readonly states: Readonly<Record<AiStateNodeId, AiStateDefinition>>;
  readonly transitions: readonly AiStateTransition[];
  readonly initialStateId: AiStateId;
}

export const DEFAULT_AI_STATE_MACHINE: AiStateMachineDefinition = {
  initialStateId: 'Idle',
  states: {
    Normal: {
      id: 'Normal',
      label: 'Normal',
      labelRu: 'Обычное состояние',
      description: 'Non-combat behavior and execution of ordinary orders.',
      descriptionRu: 'Спокойное поведение и выполнение обычных приказов.',
    },
    Combat: {
      id: 'Combat',
      label: 'Combat',
      labelRu: 'Бой',
      description: 'Behavior after a combat contact has been established.',
      descriptionRu: 'Поведение после обнаружения боевого контакта.',
    },
    Idle: {
      id: 'Idle',
      label: 'Idle',
      labelRu: 'Ожидание',
      description: 'The soldier has no active movement order or combat emergency.',
      descriptionRu: 'У бойца нет активного приказа движения или боевой чрезвычайной ситуации.',
      parentStateId: 'Normal',
      allowedUtilityBranches: ['wait', 'observe', 'receive_order'],
      minimumDurationMs: 100,
    },
    FollowingOrder: {
      id: 'FollowingOrder',
      label: 'Following order',
      labelRu: 'Выполнение приказа',
      description: 'The soldier is executing a valid player or commander movement order.',
      descriptionRu: 'Боец выполняет действующий приказ игрока или командира на движение.',
      parentStateId: 'Normal',
      allowedUtilityBranches: ['follow_move_order', 'safe_move', 'march_observe'],
      minimumDurationMs: 150,
    },
    Contact: {
      id: 'Contact',
      label: 'Contact',
      labelRu: 'Контакт',
      description: 'A subjective enemy contact or combat event requires a tactical response.',
      descriptionRu: 'Личный контакт с противником или боевое событие требуют тактической реакции.',
      parentStateId: 'Combat',
      allowedUtilityBranches: ['take_cover', 'threat_response', 'observe'],
      minimumDurationMs: 250,
    },
    Suppressed: {
      id: 'Suppressed',
      label: 'Suppressed',
      labelRu: 'Подавлен',
      description: 'Self-preservation actions have priority while suppression is critical.',
      descriptionRu: 'При критическом подавлении действия самосохранения имеют приоритет.',
      parentStateId: 'Combat',
      allowedUtilityBranches: ['take_cover', 'change_posture', 'wait_suppression'],
      minimumDurationMs: 750,
    },
  },
  transitions: [
    {
      id: 'any_to_suppressed',
      from: '*',
      to: 'Suppressed',
      priority: 1000,
      trigger: 'suppression_critical',
      guards: [],
      reason: 'Suppression reached the critical threshold.',
      reasonRu: 'Подавление достигло критического порога.',
      emergency: true,
    },
    {
      id: 'following_order_to_contact_enemy',
      from: 'FollowingOrder',
      to: 'Contact',
      priority: 800,
      trigger: 'enemy_spotted',
      guards: [],
      reason: 'An enemy was spotted while following the order.',
      reasonRu: 'Во время выполнения приказа замечен противник.',
    },
    {
      id: 'following_order_to_contact_event',
      from: 'FollowingOrder',
      to: 'Contact',
      priority: 790,
      trigger: 'combat_contact',
      guards: [],
      reason: 'A combat contact event interrupted the movement order.',
      reasonRu: 'Боевое событие прервало обычное выполнение приказа.',
    },
    {
      id: 'idle_to_contact_enemy',
      from: 'Idle',
      to: 'Contact',
      priority: 800,
      trigger: 'enemy_spotted',
      guards: [],
      reason: 'An enemy was spotted.',
      reasonRu: 'Замечен противник.',
    },
    {
      id: 'idle_to_contact_event',
      from: 'Idle',
      to: 'Contact',
      priority: 790,
      trigger: 'combat_contact',
      guards: [],
      reason: 'A combat contact event was received.',
      reasonRu: 'Получено событие боевого контакта.',
    },
    {
      id: 'idle_to_following_order',
      from: 'Idle',
      to: 'FollowingOrder',
      priority: 500,
      trigger: 'move_order_received',
      guards: [],
      reason: 'A movement order was received.',
      reasonRu: 'Получен приказ движения.',
    },
    {
      id: 'following_order_to_idle_completed',
      from: 'FollowingOrder',
      to: 'Idle',
      priority: 500,
      trigger: 'order_completed',
      guards: [],
      reason: 'The movement order was completed.',
      reasonRu: 'Приказ движения выполнен.',
    },
    {
      id: 'following_order_to_idle_cancelled',
      from: 'FollowingOrder',
      to: 'Idle',
      priority: 510,
      trigger: 'order_cancelled',
      guards: [],
      reason: 'The movement order was cancelled.',
      reasonRu: 'Приказ движения отменён.',
    },
    {
      id: 'suppressed_to_contact',
      from: 'Suppressed',
      to: 'Contact',
      priority: 600,
      trigger: 'suppression_stable',
      guards: [],
      reason: 'Suppression remained below the stable exit threshold.',
      reasonRu: 'Подавление устойчиво снизилось ниже порога выхода.',
      minimumSourceDurationMs: 750,
    },
  ],
};

export function getAiStatePath(
  machine: AiStateMachineDefinition,
  leafStateId: AiStateId,
): readonly AiStateNodeId[] {
  const leaf = machine.states[leafStateId];
  return leaf.parentStateId ? [leaf.parentStateId, leafStateId] : [leafStateId];
}

export function getAllowedUtilityBranches(
  machine: AiStateMachineDefinition,
  stateId: AiStateId,
): readonly string[] {
  return machine.states[stateId].allowedUtilityBranches ?? [];
}

export function evaluateAiConditionBinding(
  binding: AiConditionBinding,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const actual = values[binding.key];
  switch (binding.operator) {
    case 'truthy': return Boolean(actual);
    case 'falsy': return !actual;
    case 'eq': return actual === binding.value;
    case 'neq': return actual !== binding.value;
    case 'gt': return typeof actual === 'number' && typeof binding.value === 'number' && actual > binding.value;
    case 'gte': return typeof actual === 'number' && typeof binding.value === 'number' && actual >= binding.value;
    case 'lt': return typeof actual === 'number' && typeof binding.value === 'number' && actual < binding.value;
    case 'lte': return typeof actual === 'number' && typeof binding.value === 'number' && actual <= binding.value;
  }
}
