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
    syncManualFireButton(allowed);
  };

  const syncManualFireButton = (allowed = isFireAllowed(state)) => {
    const manual = controls.querySelector<HTMLButtonElement>('[data-action="fire-contact"]');
    if (!manual || allowed) return;
    const contactTitle = manual.title.replace(/^Стрельба запрещена\.\s*/, '');
    manual.disabled = true;
    manual.title = contactTitle.startsWith('Личный контакт:')
      ? `Стрельба запрещена. ${contactTitle}`
      : 'Стрельба запрещена общим переключателем. Сначала боец должен сам обнаружить противника.';
  };

  const onClick = () => {
    void unlockCombatAudio();
    setFireAllowed(state, !isFireAllowed(state));
    update();
    onChanged();
  };

  button.addEventListener('click', onClick);
  const syncTimer = window.setInterval(update, 120);
  update();

  return () => {
    window.clearInterval(syncTimer);
    button.removeEventListener('click', onClick);
    button.remove();
  };
}
