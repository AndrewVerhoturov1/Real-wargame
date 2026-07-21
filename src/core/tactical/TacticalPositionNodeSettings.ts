export type TacticalPositionNodeKind = 'observation' | 'defense' | 'firing';
export type TacticalPositionNodeObjective = 'balanced' | 'advance_to_threat' | 'withdraw_from_threat' | 'continue_order';
export type TacticalPositionNodeTargetMode = 'automatic' | 'order_point' | 'facing_sector';
export type TacticalPositionNodePosture = 'standing' | 'crouched' | 'prone';
export type TacticalPositionNodeParameterValue = string | number | boolean | null | { readonly x: number; readonly y: number };
export type TacticalPositionNodeParameters = Record<string, TacticalPositionNodeParameterValue>;

export interface TacticalPositionRankingWeights {
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly lineQuality: number;
  readonly rangeFit: number;
  readonly desiredDistance: number;
  readonly protection: number;
  readonly concealment: number;
  readonly danger: number;
  readonly routeDanger: number;
  readonly routeCost: number;
  readonly certainty: number;
  readonly orderAlignment: number;
  readonly withdrawal: number;
  readonly postureFit: number;
}

export interface TacticalPositionRankingSettings {
  readonly tacticalQualityWeight: number;
  readonly movementObjectiveWeight: number;
  readonly weights: TacticalPositionRankingWeights;
}

export interface TacticalPositionMovementObjectiveSettings {
  readonly balancedInfluence: number;
  readonly advanceToThreatInfluence: number;
  readonly withdrawFromThreatInfluence: number;
  readonly continueOrderInfluence: number;
  readonly wrongDirectionPenalty: number;
  readonly distanceToleranceMeters: number;
}

export interface TacticalPositionConstraintSettings {
  readonly maxPositionDanger: number;
  readonly maxRouteDanger: number;
  readonly minimumProtection: number;
  readonly minimumConcealment: number;
  readonly minimumDirectionalFit: number;
  readonly minimumLineQuality: number;
  readonly minimumTargetDistanceMeters: number;
  readonly maximumTargetDistanceMeters: number;
  readonly desiredDistanceMeters: number;
  readonly desiredDistanceToleranceMeters: number;
  readonly allowedPostures: Readonly<Record<TacticalPositionNodePosture, boolean>>;
  readonly requireVisualLine: boolean;
  readonly requireBallisticLine: boolean;
}

export interface TacticalPositionPostureSettings {
  readonly transitionPenaltyStanding: number;
  readonly transitionPenaltyCrouched: number;
  readonly transitionPenaltyProne: number;
  readonly dangerExposureWeight: number;
}

export interface TacticalPositionSearchBudgetSettings {
  readonly maxCandidates: number;
  readonly candidateScanLimit: number;
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
  readonly maxRouteExpansions: number;
  readonly maximumRouteCost: number;
  readonly objectiveCandidatePool: number;
  readonly minimumSeparationMeters: number;
}

export interface TacticalPositionSearchSettings {
  readonly version: 1;
  readonly ranking: TacticalPositionRankingSettings;
  readonly movementObjective: TacticalPositionMovementObjectiveSettings;
  readonly constraints: TacticalPositionConstraintSettings;
  readonly posture: TacticalPositionPostureSettings;
  readonly searchBudget: TacticalPositionSearchBudgetSettings;
}

export interface TacticalPositionNodeTargetSettings {
  readonly mode: TacticalPositionNodeTargetMode;
  readonly point: { readonly x: number; readonly y: number } | null;
  readonly sectorCenterDegrees: number;
  readonly sectorArcDegrees: number;
}

export interface TacticalPositionNodeSettings {
  readonly version: 1;
  readonly queryKey: string;
  readonly kind: TacticalPositionNodeKind;
  readonly objective: TacticalPositionNodeObjective;
  readonly target: TacticalPositionNodeTargetSettings;
  readonly searchRadiusMeters: number;
  readonly maxCalculationMs: number;
  readonly search: TacticalPositionSearchSettings;
  readonly ranking: TacticalPositionRankingSettings;
  readonly movementObjective: TacticalPositionMovementObjectiveSettings;
  readonly constraints: TacticalPositionConstraintSettings;
  readonly posture: TacticalPositionPostureSettings;
  readonly searchBudget: TacticalPositionSearchBudgetSettings;
}

export type TacticalPositionNodeParameterGroup = 'main' | 'ranking' | 'movement' | 'constraints' | 'posture' | 'performance';
export type TacticalPositionNodeParameterKind = 'number' | 'boolean' | 'string' | 'enum' | 'position';

export interface TacticalPositionNodeParameterDescriptor {
  readonly id: string;
  readonly kind: TacticalPositionNodeParameterKind;
  readonly group: TacticalPositionNodeParameterGroup;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly advanced?: boolean;
  readonly slider?: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string; readonly labelRu: string }[];
}

