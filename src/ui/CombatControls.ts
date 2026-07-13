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

  const manualFireButton = controls.querySelector<HTMLButtonElement>('[data-action="fire-contact"]');
  const syncManualFireButton = (allowed = isFireAllowed(state)) => {
    if (!manualFireButton || allowed) return;
    const contactTitle = manualFireButton.title.replace(/^Стрельба запрещена\.\s*/, '');
    const nextTitle = contactTitle.startsWith('Личный контакт:')
      ? `Стрельба запрещена. ${contactTitle}`
      : 'Стрельба запрещена общим переключателем. Сначала боец должен сам обнаружить противника.';
    if (!manualFireButton.disabled) manualFireButton.disabled = true;
    if (manualFireButton.title !== nextTitle) manualFireButton.title = nextTitle;
  };

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

  const onClick = () => {
    void unlockCombatAudio();
    setFireAllowed(state, !isFireAllowed(state));
    update();
    onChanged();
  };

  const manualButtonObserver = manualFireButton
    ? new MutationObserver(() => syncManualFireButton())
    : null;
  if (manualFireButton) {
    manualButtonObserver?.observe(manualFireButton, {
      attributes: true,
      attributeFilter: ['disabled', 'title'],
    });
  }

  button.addEventListener('click', onClick);
  update();

  return () => {
    manualButtonObserver?.disconnect();
    button.removeEventListener('click', onClick);
    button.remove();
  };
}
