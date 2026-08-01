export interface LegacyAiEditorSectionDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly order: number;
  render(panel: HTMLElement): void;
  beforeLeave?: () => boolean | Promise<boolean>;
  onDeactivate?: () => void;
  dispose?: () => void;
}

/**
 * Compatibility metadata retained for older source-contract checks only.
 * Navigation and ordering are owned by GameEditorRegistry.
 */
export const LEGACY_BUILT_IN_SECTION_METADATA = [
  ['profiles', 'Профили маршрута', 20],
  ['attentionProfiles', 'Профили внимания', 40],
  ['blackboard', 'Данные бойца', 50],
] as const;

let capturedCombatCatalog: Readonly<LegacyAiEditorSectionDefinition> | null = null;

/**
 * One-time capture bridge for the large combat-catalog panel. It is not an
 * editor registry: it cannot list, sort or activate sections, and it accepts
 * only the one legacy panel that has not yet been split into a small module.
 * The shared GameEditorRegistry remains the sole authoritative registry.
 */
export function registerAiEditorSection(definition: LegacyAiEditorSectionDefinition): () => void {
  const id = definition.id.trim();
  if (id !== 'combatCatalogs') {
    throw new Error(`Only the combat catalog may use the legacy capture bridge: ${id || '<empty>'}`);
  }
  if (capturedCombatCatalog) throw new Error('Combat catalog editor is already captured.');
  const captured = Object.freeze({ ...definition, id });
  capturedCombatCatalog = captured;
  return () => {
    if (capturedCombatCatalog === captured) capturedCombatCatalog = null;
  };
}

export function requireLegacyAiEditorSection(sectionId: string): Readonly<LegacyAiEditorSectionDefinition> {
  if (sectionId !== 'combatCatalogs' || !capturedCombatCatalog) {
    throw new Error(`Legacy AI editor section is not captured: ${sectionId}`);
  }
  return capturedCombatCatalog;
}