export interface TacticalPositionNodeParameterGroupDescriptor {
  readonly id: TacticalPositionNodeParameterGroup;
  readonly label: string;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly collapsedByDefault: boolean;
}

export const TACTICAL_POSITION_NODE_PARAMETER_GROUPS: readonly TacticalPositionNodeParameterGroupDescriptor[] = Object.freeze([
  { id: 'main', label: 'Main', labelRu: 'Основные', descriptionRu: 'Тип, задача, цель и главный объём результата.', collapsedByDefault: false },
  { id: 'ranking', label: 'Ranking weights', labelRu: 'Веса оценки', descriptionRu: 'Какие качества позиции важнее при окончательном выборе.', collapsedByDefault: false },
  { id: 'movement', label: 'Movement objective', labelRu: 'Задача движения', descriptionRu: 'Сила сближения, отхода и продолжения приказа.', collapsedByDefault: true },
  { id: 'constraints', label: 'Constraints', labelRu: 'Ограничения', descriptionRu: 'Условия, при нарушении которых позиция отбрасывается.', collapsedByDefault: true },
  { id: 'posture', label: 'Posture', labelRu: 'Поза', descriptionRu: 'Допустимые позы и цена перехода между ними.', collapsedByDefault: true },
  { id: 'performance', label: 'Performance', labelRu: 'Производительность — расширенные', descriptionRu: 'Жёсткие пределы вычислений. Завышение повышает цену поиска.', collapsedByDefault: true },
]);

const KIND_OPTIONS = Object.freeze([
  { value: 'observation', label: 'Observation', labelRu: 'Наблюдение' },
  { value: 'defense', label: 'Defense', labelRu: 'Оборона' },
  { value: 'firing', label: 'Firing', labelRu: 'Огневая позиция' },
]);
const OBJECTIVE_OPTIONS = Object.freeze([
  { value: 'balanced', label: 'Balanced', labelRu: 'Сбалансированно' },
  { value: 'advance_to_threat', label: 'Advance to threat', labelRu: 'Сближение с угрозой' },
  { value: 'withdraw_from_threat', label: 'Withdraw from threat', labelRu: 'Удаление от угрозы' },
  { value: 'continue_order', label: 'Continue order', labelRu: 'Продолжение приказа' },
]);
const TARGET_OPTIONS = Object.freeze([
  { value: 'automatic', label: 'Automatic', labelRu: 'Автоматически' },
  { value: 'order_point', label: 'Order point', labelRu: 'Точка приказа' },
  { value: 'facing_sector', label: 'Facing sector', labelRu: 'Сектор взгляда' },
]);

const weight = (
  id: string,
  group: TacticalPositionNodeParameterGroup,
  label: string,
  labelRu: string,
  descriptionRu: string,
  advanced = false,
): TacticalPositionNodeParameterDescriptor => ({
  id,
  kind: 'number',
  group,
  label,
  labelRu,
  description: descriptionRu,
  descriptionRu,
  minimum: 0,
  maximum: 10,
  step: 0.01,
  slider: true,
  advanced,
});
const percent = (
  id: string,
  group: TacticalPositionNodeParameterGroup,
  label: string,
  labelRu: string,
  descriptionRu: string,
  advanced = false,
): TacticalPositionNodeParameterDescriptor => ({
  id,
  kind: 'number',
  group,
  label,
  labelRu,
  description: descriptionRu,
  descriptionRu,
  minimum: 0,
  maximum: 100,
  step: 1,
  unit: '%',
  slider: true,
  advanced,
});
const number = (
  id: string,
  group: TacticalPositionNodeParameterGroup,
  label: string,
  labelRu: string,
  descriptionRu: string,
  minimum: number,
  maximum: number,
  step: number,
  unit?: string,
  advanced = false,
): TacticalPositionNodeParameterDescriptor => ({
  id,
  kind: 'number',
  group,
  label,
  labelRu,
  description: descriptionRu,
  descriptionRu,
  minimum,
  maximum,
  step,
  unit,
  advanced,
});
const boolean = (
  id: string,
  group: TacticalPositionNodeParameterGroup,
  label: string,
  labelRu: string,
  descriptionRu: string,
  advanced = false,
): TacticalPositionNodeParameterDescriptor => ({
  id,
  kind: 'boolean',
  group,
  label,
  labelRu,
  description: descriptionRu,
  descriptionRu,
  advanced,
});

