import type {
  TacticalPositionNodeKind,
  TacticalPositionNodeParameterDescriptor,
  TacticalPositionNodeParameterGroup,
  TacticalPositionNodeParameterGroupDescriptor,
  TacticalPositionRankingWeights,
} from './TacticalPositionNodeSettingsTypes';

export const TACTICAL_POSITION_NODE_PARAMETER_GROUPS: readonly TacticalPositionNodeParameterGroupDescriptor[] = Object.freeze([
  { id: 'main', label: 'Main', labelRu: 'Основные', descriptionRu: 'Тип, задача, цель и объём результата.', collapsedByDefault: false },
  { id: 'ranking', label: 'Ranking', labelRu: 'Веса оценки', descriptionRu: 'Что важнее при итоговом выборе.', collapsedByDefault: false },
  { id: 'movement', label: 'Movement', labelRu: 'Задача движения', descriptionRu: 'Сила сближения, отхода и продолжения приказа.', collapsedByDefault: true },
  { id: 'constraints', label: 'Constraints', labelRu: 'Ограничения', descriptionRu: 'Условия отбрасывания позиции.', collapsedByDefault: true },
  { id: 'posture', label: 'Posture', labelRu: 'Поза', descriptionRu: 'Допустимые позы и цена перехода.', collapsedByDefault: true },
  { id: 'performance', label: 'Performance', labelRu: 'Производительность — расширенные', descriptionRu: 'Жёсткие пределы вычислений.', collapsedByDefault: true },
]);

const KIND_OPTIONS = Object.freeze([
  { value: 'observation', label: 'Observation', labelRu: 'Наблюдение' },
  { value: 'defense', label: 'Defense', labelRu: 'Оборона' },
  { value: 'firing', label: 'Firing', labelRu: 'Огневая позиция' },
]);
const OBJECTIVE_OPTIONS = Object.freeze([
  { value: 'balanced', label: 'Balanced', labelRu: 'Сбалансированно' },
  { value: 'advance_to_threat', label: 'Advance', labelRu: 'Сближение с угрозой' },
  { value: 'withdraw_from_threat', label: 'Withdraw', labelRu: 'Удаление от угрозы' },
  { value: 'continue_order', label: 'Continue order', labelRu: 'Продолжение приказа' },
]);
const TARGET_OPTIONS = Object.freeze([
  { value: 'automatic', label: 'Automatic', labelRu: 'Автоматически' },
  { value: 'order_point', label: 'Order point', labelRu: 'Точка приказа' },
  { value: 'facing_sector', label: 'Facing sector', labelRu: 'Сектор взгляда' },
]);

const descriptor = (
  id: string,
  kind: TacticalPositionNodeParameterDescriptor['kind'],
  group: TacticalPositionNodeParameterGroup,
  labelRu: string,
  descriptionRu: string,
  extra: Partial<TacticalPositionNodeParameterDescriptor> = {},
): TacticalPositionNodeParameterDescriptor => ({ id, kind, group, label: labelRu, labelRu, description: descriptionRu, descriptionRu, ...extra });
const weight = (id: string, group: TacticalPositionNodeParameterGroup, labelRu: string, descriptionRu: string, advanced = false) => descriptor(id, 'number', group, labelRu, descriptionRu, { minimum: 0, maximum: 10, step: 0.01, slider: true, advanced });
const percent = (id: string, group: TacticalPositionNodeParameterGroup, labelRu: string, descriptionRu: string, advanced = false) => descriptor(id, 'number', group, labelRu, descriptionRu, { minimum: 0, maximum: 100, step: 1, unit: '%', slider: true, advanced });
const number = (id: string, group: TacticalPositionNodeParameterGroup, labelRu: string, descriptionRu: string, minimum: number, maximum: number, step: number, unit?: string, advanced = false) => descriptor(id, 'number', group, labelRu, descriptionRu, { minimum, maximum, step, unit, advanced });
const boolean = (id: string, group: TacticalPositionNodeParameterGroup, labelRu: string, descriptionRu: string, advanced = false) => descriptor(id, 'boolean', group, labelRu, descriptionRu, { advanced });

