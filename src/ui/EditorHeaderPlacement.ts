interface HeaderPlacementTool {
  id: string;
  label: string;
}

const TOOLS_BY_TAB: Record<string, HeaderPlacementTool[]> = {
  Предмет: [{ id: 'spawn_object', label: 'Поставить предмет' }],
  Боец: [{ id: 'spawn_unit', label: 'Поставить бойца' }],
  Угроза: [{ id: 'spawn_zone', label: 'Поставить угрозу' }],
  Рельеф: [
    { id: 'paint_height', label: 'Рисовать высоту' },
    { id: 'paint_forest', label: 'Рисовать лес' },
  ],
  Сцена: [],
};

export function installEditorHeaderPlacement(): () => void {
  const workbench = document.querySelector<HTMLElement>('.game-editor-workbench');
  if (!workbench) return () => undefined;

  const sync = (): void => {
    document.querySelector<HTMLElement>('[data-action="editor-place"]')?.remove();
    const toolbar = workbench.querySelector<HTMLElement>('.game-editor-global-tools');
    const activeTab = workbench.querySelector<HTMLButtonElement>('.game-editor-tabs button.active');
    if (!toolbar || !activeTab) return;

    const tools = TOOLS_BY_TAB[(activeTab.textContent ?? '').trim()] ?? [];
    const expectedIds = tools.map((tool) => tool.id).join('|');
    const currentIds = [...toolbar.querySelectorAll<HTMLButtonElement>('[data-header-placement-tool]')]
      .map((button) => button.dataset.headerPlacementTool ?? '')
      .join('|');
    if (expectedIds === currentIds) return;

    toolbar.querySelectorAll('[data-header-placement-tool]').forEach((button) => button.remove());
    const selectButton = toolbar.querySelector<HTMLButtonElement>('[data-editor-tool="select"]');
    let insertionPoint = selectButton?.nextSibling ?? toolbar.firstChild;

    for (const tool of tools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.className = 'primary editor-header-placement';
      button.dataset.headerPlacementTool = tool.id;
      button.addEventListener('click', () => {
        workbench.querySelector<HTMLButtonElement>(`.game-editor-body [data-editor-tool="${tool.id}"]`)?.click();
        syncActiveState(workbench, toolbar);
      });
      toolbar.insertBefore(button, insertionPoint);
      insertionPoint = button.nextSibling;
    }
    syncActiveState(workbench, toolbar);
  };

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      sync();
      const toolbar = workbench.querySelector<HTMLElement>('.game-editor-global-tools');
      if (toolbar) syncActiveState(workbench, toolbar);
    });
  });
  observer.observe(workbench, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();

  return () => observer.disconnect();
}

function syncActiveState(workbench: HTMLElement, toolbar: HTMLElement): void {
  for (const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-header-placement-tool]')) {
    const tool = button.dataset.headerPlacementTool ?? '';
    const source = workbench.querySelector<HTMLButtonElement>(`.game-editor-body [data-editor-tool="${tool}"]`);
    button.classList.toggle('active', source?.classList.contains('active') ?? false);
  }
}