export const TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS: readonly TacticalPositionNodeParameterDescriptor[] = Object.freeze([
  { id: 'kind', kind: 'enum', group: 'main', label: 'Position kind', labelRu: 'Тип позиции', description: 'Position kind.', descriptionRu: 'Какой тип тактической позиции искать.', options: KIND_OPTIONS },
  { id: 'objective', kind: 'enum', group: 'main', label: 'Movement objective', labelRu: 'Задача движения', description: 'Movement objective.', descriptionRu: 'Как поиск должен учитывать направление движения.', options: OBJECTIVE_OPTIONS },
  { id: 'queryKey', kind: 'string', group: 'main', label: 'Query key', labelRu: 'Ключ запроса', description: 'Stable query key.', descriptionRu: 'Связывает создание, фильтрацию и выбор кандидатов.' },
  { id: 'targetMode', kind: 'enum', group: 'main', label: 'Target mode', labelRu: 'Источник цели', description: 'Target source.', descriptionRu: 'Откуда брать направление или точку цели.', options: TARGET_OPTIONS },
  { id: 'targetPoint', kind: 'position', group: 'main', label: 'Target point', labelRu: 'Точка цели', description: 'Optional explicit target.', descriptionRu: 'Необязательная явная точка цели.' },
  number('sectorCenterDegrees', 'main', 'Sector center', 'Смещение сектора', 'Смещение центра сектора относительно взгляда.', -360, 360, 1, '°'),
  number('sectorArcDegrees', 'main', 'Sector arc', 'Ширина сектора', 'Угол сектора поиска.', 1, 360, 1, '°'),
  number('searchRadiusMeters', 'main', 'Search radius', 'Радиус поиска', 'Максимальный радиус локального поиска.', 1, 500, 1, 'м'),
  number('maxCandidates', 'main', 'Maximum results', 'Максимум результатов', 'Сколько готовых позиций вернуть графу.', 1, 16, 1),
  number('desiredDistanceMeters', 'main', 'Desired distance', 'Желаемая дистанция', 'Ноль использует автоматическую дистанцию цели или оружия.', 0, 3000, 1, 'м'),

  weight('tacticalQualityWeight', 'ranking', 'Tactical quality', 'Тактическое качество', 'Общий вес качества позиции в итоговом выборе.'),
  weight('movementObjectiveWeight', 'ranking', 'Movement objective', 'Задача движения', 'Общий вес соответствия задаче движения.'),
  weight('staticPotentialWeight', 'ranking', 'Static potential', 'Потенциал места', 'Качество постоянной основы карты.'),
  weight('directionalFitWeight', 'ranking', 'Direction fit', 'Подходящее направление', 'Насколько позиция подходит нужному направлению.'),
  weight('lineQualityWeight', 'ranking', 'Line quality', 'Обзор или линия огня', 'Качество точной линии наблюдения или огня.'),
  weight('rangeFitWeight', 'ranking', 'Weapon range fit', 'Дальность оружия', 'Соответствие рабочей дальности оружия.'),
  weight('desiredDistanceWeight', 'ranking', 'Desired distance fit', 'Желаемая дистанция', 'Штрафует отклонение от указанной желаемой дистанции.'),
  weight('protectionWeight', 'ranking', 'Protection', 'Защита', 'Предпочтение защищённых позиций.'),
  weight('concealmentWeight', 'ranking', 'Concealment', 'Скрытность', 'Предпочтение скрытых позиций.'),
  weight('dangerWeight', 'ranking', 'Low danger', 'Низкая опасность', 'Чем выше вес, тем сильнее понижаются опасные позиции.'),
  weight('routeDangerWeight', 'ranking', 'Safe route', 'Безопасность маршрута', 'Чем выше вес, тем важнее безопасность пути.'),
  weight('routeCostWeight', 'ranking', 'Short route', 'Стоимость маршрута', 'Чем выше вес, тем сильнее предпочитается дешёвый и короткий путь.'),
  weight('certaintyWeight', 'ranking', 'Certainty', 'Уверенность', 'Штрафует позиции с высокой неопределённостью.'),
  weight('orderAlignmentWeight', 'ranking', 'Order alignment', 'Соответствие приказу', 'Предпочитает позиции ближе к точке приказа.', true),
  weight('withdrawalWeight', 'ranking', 'Withdrawal quality', 'Качество отхода', 'Предпочитает позиции с безопасным путём отхода.', true),
  weight('postureFitWeight', 'ranking', 'Posture fit', 'Подходящая поза', 'Учитывает качество рекомендуемой позы и цену перехода.', true),

  weight('balancedObjectiveInfluence', 'movement', 'Balanced influence', 'Сила balanced', 'Сила сохранения текущей дистанции при balanced.', true),
  weight('advanceObjectiveInfluence', 'movement', 'Advance influence', 'Сила сближения', 'Сила приближения к угрозе.', true),
  weight('withdrawObjectiveInfluence', 'movement', 'Withdraw influence', 'Сила удаления', 'Сила удаления от угрозы.', true),
  weight('continueOrderObjectiveInfluence', 'movement', 'Continue-order influence', 'Сила продолжения приказа', 'Сила приближения к точке приказа.', true),
  percent('wrongDirectionPenalty', 'movement', 'Wrong direction penalty', 'Штраф неверного направления', 'Дополнительный штраф за движение вопреки выбранной задаче.', true),
  number('objectiveDistanceToleranceMeters', 'movement', 'Distance tolerance', 'Допуск по дистанции', 'Изменения дистанции в пределах допуска считаются нейтральными.', 0, 100, 0.5, 'м', true),

  percent('maxPositionDanger', 'constraints', 'Maximum danger', 'Максимальная опасность', 'Более опасные позиции отбрасываются.'),
  percent('maxRouteDanger', 'constraints', 'Maximum route danger', 'Максимальная опасность пути', 'Позиции с более опасным маршрутом отбрасываются.'),
  percent('minimumProtection', 'constraints', 'Minimum protection', 'Минимальная защита', 'Позиции с меньшей защитой отбрасываются.'),
  percent('minimumConcealment', 'constraints', 'Minimum concealment', 'Минимальная скрытность', 'Позиции с меньшей скрытностью отбрасываются.'),
  percent('minimumDirectionalFit', 'constraints', 'Minimum direction fit', 'Минимум направления', 'Минимальное качество нужного направления.'),
  percent('minimumLineQuality', 'constraints', 'Minimum line quality', 'Минимум обзора или огня', 'Минимальное качество точной линии.'),
  number('minimumTargetDistanceMeters', 'constraints', 'Minimum target distance', 'Минимальная дальность до цели', 'Ноль не вводит дополнительный минимум.', 0, 3000, 1, 'м'),
  number('maximumTargetDistanceMeters', 'constraints', 'Maximum target distance', 'Максимальная дальность до цели', 'Ноль использует предел цели или оружия.', 0, 5000, 1, 'м'),
  number('desiredDistanceToleranceMeters', 'constraints', 'Desired distance tolerance', 'Допуск желаемой дистанции', 'Ширина области без сильного штрафа вокруг желаемой дистанции.', 0.1, 1000, 0.5, 'м'),
  boolean('allowStanding', 'posture', 'Allow standing', 'Разрешить стоя', 'Разрешает позиции, используемые стоя.'),
  boolean('allowCrouched', 'posture', 'Allow crouched', 'Разрешить пригнувшись', 'Разрешает позиции, используемые пригнувшись.'),
  boolean('allowProne', 'posture', 'Allow prone', 'Разрешить лёжа', 'Разрешает позиции, используемые лёжа.'),
  boolean('requireVisualLine', 'constraints', 'Require visual line', 'Требовать видимость', 'Для наблюдения требует точную визуальную линию.', true),
  boolean('requireBallisticLine', 'constraints', 'Require ballistic line', 'Требовать линию огня', 'Для огневой позиции требует точную баллистическую линию.', true),
  number('transitionPenaltyStanding', 'posture', 'Standing transition penalty', 'Цена перехода в стойку', 'Штраф за смену текущей позы на стойку.', 0, 50, 0.5, undefined, true),
  number('transitionPenaltyCrouched', 'posture', 'Crouched transition penalty', 'Цена перехода в пригнувшись', 'Штраф за смену текущей позы на пригнувшись.', 0, 50, 0.5, undefined, true),
  number('transitionPenaltyProne', 'posture', 'Prone transition penalty', 'Цена перехода лёжа', 'Штраф за смену текущей позы на лёжа.', 0, 50, 0.5, undefined, true),
  weight('postureDangerExposureWeight', 'posture', 'Posture danger weight', 'Влияние опасности на позу', 'Насколько опасность понижает высокие позы.', true),

  number('candidateScanLimit', 'performance', 'Indexed candidate scan', 'Лимит просмотренных кандидатов', 'Ограничивает чтение индексированных мест. Большое значение повышает цену поиска.', 64, 4096, 32, undefined, true),
  number('preliminaryCandidates', 'performance', 'Preliminary candidates', 'Предварительные кандидаты', 'Сколько лучших дешёвых кандидатов оставить. Большое значение повышает цену.', 8, 128, 1, undefined, true),
  number('exactCandidates', 'performance', 'Exact candidates', 'Точные кандидаты', 'Сколько кандидатов подвергать точным проверкам.', 1, 32, 1, undefined, true),
  number('exactRayLimit', 'performance', 'Exact ray checks', 'Точные лучевые проверки', 'Общий предел дорогих лучевых проверок.', 0, 128, 1, undefined, true),
  number('maxRouteExpansions', 'performance', 'Route expansions', 'Расширения маршрута', 'Предел расширений одного локального поля достижимости.', 64, 8192, 64, undefined, true),
  number('maximumRouteCost', 'performance', 'Maximum route cost', 'Максимальная стоимость пути', 'Недостижимые по стоимости позиции отбрасываются.', 1, 1000000, 100, undefined, true),
  number('objectiveCandidatePool', 'performance', 'Objective ranking pool', 'Выборка задачи движения', 'Сколько точно проверенных позиций участвует в окончательном ранжировании.', 1, 32, 1, undefined, true),
  number('minimumSeparationMeters', 'performance', 'Minimum separation', 'Минимальный разнос', 'Минимальное расстояние между похожими результатами.', 0, 100, 0.5, 'м', true),
  number('maxCalculationMs', 'performance', 'Legacy graph time budget', 'Бюджет шага графа', 'Ограничивает только старый синхронный шаг графа; рабочий поток имеет собственные числовые лимиты.', 0.1, 100, 0.1, 'мс', true),
]);

