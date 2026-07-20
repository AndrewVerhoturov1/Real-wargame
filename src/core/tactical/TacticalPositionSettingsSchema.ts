import type { TacticalPositionSettings } from './TacticalPositionSettings';

export type TacticalPositionNumericSettingKey = {
  [Key in keyof TacticalPositionSettings]: TacticalPositionSettings[Key] extends number ? Key : never;
}[keyof TacticalPositionSettings];

export type TacticalPositionBooleanSettingKey = {
  [Key in keyof TacticalPositionSettings]: TacticalPositionSettings[Key] extends boolean ? Key : never;
}[keyof TacticalPositionSettings];

export interface TacticalPositionNumericFieldDefinition {
  readonly key: TacticalPositionNumericSettingKey;
  readonly labelRu: string;
  readonly helpRu: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface TacticalPositionBooleanFieldDefinition {
  readonly key: TacticalPositionBooleanSettingKey;
  readonly labelRu: string;
  readonly helpRu: string;
}

export interface TacticalPositionSettingsGroupDefinition {
  readonly id: 'posture' | 'selection' | 'ranking' | 'display';
  readonly titleRu: string;
  readonly numericFields: readonly TacticalPositionNumericFieldDefinition[];
  readonly booleanFields?: readonly TacticalPositionBooleanFieldDefinition[];
}

const numeric = (
  key: TacticalPositionNumericSettingKey,
  labelRu: string,
  helpRu: string,
  min: number,
  max: number,
  step: number,
): TacticalPositionNumericFieldDefinition => ({ key, labelRu, helpRu, min, max, step });

export const TACTICAL_POSITION_SETTINGS_GROUPS: readonly TacticalPositionSettingsGroupDefinition[] = [
  {
    id: 'posture',
    titleRu: 'Выбор позы',
    numericFields: [
      numeric('standingMaximumDanger', 'Стоя: максимальная опасность', 'Выше этого значения положение стоя недопустимо.', 0, 100, 1),
      numeric('standingMinimumSafety', 'Стоя: минимальная безопасность', 'Минимальная безопасность для положения стоя.', 0, 100, 1),
      numeric('crouchedMaximumDanger', 'Пригнувшись: максимальная опасность', 'Выше этого значения положение пригнувшись недопустимо.', 0, 100, 1),
      numeric('crouchedMinimumSafety', 'Пригнувшись: минимальная безопасность', 'Минимальная безопасность для положения пригнувшись.', 0, 100, 1),
      numeric('crouchedSafetyAdvantageThreshold', 'Выигрыш для позы пригнувшись', 'Насколько безопаснее должна быть поза пригнувшись, чтобы победить допустимое положение стоя.', 0, 100, 0.5),
      numeric('proneSafetyAdvantageThreshold', 'Выигрыш для положения лёжа', 'Насколько безопаснее должна быть поза лёжа, чтобы победить выбранную более высокую позу.', 0, 100, 0.5),
      numeric('crouchedTransitionPenalty', 'Штраф перехода пригнувшись', 'Снижает оценку бессмысленных частых переходов в низкую позу.', 0, 50, 0.5),
      numeric('proneTransitionPenalty', 'Штраф перехода лёжа', 'Снижает оценку положения лёжа, если выигрыш недостаточен.', 0, 50, 0.5),
      numeric('postureProtectionGainFactor', 'Влияние защиты позы', 'Множитель дополнительной защиты, которую даёт выбранная поза.', 0, 2, 0.05),
      numeric('dangerReductionSafetyWeight', 'Опасность → безопасность', 'Влияние снижения остаточной опасности на оценку безопасности.', 0, 2, 0.05),
      numeric('protectionGainSafetyWeight', 'Защита → безопасность', 'Влияние прироста защиты на оценку безопасности.', 0, 2, 0.05),
    ],
    booleanFields: [
      {
        key: 'moveCrouchedToProtectedPosition',
        labelRu: 'К низкой позиции двигаться пригнувшись',
        helpRu: 'К позиции пригнувшись или лёжа боец подходит пригнувшись, а на точке принимает точную рекомендованную позу.',
      },
    ],
  },
  {
    id: 'selection',
    titleRu: 'Жёсткий отбор позиции',
    numericFields: [
      numeric('minimumPositionImprovement', 'Минимальное улучшение', 'Минимальный выигрыш относительно текущего места.', 0, 100, 1),
      numeric('minimumDirectionalProtection', 'Минимальная защита от угрозы', 'Минимальная направленная защита от опорной угрозы.', 0, 100, 1),
      numeric('minimumReverseSlopeQuality', 'Минимум обратного склона', 'Минимальное качество позиции на обратном склоне.', 0, 100, 1),
    ],
  },
  {
    id: 'ranking',
    titleRu: 'Коэффициенты итоговой оценки',
    numericFields: [
      numeric('safetyWeight', 'Безопасность', 'Вес общей безопасности позиции.', 0, 2, 0.01),
      numeric('lowDangerWeight', 'Низкая опасность', 'Вес низкой остаточной опасности.', 0, 2, 0.01),
      numeric('protectionWeight', 'Защита', 'Вес направленной физической защиты.', 0, 2, 0.01),
      numeric('concealmentWeight', 'Скрытность', 'Вес маскировки позиции.', 0, 2, 0.01),
      numeric('safetyGainWeight', 'Улучшение текущего места', 'Вес выигрыша относительно текущего положения бойца.', 0, 2, 0.01),
      numeric('reverseSlopeWeight', 'Обратный склон', 'Вес позиции на обратном склоне.', 0, 2, 0.01),
      numeric('routeSafetyWeight', 'Безопасность маршрута', 'Вес безопасности пути к позиции.', 0, 2, 0.01),
      numeric('orderAlignmentWeight', 'Направление приказа', 'Вес общего соответствия направлению приказа.', 0, 2, 0.01),
      numeric('advanceToThreatWeight', 'Продвижение к угрозе', 'Вес уменьшения дистанции до угрозы в соответствующем режиме.', 0, 2, 0.01),
      numeric('withdrawFromThreatWeight', 'Отход от угрозы', 'Вес увеличения дистанции до угрозы в соответствующем режиме.', 0, 2, 0.01),
      numeric('orderTargetDistanceWeight', 'Близость к точке приказа', 'Вес близости позиции к цели действующего приказа.', 0, 2, 0.01),
      numeric('objectiveAlignmentWeight', 'Соответствие цели поиска', 'Общий вес нормализованного соответствия выбранному objective.', 0, 2, 0.01),
      numeric('uncertaintyPenaltyWeight', 'Штраф неопределённости', 'Штраф за ненадёжные знания о позиции.', 0, 2, 0.01),
      numeric('forwardSlopePenaltyWeight', 'Штраф переднего склона', 'Штраф позиции, открытой угрозе по прямому склону.', 0, 2, 0.01),
    ],
  },
  {
    id: 'display',
    titleRu: 'Стабильность отображения',
    numericFields: [
      numeric('markerRefreshIntervalSeconds', 'Обновлять не чаще, секунд', 'Минимальный интервал публикации нового набора ромбов.', 0, 10, 0.1),
      numeric('emptyResultHoldSeconds', 'Удерживать старые при пустом результате, секунд', 'Не скрывает старый набор из-за кратковременного пустого результата.', 0, 15, 0.1),
    ],
  },
];

export const TACTICAL_POSITION_NUMERIC_FIELDS = TACTICAL_POSITION_SETTINGS_GROUPS.flatMap(
  (group) => group.numericFields,
);

export const TACTICAL_POSITION_BOOLEAN_FIELDS = TACTICAL_POSITION_SETTINGS_GROUPS.flatMap(
  (group) => group.booleanFields ?? [],
);
