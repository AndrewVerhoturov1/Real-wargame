export type GameEditorSurface = 'ai-editor' | 'combat-lab';
export type GameEditorGroup = 'behavior' | 'soldier' | 'combat' | 'world';
export type GameEditorActivation = 'embedded' | 'route' | 'hidden';

export interface GameEditorOpenRequest {
  readonly editorId: string;
  readonly profileId?: string;
  readonly selectedUnitId?: string;
  readonly returnTo?: string;
}

export interface GameEditorMountContext {
  readonly host: HTMLElement;
  readonly surface: GameEditorSurface;
  readonly request: GameEditorOpenRequest;
  readonly requestClose: () => void;
}

export interface GameEditorInstallation {
  beforeClose?(): boolean | Promise<boolean>;
  destroy(): void;
}

export interface GameEditorDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly group: GameEditorGroup;
  readonly order: number;
  activationFor(surface: GameEditorSurface): GameEditorActivation;
  mount?(context: GameEditorMountContext): GameEditorInstallation;
  route?(request: GameEditorOpenRequest): string;
}

export type GameEditorOpenResult =
  | { readonly kind: 'mounted'; readonly definition: GameEditorDefinition }
  | { readonly kind: 'route'; readonly definition: GameEditorDefinition; readonly url: string }
  | { readonly kind: 'hidden'; readonly definition: GameEditorDefinition }
  | { readonly kind: 'refused'; readonly definition: GameEditorDefinition };