const DEFENSE_WEIGHTS: TacticalPositionRankingWeights = Object.freeze({
  staticPotential: 0.18,
  directionalFit: 0.16,
  lineQuality: 0.03,
  rangeFit: 0,
  desiredDistance: 0,
  protection: 0.29,
  concealment: 0.09,
  danger: 0.10,
  routeDanger: 0.06,
  routeCost: 0,
  certainty: 0.04,
  orderAlignment: 0.03,
  withdrawal: 0.02,
  postureFit: 0,
});
const OBSERVATION_WEIGHTS: TacticalPositionRankingWeights = Object.freeze({
  staticPotential: 0.19,
  directionalFit: 0.13,
  lineQuality: 0.25,
  rangeFit: 0,
  desiredDistance: 0,
  protection: 0.08,
  concealment: 0.12,
  danger: 0.09,
  routeDanger: 0.05,
  routeCost: 0,
  certainty: 0.04,
  orderAlignment: 0.03,
  withdrawal: 0.02,
  postureFit: 0,
});
const FIRING_WEIGHTS: TacticalPositionRankingWeights = Object.freeze({
  staticPotential: 0.16,
  directionalFit: 0.12,
  lineQuality: 0.24,
  rangeFit: 0.16,
  desiredDistance: 0,
  protection: 0.08,
  concealment: 0.06,
  danger: 0.07,
  routeDanger: 0.04,
  routeCost: 0,
  certainty: 0.02,
  orderAlignment: 0.03,
  withdrawal: 0.02,
  postureFit: 0,
});

