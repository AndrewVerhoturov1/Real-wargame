export type MovementEditorField = readonly [path: string, label: string, help: string, min: number, max: number, step: number, unit: string];
export type MovementEditorGroup = readonly [title: string, description: string, fields: readonly MovementEditorField[]];

export const MOVEMENT_EDITOR_GROUPS: readonly MovementEditorGroup[] = [
  ['Скорость и переходы', 'Физическая скорость и задержки смены состояния.', [
    ['settings.speed.speedMultiplier','Множитель скорости','Масштабирует базовую скорость бойца.',.05,4,.05,'×'],
    ['settings.speed.startDelaySeconds','Время начала движения','Задержка перед первым шагом.',0,10,.05,'с'],
    ['settings.speed.stopDelaySeconds','Время остановки','Время контролируемого торможения.',0,10,.05,'с'],
    ['settings.speed.stanceChangeSeconds','Время смены позы','Переход между позами.',0,15,.05,'с'],
    ['settings.speed.minimumSpeedMetersPerSecond','Минимальная скорость','Минимально допустимая физическая скорость.',0,10,.05,'м/с'],
    ['settings.speed.lowStaminaSpeedMultiplier','Ограничение при низкой выносливости','Множитель скорости после порога усталости.',0,1,.01,'×'],
  ]],
  ['Выносливость', 'Расход, восстановление и пороги fallback.', [
    ['settings.stamina.drainPerSecond','Расход в секунду','Расход выносливости во время движения.',0,100,.1,'ед/с'],
    ['settings.stamina.recoveryPerSecond','Восстановление','Базовое восстановление вне этого движения.',0,100,.1,'ед/с'],
    ['settings.stamina.minimumToStart','Минимум для запуска','Запас, необходимый для начала.',0,100,1,'ед'],
    ['settings.stamina.fallbackThreshold','Порог fallback','Ниже него runtime применяет fallback.',0,100,1,'ед'],
    ['settings.stamina.resumeThreshold','Порог возврата','Запас для возврата к исходному профилю.',0,100,1,'ед'],
  ]],
  ['Визуальная заметность', 'Только модификаторы движения; профиль внимания остаётся отдельным.', [
    ['settings.visibility.movementVisibilityMultiplier','Заметность движения','Множитель визуального сигнала движения.',0,5,.05,'×'],
    ['settings.visibility.lateralMovementMultiplier','Поперечное движение','Дополнительная заметность движения боком.',0,5,.05,'×'],
    ['settings.visibility.openTerrainExposureBonus','Открытая местность','Дополнительная демаскировка без укрытия.',0,5,.05,'+'],
  ]],
  ['Шум', 'Звуковые события без зависимости от renderer или frame loop.', [
    ['settings.noise.loudness','Громкость','Нормализованная сила звука движения.',0,1,.01,'0–1'],
    ['settings.noise.eventSpacingMeters','Дистанция между событиями','Расстояние между последовательными звуками.',.05,50,.05,'м'],
    ['settings.noise.fatigueMultiplier','Влияние усталости','Насколько усталость усиливает шум.',0,5,.05,'×'],
  ]],
  ['Обзор во время движения', 'Модификаторы выбранного профиля внимания.', [
    ['settings.attention.focusMultiplier','Фокус','Качество центрального фокуса.',0,3,.05,'×'],
    ['settings.attention.directAttentionMultiplier','Прямое внимание','Качество переднего сектора.',0,3,.05,'×'],
    ['settings.attention.peripheralMultiplier','Периферия','Качество бокового восприятия.',0,3,.05,'×'],
    ['settings.attention.rearAwarenessMultiplier','Контроль тыла','Качество восприятия сзади.',0,3,.05,'×'],
    ['settings.attention.stationaryTargetDetectionMultiplier','Неподвижные цели','Обнаружение неподвижных целей.',0,3,.05,'×'],
    ['settings.attention.movingTargetDetectionMultiplier','Движущиеся цели','Обнаружение движущихся целей.',0,3,.05,'×'],
    ['settings.attention.scanSpeedMultiplier','Скорость осмотра','Скорость перевода внимания.',0,3,.05,'×'],
  ]],
  ['Оружие', 'Действия с оружием во время и после движения.', [
    ['settings.weapon.readyDelayAfterStopSeconds','Задержка готовности после остановки','Пауза до полной готовности оружия.',0,15,.05,'с'],
    ['settings.weapon.weaponPreparationPenalty','Штраф подготовки оружия','Штраф к подготовке и наведению.',0,3,.05,'×'],
  ]],
  ['Ограничения', 'Физическая доступность профиля.', [
    ['settings.restrictions.maximumWoundSeverity','Максимальное допустимое ранение','Тяжесть ранения, при которой профиль допустим.',0,1,.01,'0–1'],
    ['settings.restrictions.minimumSoldierSpeedMetersPerSecond','Минимальная физическая скорость бойца','Минимальная собственная скорость бойца.',0,10,.05,'м/с'],
  ]],
];
