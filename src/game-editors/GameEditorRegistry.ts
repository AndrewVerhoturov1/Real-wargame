import type {
  GameEditorActivation,
  GameEditorDefinition,
  GameEditorGroup,
  GameEditorSurface,
} from './GameEditorTypes';

export const GROUP_ORDER: Readonly<Record<GameEditorGroup, number>> = Object.freeze({
  behavior: 10,
  soldier: 20,
  combat: 30,
  world: 40,
});

export const GROUP_LABEL_RU: Readonly<Record<GameEditorGroup, string>> = Object.freeze({
  behavior: 'Поведение',
  soldier: 'Боец',
  combat: 'Бой',
  world: 'Мир',
});

const SURFACES: readonly GameEditorSurface[] = ['ai-editor', 'combat-lab'];
const ACTIVATIONS: readonly GameEditorActivation[] = ['embedded', 'route', 'hidden'];

export class GameEditorRegistry {
  private readonly definitions = new Map<string, GameEditorDefinition>();

  constructor(initialDefinitions: Iterable<GameEditorDefinition> = []) {
    for (const definition of initialDefinitions) this.register(definition);
  }

  register(definition: GameEditorDefinition): void {
    const id = definition.id.trim();
    const labelRu = definition.labelRu.trim();
    if (!id) throw new Error('Game editor id is required.');
    if (!labelRu) throw new Error(`Game editor label is required: ${id}`);
    if (!(definition.group in GROUP_ORDER)) throw new Error(`Unknown game editor group: ${definition.group}`);
    if (!Number.isFinite(definition.order)) throw new Error(`Game editor order must be finite: ${id}`);
    if (this.definitions.has(id)) throw new Error(`Game editor id is already registered: ${id}`);

    for (const surface of SURFACES) validateActivation(definition, surface);

    const snapshot = Object.freeze({ ...definition, id, labelRu });
    this.definitions.set(id, snapshot);
  }

  get(editorId: string): GameEditorDefinition | undefined {
    return this.definitions.get(editorId);
  }

  require(editorId: string): GameEditorDefinition {
    const definition = this.get(editorId);
    if (!definition) throw new Error(`Unknown game editor: ${editorId}`);
    return definition;
  }

  list(): readonly GameEditorDefinition[] {
    return Object.freeze([...this.definitions.values()].sort(compareDefinitions));
  }

  listForSurface(surface: GameEditorSurface): readonly GameEditorDefinition[] {
    return Object.freeze(this.list().filter((definition) => definition.activationFor(surface) !== 'hidden'));
  }
}

function validateActivation(definition: GameEditorDefinition, surface: GameEditorSurface): void {
  const activation = definition.activationFor(surface);
  if (!ACTIVATIONS.includes(activation)) {
    throw new Error(`Unknown activation for ${definition.id} on ${surface}: ${String(activation)}`);
  }
  if (activation === 'embedded' && !definition.mount) {
    throw new Error(`Embedded editor has no mount function: ${definition.id} (${surface})`);
  }
  if (activation === 'route' && !definition.route) {
    throw new Error(`Route editor has no route factory: ${definition.id} (${surface})`);
  }
}

function compareDefinitions(left: GameEditorDefinition, right: GameEditorDefinition): number {
  return GROUP_ORDER[left.group] - GROUP_ORDER[right.group]
    || left.order - right.order
    || left.id.localeCompare(right.id, 'en');
}