export const DEFAULT_TACTICAL_POSITION_RANKING_BY_KIND: Readonly<Record<TacticalPositionNodeKind, TacticalPositionRankingWeights>> = Object.freeze({
  observation: OBSERVATION_WEIGHTS,
  defense: DEFENSE_WEIGHTS,
  firing: FIRING_WEIGHTS,
});

function qualityBalance(kind: TacticalPositionNodeKind): { tactical: number; movement: number; continueInfluence: number } {
  if (kind === 'defense') return { tactical: 0.58, movement: 0.42, continueInfluence: 0.5918367347 };
  return { tactical: 0.66, movement: 0.34, continueInfluence: 0.8319327731 };
}

export function createDefaultTacticalPositionNodeParameters(
  kind: TacticalPositionNodeKind = 'defense',
  objective: TacticalPositionNodeObjective = 'balanced',
): TacticalPositionNodeParameters {
  const normalizedKind = normalizeKind(kind);
  const normalizedObjective = normalizeObjective(objective);
  const weights = DEFAULT_TACTICAL_POSITION_RANKING_BY_KIND[normalizedKind];
  const balance = qualityBalance(normalizedKind);
  return {
    kind: normalizedKind,
    objective: normalizedObjective,
    queryKey: 'tactical_position_query',
    targetMode: 'automatic',
    targetPoint: null,
    sectorCenterDegrees: 0,
    sectorArcDegrees: 90,
    searchRadiusMeters: 50,
    maxCandidates: 12,
    desiredDistanceMeters: 0,
    tacticalQualityWeight: balance.tactical,
    movementObjectiveWeight: balance.movement,
    staticPotentialWeight: weights.staticPotential,
    directionalFitWeight: weights.directionalFit,
    lineQualityWeight: weights.lineQuality,
    rangeFitWeight: weights.rangeFit,
    desiredDistanceWeight: weights.desiredDistance,
    protectionWeight: weights.protection,
    concealmentWeight: weights.concealment,
    dangerWeight: weights.danger,
    routeDangerWeight: weights.routeDanger,
    routeCostWeight: weights.routeCost,
    certaintyWeight: weights.certainty,
    orderAlignmentWeight: weights.orderAlignment,
    withdrawalWeight: weights.withdrawal,
    postureFitWeight: weights.postureFit,
    balancedObjectiveInfluence: 0,
    advanceObjectiveInfluence: 1,
    withdrawObjectiveInfluence: 1,
    continueOrderObjectiveInfluence: balance.continueInfluence,
    wrongDirectionPenalty: 0,
    objectiveDistanceToleranceMeters: 2,
    maxPositionDanger: 78,
    maxRouteDanger: 100,
    minimumProtection: normalizedKind === 'defense' ? 10 : 0,
    minimumConcealment: 0,
    minimumDirectionalFit: normalizedKind === 'observation' || normalizedKind === 'firing' ? 18 : 0,
    minimumLineQuality: 18,
    minimumTargetDistanceMeters: 0,
    maximumTargetDistanceMeters: 0,
    desiredDistanceToleranceMeters: 10,
    allowStanding: true,
    allowCrouched: true,
    allowProne: true,
    requireVisualLine: false,
    requireBallisticLine: false,
    transitionPenaltyStanding: 3,
    transitionPenaltyCrouched: 3,
    transitionPenaltyProne: 7,
    postureDangerExposureWeight: 0.30,
    candidateScanLimit: 864,
    preliminaryCandidates: 36,
    exactCandidates: 12,
    exactRayLimit: 32,
    maxRouteExpansions: 1728,
    maximumRouteCost: 100000,
    objectiveCandidatePool: 12,
    minimumSeparationMeters: 4,
    maxCalculationMs: 12,
  };
}

