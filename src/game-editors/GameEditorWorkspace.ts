import { GameEditorRegistry } from './GameEditorRegistry';
import type {
  GameEditorDefinition,
  GameEditorInstallation,
  GameEditorOpenRequest,
  GameEditorOpenResult,
  GameEditorSurface,
} from './GameEditorTypes';

interface ActiveEditor {
  readonly definition: GameEditorDefinition;
  readonly installation: GameEditorInstallation;
}

export class GameEditorWorkspace {
  private active: ActiveEditor | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly registry: GameEditorRegistry,
    private readonly surface: GameEditorSurface,
  ) {}

  get activeEditorId(): string | null {
    return this.active?.definition.id ?? null;
  }

  async open(request: GameEditorOpenRequest): Promise<GameEditorOpenResult> {
    this.assertAlive();
    const definition = this.registry.require(request.editorId);
    const activation = definition.activationFor(this.surface);
    if (activation === 'hidden') return { kind: 'hidden', definition };

    if (!(await this.closeActive())) return { kind: 'refused', definition };

    if (activation === 'route') {
      if (!definition.route) throw new Error(`Route editor has no route factory: ${definition.id}`);
      return { kind: 'route', definition, url: definition.route(request) };
    }

    if (!definition.mount) throw new Error(`Embedded editor has no mount function: ${definition.id}`);
    this.host.replaceChildren();
    const installation = definition.mount({
      host: this.host,
      surface: this.surface,
      request,
      requestClose: () => { void this.close(); },
    });
    this.active = { definition, installation };
    return { kind: 'mounted', definition };
  }

  async close(): Promise<boolean> {
    this.assertAlive();
    return this.closeActive();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const installation = this.active?.installation;
    this.active = null;
    installation?.destroy();
    this.host.replaceChildren();
  }

  private async closeActive(): Promise<boolean> {
    const installation = this.active?.installation;
    if (!installation) return true;
    if (installation.beforeClose && !(await installation.beforeClose())) return false;
    this.active = null;
    installation.destroy();
    this.host.replaceChildren();
    return true;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Game editor workspace is destroyed.');
  }
}
