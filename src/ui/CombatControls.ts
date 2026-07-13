import { isFireAllowed, setFireAllowed } from '../core/combat/CombatRules';
import type { SimulationState } from '../core/simulation/SimulationState';
import { unlockCombatAudio } from './CombatAudio';

export function installCombatControls(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const controls = document.querySelector<HTMLElement>('.simulation-controls');
  if (!controls) return () => undefined;

  const existing = controls.querySelector<HTMLButtonElement>('[data-action="toggle-fire-permission"]');
  if (existing) existing.remove();

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary combat-fire-permission';
  button.dataset.action = 'toggle-fire-permission';
  controls.prepend(button);

  const update = () => {
    const allowed = isFireAllowed(state);
    button.textContent = allowed ? 'Стрельба: разрешена' : 'Стрельба: запрещена';
    button.setAttribute('aria-pressed', String(allowed));
    button.classList.toggle('hud-toggle-off', !allowed);
    button.title = allowed
      ? 'Бойцы могут открывать огонь по своим подтверждённым контактам.'
      : 'Бойцы обнаруживают противника, но новые выстрелы запрещены.';
  };

  const onClick = () => {
    void unlockCombatAudio();
    setFireAllowed(state, !isFireAllowed(state));
    update();
    onChanged();
  };

  button.addEventListener('click', onClick);
  update();

  return () => {
    button.removeEventListener('click', onClick);
    button.remove();
  };
}
