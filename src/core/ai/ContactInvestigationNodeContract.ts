import type { AiNodeContract, AiParameterDefinition, AiParameterOption } from './contracts/AiNodeContract';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from './contracts/AiNodeContractRegistry';

const option = (value: string, label: string, labelRu: string): AiParameterOption => ({ value, label, labelRu });
const parameter = (
  id: string,
  kind: AiParameterDefinition['kind'],
  label: string,
  labelRu: string,
  defaultValue: AiParameterDefinition['defaultValue'],
  extra: Partial<AiParameterDefinition> = {},
): AiParameterDefinition => ({ id, kind, label, labelRu, defaultValue, ...extra });
const requiredNumber = (
  id: string,
  label: string,
  labelRu: string,
  defaultValue: number,
  minimum: number,
  maximum?: number,
): AiParameterDefinition => parameter(id, 'number', label, labelRu, defaultValue, {
  required: true,
  minimum,
  maximum,
});
const stageOptions = [
  option('cue', 'Cue', 'След'),
  option('suspicion', 'Suspicion', 'Подозрение'),
  option('contact', 'Contact', 'Контакт'),
  option('identified', 'Identified', 'Идентифицирован'),
  option('confirmed', 'Confirmed', 'Подтверждён'),
] as const;

export const CONTACT_INVESTIGATION_NODE_CONTRACT: AiNodeContract = {
  type: 'InvestigateContact',
  category: 'action',
  label: 'Investigate Contact',
  labelRu: 'Доразведать контакт',
  description: 'Selects and steadily investigates the best subjective contact.',
  descriptionRu: 'Выбирает наиболее полезный субъективный контакт, устойчиво доразведывает его и переключается на более срочную угрозу.',
  childPolicy: 'none',
  lifecycle: 'instant',
  inputs: [],
  outputs: [],
  parameters: [
    requiredNumber('cooldownSeconds', 'Cooldown', 'Задержка повторения', 0, 0),
    parameter('cooldownTiming', 'enum', 'Cooldown timing', 'Момент задержки', 'on_success', {
      options: [
        option('on_start', 'On start', 'При запуске'),
        option('on_success', 'On success', 'После успеха'),
        option('on_attempt', 'On attempt', 'После попытки'),
      ],
    }),
    parameter('minimumStage', 'enum', 'Minimum stage', 'Минимальная стадия', 'cue', { required: true, options: stageOptions }),
    requiredNumber('minimumConfidence', 'Minimum confidence', 'Минимальная уверенность', 15, 0, 100),
    parameter('completionStage', 'enum', 'Completion stage', 'Доразведка завершена на стадии', 'identified', { required: true, options: stageOptions }),
    requiredNumber('searchArcDegrees', 'Search arc', 'Ширина сектора', 120, 1, 360),
    requiredNumber('maximumContactAgeSeconds', 'Maximum contact age', 'Максимальный возраст контакта', 10, 0.1, 120),
    parameter('reactToFreshFire', 'boolean', 'React to fresh fire', 'Срочно реагировать на признаки огня', true, { required: true }),
    requiredNumber('minimumHoldSeconds', 'Minimum hold', 'Минимально смотреть один контакт', 1.2, 0, 30),
    requiredNumber('preferredInvestigationSeconds', 'Preferred investigation time', 'Желательное время проверки', 3, 0, 60),
    requiredNumber('maximumInvestigationSeconds', 'Maximum investigation time', 'Максимальное время проверки', 5, 0.1, 120),
    requiredNumber('revisitDelaySeconds', 'Revisit delay', 'Пауза перед повторной проверкой', 4, 0, 120),
    requiredNumber('switchAdvantagePercent', 'Switch advantage', 'Преимущество для переключения', 25, 0, 500),
    requiredNumber('urgentCloserMeters', 'Urgently closer by meters', 'Переключиться, если ближе на', 12, 0, 500),
    requiredNumber('urgentCloserRatio', 'Urgently closer ratio', 'Переключиться, если дистанция меньше', 0.6, 0, 1),
    requiredNumber('confidenceWeight', 'Confidence weight', 'Вес уверенности', 0.3, 0, 10),
    requiredNumber('proximityWeight', 'Proximity weight', 'Вес близости', 0.25, 0, 10),
    requiredNumber('freshnessWeight', 'Freshness weight', 'Вес свежести', 0.2, 0, 10),
    requiredNumber('urgencyWeight', 'Urgency weight', 'Вес срочности угрозы', 0.2, 0, 10),
    requiredNumber('uncertaintyPenaltyWeight', 'Uncertainty penalty', 'Штраф неопределённости', 0.15, 0, 10),
    requiredNumber('currentContactBonus', 'Current contact bonus', 'Бонус удержания текущего контакта', 10, 0, 100),
  ],
};

export function ensureContactInvestigationNodeContractRegistered(): void {
  if (!DEFAULT_AI_NODE_CONTRACT_REGISTRY.has(CONTACT_INVESTIGATION_NODE_CONTRACT.type)) {
    DEFAULT_AI_NODE_CONTRACT_REGISTRY.register(CONTACT_INVESTIGATION_NODE_CONTRACT);
  }
}
