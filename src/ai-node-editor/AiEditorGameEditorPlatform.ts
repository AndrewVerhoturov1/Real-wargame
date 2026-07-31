import { GameEditorWorkspace } from '../game-editors/GameEditorWorkspace';
import { createDefaultGameEditorRegistry } from '../game-editors/createDefaultGameEditorRegistry';
import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';

const graphRoot = document.getElementById('ai-node-editor-root');
if (!(graphRoot instanceof HTMLElement)) throw new Error('AI node editor root is missing.');

const shell = document.createElement('main');
shell.className = 'game-editor-shell';
shell.dataset.gameEditorSurface = 'ai-editor';
shell.innerHTML = `
  <nav class="game-editor-navigation" aria-label="Разделы редактора ИИ">
    <div class="game-editor-navigation-tabs" role="tablist" data-game-editor-tabs></div>
  </nav>
  <section class="game-editor-workspace" data-game-editor-workspace aria-live="polite"></section>
  <div data-game-editor-graph-parking hidden></div>
`;

graphRoot.replaceWith(shell);
const tabs = requireElement(shell, '[data-game-editor-tabs]');
const workspaceHost = requireElement(shell, '[data-game-editor-workspace]');
const graphParking = requireElement(shell, '[data-game-editor-graph-parking]');
graphParking.append(graphRoot);
graphRoot.hidden = true;

const registry = createDefaultGameEditorRegistry({ mountBehaviorGraph });
const workspace = new GameEditorWorkspace(workspaceHost, registry, 'ai-editor');
let destroyed = false;

for (const definition of registry.listForSurface('ai-editor')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.role = 'tab';
  button.dataset.gameEditorId = definition.id;
  button.textContent = definition.labelRu;
  button.setAttribute('aria-selected', 'false');
  button.addEventListener('click', () => { void openEditor(definition.id); });
  tabs.append(button);
}

const requestedEditorId = new URLSearchParams(window.location.search).get('editor');
const initialEditorId = requestedEditorId && registry.get(requestedEditorId)
  ? requestedEditorId
  : 'behaviorGraph';
void openEditor(initialEditorId);
window.addEventListener('pagehide', destroy, { once: true });

async function openEditor(editorId: string): Promise<void> {
  if (destroyed) return;
  const result = await workspace.open({
    editorId,
    selectedUnitId: new URLSearchParams(window.location.search).get('selectedUnitId') ?? undefined,
  });
  if (result.kind === 'refused' || result.kind === 'hidden') return;
  if (result.kind === 'route') {
    window.location.assign(result.url);
    return;
  }
  workspaceHost.dataset.activeGameEditor = editorId;
  tabs.querySelectorAll<HTMLButtonElement>('[data-game-editor-id]').forEach((button) => {
    const selected = button.dataset.gameEditorId === editorId;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
}

function mountBehaviorGraph(context: GameEditorMountContext): GameEditorInstallation {
  context.host.replaceChildren(graphRoot);
  graphRoot.hidden = false;
  let installationDestroyed = false;
  return {
    destroy(): void {
      if (installationDestroyed) return;
      installationDestroyed = true;
      graphRoot.hidden = true;
      graphParking.append(graphRoot);
    },
  };
}

function destroy(): void {
  if (destroyed) return;
  destroyed = true;
  workspace.destroy();
}

function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`AI editor shell element is missing: ${selector}`);
  return element;
}
