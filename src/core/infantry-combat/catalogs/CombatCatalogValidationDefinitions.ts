import {
  AUTOMATIC_MODES, FIRE_MODES, POSTURES, PROFICIENCIES, RELOAD_KINDS, ROLES, STATUSES, WEAPON_CLASSES,
  add, boolean, definitionRef, enumValue, exact, id, integer, integerRecord, nonNegative, numberRecord,
  objectAt, positive, string, uniqueEnumArray, type Issues,
} from './CombatCatalogValidationSupport';

export function validateAmmo(value: unknown, path: string, issues: Issues): void {
  const item = objectAt(value, path, issues);
  if (!item) return;
  common(item, 'ammoDefinitionId', path, issues);
  positive(item.projectileMassKilograms, `${path}.projectileMassKilograms`, issues);
  positive(item.muzzleVelocityMetersPerSecond, `${path}.muzzleVelocityMetersPerSecond`, issues);
  nonNegative(item.bodyPenetrationBudget, `${path}.bodyPenetrationBudget`, issues);
  nonNegative(item.woundEffectMultiplier, `${path}.woundEffectMultiplier`, issues);
  boolean(item.tracer, `${path}.tracer`, issues);
  if (item.tracerVisualProfileId !== null) string(item.tracerVisualProfileId, `${path}.tracerVisualProfileId`, issues, false);
  positive(item.maximumLifetimeSeconds, `${path}.maximumLifetimeSeconds`, issues);
}

export function validateWeapon(value: unknown, path: string, issues: Issues): void {
  const item = objectAt(value, path, issues);
  if (!item) return;
  common(item, 'weaponDefinitionId', path, issues);
  enumValue(item.weaponClass, WEAPON_CLASSES, `${path}.weaponClass`, issues);
  definitionRef(item.ammo, `${path}.ammo`, issues);
  const modes = uniqueEnumArray(item.availableFireModes, FIRE_MODES, `${path}.availableFireModes`, 'duplicate_fire_mode', issues);
  const roundsPerMinute = nonNegative(item.roundsPerMinute, `${path}.roundsPerMinute`, issues);
  const shortBurstRounds = integer(item.shortBurstRounds, 0, `${path}.shortBurstRounds`, issues);
  const longBurstRounds = integer(item.longBurstRounds, 0, `${path}.longBurstRounds`, issues);
  const capacityRounds = integer(item.capacityRounds, 1, `${path}.capacityRounds`, issues);
  for (const field of [
    'baseDispersionRadians', 'aimQualityPerSecond', 'recoilPitchRadiansPerShot', 'recoilYawRadiansPerShot',
    'recoilRecoveryPerSecond', 'movingDispersionMultiplier', 'deployedTraverseArcRadians',
    'undeployedSustainedFireMultiplier', 'assistantDeployMultiplier', 'assistantReloadMultiplier',
    'soundRadiusMeters', 'muzzleFlashVisibility', 'muzzleForwardOffsetMeters',
  ]) nonNegative(item[field], `${path}.${field}`, issues);
  for (const field of ['readySeconds', 'recoverySeconds', 'deploySeconds', 'undeploySeconds']) {
    positive(item[field], `${path}.${field}`, issues);
  }
  boolean(item.allowFireWhileMoving, `${path}.allowFireWhileMoving`, issues);
  numberRecord(item.postureDispersionMultiplier, POSTURES, `${path}.postureDispersionMultiplier`, issues);
  if (modes?.some((mode) => AUTOMATIC_MODES.has(mode)) && roundsPerMinute !== null && roundsPerMinute <= 0) {
    add(issues, `${path}.roundsPerMinute`, 'automatic_mode_requires_rate', 'Автоматический режим требует положительного темпа стрельбы.');
  }
  if (shortBurstRounds !== null && longBurstRounds !== null && capacityRounds !== null
    && !(shortBurstRounds <= longBurstRounds && longBurstRounds <= capacityRounds)) {
    add(issues, `${path}.shortBurstRounds`, 'invalid_burst_round_order', 'Требуется shortBurstRounds <= longBurstRounds <= capacityRounds.');
  }
  validateReloadStages(item.reloadStages, `${path}.reloadStages`, issues);
}

