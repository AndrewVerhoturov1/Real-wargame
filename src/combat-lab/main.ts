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
import './game-editors/polygon-editor-parity.css';
import './game-editors/polygon-global-editor-parity.css';
import './game-editors/polygon-global-editor-feature-grid.css';
import './game-editors/polygon-global-editor-inner-parity.css';
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
    shellMenuInstallation.destroy();
    throw error;
  }
}

function createCombatLabRenderContext(context: GameApplicationContext): GameApplicationContext {
  return {
    ...context,
    installExtension(extensionContext) {
      return installCombatLabWithLiveUnit(
        document.querySelector<HTMLElement>('#combat-lab-extension-root')!,
        getCombatLabWorkspaceServices().session,
        extensionContext,
      );
    },
  };
}

function installCombatLabWithLiveUnit(
  extensionRoot: HTMLElement,
  session: CombatLabVisualSession,
  context: GameApplicationContext,
): GameApplicationExtension {
  const combatLab = new CombatLabExtension(extensionRoot, session, context);
  const liveUnit = CombatLabLiveUnitInspector.create({
    root: extensionRoot,
    session,
  });
  const rightPanel = getCombatLabRightPanelSeam(extensionRoot);
  const initialInfoOwners = preparePolygonInfoLiveOwners({
    map: session.state.map,
    state: session.state,
  });
  const polygonRightPanel = PolygonRightPanelLiveView.create({
    root: rightPanel.host,
    state: session.state,
    infoOwners: initialInfoOwners,
  });

  const unregisterContextMenuRoutes = registerEntityContextMenuRoutes({
    selectUnit(unitId) {
      selectUnit(session.state, unitId);
      liveUnit.reconcile();
    },
    openPanel(view, target) {
      if (view === 'unit' && target.kind === 'unit') {
        selectUnit(session.state, target.id);
        liveUnit.reconcile();
      }
      if (view === 'info') {
        setMouseGridPosition(session.state, target.anchorGridX, target.anchorGridY);
      }
      rightPanel.activateTab(view);
    },
    openEditor(editorId, target) {
      const selectedUnitId = target.kind === 'unit' ? target.id : undefined;
      const requestedEditor = target.kind === 'unit' ? 'soldierData' : 'environmentProfiles';
      requestCombatLabGameEditorOpen(extensionRoot, {
        editorId: editorId === 'unit' ? requestedEditor : editorId,
        selectedUnitId,
      });
    },
  });

  return {
    destroy(): void {
      unregisterContextMenuRoutes();
      polygonRightPanel.destroy();
      liveUnit.destroy();
      combatLab.destroy();
    },
  };
}

function keepProductionTickerPaused(session: CombatLabVisualSession): void {
  session.pause();
}

function createSessionPauseController(session: CombatLabVisualSession): GamePauseController {
  return {
    get isPaused(): boolean {
      return session.isPaused;
    },
    pause(): void {
      session.pause();
    },
    resume(): void {
      session.resume();
    },
    toggle(): void {
      if (session.isPaused) session.resume();
      else session.pause();
    },
  };
}

function installLaboratoryPlaceholder(host: HTMLElement): void {
  host.replaceChildren();
}
