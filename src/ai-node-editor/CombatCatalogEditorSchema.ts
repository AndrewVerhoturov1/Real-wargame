import type {
  AmmoDefinitionV1,
  DefinitionRef,
  FireMode,
  LoadoutTemplateV1,
  ReloadStageKind,
  WeaponClass,
  WeaponDefinitionV1,
  WeaponProficiency,
} from '../core/infantry-combat/catalogs';

export interface CombatCatalogNumericFieldDefinition {
  readonly path: string;
  readonly labelRu: string;
  readonly helpRu: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unitRu: string;
  readonly integer?: boolean;
}

export interface CombatCatalogNumericGroupDefinition {
  readonly id: string;
  readonly titleRu: string;
  readonly fields: readonly CombatCatalogNumericFieldDefinition[];
}

export const AMMO_NUMERIC_GROUPS: readonly CombatCatalogNumericGroupDefinition[] = [
  {
    id: 'physical',
    titleRu: 'Физические параметры',
    fields: [
      numeric('projectileMassKilograms', 'Масса пули', 'Масса одной пули в килограммах.', 0.0001, 0.1, 0.0001, 'кг'),
      numeric('muzzleVelocityMetersPerSecond', 'Начальная скорость', 'Скорость пули в момент вылета из ствола.', 1, 2000, 1, 'м/с'),
      numeric('bodyPenetrationBudget', 'Бюджет пробития тела', 'Условный запас прохождения через крупные зоны тела.', 0, 10, 0.01, 'условная величина'),
      numeric('woundEffectMultiplier', 'Множитель раневого действия', 'Множитель тяжести воздействия боеприпаса.', 0, 10, 0.01, 'множитель'),
      numeric('maximumLifetimeSeconds', 'Максимальное время жизни', 'После этого времени физическая пуля удаляется.', 0.01, 30, 0.01, 'с'),
    ],
  },
];

