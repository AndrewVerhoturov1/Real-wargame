import '../game/GameStyles';
import '../ui/GameplayTuningProfileStorage';
import './ui/combat-lab-ui-tokens.css';
import './combat-lab.css';
import './combat-lab-workspace.css';
import './combat-lab-ui-polish.css';
import './combat-lab-header-final.css';
import './polygon-shell.css';
import './polygon-shell-compat.css';
import './polygon-shell-exact.css';
import './ui/combat-lab-experiment-run.css';
import './ui/combat-lab-batch-results.css';
import './ui/combat-lab-live-unit.css';
import './game-editors/combat-lab-game-editors.css';
import './game-editors/combat-lab-game-editor-shell.css';
import './polygon-map-surface.css';
import { selectUnit, setMouseGridPosition } from '../core/simulation/SimulationState';
import { getCombatLabScenarioDefinition } from '../core/testing/combat-lab';
import { collectGameApplicationElements, GameApplication } from '../game/GameApplication';
import type {
  GameApplicationContext,
  GameApplicationExtension,
  GamePauseController,
} from '../game/GameApplicationTypes';
import { createDefaultGameEditorRegistry } from '../game-editors/createDefaultGameEditorRegistry';
import { installAppShellMenu } from '../shared/AppShellMenu';
import { getAppOverlayCoordinator } from '../shared/app-overlay/AppOverlayCoordinator';
import { registerEntityContextMenuRoutes } from '../ui/EntityContextMenuRouteRegistry';
import { CombatLabExtension } from './CombatLabExtension';
import { getCombatLabWorkspaceServices } from './CombatLabWorkspaceServices';
import { CombatLabEditorShellBridge } from './game-editors/CombatLabEditorShellBridge';
import { requestCombatLabGameEditorOpen } from './game-editors/CombatLabGameEditorLinks';
import { CombatLabGameEditors } from './game-editors/CombatLabGameEditors';
import {
  installCombatLabQuickParameters,
  type CombatLabQuickParametersInstallationV1,
} from './parameters/installCombatLabQuickParameters';
import { preparePolygonInfoLiveOwners } from './right-panel/PolygonRightPanelLive';
import { PolygonRightPanelLiveView } from './right-panel/PolygonRightPanelLiveView';
import { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabLiveUnitInspector } from './ui/CombatLabLiveUnitInspector';
import { getCombatLabRightPanelSeam } from './ui/CombatLabRightPanelSeam';
import {
  getCombatLabWorkspaceHosts,
  getOnlyCombatLabWorkspaceRoot,
} from './ui/CombatLabWorkspaceTabs';

let application: GameApplication | null = null;
let quickParametersInstallation: CombatLabQuickParametersInstallationV1 | null = null;
let gameEditorsInstallation: CombatLabGameEditors | null = null;
let editorShellBridge: CombatLabEditorShellBridge | null = null;

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
      installExtension: (context) => installCombatLabWithLiveUnit(
        extensionRoot,
        session,
        createCombatLabRenderContext(context),
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
    editorShellBridge = CombatLabEditorShellBridge.create({
      root: workspaceRoot,
      eventTarget: extensionRoot,
      state: session.state,
      session,
    });
    quickParametersInstallation = installCombatLabQuickParameters(extensionRoot, session);
  } catch (error) {
    quickParametersInstallation?.destroy();
    quickParametersInstallation = null;
    editorShellBridge?.destroy();
    editorShellBridge = null;
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
  editorShellBridge?.destroy();
  editorShellBridge = null;
  gameEditorsInstallation?.destroy();
  gameEditorsInstallation = null;
  application?.destroy();
  application = null;
  shellMenuInstallation.destroy();
});

