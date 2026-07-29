import './combat-lab-map-context-menu.css';

export interface CombatLabMapContextMenuItemV1 {
  readonly id: string;
  readonly labelRu: string;
  readonly disabled?: boolean;
  readonly reasonRu?: string | null;
  readonly onSelect: () => void;
}

export class CombatLabMapContextMenu {
  readonly root = document.createElement('div');
  private layoutFrameId: number | null = null;
  private destroyed = false;

  constructor(private readonly ownerDocument: Document = document) {
    this.root.className = 'combat-lab-map-context-menu';
    this.root.setAttribute('role', 'menu');
    this.root.hidden = true;
    this.ownerDocument.body.append(this.root);
    this.ownerDocument.addEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.addEventListener('resize', this.close);
    window.addEventListener('blur', this.close);
  }

  open(clientX: number, clientY: number, items: readonly CombatLabMapContextMenuItemV1[]): void {
    if (this.destroyed) return;
    this.root.replaceChildren(...items.map((item) => this.createItem(item)));
    this.root.hidden = false;
    this.root.style.left = `${Math.max(4, clientX)}px`;
    this.root.style.top = `${Math.max(4, clientY)}px`;
    this.cancelLayoutFrame();
    this.layoutFrameId = window.requestAnimationFrame(() => {
      this.layoutFrameId = null;
      this.keepInsideViewport();
    });
  }

  readonly close = (): void => {
    if (this.destroyed) return;
    this.cancelLayoutFrame();
    this.root.hidden = true;
    this.root.replaceChildren();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.ownerDocument.removeEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.removeEventListener('resize', this.close);
    window.removeEventListener('blur', this.close);
    this.root.remove();
  }

  private createItem(item: CombatLabMapContextMenuItemV1): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'combat-lab-map-context-menu-item';
    row.dataset.menuItem = item.id;
    row.setAttribute('role', 'menuitem');
    row.disabled = Boolean(item.disabled);
    row.textContent = item.labelRu;
    if (item.reasonRu) {
      const reason = document.createElement('small');
      reason.textContent = item.reasonRu;
      row.append(reason);
      row.title = item.reasonRu;
    }
    row.addEventListener('click', () => {
      if (row.disabled) return;
      this.close();
      item.onSelect();
    });
    return row;
  }

  private cancelLayoutFrame(): void {
    if (this.layoutFrameId === null) return;
    window.cancelAnimationFrame(this.layoutFrameId);
    this.layoutFrameId = null;
  }

  private keepInsideViewport(): void {
    if (this.root.hidden || this.destroyed) return;
    const rect = this.root.getBoundingClientRect();
    const left = Math.max(4, Math.min(parseFloat(this.root.style.left) || 0, window.innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(parseFloat(this.root.style.top) || 0, window.innerHeight - rect.height - 4));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  private readonly handleOutsidePointerDown = (event: PointerEvent): void => {
    if (this.root.hidden || this.root.contains(event.target as Node)) return;
    this.close();
  };
}
