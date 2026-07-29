import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getWeaponDefinition, getWeaponRuntime } from '../core/combat/WeaponModel';
import { getEffectiveCombatCapabilities } from '../core/infantry-combat/runtime';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSelectedUnit } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

type WeaponVisualKind = 'rifle' | 'submachine-gun' | 'machine-gun' | 'pistol';
type SelectedUnit = UnitModel | null | undefined;

type StatElements = {
  readonly label: HTMLElement;
  readonly value: HTMLElement;
};

type UnitBarElements = {
  readonly bar: HTMLElement;
  readonly identity: HTMLElement;
  readonly technicalMeta: HTMLElement;
  readonly friendlyMeta: HTMLElement;
  readonly weaponCard: HTMLElement;
  readonly weaponImage: HTMLElement;
  readonly weaponName: HTMLElement;
  readonly weaponAmmo: HTMLElement;
  readonly health: StatElements | null;
  readonly fatigue: StatElements | null;
  readonly suppression: StatElements | null;
  readonly ammo: StatElements | null;
};

export interface UnitBarSnapshot {
  readonly weaponNameRu: string;
  readonly weaponVisualKind: WeaponVisualKind;
  readonly roundsLoaded: number;
  readonly capacityRounds: number;
  readonly roundsReserve: number;
  readonly healthLabelRu: 'Кровь' | 'Здоровье';
  readonly healthPercent: number;
  readonly fatiguePercent: number;
  readonly suppressionPercent: number;
  readonly capabilityRu: string;
  readonly key: string;
}

/**
 * Adds the production-facing identity and weapon card to the existing shared
 * soldier panel. Gameplay state remains owned by the simulation; this module
 * only reads the selected unit and updates a bounded DOM fragment.
 */
