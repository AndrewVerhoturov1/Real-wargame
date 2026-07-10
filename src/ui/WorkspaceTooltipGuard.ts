export function installWorkspaceTooltipGuard(): () => void {
  const clearCoverTooltip = (): void => {
    const tooltip = document.querySelector<HTMLElement>('.cover-map-tooltip');
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.replaceChildren();
  };

  const handlePointerDown = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-tab], [data-mode], [data-action="collapse"], .game-editor-tabs')) return;
    clearCoverTooltip();
  };
  const handleVisibility = (): void => {
    if (document.hidden) clearCoverTooltip();
  };

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('blur', clearCoverTooltip);

  return () => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', clearCoverTooltip);
  };
}
