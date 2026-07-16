export const TACTICAL_ORDER_INTENT_FORMAT_VERSION = 1 as const;

export const TACTICAL_ORDER_PRESET_IDS = ['move', 'recon', 'assault'] as const;
export type TacticalOrderPresetId = typeof TACTICAL_ORDER_PRESET_IDS[number];

export type TacticalOrderAttentionPolicy = 'automatic' | 'search' | 'engage';
export type TacticalOrderContactPolicy = 'continue_if_possible' | 'pause_and_observe' | 'press_attack';
export type TacticalOrderFirePolicy = 'self_defense' | 'controlled' | 'fire_at_will';

export interface TacticalOrderIntent {
  readonly formatVersion: typeof TACTICAL_ORDER_INTENT_FORMAT_VERSION;
  readonly presetId: TacticalOrderPresetId;
  readonly navigationProfileId: string;
  readonly attentionPolicy: TacticalOrderAttentionPolicy;
  readonly contactPolicy: TacticalOrderContactPolicy;
  readonly firePolicy: TacticalOrderFirePolicy;
  readonly resumeAfterTemporaryInterruption: boolean;
}

export interface TacticalOrderPresetDefinition {
  readonly id: TacticalOrderPresetId;
  readonly nameEn: string;
  readonly nameRu: string;
  readonly menuHintRu: string;
  readonly shortDescriptionEn: string;
  readonly shortDescriptionRu: string;
  readonly icon: string;
  readonly intent: TacticalOrderIntent;
}

const PRESETS: Readonly<Record<TacticalOrderPresetId, TacticalOrderPresetDefinition>> = Object.freeze({
  move: preset(
    'move',
    'Normal movement',
    'Обычное',
    'Обычное выполнение',
    'Carry out the order normally while reacting to danger through current self-preservation logic.',
    'Выполнить приказ обычным способом, реагируя на опасность по текущей логике самосохранения.',
    '→',
    'normal',
    'automatic',
    'continue_if_possible',
    'self_defense',
  ),
  recon: preset(
    'recon',
    'Reconnaissance',
    'Разведка',
    'Осторожно искать контакты',
    'Move cautiously, actively search for contacts and pause to observe when one is found.',
    'Осторожно двигаться, активно искать контакты и при обнаружении остановиться для наблюдения.',
    '◉',
    'cautious',
    'search',
    'pause_and_observe',
    'self_defense',
  ),
  assault: preset(
    'assault',
    'Assault',
    'Штурм',
    'Решительно давить к цели',
    'Advance decisively and press the attack without bypassing hard safety constraints.',
    'Решительно двигаться к цели и продолжать атаку, не игнорируя критические ограничения безопасности.',
    '⚔',
    'attack',
    'engage',
    'press_attack',
    'fire_at_will',
  ),
});

export function createTacticalOrderIntent(presetId: TacticalOrderPresetId): TacticalOrderIntent {
  return cloneAndFreezeIntent(PRESETS[presetId].intent);
}

export function normalizeTacticalOrderIntent(value: unknown): TacticalOrderIntent {
  if (!isRecord(value) || !isPresetId(value.presetId)) return createTacticalOrderIntent('move');
  const presetId = value.presetId;
  const canonical = PRESETS[presetId].intent;
  return cloneAndFreezeIntent({
    formatVersion: TACTICAL_ORDER_INTENT_FORMAT_VERSION,
    presetId,
    navigationProfileId: cleanProfileId(value.navigationProfileId, canonical.navigationProfileId),
    attentionPolicy: isAttentionPolicy(value.attentionPolicy) ? value.attentionPolicy : canonical.attentionPolicy,
    contactPolicy: isContactPolicy(value.contactPolicy) ? value.contactPolicy : canonical.contactPolicy,
    firePolicy: isFirePolicy(value.firePolicy) ? value.firePolicy : canonical.firePolicy,
    resumeAfterTemporaryInterruption: typeof value.resumeAfterTemporaryInterruption === 'boolean'
      ? value.resumeAfterTemporaryInterruption
      : canonical.resumeAfterTemporaryInterruption,
  });
}

