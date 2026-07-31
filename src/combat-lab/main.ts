import '../game/GameStyles';
import './ui/combat-lab-ui-tokens.css';
import './combat-lab.css';
import './combat-lab-workspace.css';
import './combat-lab-ui-polish.css';
import './combat-lab-header-final.css';
import './ui/combat-lab-experiment-run.css';
import './ui/combat-lab-batch-results.css';
import { getCombatLabScenarioDefinition } from '../core/testing/combat-lab';
import { collectGameApplicationElements, GameApplication } from '../game/GameApplication';
import type { GameApplicationContext, GamePauseController } from '../game/GameApplicationTypes';
import { installAppShellMenu } from '../shared/AppShellMenu';
import { CombatLabExtension } from './CombatLabExtension';
import {
  installCombatLabQuickParameters,
  type CombatLabQuickParametersInstallationV1,
} from './parameters/installCombatLabQuickParameters';
import { CombatLabVisualSession } from './runtime/CombatLabVisualSession';

let application: GameApplication | null = null;
let quickParametersInstallation: CombatLabQuickParametersInstallationV1 | null = null;

installAppShellMenu({ mode: 'combat-lab' });
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
      installExtension: (context) => CombatLabExtension.create(
        extensionRoot,
        session,
        createCombatLabRenderContext(context),
      ),
    });
    quickParametersInstallation = installCombatLabQuickParameters(extensionRoot, session);
  } catch (error) {
    quickParametersInstallation?.destroy();
    quickParametersInstallation = null;
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
  application?.destroy();
  application = null;
});

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