export function normalizeTacticalPositionNodeParameters(value: Readonly<Record<string, unknown>> | null | undefined): TacticalPositionNodeParameters {
  const source = value ?? {};
  const kind = normalizeKind(source.kind);
  const objective = normalizeObjective(source.objective);
  const defaults = createDefaultTacticalPositionNodeParameters(kind, objective);
  const result: TacticalPositionNodeParameters = {};
  for (const [key, entry] of Object.entries(source)) {
    if (isParameterValue(entry)) result[key] = cloneParameterValue(entry);
  }
  for (const [key, entry] of Object.entries(defaults)) result[key] = cloneParameterValue(entry);

  result.kind = kind;
  result.objective = objective;
  result.queryKey = readString(source.queryKey, defaults.queryKey as string);
  result.targetMode = normalizeTargetMode(source.targetMode);
  result.targetPoint = readPosition(source.targetPoint);
  result.sectorCenterDegrees = readNumber(source.sectorCenterDegrees, 0, -360, 360);
  result.sectorArcDegrees = readNumber(source.sectorArcDegrees, 90, 1, 360);
  result.searchRadiusMeters = readNumber(source.searchRadiusMeters, 50, 1, 500);
  result.maxCandidates = readInteger(source.maxCandidates, 12, 1, 16);
  result.desiredDistanceMeters = readNumber(source.desiredDistanceMeters, 0, 0, 3000);

  for (const id of RANKING_FIELD_IDS) result[id] = readNumber(source[id], defaults[id] as number, 0, 10);
  result.wrongDirectionPenalty = readNumber(source.wrongDirectionPenalty, defaults.wrongDirectionPenalty as number, 0, 100);
  result.objectiveDistanceToleranceMeters = readNumber(source.objectiveDistanceToleranceMeters, defaults.objectiveDistanceToleranceMeters as number, 0, 100);

  for (const id of PERCENT_CONSTRAINT_IDS) result[id] = readNumber(source[id], defaults[id] as number, 0, 100);
  result.minimumTargetDistanceMeters = readNumber(source.minimumTargetDistanceMeters, 0, 0, 3000);
  result.maximumTargetDistanceMeters = readNumber(source.maximumTargetDistanceMeters, 0, 0, 5000);
  result.desiredDistanceToleranceMeters = readNumber(source.desiredDistanceToleranceMeters, 10, 0.1, 1000);
  result.allowStanding = readBoolean(source.allowStanding, true);
  result.allowCrouched = readBoolean(source.allowCrouched, true);
  result.allowProne = readBoolean(source.allowProne, true);
  if (!result.allowStanding && !result.allowCrouched && !result.allowProne) result.allowStanding = true;
  result.requireVisualLine = readBoolean(source.requireVisualLine, false);
  result.requireBallisticLine = readBoolean(source.requireBallisticLine, false);
  result.transitionPenaltyStanding = readNumber(source.transitionPenaltyStanding, 3, 0, 50);
  result.transitionPenaltyCrouched = readNumber(source.transitionPenaltyCrouched, 3, 0, 50);
  result.transitionPenaltyProne = readNumber(source.transitionPenaltyProne, 7, 0, 50);
  result.postureDangerExposureWeight = readNumber(source.postureDangerExposureWeight, 0.30, 0, 10);

  result.candidateScanLimit = readInteger(source.candidateScanLimit, 864, 64, 4096);
  result.preliminaryCandidates = readInteger(source.preliminaryCandidates, 36, 8, 128);
  result.exactCandidates = readInteger(source.exactCandidates, 12, 1, 32);
  result.exactRayLimit = readInteger(source.exactRayLimit, 32, 0, 128);
  result.maxRouteExpansions = readInteger(source.maxRouteExpansions, 1728, 64, 8192);
  result.maximumRouteCost = readNumber(source.maximumRouteCost, 100000, 1, 1000000);
  result.objectiveCandidatePool = readInteger(source.objectiveCandidatePool, 12, 1, 32);
  result.minimumSeparationMeters = readNumber(source.minimumSeparationMeters, 4, 0, 100);
  result.maxCalculationMs = readNumber(source.maxCalculationMs, 12, 0.1, 100);

  result.exactCandidates = Math.max(result.exactCandidates as number, result.maxCandidates as number);
  result.preliminaryCandidates = Math.max(result.preliminaryCandidates as number, result.exactCandidates as number);
  result.candidateScanLimit = Math.max(result.candidateScanLimit as number, result.preliminaryCandidates as number);
  result.objectiveCandidatePool = Math.min(
    result.exactCandidates as number,
    Math.max(result.maxCandidates as number, result.objectiveCandidatePool as number),
  );
  if ((result.maximumTargetDistanceMeters as number) > 0) {
    result.maximumTargetDistanceMeters = Math.max(
      result.maximumTargetDistanceMeters as number,
      result.minimumTargetDistanceMeters as number,
    );
  }
  return result;
}

