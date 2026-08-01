import type { UnitModel } from '../../core/units/UnitModel';
import type { GameEditorOpenRequest } from '../../game-editors/GameEditorTypes';

export interface CombatLabSourceProfileLink {
  readonly editorId: string;
  readonly profileId: string | null;
  readonly labelRu: string;
}

export interface CombatLabGameEditorOpenEventDetail {
  readonly request: GameEditorOpenRequest;
  readonly trigger: HTMLElement | null;
}

export const COMBAT_LAB_OPEN_GAME_EDITOR_EVENT = 'combat-lab:open-game-editor';

export function resolveCombatLabSelectedUnitProfileLinks(
  unit: UnitModel,
): readonly CombatLabSourceProfileLink[] {
  const links: CombatLabSourceProfileLink[] = [];
  const routeProfileId = firstId(
    unit.activeNavigationProfileId,
    unit.unitRoleNavigationProfileId,
    unit.playerNavigationProfileId,
  );
  links.push(Object.freeze({
    editorId: 'routeProfiles',
    profileId: routeProfileId,
    labelRu: 'Профиль маршрута',
  }));

  const movementProfileId = firstId(
    unit.movementRuntime?.effectiveProfileId,
    unit.movementRuntime?.requestedProfileId,
    unit.unitRoleMovementProfileId,
  );
  links.push(Object.freeze({
    editorId: 'movementProfiles',
    profileId: movementProfileId,
    labelRu: 'Профиль движения',
  }));

  const attentionProfileId = firstId(unit.playerAttentionProfileId);
  if (attentionProfileId) links.push(Object.freeze({
    editorId: 'attentionProfiles',
    profileId: attentionProfileId,
    labelRu: 'Профиль внимания',
  }));

  for (const link of readUnitSourceProfileLinks(unit)) {
    if (links.some((candidate) => (
      candidate.editorId === link.editorId && candidate.profileId === link.profileId
    ))) continue;
    links.push(link);
  }

  return Object.freeze(links);
}

export function requestCombatLabGameEditorOpen(
  root: HTMLElement,
  request: GameEditorOpenRequest,
  trigger: HTMLElement | null = null,
): void {
  root.dispatchEvent(new CustomEvent<CombatLabGameEditorOpenEventDetail>(
    COMBAT_LAB_OPEN_GAME_EDITOR_EVENT,
    {
      bubbles: true,
      detail: Object.freeze({ request: Object.freeze({ ...request }), trigger }),
    },
  ));
}

export function readCombatLabGameEditorOpenRequest(
  event: Event,
): CombatLabGameEditorOpenEventDetail | null {
  if (event.type !== COMBAT_LAB_OPEN_GAME_EDITOR_EVENT) return null;
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isRecord(detail) || !isRecord(detail.request)) return null;
  const editorId = stringId(detail.request.editorId);
  if (!editorId) return null;
  const request: GameEditorOpenRequest = Object.freeze({
    editorId,
    ...optionalId('profileId', detail.request.profileId),
    ...optionalId('selectedUnitId', detail.request.selectedUnitId),
    ...optionalId('returnTo', detail.request.returnTo),
  });
  return Object.freeze({
    request,
    trigger: detail.trigger instanceof HTMLElement ? detail.trigger : null,
  });
}

function readUnitSourceProfileLinks(unit: UnitModel): readonly CombatLabSourceProfileLink[] {
  const soldier = unit.soldier as unknown;
  if (!isRecord(soldier) || !Array.isArray(soldier.sourceProfileLinks)) return [];
  const links: CombatLabSourceProfileLink[] = [];
  for (const candidate of soldier.sourceProfileLinks) {
    if (!isRecord(candidate)) continue;
    const editorId = stringId(candidate.editorId);
    const profileId = stringId(candidate.profileId);
    const labelRu = stringId(candidate.labelRu);
    if (!editorId || !profileId || !labelRu) continue;
    links.push(Object.freeze({ editorId, profileId, labelRu }));
  }
  return Object.freeze(links);
}

function firstId(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = stringId(value);
    if (normalized) return normalized;
  }
  return null;
}

function optionalId<K extends 'profileId' | 'selectedUnitId' | 'returnTo'>(
  key: K,
  value: unknown,
): Partial<Record<K, string>> {
  const normalized = stringId(value);
  return normalized ? { [key]: normalized } as Partial<Record<K, string>> : {};
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
