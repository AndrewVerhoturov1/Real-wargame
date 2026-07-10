const PLACEMENT_SELECTOR = '.game-editor-body [data-editor-tool].primary';

export function installEditorHeaderPlacement(): () => void {
  const workbench = document.querySelector<HTMLElement>('.game-editor-workbench');
  if (!workbench) return () => undefined;

  const sync = (): void => {
    document.querySelector<HTMLElement>('[data-action="editor-place"]')?.remove();
    const toolbar = workbench.querySelector<HTMLElement>('.game-editor-global-tools');
    if (!toolbar) return;

    const placementButtons = [...workbench.querySelectorAll<HTMLButtonElement>(PLACEMENT_SELECTOR)];
    const selectButton = toolbar.querySelector<HTMLButtonElement>('[data-editor-tool="select"]');
    let insertionPoint = selectButton?.nextSibling ?? toolbar.firstChild;

    for (const placementButton of placementButtons) {
      placementButton.textContent = normalizePlacementLabel(placementButton.textContent ?? 'Поставить');
      placementButton.classList.add('editor-header-placement');
      toolbar.insertBefore(placementButton, insertionPoint);
      insertionPoint = placementButton.nextSibling;
    }
  };

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  });
  observer.observe(workbench, { childList: true, subtree: true });
  sync();

  return () => observer.disconnect();
}

function normalizePlacementLabel(label: string): string {
  if (label.includes('Ставить предмет')) return 'Поставить предмет';
  if (label.includes('Ставить бойца')) return 'Поставить бойца';
  if (label.includes('Ставить угрозу')) return 'Поставить угрозу';
  return label;
}
