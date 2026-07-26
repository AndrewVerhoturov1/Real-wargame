import './combat-lab.css';
import { getCombatLabScenarioDefinition } from '../core/testing/combat-lab';
import { CombatLabRenderer } from './rendering/CombatLabRenderer';
import { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabShell, createCombatLabLayout } from './ui/CombatLabShell';

const root = document.querySelector<HTMLElement>('#combat-lab-root');
if (!root) throw new Error('Не найден корневой элемент испытательного полигона.');

const defaultDefinition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const session = new CombatLabVisualSession(defaultDefinition.scenarioId, defaultDefinition.defaultSeed);
const layout = createCombatLabLayout(root);
let shell: CombatLabShell | null = null;

try {
  const renderer = await CombatLabRenderer.create(layout.map, session, () => shell?.refreshLive());
  shell = new CombatLabShell(layout, session, renderer);
  window.addEventListener('beforeunload', () => renderer.destroy(), { once: true });
} catch (error) {
  console.error(error);
  root.replaceChildren();
  const message = document.createElement('div');
  message.className = 'combat-lab-startup-error';
  message.textContent = `Испытательный полигон не запущен: ${error instanceof Error ? error.message : String(error)}`;
  root.append(message);
}
