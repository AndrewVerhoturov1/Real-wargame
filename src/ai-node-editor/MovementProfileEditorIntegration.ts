import {
  disposeMovementProfileEditorPanel,
  renderMovementProfiles,
} from './MovementProfileEditorPanel';

const navigation = document.querySelector<HTMLElement>('.navigation-profile-tabs');
const mainTabs = navigation?.querySelector<HTMLElement>('.navigation-profile-main-tabs');
const panel = document.querySelector<HTMLElement>('.navigation-profile-workbench');
const graphRoot = document.querySelector<HTMLElement>('#ai-node-editor-root');

if (!navigation || !mainTabs || !panel || !graphRoot) {
  throw new Error('Movement profile editor integration could not find the AI editor shell.');
}

const routeProfileButton = mainTabs.querySelector<HTMLButtonElement>('[data-navigation-tab="profiles"]');
if (routeProfileButton) routeProfileButton.textContent = 'Профили маршрута';

const movementButton = document.createElement('button');
movementButton.type = 'button';
movementButton.textContent = 'Профили движения';
movementButton.dataset.movementProfileTab = 'true';
movementButton.setAttribute('role', 'tab');
movementButton.setAttribute('aria-selected', 'false');

const attentionButton = mainTabs.querySelector<HTMLButtonElement>('[data-navigation-tab="attentionProfiles"]');
mainTabs.insertBefore(movementButton, attentionButton ?? null);

movementButton.addEventListener('click', () => {
  graphRoot.hidden = true;
  panel.hidden = false;
  navigation.querySelectorAll<HTMLButtonElement>('[data-navigation-tab]').forEach((button) => {
    button.classList.remove('active');
    button.setAttribute('aria-selected', 'false');
  });
  movementButton.classList.add('active');
  movementButton.setAttribute('aria-selected', 'true');
  renderMovementProfiles(panel);
});

navigation.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-navigation-tab]')) return;
  movementButton.classList.remove('active');
  movementButton.setAttribute('aria-selected', 'false');
  const tab = target.closest<HTMLButtonElement>('[data-navigation-tab]')?.dataset.navigationTab ?? '';
  panel.dataset.activeProfileEditor = tab;
  if (tab === 'profiles') {
    const heading = panel.querySelector<HTMLHeadingElement>('h2');
    if (heading?.textContent?.trim() === 'Профили движения') heading.textContent = 'Профили маршрута';
  }
});

window.addEventListener('beforeunload', disposeMovementProfileEditorPanel, { once: true });
