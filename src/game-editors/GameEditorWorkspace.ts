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
  private transitionRevision = 0;

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
    const transitionRevision = ++this.transitionRevision;
    const definition = this.registry.require(request.editorId);
    const activation = definition.activationFor(this.surface);
    if (activation === 'hidden') return { kind: 'hidden', definition };

    if (!(await this.closeActive())) return { kind: 'refused', definition };
    this.assertCurrentTransition(transitionRevision);

    if (activation === 'route') {
      return { kind: 'route', definition, url: definition.route!(request) };
    }

    this.host.replaceChildren();
    const installation = definition.mount!({
      host: this.host,
      surface: this.surface,
      request,
      requestClose: () => { void this.close(); },
    });
    this.assertCurrentTransition(transitionRevision, installation);
    this.active = { definition, installation };
    return { kind: 'mounted', definition };
  }

  async close(): Promise<boolean> {
    this.assertAlive();
    ++this.transitionRevision;
    return this.closeActive();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.transitionRevision;
    const installation = this.active?.installation;
    this.active = null;
    installation?.destroy();
    this.host.replaceChildren();
  }

  private async closeActive(): Promise<boolean> {
    const current = this.active;
    if (!current) return true;
    if (current.installation.beforeClose && !(await current.installation.beforeClose())) return false;
    if (this.active !== current) return true;
    this.active = null;
    current.installation.destroy();
    this.host.replaceChildren();
    return true;
  }

  private assertCurrentTransition(revision: number, installation?: GameEditorInstallation): void {
    if (!this.destroyed && revision === this.transitionRevision) return;
    installation?.destroy();
    throw new Error('Game editor workspace transition was superseded.');
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Game editor workspace is destroyed.');
  }
}
