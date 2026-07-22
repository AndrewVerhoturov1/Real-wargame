import {
  add, entryPath, isObject, readRef, refKey, validIdRevision, type Issues,
} from './CombatCatalogValidationSupport';

export function validateReferences(ammo: unknown[], weapons: unknown[], loadouts: unknown[], issues: Issues): void {
  const ammoRefs = new Set<string>();
  const ammoIds = new Set<string>();
  for (const raw of ammo) if (isObject(raw) && validIdRevision(raw, 'ammoDefinitionId')) {
    ammoRefs.add(refKey(raw.ammoDefinitionId as string, raw.revision as number));
    ammoIds.add(raw.ammoDefinitionId as string);
  }
  const weaponRefs = new Map<string, Record<string, unknown>>();
  for (const raw of weapons) if (isObject(raw) && validIdRevision(raw, 'weaponDefinitionId')) {
    const path = entryPath('weaponDefinitions', raw, 'weaponDefinitionId', 0);
    const ref = readRef(raw.ammo);
    if (ref && !ammoRefs.has(refKey(ref.definitionId, ref.revision))) {
      add(issues, `${path}.ammo`, 'missing_ammo_reference', 'Оружие ссылается на отсутствующую точную ревизию боеприпаса.');
    }
    weaponRefs.set(refKey(raw.weaponDefinitionId as string, raw.revision as number), raw);
  }
  for (const raw of loadouts) if (isObject(raw) && validIdRevision(raw, 'loadoutTemplateId')) {
    const path = entryPath('loadoutTemplates', raw, 'loadoutTemplateId', 0);
    checkLoadoutWeapon(raw.primary, `${path}.primary`, weaponRefs, issues);
    if (raw.secondary !== null) checkLoadoutWeapon(raw.secondary, `${path}.secondary`, weaponRefs, issues);
    const reserve = isObject(raw.reserveRoundsByAmmoDefinitionId) ? raw.reserveRoundsByAmmoDefinitionId : {};
    const maximum = isObject(raw.maximumReserveRoundsByAmmoDefinitionId) ? raw.maximumReserveRoundsByAmmoDefinitionId : {};
    for (const ammoId of [...new Set([...Object.keys(reserve), ...Object.keys(maximum)])].sort()) {
      if (!ammoIds.has(ammoId)) add(issues, `${path}.reserveRoundsByAmmoDefinitionId.${ammoId}`, 'missing_ammo_definition', 'Резерв ссылается на отсутствующее определение боеприпаса.');
      const initial = reserve[ammoId];
      const limit = typeof maximum[ammoId] === 'number' ? maximum[ammoId] : 0;
      if (typeof initial === 'number' && Number.isFinite(initial) && Number.isFinite(limit) && initial > limit) {
        add(issues, `${path}.reserveRoundsByAmmoDefinitionId.${ammoId}`, 'reserve_exceeds_maximum', 'Начальный резерв не может превышать максимальный резерв.');
      }
    }
  }
}

function checkLoadoutWeapon(
  value: unknown, path: string, weapons: Map<string, Record<string, unknown>>, issues: Issues,
): void {
  const item = isObject(value) ? value : null;
  const ref = item ? readRef(item.definition) : null;
  if (!ref) return;
  const weapon = weapons.get(refKey(ref.definitionId, ref.revision));
  if (!weapon) {
    add(issues, `${path}.definition`, 'missing_weapon_reference', 'Снаряжение ссылается на отсутствующую точную ревизию оружия.');
    return;
  }
  if (typeof item?.loadedRounds === 'number' && typeof weapon.capacityRounds === 'number' && item.loadedRounds > weapon.capacityRounds) {
    add(issues, `${path}.loadedRounds`, 'loaded_rounds_exceed_capacity', 'Начальная загрузка не может превышать ёмкость оружия.');
  }
}
