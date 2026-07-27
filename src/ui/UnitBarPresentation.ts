import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getWeaponDefinition, getWeaponRuntime, type WeaponDefinition } from '../core/combat/WeaponModel';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSelectedUnit } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

type WeaponVisualKind = 'rifle' | 'submachine-gun' | 'machine-gun' | 'pistol';

type UnitBarElements = {
  readonly bar: HTMLElement;
  readonly identity: HTMLElement;
  readonly technicalMeta: HTMLElement;
  readonly friendlyMeta: HTMLElement;
  readonly weaponCard: HTMLElement;
  readonly weaponImage: HTMLElement;
  readonly weaponName: HTMLElement;
  readonly weaponAmmo: HTMLElement;
};

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
  }, 500);
  schedule();

  return () => {
    destroyed = true;
    observer.disconnect();
    window.clearInterval(fallbackTimer);
    if (frame !== 0) window.cancelAnimationFrame(frame);
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

  return { bar, identity, technicalMeta, friendlyMeta, weaponCard, weaponImage, weaponName, weaponAmmo };
}

function renderSelection(elements: UnitBarElements, unit: UnitModel | null): void {
  if (!unit) {
    elements.identity.title = '';
    elements.friendlyMeta.textContent = 'Выберите бойца на карте';
    elements.weaponCard.classList.add('empty');
    elements.weaponCard.removeAttribute('data-weapon-kind');
    elements.weaponImage.replaceChildren();
    elements.weaponName.textContent = 'Оружие не выбрано';
    elements.weaponAmmo.textContent = 'Боезапас: —';
    return;
  }

  const runtime = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(runtime.weaponId);
  const kind = weaponVisualKind(definition);
  const combat = getCombatRuntime(unit);
  elements.identity.title = `Технический идентификатор: ${unit.id}`;
  elements.technicalMeta.title = elements.technicalMeta.textContent ?? '';
  elements.friendlyMeta.textContent = [
    unit.side === 'red' ? 'Противник' : 'Свои',
    postureLabel(unit.behaviorRuntime.posture),
    capabilityLabel(combat.capability),
  ].join(' · ');
  elements.weaponCard.classList.remove('empty');
  elements.weaponCard.setAttribute('data-weapon-kind', kind);
  elements.weaponImage.innerHTML = weaponSilhouette(kind);
  elements.weaponName.textContent = definition.labelRu;
  elements.weaponAmmo.textContent = `Магазин ${runtime.roundsLoaded}/${definition.magazineCapacity} · запас ${runtime.roundsReserve}`;
}

function buildPresentationKey(unit: UnitModel | null): string {
  if (!unit) return 'none';
  const runtime = getWeaponRuntime(unit);
  const combat = getCombatRuntime(unit);
  return [
    unit.id,
    unit.labels.ru,
    unit.side,
    unit.behaviorRuntime.posture,
    combat.capability,
    runtime.weaponId,
    runtime.roundsLoaded,
    runtime.roundsReserve,
  ].join('|');
}

function weaponVisualKind(definition: WeaponDefinition): WeaponVisualKind {
  const searchable = `${definition.id} ${definition.label} ${definition.labelRu}`.toLowerCase();
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

function capabilityLabel(capability: ReturnType<typeof getCombatRuntime>['capability']): string {
  if (capability === 'wounded') return 'ранен';
  if (capability === 'severely_wounded') return 'тяжело ранен';
  if (capability === 'incapacitated') return 'выведен из строя';
  if (capability === 'dead') return 'погиб';
  return 'боеспособен';
}