export function withTacticalOrderNavigationProfile(
  intent: TacticalOrderIntent,
  navigationProfileId: string,
): TacticalOrderIntent {
  const normalized = normalizeTacticalOrderIntent(intent);
  return cloneAndFreezeIntent({
    ...normalized,
    navigationProfileId: cleanProfileId(navigationProfileId, normalized.navigationProfileId),
  });
}

export function getTacticalOrderPresetDefinition(presetId: TacticalOrderPresetId): TacticalOrderPresetDefinition {
  const value = PRESETS[presetId];
  return {
    ...value,
    intent: cloneAndFreezeIntent(value.intent),
  };
}

export function listTacticalOrderPresetDefinitions(): TacticalOrderPresetDefinition[] {
  return TACTICAL_ORDER_PRESET_IDS.map(getTacticalOrderPresetDefinition);
}

export function tacticalOrderAttentionLabelRu(value: TacticalOrderAttentionPolicy): string {
  if (value === 'search') return 'Поиск';
  if (value === 'engage') return 'Бой';
  return 'Автоматически';
}

export function tacticalOrderContactLabelRu(value: TacticalOrderContactPolicy): string {
  if (value === 'pause_and_observe') return 'остановиться и наблюдать';
  if (value === 'press_attack') return 'продолжать атаку';
  return 'продолжать, если возможно';
}

export function tacticalOrderFireLabelRu(value: TacticalOrderFirePolicy): string {
  if (value === 'fire_at_will') return 'огонь по возможности';
  if (value === 'controlled') return 'контролируемый огонь';
  return 'самооборона';
}

function preset(
  id: TacticalOrderPresetId,
  nameEn: string,
  nameRu: string,
  menuHintRu: string,
  shortDescriptionEn: string,
  shortDescriptionRu: string,
  icon: string,
  navigationProfileId: string,
  attentionPolicy: TacticalOrderAttentionPolicy,
  contactPolicy: TacticalOrderContactPolicy,
  firePolicy: TacticalOrderFirePolicy,
): TacticalOrderPresetDefinition {
  return Object.freeze({
    id,
    nameEn,
    nameRu,
    menuHintRu,
    shortDescriptionEn,
    shortDescriptionRu,
    icon,
    intent: cloneAndFreezeIntent({
      formatVersion: TACTICAL_ORDER_INTENT_FORMAT_VERSION,
      presetId: id,
      navigationProfileId,
      attentionPolicy,
      contactPolicy,
      firePolicy,
      resumeAfterTemporaryInterruption: true,
    }),
  });
}

function cloneAndFreezeIntent(value: TacticalOrderIntent): TacticalOrderIntent {
  return Object.freeze({
    formatVersion: TACTICAL_ORDER_INTENT_FORMAT_VERSION,
    presetId: value.presetId,
    navigationProfileId: value.navigationProfileId,
    attentionPolicy: value.attentionPolicy,
    contactPolicy: value.contactPolicy,
    firePolicy: value.firePolicy,
    resumeAfterTemporaryInterruption: value.resumeAfterTemporaryInterruption,
  });
}

function isPresetId(value: unknown): value is TacticalOrderPresetId {
  return typeof value === 'string' && (TACTICAL_ORDER_PRESET_IDS as readonly string[]).includes(value);
}

function cleanProfileId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isAttentionPolicy(value: unknown): value is TacticalOrderAttentionPolicy {
  return value === 'automatic' || value === 'search' || value === 'engage';
}

function isContactPolicy(value: unknown): value is TacticalOrderContactPolicy {
  return value === 'continue_if_possible' || value === 'pause_and_observe' || value === 'press_attack';
}

function isFirePolicy(value: unknown): value is TacticalOrderFirePolicy {
  return value === 'self_defense' || value === 'controlled' || value === 'fire_at_will';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
