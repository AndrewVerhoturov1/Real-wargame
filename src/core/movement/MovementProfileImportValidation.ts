import { isBuiltInMovementProfileId } from './MovementProfileDefaults';
import { normalizeCustomMovementId, normalizeMovementRegistryData } from './MovementProfileNormalization';
import {
  BUILT_IN_MOVEMENT_PROFILE_IDS,
  MOVEMENT_PROFILE_FORMAT_VERSION,
  type MovementProfileRegistryData,
} from './MovementProfileTypes';

export interface MovementProfileImportIssue {
  readonly path: string;
  readonly messageEn: string;
  readonly messageRu: string;
}

export class MovementProfileImportError extends Error {
  readonly issues: readonly MovementProfileImportIssue[];

  constructor(issues: readonly MovementProfileImportIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.messageEn}`).join('\n'));
    this.name = 'MovementProfileImportError';
    this.issues = [...issues];
  }
}

const ENUM_FIELDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['preferredGait', ['walk', 'crouch', 'run', 'sprint', 'crawl']],
  ['stancePolicy', ['standing', 'crouched', 'prone', 'adaptive']],
  ['category', ['routine', 'stealth', 'combat', 'emergency']],
  ['settings.noise.surfacePolicy', ['profile_multiplier', 'material_profile_future']],
  ['settings.restrictions.fallbackRule', ['profile', 'slower_gait', 'stop']],
];

const BOOLEAN_FIELDS = [
  'builtIn',
  'settings.visibility.usesStealthSkill',
  'settings.weapon.allowFireWhileMoving',
  'settings.weapon.allowReloadWhileMoving',
  'settings.restrictions.allowedWhileSuppressed',
] as const;

const NUMBER_FIELDS = [
  'sortOrder',
  'revision',
  'settings.speed.speedMultiplier',
  'settings.speed.startDelaySeconds',
  'settings.speed.stopDelaySeconds',
  'settings.speed.stanceChangeSeconds',
  'settings.speed.minimumSpeedMetersPerSecond',
  'settings.speed.lowStaminaSpeedMultiplier',
  'settings.stamina.drainPerSecond',
  'settings.stamina.recoveryPerSecond',
  'settings.stamina.minimumToStart',
  'settings.stamina.fallbackThreshold',
  'settings.stamina.resumeThreshold',
  'settings.visibility.movementVisibilityMultiplier',
  'settings.visibility.lateralMovementMultiplier',
  'settings.visibility.openTerrainExposureBonus',
  'settings.noise.loudness',
  'settings.noise.eventSpacingMeters',
  'settings.noise.fatigueMultiplier',
  'settings.attention.focusMultiplier',
  'settings.attention.directAttentionMultiplier',
  'settings.attention.peripheralMultiplier',
  'settings.attention.rearAwarenessMultiplier',
  'settings.attention.stationaryTargetDetectionMultiplier',
  'settings.attention.movingTargetDetectionMultiplier',
  'settings.attention.scanSpeedMultiplier',
  'settings.weapon.readyDelayAfterStopSeconds',
  'settings.weapon.weaponPreparationPenalty',
  'settings.restrictions.maximumWoundSeverity',
  'settings.restrictions.minimumSoldierSpeedMetersPerSecond',
] as const;

const OBJECT_FIELDS = [
  'settings',
  'settings.speed',
  'settings.stamina',
  'settings.visibility',
  'settings.noise',
  'settings.attention',
  'settings.weapon',
  'settings.restrictions',
] as const;

const TEXT_FIELDS = [
  'nameEn',
  'nameRu',
  'descriptionEn',
  'descriptionRu',
] as const;

export function validateMovementProfileImport(value: unknown): MovementProfileRegistryData {
  const issues: MovementProfileImportIssue[] = [];
  if (!isRecord(value)) {
    throw new MovementProfileImportError([
      issue('$', 'Import root must be a JSON object.', 'Корень файла должен быть JSON-объектом.'),
    ]);
  }

  validateTopLevel(value, issues);
  const rawProfiles = value.profiles;
  if (!Array.isArray(rawProfiles)) throw new MovementProfileImportError(issues);

  const normalizedIds = new Map<number, string>();
  const firstIndexById = new Map<string, number>();
  const validFallbackIds = new Set<string>(BUILT_IN_MOVEMENT_PROFILE_IDS);

  rawProfiles.forEach((profile, index) => {
    const path = `profiles[${index}]`;
    if (!isRecord(profile)) {
      issues.push(issue(path, 'Profile must be an object.', 'Профиль должен быть объектом.'));
      return;
    }

    const id = validateId(profile, path, issues);
    if (id) {
      normalizedIds.set(index, id);
      validFallbackIds.add(id);
      const firstIndex = firstIndexById.get(id);
      if (firstIndex !== undefined) {
        issues.push(issue(
          `${path}.id`,
          `Duplicate profile id after normalization; first occurrence is profiles[${firstIndex}].`,
          `ID профиля повторяется после нормализации; первое вхождение: profiles[${firstIndex}].`,
        ));
      } else {
        firstIndexById.set(id, index);
      }
      if (profile.builtIn === true && !isBuiltInMovementProfileId(id)) {
        issues.push(issue(
          `${path}.builtIn`,
          'A custom profile cannot claim built-in ownership.',
          'Пользовательский профиль не может быть помечен как встроенный.',
        ));
      }
    }

    validateProfileShape(profile, path, issues);
  });

  rawProfiles.forEach((profile, index) => {
    if (!isRecord(profile)) return;
    const fallback = profile.fallbackProfileId;
    if (fallback === undefined || fallback === null || fallback === '') return;
    if (typeof fallback !== 'string') {
      issues.push(issue(
        `profiles[${index}].fallbackProfileId`,
        'Fallback profile id must be a string or null.',
        'ID резервного профиля должен быть строкой или null.',
      ));
      return;
    }
    const normalizedFallback = normalizeReferenceId(fallback);
    const currentId = normalizedIds.get(index);
    if (!normalizedFallback || !validFallbackIds.has(normalizedFallback)) {
      issues.push(issue(
        `profiles[${index}].fallbackProfileId`,
        `Fallback profile "${fallback}" does not exist in the imported registry.`,
        `Резервный профиль «${fallback}» отсутствует в импортируемом реестре.`,
      ));
    } else if (normalizedFallback === currentId) {
      issues.push(issue(
        `profiles[${index}].fallbackProfileId`,
        'A profile cannot use itself as fallback.',
        'Профиль не может использовать себя как резервный.',
      ));
    }
  });

  if (issues.length > 0) throw new MovementProfileImportError(issues);
  return normalizeMovementRegistryData(value as Partial<MovementProfileRegistryData>);
}

function validateTopLevel(value: Record<string, unknown>, issues: MovementProfileImportIssue[]): void {
  if (!Array.isArray(value.profiles)) {
    issues.push(issue('profiles', 'Field must be an array.', 'Поле должно быть массивом.'));
  }
  if (value.formatVersion !== undefined) {
    if (typeof value.formatVersion !== 'number' || !Number.isInteger(value.formatVersion)) {
      issues.push(issue('formatVersion', 'Format version must be an integer.', 'Версия формата должна быть целым числом.'));
    } else if (value.formatVersion > MOVEMENT_PROFILE_FORMAT_VERSION) {
      issues.push(issue(
        'formatVersion',
        `Unsupported future format version ${value.formatVersion}.`,
        `Версия формата ${value.formatVersion} новее поддерживаемой версии ${MOVEMENT_PROFILE_FORMAT_VERSION}.`,
      ));
    }
  }
  if (value.revision !== undefined
    && (typeof value.revision !== 'number' || !Number.isInteger(value.revision))) {
    issues.push(issue('revision', 'Registry revision must be an integer.', 'Ревизия реестра должна быть целым числом.'));
  }
}

function validateId(
  profile: Record<string, unknown>,
  path: string,
  issues: MovementProfileImportIssue[],
): string | null {
  if (typeof profile.id !== 'string' || !profile.id.trim()) {
    issues.push(issue(`${path}.id`, 'Profile id is required.', 'Не указан ID профиля.'));
    return null;
  }
  const rawId = profile.id.trim();
  if (isBuiltInMovementProfileId(rawId)) return rawId;
  try {
    return normalizeCustomMovementId(rawId);
  } catch (error) {
    issues.push(issue(
      `${path}.id`,
      error instanceof Error ? error.message : 'Invalid custom profile id.',
      'Пользовательский ID пуст, зарезервирован или содержит только недопустимые символы.',
    ));
    return null;
  }
}

function validateProfileShape(
  profile: Record<string, unknown>,
  path: string,
  issues: MovementProfileImportIssue[],
): void {
  for (const field of TEXT_FIELDS) {
    const state = readPresent(profile, field);
    if (state.present && typeof state.value !== 'string') {
      issues.push(issue(`${path}.${field}`, 'Field must be a string.', 'Поле должно быть строкой.'));
    }
  }

  const template = readPresent(profile, 'templateProfileId');
  if (template.present
    && (typeof template.value !== 'string' || !isBuiltInMovementProfileId(template.value))) {
    issues.push(issue(
      `${path}.templateProfileId`,
      'Template profile id must reference a built-in movement profile.',
      'Шаблон должен ссылаться на встроенный профиль движения.',
    ));
  }

  for (const field of OBJECT_FIELDS) {
    const state = readPresent(profile, field);
    if (state.present && !isRecord(state.value)) {
      issues.push(issue(`${path}.${field}`, 'Field must be an object.', 'Поле должно быть объектом.'));
    }
  }

  for (const field of NUMBER_FIELDS) {
    const state = readPresent(profile, field);
    if (state.present && (typeof state.value !== 'number' || !Number.isFinite(state.value))) {
      issues.push(issue(`${path}.${field}`, 'Field must be a finite number.', 'Поле должно быть конечным числом.'));
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const state = readPresent(profile, field);
    if (state.present && typeof state.value !== 'boolean') {
      issues.push(issue(`${path}.${field}`, 'Field must be boolean.', 'Поле должно быть логическим значением.'));
    }
  }

  for (const [field, allowed] of ENUM_FIELDS) {
    const state = readPresent(profile, field);
    if (state.present
      && (typeof state.value !== 'string' || !allowed.includes(state.value))) {
      issues.push(issue(
        `${path}.${field}`,
        `Field must be one of: ${allowed.join(', ')}.`,
        `Недопустимое значение. Допустимо: ${allowed.join(', ')}.`,
      ));
    }
  }
}

function normalizeReferenceId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isBuiltInMovementProfileId(trimmed)) return trimmed;
  try {
    return normalizeCustomMovementId(trimmed);
  } catch {
    return null;
  }
}

function readPresent(source: Record<string, unknown>, path: string): { present: boolean; value: unknown } {
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { present: false, value: undefined };
    }
    current = current[part];
  }
  return { present: true, value: current };
}

function issue(path: string, messageEn: string, messageRu: string): MovementProfileImportIssue {
  return { path, messageEn, messageRu };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
