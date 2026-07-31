import type {
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

export class GameEditorRegistry {
  private readonly definitions = new Map<string, GameEditorDefinition>();

  constructor(initialDefinitions: Iterable<GameEditorDefinition> = []) {
    for (const definition of initialDefinitions) this.register(definition);
  }

  register(definition: GameEditorDefinition): void {
    const id = definition.id.trim();
    if (!id) throw new Error('Game editor id is required.');
    if (this.definitions.has(id)) throw new Error(`Game editor id is already registered: ${id}`);

    const snapshot = Object.freeze({
      ...definition,
      id,
      labelRu: definition.labelRu.trim(),
    });
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

function compareDefinitions(left: GameEditorDefinition, right: GameEditorDefinition): number {
  return GROUP_ORDER[left.group] - GROUP_ORDER[right.group]
    || left.order - right.order
    || left.id.localeCompare(right.id, 'en');
}
