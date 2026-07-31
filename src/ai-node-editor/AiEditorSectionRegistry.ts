export interface LegacyAiEditorSectionDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly order: number;
  render(panel: HTMLElement): void;
  beforeLeave?: () => boolean | Promise<boolean>;
  onDeactivate?: () => void;
  dispose?: () => void;
}

const definitions = new Map<string, Readonly<LegacyAiEditorSectionDefinition>>();

/**
 * Temporary adapter for a legacy panel whose large form is migrated without
 * retaining the former page navigation or host discovery. New editors must
 * export a mountable installation directly instead of using this function.
 */
export function registerAiEditorSection(definition: LegacyAiEditorSectionDefinition): () => void {
  const id = definition.id.trim();
  if (!id) throw new Error('Legacy AI editor section id is required.');
  if (definitions.has(id)) throw new Error(`Legacy AI editor section is already registered: ${id}`);
  definitions.set(id, Object.freeze({ ...definition, id }));
  return () => { definitions.delete(id); };
}

export function requireLegacyAiEditorSection(sectionId: string): Readonly<LegacyAiEditorSectionDefinition> {
  const definition = definitions.get(sectionId);
  if (!definition) throw new Error(`Legacy AI editor section is not registered: ${sectionId}`);
  return definition;
}
