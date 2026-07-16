import {
  BUILTIN_MOVEMENT_PROFILE_IDS,
  movementProfileLabelRu,
} from '../core/movement/MovementProfileContract';

export interface MovementProfileSelectorEntry {
  readonly id: string;
  readonly nameRu: string;
  readonly revision?: number;
}

export interface MovementProfileSelectorProvider {
  listProfiles(): readonly MovementProfileSelectorEntry[];
}

export const BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER: MovementProfileSelectorProvider = Object.freeze({
  listProfiles: () => BUILTIN_MOVEMENT_PROFILE_IDS.map((id) => Object.freeze({
    id,
    nameRu: movementProfileLabelRu(id),
  })),
});

let currentProvider: MovementProfileSelectorProvider = BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER;

export function setMovementProfileSelectorProvider(
  provider: MovementProfileSelectorProvider | null | undefined,
): void {
  currentProvider = provider ?? BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER;
}

export function getMovementProfileSelectorProvider(): MovementProfileSelectorProvider {
  return currentProvider;
}

export function listMovementProfileSelectorEntries(): readonly MovementProfileSelectorEntry[] {
  const normalized = currentProvider.listProfiles().flatMap((profile) => {
    const id = cleanText(profile.id);
    if (!id) return [];
    return [Object.freeze({
      id,
      nameRu: cleanText(profile.nameRu) ?? movementProfileLabelRu(id),
      revision: finiteRevision(profile.revision),
    })];
  });
  return normalized.length > 0
    ? Object.freeze(normalized)
    : BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER.listProfiles();
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteRevision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}
