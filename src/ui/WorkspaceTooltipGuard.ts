export function installWorkspaceTooltipGuard(): () => void {
  const closeWorkspaceMenus = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-tab], [data-mode], [data-action="collapse"], .game-editor-tabs')) return;
    for (const details of document.querySelectorAll<HTMLDetailsElement>('.workspace-file-menu[open], .workspace-display-menu[open]')) {
      details.open = false;
    }
  };

  document.addEventListener('pointerdown', closeWorkspaceMenus, true);
  return () => document.removeEventListener('pointerdown', closeWorkspaceMenus, true);
}