export const WEAPON_NUMERIC_GROUPS: readonly CombatCatalogNumericGroupDefinition[] = [
  {
    id: 'fire',
    titleRu: 'Огонь и ёмкость',
    fields: [
      numeric('roundsPerMinute', 'Темп стрельбы', 'Табличный темп стрельбы.', 0, 2000, 1, 'выстр./мин'),
      integer('shortBurstRounds', 'Короткая очередь', 'Число выстрелов короткой очереди.', 0, 500, 1, 'патронов'),
      integer('longBurstRounds', 'Длинная очередь', 'Число выстрелов длинной очереди.', 0, 500, 1, 'патронов'),
      integer('capacityRounds', 'Ёмкость', 'Максимальное число патронов в оружии.', 1, 1000, 1, 'патронов'),
      numeric('baseDispersionRadians', 'Базовое рассеивание', 'Базовый угловой разброс без дополнительных множителей.', 0, 1, 0.0001, 'рад'),
      numeric('aimQualityPerSecond', 'Скорость прицеливания', 'Рост качества прицеливания за секунду.', 0, 20, 0.01, 'в секунду'),
    ],
  },
  {
    id: 'recoil',
    titleRu: 'Отдача и восстановление',
    fields: [
      numeric('recoilPitchRadiansPerShot', 'Вертикальная отдача', 'Вертикальное смещение после одного выстрела.', 0, 1, 0.0001, 'рад/выстрел'),
      numeric('recoilYawRadiansPerShot', 'Боковая отдача', 'Боковое смещение после одного выстрела.', 0, 1, 0.0001, 'рад/выстрел'),
      numeric('recoilRecoveryPerSecond', 'Компенсация отдачи', 'Скорость возврата оружия после отдачи.', 0, 20, 0.01, 'в секунду'),
      numeric('readySeconds', 'Подготовка оружия', 'Время перевода оружия в готовность.', 0.01, 30, 0.01, 'с'),
      numeric('recoverySeconds', 'Восстановление после огня', 'Минимальное время после завершения огня.', 0.01, 30, 0.01, 'с'),
    ],
  },
  {
    id: 'movement',
    titleRu: 'Движение и поза',
    fields: [
      numeric('movingDispersionMultiplier', 'Штраф движения', 'Множитель рассеивания во время движения.', 0, 20, 0.01, 'множитель'),
      numeric('postureDispersionMultiplier.standing', 'Стоя', 'Множитель рассеивания в положении стоя.', 0, 20, 0.01, 'множитель'),
      numeric('postureDispersionMultiplier.crouched', 'Пригнувшись', 'Множитель рассеивания в положении пригнувшись.', 0, 20, 0.01, 'множитель'),
      numeric('postureDispersionMultiplier.prone', 'Лёжа', 'Множитель рассеивания в положении лёжа.', 0, 20, 0.01, 'множитель'),
    ],
  },
  {
    id: 'deployment',
    titleRu: 'Установка и расчёт',
    fields: [
      numeric('deploySeconds', 'Установка', 'Время установки оружия.', 0.01, 60, 0.01, 'с'),
      numeric('undeploySeconds', 'Сворачивание', 'Время сворачивания оружия.', 0.01, 60, 0.01, 'с'),
      numeric('deployedTraverseArcRadians', 'Сектор наведения', 'Полный доступный сектор после установки.', 0, Math.PI * 2, 0.01, 'рад'),
      numeric('undeployedSustainedFireMultiplier', 'Длительный огонь без установки', 'Множитель пригодности к длительному огню без установки.', 0, 10, 0.01, 'множитель'),
      numeric('assistantDeployMultiplier', 'Помощник: установка', 'Множитель длительности установки при помощи расчёта.', 0, 10, 0.01, 'множитель'),
      numeric('assistantReloadMultiplier', 'Помощник: перезарядка', 'Множитель длительности перезарядки при помощи расчёта.', 0, 10, 0.01, 'множитель'),
    ],
  },
  {
    id: 'signals',
    titleRu: 'Звук, вспышка и ствол',
    fields: [
      numeric('soundRadiusMeters', 'Радиус звука', 'Базовая дальность слышимости выстрела.', 0, 5000, 1, 'м'),
      numeric('muzzleFlashVisibility', 'Заметность вспышки', 'Условная заметность дульной вспышки.', 0, 10, 0.01, 'условная величина'),
      numeric('muzzleForwardOffsetMeters', 'Вынос дульного среза', 'Расстояние от бойца до дульного среза вдоль направления оружия.', 0, 5, 0.01, 'м'),
    ],
  },
];

export const WEAPON_CLASSES: readonly { value: WeaponClass; labelRu: string }[] = [
  { value: 'rifle', labelRu: 'Винтовка' },
  { value: 'submachine_gun', labelRu: 'Пистолет-пулемёт' },
  { value: 'machine_gun', labelRu: 'Пулемёт' },
  { value: 'pistol', labelRu: 'Пистолет' },
];

export const FIRE_MODES: readonly { value: FireMode; labelRu: string }[] = [
  { value: 'single', labelRu: 'Одиночный' },
  { value: 'short_burst', labelRu: 'Короткая очередь' },
  { value: 'long_burst', labelRu: 'Длинная очередь' },
  { value: 'suppress', labelRu: 'Подавление' },
];

export const RELOAD_STAGE_KINDS: readonly { value: ReloadStageKind; labelRu: string }[] = [
  { value: 'open', labelRu: 'Открыть / извлечь' },
  { value: 'load', labelRu: 'Загрузить' },
  { value: 'close', labelRu: 'Закрыть / дослать' },
];

export const LOADOUT_ROLES: readonly { value: LoadoutTemplateV1['role']; labelRu: string }[] = [
  { value: 'rifleman', labelRu: 'Стрелок' },
  { value: 'submachine_gunner', labelRu: 'Автоматчик' },
  { value: 'machine_gunner', labelRu: 'Пулемётчик' },
  { value: 'assistant_machine_gunner', labelRu: 'Помощник пулемётчика' },
];