export function readTacticalPositionNodeSettings(value: Readonly<Record<string, unknown>> | null | undefined): TacticalPositionNodeSettings {
  const parameters = normalizeTacticalPositionNodeParameters(value);
  const kind = parameters.kind as TacticalPositionNodeKind;
  const objective = parameters.objective as TacticalPositionNodeObjective;
  const rankingSettings: TacticalPositionRankingSettings = Object.freeze({
    tacticalQualityWeight: parameters.tacticalQualityWeight as number,
    movementObjectiveWeight: parameters.movementObjectiveWeight as number,
    weights: Object.freeze({
      staticPotential: parameters.staticPotentialWeight as number,
      directionalFit: parameters.directionalFitWeight as number,
      lineQuality: parameters.lineQualityWeight as number,
      rangeFit: parameters.rangeFitWeight as number,
      desiredDistance: parameters.desiredDistanceWeight as number,
      protection: parameters.protectionWeight as number,
      concealment: parameters.concealmentWeight as number,
      danger: parameters.dangerWeight as number,
      routeDanger: parameters.routeDangerWeight as number,
      routeCost: parameters.routeCostWeight as number,
      certainty: parameters.certaintyWeight as number,
      orderAlignment: parameters.orderAlignmentWeight as number,
      withdrawal: parameters.withdrawalWeight as number,
      postureFit: parameters.postureFitWeight as number,
    }),
  });
  const movementObjective: TacticalPositionMovementObjectiveSettings = Object.freeze({
    balancedInfluence: parameters.balancedObjectiveInfluence as number,
    advanceToThreatInfluence: parameters.advanceObjectiveInfluence as number,
    withdrawFromThreatInfluence: parameters.withdrawObjectiveInfluence as number,
    continueOrderInfluence: parameters.continueOrderObjectiveInfluence as number,
    wrongDirectionPenalty: parameters.wrongDirectionPenalty as number,
    distanceToleranceMeters: parameters.objectiveDistanceToleranceMeters as number,
  });
  const constraints: TacticalPositionConstraintSettings = Object.freeze({
    maxPositionDanger: parameters.maxPositionDanger as number,
    maxRouteDanger: parameters.maxRouteDanger as number,
    minimumProtection: parameters.minimumProtection as number,
    minimumConcealment: parameters.minimumConcealment as number,
    minimumDirectionalFit: parameters.minimumDirectionalFit as number,
    minimumLineQuality: parameters.minimumLineQuality as number,
    minimumTargetDistanceMeters: parameters.minimumTargetDistanceMeters as number,
    maximumTargetDistanceMeters: parameters.maximumTargetDistanceMeters as number,
    desiredDistanceMeters: parameters.desiredDistanceMeters as number,
    desiredDistanceToleranceMeters: parameters.desiredDistanceToleranceMeters as number,
    allowedPostures: Object.freeze({
      standing: parameters.allowStanding as boolean,
      crouched: parameters.allowCrouched as boolean,
      prone: parameters.allowProne as boolean,
    }),
    requireVisualLine: parameters.requireVisualLine as boolean,
    requireBallisticLine: parameters.requireBallisticLine as boolean,
  });
  const posture: TacticalPositionPostureSettings = Object.freeze({
    transitionPenaltyStanding: parameters.transitionPenaltyStanding as number,
    transitionPenaltyCrouched: parameters.transitionPenaltyCrouched as number,
    transitionPenaltyProne: parameters.transitionPenaltyProne as number,
    dangerExposureWeight: parameters.postureDangerExposureWeight as number,
  });
  const searchBudget: TacticalPositionSearchBudgetSettings = Object.freeze({
    maxCandidates: parameters.maxCandidates as number,
    candidateScanLimit: parameters.candidateScanLimit as number,
    preliminaryCandidates: parameters.preliminaryCandidates as number,
    exactCandidates: parameters.exactCandidates as number,
    exactRayLimit: parameters.exactRayLimit as number,
    maxRouteExpansions: parameters.maxRouteExpansions as number,
    maximumRouteCost: parameters.maximumRouteCost as number,
    objectiveCandidatePool: parameters.objectiveCandidatePool as number,
    minimumSeparationMeters: parameters.minimumSeparationMeters as number,
  });
  const search: TacticalPositionSearchSettings = Object.freeze({
    version: 1,
    ranking: rankingSettings,
    movementObjective,
    constraints,
    posture,
    searchBudget,
  });
  return Object.freeze({
    version: 1,
    queryKey: parameters.queryKey as string,
    kind,
    objective,
    target: Object.freeze({
      mode: parameters.targetMode as TacticalPositionNodeTargetMode,
      point: parameters.targetPoint ? Object.freeze({ ...(parameters.targetPoint as { x: number; y: number }) }) : null,
      sectorCenterDegrees: parameters.sectorCenterDegrees as number,
      sectorArcDegrees: parameters.sectorArcDegrees as number,
    }),
    searchRadiusMeters: parameters.searchRadiusMeters as number,
    maxCalculationMs: parameters.maxCalculationMs as number,
    search,
    ranking: rankingSettings,
    movementObjective,
    constraints,
    posture,
    searchBudget,
  });
}