export const TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS: readonly TacticalPositionNodeParameterDescriptor[] = Object.freeze([
  descriptor('kind', 'enum', 'main', 'Тип позиции', 'Какой тип позиции искать.', { options: KIND_OPTIONS }),
  descriptor('objective', 'enum', 'main', 'Задача движения', 'Как учитывать направление движения.', { options: OBJECTIVE_OPTIONS }),
  descriptor('queryKey', 'string', 'main', 'Ключ запроса', 'Связывает ноды одного запроса.'),
  descriptor('targetMode', 'enum', 'main', 'Источник цели', 'Откуда брать направление или точку.', { options: TARGET_OPTIONS }),
  descriptor('targetPoint', 'position', 'main', 'Точка цели', 'Необязательная явная точка.'),
  number('sectorCenterDegrees', 'main', 'Смещение сектора', 'Смещение центра сектора.', -360, 360, 1, '°'),
  number('sectorArcDegrees', 'main', 'Ширина сектора', 'Угол сектора поиска.', 1, 360, 1, '°'),
  number('searchRadiusMeters', 'main', 'Радиус поиска', 'Максимальный радиус поиска.', 1, 500, 1, 'м'),
  number('maxCandidates', 'main', 'Максимум результатов', 'Сколько позиций вернуть.', 1, 16, 1),
  number('desiredDistanceMeters', 'main', 'Желаемая дистанция', 'Ноль использует автоматическое значение.', 0, 3000, 1, 'м'),
  weight('tacticalQualityWeight', 'ranking', 'Тактическое качество', 'Общий вес качества позиции.'),
  weight('movementObjectiveWeight', 'ranking', 'Задача движения', 'Общий вес задачи движения.'),
  weight('staticPotentialWeight', 'ranking', 'Потенциал места', 'Вес качества постоянной основы.'),
  weight('directionalFitWeight', 'ranking', 'Подходящее направление', 'Вес соответствия направлению.'),
  weight('lineQualityWeight', 'ranking', 'Обзор или линия огня', 'Вес точной линии.'),
  weight('rangeFitWeight', 'ranking', 'Дальность оружия', 'Вес рабочей дальности.'),
  weight('desiredDistanceWeight', 'ranking', 'Желаемая дистанция', 'Вес желаемой дистанции.'),
  weight('protectionWeight', 'ranking', 'Защита', 'Вес защиты.'),
  weight('concealmentWeight', 'ranking', 'Скрытность', 'Вес скрытности.'),
  weight('dangerWeight', 'ranking', 'Низкая опасность', 'Вес низкой опасности.'),
  weight('routeDangerWeight', 'ranking', 'Безопасность маршрута', 'Вес безопасности пути.'),
  weight('routeCostWeight', 'ranking', 'Стоимость маршрута', 'Вес дешёвого и короткого пути.'),
  weight('certaintyWeight', 'ranking', 'Уверенность', 'Вес низкой неопределённости.'),
  weight('orderAlignmentWeight', 'ranking', 'Соответствие приказу', 'Вес близости к приказу.', true),
  weight('withdrawalWeight', 'ranking', 'Качество отхода', 'Вес безопасного пути отхода.', true),
  weight('postureFitWeight', 'ranking', 'Подходящая поза', 'Вес качества рекомендуемой позы.', true),
  weight('balancedObjectiveInfluence', 'movement', 'Сила balanced', 'Сохранение текущей дистанции.', true),
  weight('advanceObjectiveInfluence', 'movement', 'Сила сближения', 'Приближение к угрозе.', true),
  weight('withdrawObjectiveInfluence', 'movement', 'Сила удаления', 'Удаление от угрозы.', true),
  weight('continueOrderObjectiveInfluence', 'movement', 'Сила продолжения приказа', 'Приближение к точке приказа.', true),
  percent('wrongDirectionPenalty', 'movement', 'Штраф неверного направления', 'Штраф за движение вопреки задаче.', true),
  number('objectiveDistanceToleranceMeters', 'movement', 'Допуск по дистанции', 'Малое изменение считается нейтральным.', 0, 100, 0.5, 'м', true),
  percent('maxPositionDanger', 'constraints', 'Максимальная опасность', 'Более опасные позиции отбрасываются.'),
  percent('maxRouteDanger', 'constraints', 'Максимальная опасность пути', 'Более опасные маршруты отбрасываются.'),
  percent('minimumProtection', 'constraints', 'Минимальная защита', 'Минимум защиты позиции.'),
  percent('minimumConcealment', 'constraints', 'Минимальная скрытность', 'Минимум скрытности позиции.'),
  percent('minimumDirectionalFit', 'constraints', 'Минимум направления', 'Минимальное качество направления.'),
  percent('minimumLineQuality', 'constraints', 'Минимум обзора или огня', 'Минимальное качество точной линии.'),
  number('minimumTargetDistanceMeters', 'constraints', 'Минимальная дальность до цели', 'Ноль не вводит минимум.', 0, 3000, 1, 'м'),
  number('maximumTargetDistanceMeters', 'constraints', 'Максимальная дальность до цели', 'Ноль использует предел цели или оружия.', 0, 5000, 1, 'м'),
  number('desiredDistanceToleranceMeters', 'constraints', 'Допуск желаемой дистанции', 'Ширина области без сильного штрафа.', 0.1, 1000, 0.5, 'м'),
  boolean('allowStanding', 'posture', 'Разрешить стоя', 'Разрешает стойку.'),
  boolean('allowCrouched', 'posture', 'Разрешить пригнувшись', 'Разрешает пригнувшуюся позу.'),
  boolean('allowProne', 'posture', 'Разрешить лёжа', 'Разрешает положение лёжа.'),
  boolean('requireVisualLine', 'constraints', 'Требовать видимость', 'Требует точную визуальную линию.', true),
  boolean('requireBallisticLine', 'constraints', 'Требовать линию огня', 'Требует точную баллистическую линию.', true),
  number('transitionPenaltyStanding', 'posture', 'Цена перехода в стойку', 'Штраф смены позы.', 0, 50, 0.5, undefined, true),
  number('transitionPenaltyCrouched', 'posture', 'Цена перехода в пригнувшись', 'Штраф смены позы.', 0, 50, 0.5, undefined, true),
  number('transitionPenaltyProne', 'posture', 'Цена перехода лёжа', 'Штраф смены позы.', 0, 50, 0.5, undefined, true),
  weight('postureDangerExposureWeight', 'posture', 'Влияние опасности на позу', 'Насколько опасность понижает высокие позы.', true),
  number('candidateScanLimit', 'performance', 'Лимит просмотренных кандидатов', 'Ограничивает чтение индекса.', 64, 4096, 32, undefined, true),
  number('preliminaryCandidates', 'performance', 'Предварительные кандидаты', 'Число дешёво оценённых позиций.', 8, 128, 1, undefined, true),
  number('exactCandidates', 'performance', 'Точные кандидаты', 'Число точных проверок.', 1, 32, 1, undefined, true),
  number('exactRayLimit', 'performance', 'Точные лучевые проверки', 'Общий предел дорогих лучей.', 0, 128, 1, undefined, true),
  number('maxRouteExpansions', 'performance', 'Расширения маршрута', 'Предел одного поля достижимости.', 64, 8192, 64, undefined, true),
  number('maximumRouteCost', 'performance', 'Максимальная стоимость пути', 'Предел стоимости маршрута.', 1, 1_000_000, 100, undefined, true),
  number('objectiveCandidatePool', 'performance', 'Выборка задачи движения', 'Пул итогового ранжирования.', 1, 32, 1, undefined, true),
  number('minimumSeparationMeters', 'performance', 'Минимальный разнос', 'Разнос похожих результатов.', 0, 100, 0.5, 'м', true),
  number('maxCalculationMs', 'performance', 'Бюджет шага графа', 'Только старый синхронный бюджет.', 0.1, 100, 0.1, 'мс', true),
]);

export const DEFAULT_TACTICAL_POSITION_RANKING_BY_KIND: Readonly<Record<TacticalPositionNodeKind, TacticalPositionRankingWeights>> = Object.freeze({
  observation: { staticPotential: 0.19, directionalFit: 0.13, lineQuality: 0.25, rangeFit: 0, desiredDistance: 0, protection: 0.08, concealment: 0.12, danger: 0.09, routeDanger: 0.05, routeCost: 0, certainty: 0.04, orderAlignment: 0.03, withdrawal: 0.02, postureFit: 0 },
  defense: { staticPotential: 0.18, directionalFit: 0.16, lineQuality: 0.03, rangeFit: 0, desiredDistance: 0, protection: 0.29, concealment: 0.09, danger: 0.10, routeDanger: 0.06, routeCost: 0, certainty: 0.04, orderAlignment: 0.03, withdrawal: 0.02, postureFit: 0 },
  firing: { staticPotential: 0.16, directionalFit: 0.12, lineQuality: 0.24, rangeFit: 0.16, desiredDistance: 0, protection: 0.08, concealment: 0.06, danger: 0.07, routeDanger: 0.04, routeCost: 0, certainty: 0.02, orderAlignment: 0.03, withdrawal: 0.02, postureFit: 0 },
});
