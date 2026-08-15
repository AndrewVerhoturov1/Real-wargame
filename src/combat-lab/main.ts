import '../game/GameStyles';
import '../ui/GameplayTuningProfileStorage';
import './ui/combat-lab-ui-tokens.css';
import './combat-lab.css';
import './combat-lab-workspace.css';
import './combat-lab-ui-polish.css';
import './combat-lab-header-final.css';
import './polygon-shell.css';
import './polygon-shell-compat.css';
import './ui/combat-lab-live-unit.css';
import './ui/combat-lab-experiment-run.css';
import './ui/combat-lab-batch-results.css';
import './game-editors/combat-lab-game-editors.css';
import { getCombatLabScenarioDefinition } from '../core/testing/combat-lab';
import { collectGameApplicationElements, GameApplication } from '../game/GameApplication';
import type { GameApplicationContext, GameApplicationExtension, GamePauseController } from '../game/GameApplicationTypes';
import { createDefaultGameEditorRegistry } from '../game-editors/createDefaultGameEditorRegistry';
import { installAppShellMenu } from '../shared/AppShellMenu';
import { getAppOverlayCoordinator } from '../shared/app-overlay/AppOverlayCoordinator';
import { CombatLabExtension } from './CombatLabExtension';
import { getCombatLabWorkspaceServices } from './CombatLabWorkspaceServices';
import { CombatLabGameEditors } from './game-editors/CombatLabGameEditors';
import {
  installCombatLabQuickParameters,
  type CombatLabQuickParametersInstallationV1,
} from './parameters/installCombatLabQuickParameters';
import { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabLiveUnitInspector } from './ui/CombatLabLiveUnitInspector';
import {
  getCombatLabWorkspaceHosts,
  getOnlyCombatLabWorkspaceRoot,
} from './ui/CombatLabWorkspaceTabs';

let application: GameApplication | null = null;
let quickParametersInstallation: CombatLabQuickParametersInstallationV1 | null = null;
let gameEditorsInstallation: CombatLabGameEditors | null = null;

const shellMenuInstallation = installAppShellMenu({ mode: 'combat-lab' });
void startCombatLab();

async function startCombatLab(): Promise<void> {
  const extensionRoot = document.querySelector<HTMLElement>('#combat-lab-extension-root');
  if (!extensionRoot) throw new Error('Не найден контейнер инструментов испытательного полигона.');

  const defaultDefinition = getCombatLabScenarioDefinition('rifle-distance-baseline');
  const session = new CombatLabVisualSession(defaultDefinition.scenarioId, defaultDefinition.defaultSeed);
  keepProductionTickerPaused(session);

  try {
    application = await GameApplication.create({
      mode: 'combat-lab',
      state: session.state,
      elements: collectGameApplicationElements(),
      pauseController: createSessionPauseController(session, extensionRoot),
      installExtension: (context) => installCombatLabExtension(
        extensionRoot,
        session,
        context,
      ),
    });
    const workspaceRoot = getOnlyCombatLabWorkspaceRoot();
    const workspaceHosts = getCombatLabWorkspaceHosts(workspaceRoot);
    installLaboratoryPlaceholder(workspaceHosts.laboratory);
    gameEditorsInstallation = CombatLabGameEditors.create({
      host: workspaceHosts.settings,
      eventTarget: extensionRoot,
      registry: createDefaultGameEditorRegistry(),
      overlayCoordinator: getAppOverlayCoordinator(document),
    });
    quickParametersInstallation = installCombatLabQuickParameters(extensionRoot, session);
  } catch (error) {
    quickParametersInstallation?.destroy();
    quickParametersInstallation = null;
    gameEditorsInstallation?.destroy();
    gameEditorsInstallation = null;
    application?.destroy();
    application = null;
    console.error(error);
    extensionRoot.replaceChildren();
    const message = document.createElement('div');
    message.className = 'combat-lab-startup-error';
    message.textContent = `Испытательный полигон не запущен: ${error instanceof Error ? error.message : String(error)}`;
    extensionRoot.append(message);
  }
}

window.addEventListener('beforeunload', () => {
  quickParametersInstallation?.destroy();
  quickParametersInstallation = null;
  gameEditorsInstallation?.destroy();
  gameEditorsInstallation = null;
  application?.destroy();
  application = null;
  shellMenuInstallation.destroy();
});

function installCombatLabExtension(
  extensionRoot: HTMLElement,
  session: CombatLabVisualSession,
  context: GameApplicationContext,
): GameApplicationExtension {
  const extension = CombatLabExtension.create(
    extensionRoot,
    session,
    createCombatLabRenderContext(context),
  );
  const workspaceRoot = getOnlyCombatLabWorkspaceRoot();
  const services = getCombatLabWorkspaceServices(workspaceRoot);
  const unitHost = workspaceRoot.querySelector<HTMLElement>('[data-polygon-right-content="unit"]');
  if (!unitHost) {
    extension.destroy();
    throw new Error('Не найден host правой вкладки «Юнит».');
  }

  const liveUnitInspector = CombatLabLiveUnitInspector.create({
    host: unitHost,
    state: session.state,
    session,
    editorEventRoot: extensionRoot,
    getRoleLabelRu: (unitId) => (
      services.draft.get().roles.find((role) => role.unitId === unitId)?.titleRu ?? null
    ),
  });
  const removeTicker = context.addTickerListener(() => liveUnitInspector.refresh());
  const removeSelectionListener = services.selection.subscribe(() => liveUnitInspector.refresh(true));
  const removeDraftListener = services.draft.subscribe(() => liveUnitInspector.refresh(true));

  return {
    destroy: () => {
      removeDraftListener();
      removeSelectionListener();
      removeTicker();
      liveUnitInspector.destroy();
      extension.destroy();
    },
  };
}

function installLaboratoryPlaceholder(host: HTMLElement): void {
  const message = document.createElement('div');
  message.className = 'polygon-shell-empty-state';
  message.textContent = 'Лаборатория пока не подключена к продуктовым параметрам. Каркас не создаёт временные значения или отдельное состояние эксперимента.';
  host.replaceChildren(message);
}

function createCombatLabRenderContext(context: GameApplicationContext): GameApplicationContext {
  return {
    ...context,
    // The Pixi ticker already renders every frame. Combat Lab callers only need
    // to mutate renderer state; the next automatic frame publishes it. Keeping
    // forceRender as a no-op prevents duplicate renderFrame passes and preserves
    // the revision-owned static map cache.
    forceRender: () => {},
  };
}

function createSessionPauseController(
  session: CombatLabVisualSession,
  extensionRoot: HTMLElement,
): GamePauseController {
  const extensionActive = () => extensionRoot.dataset.combatLabExtension === 'active';
  return {
    isPaused: () => session.isPaused(),
    toggle: () => {
      if (extensionActive()) extensionRoot.dispatchEvent(new CustomEvent('combat-lab:toggle-pause'));
      else session.togglePaused();
      keepProductionTickerPaused(session);
    },
    setPaused: (value) => {
      if (extensionActive()) extensionRoot.dispatchEvent(new CustomEvent('combat-lab:set-paused', { detail: value }));
      else session.setPaused(value);
      keepProductionTickerPaused(session);
    },
  };
}

function keepProductionTickerPaused(session: CombatLabVisualSession): void {
  (session.state as typeof session.state & { paused?: boolean }).paused = true;
}