export function validateLoadout(value: unknown, path: string, issues: Issues): void {
  const item = objectAt(value, path, issues);
  if (!item) return;
  common(item, 'loadoutTemplateId', path, issues);
  loadoutWeapon(item.primary, `${path}.primary`, issues);
  if (item.secondary !== null) loadoutWeapon(item.secondary, `${path}.secondary`, issues);
  integerRecord(item.reserveRoundsByAmmoDefinitionId, `${path}.reserveRoundsByAmmoDefinitionId`, issues);
  integerRecord(item.maximumReserveRoundsByAmmoDefinitionId, `${path}.maximumReserveRoundsByAmmoDefinitionId`, issues);
  integer(item.firstAidCharges, 0, `${path}.firstAidCharges`, issues);
  enumValue(item.role, ROLES, `${path}.role`, issues);
  const proficiency = objectAt(item.proficiencyByWeaponClass, `${path}.proficiencyByWeaponClass`, issues);
  if (proficiency) for (const weaponClass of WEAPON_CLASSES) {
    enumValue(proficiency[weaponClass], PROFICIENCIES, `${path}.proficiencyByWeaponClass.${weaponClass}`, issues);
  }
}

function validateReloadStages(value: unknown, path: string, issues: Issues): void {
  if (!Array.isArray(value)) {
    add(issues, path, 'invalid_type', 'Этапы перезарядки должны быть массивом.');
    return;
  }
  const seen = new Set<string>();
  let loadCount = 0;
  let appliedCount = 0;
  value.forEach((raw, index) => {
    const stagePath = `${path}[${index}]`;
    const stage = objectAt(raw, stagePath, issues);
    if (!stage) return;
    const stageId = id(stage.stageId, `${stagePath}.stageId`, issues);
    if (stageId && seen.has(stageId)) add(issues, `${stagePath}.stageId`, 'duplicate_reload_stage', 'ID этапов перезарядки должны быть уникальны.');
    if (stageId) seen.add(stageId);
    const kind = enumValue(stage.kind, RELOAD_KINDS, `${stagePath}.kind`, issues);
    if (kind === 'load') loadCount += 1;
    positive(stage.durationSeconds, `${stagePath}.durationSeconds`, issues);
    boolean(stage.interruptible, `${stagePath}.interruptible`, issues);
    boolean(stage.movementAllowed, `${stagePath}.movementAllowed`, issues);
    const applies = boolean(stage.loadedRoundsAppliedAtCompletion, `${stagePath}.loadedRoundsAppliedAtCompletion`, issues);
    if (applies === true) appliedCount += 1;
    if (applies !== null && applies !== (kind === 'load')) {
      add(issues, `${stagePath}.loadedRoundsAppliedAtCompletion`, 'invalid_load_application_stage', 'Патроны применяются только при завершении этапа load.');
    }
  });
  if (loadCount !== 1) add(issues, path, 'invalid_load_stage_count', 'Этап с kind="load" должен существовать ровно один раз.');
  if (appliedCount !== 1) add(issues, path, 'invalid_load_application_count', 'Ровно один этап должен применять загруженные патроны.');
}

function loadoutWeapon(value: unknown, path: string, issues: Issues): void {
  const item = objectAt(value, path, issues);
  if (!item) return;
  definitionRef(item.definition, `${path}.definition`, issues);
  integer(item.loadedRounds, 0, `${path}.loadedRounds`, issues);
}

function common(item: Record<string, unknown>, idField: string, path: string, issues: Issues): void {
  exact(item.schemaVersion, 1, `${path}.schemaVersion`, 'unsupported_schema_version', issues);
  id(item[idField], `${path}.${idField}`, issues);
  integer(item.revision, 1, `${path}.revision`, issues);
  enumValue(item.status, STATUSES, `${path}.status`, issues);
  string(item.nameEn, `${path}.nameEn`, issues, true);
  string(item.nameRu, `${path}.nameRu`, issues, true);
}
