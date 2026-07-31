import { installAppShellMenu } from './AppShellMenu';

const shellMenuInstallation = installAppShellMenu({ mode: 'editor' });
window.addEventListener('beforeunload', () => {
  shellMenuInstallation.destroy();
}, { once: true });