export function installUnitBarPresentation(state: SimulationState): () => void {
  const elements = buildUnitBarPresentation();
  if (!elements) return () => {};

  let destroyed = false;
  let frame = 0;
  let lastKey = '';

  const render = (): void => {
    frame = 0;
    if (destroyed) return;
    const unit = getSelectedUnit(state);
    const key = buildPresentationKey(unit);
    if (key === lastKey) return;
    lastKey = key;
    renderSelection(elements, unit);
  };

  const schedule = (): void => {
    if (destroyed || frame !== 0) return;
    frame = window.requestAnimationFrame(render);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(elements.bar, { childList: true, subtree: true, characterData: true });
  const fallbackTimer = window.setInterval(() => {
    if (!document.hidden) schedule();
  }, 250);
  schedule();

  return () => {
    destroyed = true;
    observer.disconnect();
    window.clearInterval(fallbackTimer);
    if (frame !== 0) window.cancelAnimationFrame(frame);
  };
}

export function buildUnitBarSnapshot(unit: UnitModel): UnitBarSnapshot {
  const infantry = unit.infantryCombatRuntime;
  const primary = infantry.primaryWeapon;
  const legacyWeapon = getWeaponRuntime(unit);
  const legacyDefinition = getWeaponDefinition(legacyWeapon.weaponId);
  const usesInfantryWeapon = primary !== null;
  const usesInfantryPhysiology = usesInfantryWeapon
    || infantry.wounds.revision > 0
    || infantry.wounds.slots.length > 0
    || infantry.physiology.blood.bloodLoss > 0
    || infantry.physiology.blood.state !== 'stable'
    || infantry.physiology.fatigue.initialized;

  const weaponNameRu = primary?.resolved.weapon.nameRu ?? legacyDefinition.labelRu;
  const weaponVisualKind = weaponVisualKindFromText(primary
    ? `${primary.resolved.weapon.weaponDefinitionId} ${primary.resolved.weapon.nameEn} ${primary.resolved.weapon.nameRu}`
    : `${legacyDefinition.id} ${legacyDefinition.label} ${legacyDefinition.labelRu}`);
  const roundsLoaded = primary?.roundsInWeapon ?? legacyWeapon.roundsLoaded;
  const capacityRounds = primary?.resolved.weapon.capacityRounds ?? legacyDefinition.magazineCapacity;
  const roundsReserve = primary
    ? infantry.ammoInventory.reserves
      .filter((entry) => entry.ammoDefinitionId === primary.resolved.ammo.ammoDefinitionId)
      .reduce((total, entry) => total + Math.max(0, entry.rounds), 0)
    : legacyWeapon.roundsReserve;
  const healthPercent = usesInfantryPhysiology
    ? Math.round((1 - clamp01(infantry.physiology.blood.bloodLoss)) * 100)
    : clampPercent(unit.soldier.condition.health);
  const fatiguePercent = usesInfantryPhysiology
    ? Math.round(clamp01(infantry.physiology.fatigue.fatigue) * 100)
    : clampPercent(unit.soldier.condition.fatigue);
  const suppressionPercent = usesInfantryPhysiology
    ? Math.round(clamp01(infantry.suppression.suppressionLevel) * 100)
    : clampPercent(unit.behaviorRuntime.suppression);
  const capabilityRu = usesInfantryPhysiology
    ? effectiveCapabilityLabel(unit)
    : legacyCapabilityLabel(getCombatRuntime(unit).capability);
  const healthLabelRu = usesInfantryPhysiology ? 'Кровь' : 'Здоровье';

  return {
    weaponNameRu,
    weaponVisualKind,
    roundsLoaded,
    capacityRounds,
    roundsReserve,
    healthLabelRu,
    healthPercent,
    fatiguePercent,
    suppressionPercent,
    capabilityRu,
    key: [
      unit.id,
      unit.labels.ru,
      unit.side,
      unit.behaviorRuntime.posture,
      weaponNameRu,
      weaponVisualKind,
      roundsLoaded,
      capacityRounds,
      roundsReserve,
      healthLabelRu,
      healthPercent,
      fatiguePercent,
      suppressionPercent,
      capabilityRu,
      infantry.wounds.revision,
      infantry.physiology.blood.state,
      infantry.suppression.revision,
    ].join('|'),
  };
}

function buildUnitBarPresentation(): UnitBarElements | null {
  const bar = document.querySelector<HTMLElement>('.simulation-unit-bar');
  const identity = bar?.querySelector<HTMLElement>('.unit-bar-identity');
  const technicalMeta = identity?.querySelector<HTMLElement>('[data-role="unit-meta"]');
  if (!bar || !identity || !technicalMeta) return null;

  const profile = document.createElement('section');
  profile.className = 'unit-bar-profile';
  profile.setAttribute('aria-label', 'Выбранный боец и вооружение');

  const friendlyMeta = document.createElement('span');
  friendlyMeta.className = 'unit-bar-friendly-meta';
  friendlyMeta.dataset.role = 'unit-friendly-meta';
  technicalMeta.classList.add('unit-meta-diagnostic');
  technicalMeta.hidden = true;
  technicalMeta.before(friendlyMeta);

  const weaponCard = document.createElement('section');
  weaponCard.className = 'unit-bar-weapon';
  weaponCard.setAttribute('aria-label', 'Оружие выбранного бойца');

  const weaponImage = document.createElement('div');
  weaponImage.className = 'unit-bar-weapon-image';
  weaponImage.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div');
  text.className = 'unit-bar-weapon-text';
  const weaponName = document.createElement('strong');
  weaponName.dataset.role = 'weapon-name';
  const weaponAmmo = document.createElement('span');
  weaponAmmo.dataset.role = 'weapon-ammo';
  text.append(weaponName, weaponAmmo);
  weaponCard.append(weaponImage, text);

  identity.before(profile);
  profile.append(identity, weaponCard);

  return {
    bar,
    identity,
    technicalMeta,
    friendlyMeta,
    weaponCard,
    weaponImage,
    weaponName,
    weaponAmmo,
    health: findStat(bar, 'health'),
    fatigue: findStat(bar, 'fatigue'),
    suppression: findStat(bar, 'suppression'),
    ammo: findStat(bar, 'ammo'),
  };
}

function renderSelection(elements: UnitBarElements, unit: SelectedUnit): void {
  if (!unit) {
    elements.identity.title = '';
    elements.friendlyMeta.textContent = 'Выберите бойца на карте';
    elements.weaponCard.classList.add('empty');
    elements.weaponCard.removeAttribute('data-weapon-kind');
    elements.weaponImage.replaceChildren();
    elements.weaponName.textContent = 'Оружие не выбрано';
    elements.weaponAmmo.textContent = 'Боезапас: —';
    setStat(elements.health, 'Кровь', '—');
    setStat(elements.fatigue, 'Усталость', '—');
    setStat(elements.suppression, 'Подавление', '—');
    setStat(elements.ammo, 'Патроны', '—');
    return;
  }

  const snapshot = buildUnitBarSnapshot(unit);
  elements.identity.title = `Технический идентификатор: ${unit.id}`;
  elements.technicalMeta.title = elements.technicalMeta.textContent ?? '';
  elements.friendlyMeta.textContent = [
    unit.side === 'red' ? 'Противник' : 'Свои',
    postureLabel(unit.behaviorRuntime.posture),
    snapshot.capabilityRu,
  ].join(' · ');
  elements.weaponCard.classList.remove('empty');
  elements.weaponCard.setAttribute('data-weapon-kind', snapshot.weaponVisualKind);
  elements.weaponImage.innerHTML = weaponSilhouette(snapshot.weaponVisualKind);
  elements.weaponName.textContent = snapshot.weaponNameRu;
  elements.weaponAmmo.textContent = `Магазин ${snapshot.roundsLoaded}/${snapshot.capacityRounds} · запас ${snapshot.roundsReserve}`;
  setStat(elements.health, snapshot.healthLabelRu, `${snapshot.healthPercent} / 100`);
  setStat(elements.fatigue, 'Усталость', `${snapshot.fatiguePercent} / 100`);
  setStat(elements.suppression, 'Подавление', `${snapshot.suppressionPercent} / 100`);
  setStat(elements.ammo, 'Патроны', `${snapshot.roundsLoaded}+${snapshot.roundsReserve}`);
}

function buildPresentationKey(unit: SelectedUnit): string {
  return unit ? buildUnitBarSnapshot(unit).key : 'none';
}

function findStat(bar: HTMLElement, id: string): StatElements | null {
  const value = bar.querySelector<HTMLElement>(`[data-stat="${id}"]`);
  const label = value?.parentElement?.querySelector<HTMLElement>('span') ?? null;
  return value && label ? { label, value } : null;
}

function setStat(stat: StatElements | null, label: string, value: string): void {
  if (!stat) return;
  if (stat.label.textContent !== label) stat.label.textContent = label;
  if (stat.value.textContent !== value) stat.value.textContent = value;
}

function weaponVisualKindFromText(searchableValue: string): WeaponVisualKind {
  const searchable = searchableValue.toLowerCase();
  if (/(machine|пулем|dp[-_ ]?27|mg[-_ ]?)/.test(searchable)) return 'machine-gun';
  if (/(submachine|ппш|ppsh|smg|пистолет-пулем)/.test(searchable)) return 'submachine-gun';
  if (/(pistol|пистолет)/.test(searchable)) return 'pistol';
  return 'rifle';
}

function weaponSilhouette(kind: WeaponVisualKind): string {
  const common = 'viewBox="0 0 180 64" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg"';
  if (kind === 'pistol') {
    return `<svg ${common}><path d="M30 18h96l18 10-8 12h-48l-8 20H57l6-20H30z"/><path d="M126 18h25v7h-25z"/></svg>`;
  }
  if (kind === 'machine-gun') {
    return `<svg ${common}><path d="M8 26h106l22-8 33 5v9l-33 4-22-5H8z"/><path d="M61 31h20l-8 26H55zM104 31h12l8 26h-7z"/><circle cx="139" cy="27" r="10" fill="none" stroke="currentColor" stroke-width="6"/></svg>`;
  }
  if (kind === 'submachine-gun') {
    return `<svg ${common}><path d="M9 24h107l24-8 32 5v9l-32 4-24-5H9z"/><path d="M64 29h17l-4 29H60zM103 30h18l-8 19H99z"/><path d="M22 18h50v6H22z"/></svg>`;
  }
  return `<svg ${common}><path d="M5 27h111l27-8 32 5v8l-32 5-27-6H5z"/><path d="M45 31h25L58 54H38zM112 22h42v5h-42z"/><path d="M17 23h78v4H17z"/></svg>`;
}

function postureLabel(posture: UnitModel['behaviorRuntime']['posture']): string {
  if (posture === 'standing') return 'стоит';
  if (posture === 'crouched') return 'пригнулся';
  return 'лежит';
}

function effectiveCapabilityLabel(unit: UnitModel): string {
  const capabilities = getEffectiveCombatCapabilities(unit);
  const blood = unit.infantryCombatRuntime.physiology.blood;
  const wounds = unit.infantryCombatRuntime.wounds.slots;
  if (!capabilities.alive) return 'погиб';
  if (!capabilities.conscious) return 'без сознания';
  if (!capabilities.canUseWeapon || blood.state === 'critical' || wounds.some((wound) => wound.severity === 'critical')) {
    return 'тяжело ранен';
  }
  if (blood.state === 'weakened' || wounds.length > 0) return 'ранен';
  return 'боеспособен';
}

function legacyCapabilityLabel(capability: ReturnType<typeof getCombatRuntime>['capability']): string {
  if (capability === 'wounded') return 'ранен';
  if (capability === 'severely_wounded') return 'тяжело ранен';
  if (capability === 'incapacitated') return 'выведен из строя';
  if (capability === 'dead') return 'погиб';
  return 'боеспособен';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
