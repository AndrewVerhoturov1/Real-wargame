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
  let lastTab = 'Предмет';

  const sync = (): void => {
    document.querySelectorAll<HTMLElement>('[data-action="editor-place"]').forEach((item) => item.remove());
    if (!document.body.classList.contains('workspace-editor')) return;

    const workbench = document.querySelector<HTMLElement>('.game-editor-workbench');
    const toolbar = workbench?.querySelector<HTMLElement>('.game-editor-global-tools');
    if (!workbench || !toolbar) return;

    const activeTab = workbench.querySelector<HTMLButtonElement>('.game-editor-tabs button.active');
    const activeLabel = (activeTab?.textContent ?? '').trim();
    if (activeLabel && TOOLS_BY_TAB[activeLabel]) lastTab = activeLabel;
    const tools = TOOLS_BY_TAB[lastTab] ?? [];
    const expectedIds = tools.map((tool) => tool.id).join('|');
    const currentIds = [...toolbar.querySelectorAll<HTMLButtonElement>('[data-header-placement-tool]')]
      .map((button) => button.dataset.headerPlacementTool ?? '')
      .join('|');

    if (expectedIds !== currentIds) {
      toolbar.querySelectorAll('[data-header-placement-tool]').forEach((button) => button.remove());
      const selectButton = toolbar.querySelector<HTMLButtonElement>('[data-editor-tool="select"]');
      let insertionPoint = selectButton?.nextSibling ?? toolbar.firstChild;

      for (const tool of tools) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = tool.label;
        button.className = 'editor-header-placement';
        button.dataset.headerPlacementTool = tool.id;
        button.addEventListener('click', () => {
          workbench.querySelector<HTMLButtonElement>(`.game-editor-body [data-editor-tool="${tool.id}"]`)?.click();
          syncActiveState(workbench, toolbar);
        });
        toolbar.insertBefore(button, insertionPoint);
        insertionPoint = button.nextSibling;
      }
    }
    syncActiveState(workbench, toolbar);
  };

  const handleContextClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const tabButton = target?.closest<HTMLButtonElement>('.game-editor-tabs button');
    if (tabButton) {
      const label = (tabButton.textContent ?? '').trim();
      if (TOOLS_BY_TAB[label]) lastTab = label;
    }
    if (tabButton || target?.closest('[data-mode="editor"]')) window.setTimeout(sync, 0);
  };

  document.addEventListener('click', handleContextClick, true);
  const interval = window.setInterval(sync, 500);
  sync();

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('click', handleContextClick, true);
  };
}

function syncActiveState(workbench: HTMLElement, toolbar: HTMLElement): void {
  for (const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-header-placement-tool]')) {
    const tool = button.dataset.headerPlacementTool ?? '';
    const source = workbench.querySelector<HTMLButtonElement>(`.game-editor-body [data-editor-tool="${tool}"]`);
    button.classList.toggle('active', source?.classList.contains('active') ?? false);
  }
}