export const PROFICIENCIES: readonly { value: WeaponProficiency; labelRu: string }[] = [
  { value: 'untrained', labelRu: 'Не обучен' },
  { value: 'trained', labelRu: 'Обучен' },
  { value: 'specialist', labelRu: 'Специалист' },
];

export function createAmmoDraftTemplate(ammoDefinitionId: string): AmmoDefinitionV1 {
  return {
    schemaVersion: 1,
    ammoDefinitionId,
    revision: 1,
    status: 'draft',
    nameEn: 'New ammunition',
    nameRu: 'Новый боеприпас',
    projectileMassKilograms: 0.008,
    muzzleVelocityMetersPerSecond: 700,
    bodyPenetrationBudget: 1,
    woundEffectMultiplier: 1,
    tracer: false,
    tracerVisualProfileId: null,
    maximumLifetimeSeconds: 5,
  };
}

export function createWeaponDraftTemplate(
  weaponDefinitionId: string,
  ammo: DefinitionRef,
): WeaponDefinitionV1 {
  return {
    schemaVersion: 1,
    weaponDefinitionId,
    revision: 1,
    status: 'draft',
    nameEn: 'New weapon',
    nameRu: 'Новое оружие',
    weaponClass: 'rifle',
    ammo: { ...ammo },
    availableFireModes: ['single'],
    roundsPerMinute: 60,
    shortBurstRounds: 1,
    longBurstRounds: 1,
    capacityRounds: 5,
    baseDispersionRadians: 0.003,
    aimQualityPerSecond: 0.5,
    recoilPitchRadiansPerShot: 0.02,
    recoilYawRadiansPerShot: 0.01,
    recoilRecoveryPerSecond: 0.8,
    readySeconds: 0.5,
    recoverySeconds: 0.3,
    reloadStages: [
      {
        stageId: 'load',
        kind: 'load',
        durationSeconds: 2,
        interruptible: true,
        movementAllowed: false,
        loadedRoundsAppliedAtCompletion: true,
      },
    ],
    allowFireWhileMoving: false,
    movingDispersionMultiplier: 2,
    postureDispersionMultiplier: { standing: 1, crouched: 0.8, prone: 0.6 },
    deploySeconds: 0.3,
    undeploySeconds: 0.2,
    deployedTraverseArcRadians: Math.PI * 2,
    undeployedSustainedFireMultiplier: 1,
    assistantDeployMultiplier: 1,
    assistantReloadMultiplier: 1,
    soundRadiusMeters: 400,
    muzzleFlashVisibility: 0.7,
    muzzleForwardOffsetMeters: 0.7,
  };
}

export function createLoadoutDraftTemplate(
  loadoutTemplateId: string,
  primary: DefinitionRef,
  primaryAmmoDefinitionId: string,
): LoadoutTemplateV1 {
  return {
    schemaVersion: 1,
    loadoutTemplateId,
    revision: 1,
    status: 'draft',
    nameEn: 'New loadout',
    nameRu: 'Новый комплект снаряжения',
    role: 'rifleman',
    primary: { definition: { ...primary }, loadedRounds: 0 },
    secondary: null,
    reserveRoundsByAmmoDefinitionId: { [primaryAmmoDefinitionId]: 0 },
    maximumReserveRoundsByAmmoDefinitionId: { [primaryAmmoDefinitionId]: 0 },
    firstAidCharges: 1,
    proficiencyByWeaponClass: {
      rifle: 'untrained',
      submachine_gun: 'untrained',
      machine_gun: 'untrained',
      pistol: 'untrained',
    },
  };
}

function numeric(
  path: string,
  labelRu: string,
  helpRu: string,
  min: number,
  max: number,
  step: number,
  unitRu: string,
): CombatCatalogNumericFieldDefinition {
  return { path, labelRu, helpRu, min, max, step, unitRu };
}

function integer(
  path: string,
  labelRu: string,
  helpRu: string,
  min: number,
  max: number,
  step: number,
  unitRu: string,
): CombatCatalogNumericFieldDefinition {
  return { ...numeric(path, labelRu, helpRu, min, max, step, unitRu), integer: true };
}