export function tacticalPositionSearchSettingsDigest(settings: TacticalPositionSearchSettings): string {
  return stableSerialize(settings);
}

export function resetTacticalPositionNodeParameter(
  parameters: Readonly<Record<string, unknown>>,
  parameterId: string,
): TacticalPositionNodeParameters {
  const current = normalizeTacticalPositionNodeParameters(parameters);
  const defaults = createDefaultTacticalPositionNodeParameters(current.kind as TacticalPositionNodeKind, current.objective as TacticalPositionNodeObjective);
  if (Object.prototype.hasOwnProperty.call(defaults, parameterId)) current[parameterId] = cloneParameterValue(defaults[parameterId]!);
  return normalizeTacticalPositionNodeParameters(current);
}

export function resetTacticalPositionNodeParameterGroup(
  parameters: Readonly<Record<string, unknown>>,
  group: TacticalPositionNodeParameterGroup,
): TacticalPositionNodeParameters {
  const current = normalizeTacticalPositionNodeParameters(parameters);
  const defaults = createDefaultTacticalPositionNodeParameters(current.kind as TacticalPositionNodeKind, current.objective as TacticalPositionNodeObjective);
  for (const descriptor of TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS) {
    if (descriptor.group === group && Object.prototype.hasOwnProperty.call(defaults, descriptor.id)) {
      current[descriptor.id] = cloneParameterValue(defaults[descriptor.id]!);
    }
  }
  return normalizeTacticalPositionNodeParameters(current);
}

const RANKING_FIELD_IDS = Object.freeze([
  'tacticalQualityWeight',
  'movementObjectiveWeight',
  'staticPotentialWeight',
  'directionalFitWeight',
  'lineQualityWeight',
  'rangeFitWeight',
  'desiredDistanceWeight',
  'protectionWeight',
  'concealmentWeight',
  'dangerWeight',
  'routeDangerWeight',
  'routeCostWeight',
  'certaintyWeight',
  'orderAlignmentWeight',
  'withdrawalWeight',
  'postureFitWeight',
  'balancedObjectiveInfluence',
  'advanceObjectiveInfluence',
  'withdrawObjectiveInfluence',
  'continueOrderObjectiveInfluence',
] as const);
const PERCENT_CONSTRAINT_IDS = Object.freeze([
  'maxPositionDanger',
  'maxRouteDanger',
  'minimumProtection',
  'minimumConcealment',
  'minimumDirectionalFit',
  'minimumLineQuality',
] as const);

function normalizeKind(value: unknown): TacticalPositionNodeKind {
  if (value === 'observation' || value === 'firing') return value;
  return 'defense';
}
function normalizeObjective(value: unknown): TacticalPositionNodeObjective {
  if (value === 'advance_to_threat' || value === 'withdraw_from_threat' || value === 'continue_order') return value;
  return 'balanced';
}
function normalizeTargetMode(value: unknown): TacticalPositionNodeTargetMode {
  if (value === 'order_point' || value === 'facing_sector') return value;
  return 'automatic';
}
function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
function readNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}
function readInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(readNumber(value, fallback, minimum, maximum));
}
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function readPosition(value: unknown): { readonly x: number; readonly y: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null;
}
function isParameterValue(value: unknown): value is TacticalPositionNodeParameterValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || readPosition(value) !== null;
}
function cloneParameterValue(value: TacticalPositionNodeParameterValue): TacticalPositionNodeParameterValue {
  return typeof value === 'object' && value !== null ? { ...value } : value;
}
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
  return `{${entries.join(',')}}`;
}
