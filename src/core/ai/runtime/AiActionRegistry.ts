import type { AiNodeLifecycle } from './AiNodeLifecycle';

export class AiActionRegistry {
  private readonly actions = new Map<string, AiNodeLifecycle<unknown>>();

  register<TState>(type: string, lifecycle: AiNodeLifecycle<TState>): this {
    const normalizedType = type.trim();
    if (!normalizedType) throw new Error('AI action type must be non-empty.');
    if (this.actions.has(normalizedType)) throw new Error(`AI action type is already registered: ${normalizedType}`);
    this.actions.set(normalizedType, lifecycle as AiNodeLifecycle<unknown>);
    return this;
  }

  get<TState = unknown>(type: string): AiNodeLifecycle<TState> | undefined {
    return this.actions.get(type) as AiNodeLifecycle<TState> | undefined;
  }

  has(type: string): boolean {
    return this.actions.has(type);
  }

  listTypes(): readonly string[] {
    return [...this.actions.keys()].sort((left, right) => left.localeCompare(right));
  }
}