function installCombatLabWithLiveUnit(
  extensionRoot: HTMLElement,
  session: CombatLabVisualSession,
  context: GameApplicationContext,
): GameApplicationExtension {
  const extension = CombatLabExtension.create(extensionRoot, session, context);
  const workspaceRoot = getOnlyCombatLabWorkspaceRoot();
  const services = getCombatLabWorkspaceServices(workspaceRoot);
  const rightPanel = getCombatLabRightPanelSeam(workspaceRoot, session.state);
  const inspector = CombatLabLiveUnitInspector.create({
    host: rightPanel.hosts.unit,
    state: rightPanel.state,
    session,
    rightPanel,
    editorEventRoot: extensionRoot,
    getRoleLabelRu: (unitId) => {
      const role = services.draft.get().roles.find((candidate) => candidate.unitId === unitId);
      return role?.titleRu ?? null;
    },
  });

  let infoOwners = preparePolygonInfoLiveOwners(rightPanel.state);
  const linzaView = new PolygonRightPanelLiveView({
    hosts: {
      info: rightPanel.hosts.info,
      attention: rightPanel.hosts.attention,
      memory: rightPanel.hosts.memory,
    },
    getAttentionContext: () => ({
      state: rightPanel.state,
      unitId: rightPanel.state.selectedUnitId,
    }),
  });

  const selectContextUnit = (unitId: string): void => {
    selectUnit(rightPanel.state, unitId);
    rightPanel.selection.reconcileFromState();
    inspector.refresh(true);
    editorShellBridge?.refresh();
  };

  const refreshLinza = (): void => {
    const state = rightPanel.state;
    if (rightPanel.isTabActive('info')) {
      if (infoOwners.map !== state.map) infoOwners = preparePolygonInfoLiveOwners(state);
      const point = state.mouseGridPosition
        ? { x: state.mouseGridPosition.x, y: state.mouseGridPosition.y, pinned: false }
        : null;
      linzaView.renderInfo(state, point, infoOwners);
      rightPanel.setHeader({ kickerRu: 'ТОЧКА КАРТЫ', titleRu: point ? 'Инфо' : 'Точка не выбрана' });
      return;
    }
    if (rightPanel.isTabActive('attention')) {
      linzaView.renderAttention(state, state.selectedUnitId);
      const selected = state.units.find((unit) => unit.id === state.selectedUnitId);
      rightPanel.setHeader({ kickerRu: 'ВНИМАНИЕ', titleRu: selected?.labels.ru ?? 'Юнит не выбран' });
      return;
    }
    if (rightPanel.isTabActive('memory')) {
      linzaView.renderMemory(state, state.selectedUnitId);
      const selected = state.units.find((unit) => unit.id === state.selectedUnitId);
      rightPanel.setHeader({ kickerRu: 'ПАМЯТЬ', titleRu: selected?.labels.ru ?? 'Юнит не выбран' });
    }
  };

  const unregisterContextRoutes = registerEntityContextMenuRoutes({
    openPanel: (target, view) => {
      if (target.kind === 'unit') selectContextUnit(target.id);
      if (view === 'info') setMouseGridPosition(rightPanel.state, target.anchorGrid);
      rightPanel.activateTab(view);
      linzaView.invalidate();
      inspector.refresh(true);
      editorShellBridge?.refresh();
      refreshLinza();
    },
    openEditor: (target) => {
      if (target.kind === 'unit') {
        selectContextUnit(target.id);
        requestCombatLabGameEditorOpen(extensionRoot, {
          editorId: 'soldierData',
          selectedUnitId: target.id,
          returnTo: 'combat-lab:right-panel:unit',
        });
        return;
      }
      setMouseGridPosition(rightPanel.state, target.anchorGrid);
      extensionRoot.dispatchEvent(new CustomEvent('combat-lab:activate-tab', {
        bubbles: true,
        detail: 'scene',
      }));
    },
  });

  const removeTickerListener = context.addTickerListener(() => {
    inspector.refresh();
    editorShellBridge?.refresh();
    refreshLinza();
  });
  const removeSelectionListener = rightPanel.selection.subscribe(() => {
    inspector.refresh(true);
    editorShellBridge?.refresh();
    linzaView.invalidate();
    refreshLinza();
  });
  const removeDraftListener = services.draft.subscribe(() => {
    inspector.refresh(true);
    editorShellBridge?.refresh();
  });

  refreshLinza();

  return {
    destroy(): void {
      removeDraftListener();
      removeSelectionListener();
      removeTickerListener();
      unregisterContextRoutes();
      linzaView.destroy();
      inspector.destroy();
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
