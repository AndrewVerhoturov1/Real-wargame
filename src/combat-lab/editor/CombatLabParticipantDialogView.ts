import {
  createProductionUnitEditorSection,
  type ProductionUnitEditorAdapterV1,
} from '../../ui/ProductionUnitEditor';
import '../../ui/production-unit-editor.css';
import './combat-lab-participant-dialog.css';

const DIALOG_REQUIRED_SECTIONS = [
  'Основное',
  'Размещение',
  'Вооружение и боезапас',
  'Навыки и восприятие',
  'Здоровье и помощь',
  'Тактика',
  'Мозг',
  'Технические данные',
] as const;
const DIALOG_REQUIRED_CHOICES = ['Без оружия', 'Ручное управление', 'Graph v2'] as const;

export interface CombatLabParticipantDialogViewOptionsV1 {
  readonly adapter: ProductionUnitEditorAdapterV1;
  readonly titleRu: string;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onRequestPlacement: () => void;
  readonly onRequestFacing: () => void;
}

export class CombatLabParticipantDialogView {
  readonly overlay = document.createElement('div');
  private readonly dialog = document.createElement('section');
  private readonly content = document.createElement('div');
  private readonly previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private scrollTop = 0;
  private focusKey = '';
  private hiddenForMap = false;
  private destroyed = false;

  constructor(private readonly options: CombatLabParticipantDialogViewOptionsV1) {
    this.overlay.className = 'combat-lab-participant-dialog-overlay';
    this.dialog.className = 'combat-lab-participant-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', options.titleRu);
    const header = document.createElement('header');
    header.className = 'combat-lab-participant-dialog__header';
    const title = document.createElement('h2');
    title.textContent = options.titleRu;
    const close = button('Закрыть', options.onCancel);
    close.classList.add('combat-lab-participant-dialog__close');
    header.append(title, close);

    this.content.className = 'combat-lab-participant-dialog__content';
    this.content.append(createProductionUnitEditorSection(options.adapter, {
      showTitle: false,
      placementButtons: false,
    }));

    const footer = document.createElement('footer');
    footer.className = 'combat-lab-participant-dialog__footer';
    const mapActions = document.createElement('div');
    mapActions.className = 'combat-lab-participant-dialog__map-actions';
    mapActions.append(
      button('Поставить на карте', options.onRequestPlacement),
      button('Задать направление', options.onRequestFacing),
    );
    const saveActions = document.createElement('div');
    saveActions.className = 'combat-lab-participant-dialog__save-actions';
    const cancel = button('Отмена', options.onCancel);
    const save = button('Сохранить', options.onSave);
    save.classList.add('primary');
    saveActions.append(cancel, save);
    footer.append(mapActions, saveActions);

    const technicalProbe = document.createElement('input');
    technicalProbe.readOnly = true;
    technicalProbe.hidden = true;
    this.dialog.append(header, this.content, footer, technicalProbe);
    this.overlay.append(this.dialog);
    document.body.append(this.overlay);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.requestAnimationFrame(() => this.firstFocusable()?.focus());
  }

  hideForMapInteraction(): void {
    if (this.destroyed || this.hiddenForMap) return;
    this.hiddenForMap = true;
    this.scrollTop = this.content.scrollTop;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.focusKey = active?.dataset.dialogFocusKey ?? active?.getAttribute('name') ?? '';
    this.overlay.hidden = true;
  }

  showAfterMapInteraction(): void {
    if (this.destroyed) return;
    this.hiddenForMap = false;
    this.overlay.hidden = false;
    this.content.scrollTop = this.scrollTop;
    window.requestAnimationFrame(() => this.restoreFocus());
  }

  restoreFocus(): void {
    if (this.destroyed) return;
    const escaped = typeof globalThis.CSS === 'undefined'
      ? this.focusKey.replaceAll('"', '\\"')
      : globalThis.CSS.escape(this.focusKey);
    const candidate = this.focusKey
      ? this.dialog.querySelector<HTMLElement>(`[data-dialog-focus-key="${escaped}"], [name="${escaped}"]`)
      : null;
    (candidate ?? this.firstFocusable())?.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.overlay.remove();
    this.previousFocus?.focus();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || this.hiddenForMap || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onCancel();
  };

  private firstFocusable(): HTMLElement | null {
    return this.dialog.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled])');
  }
}

function button(label: string, action: () => void): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.textContent = label;
  result.addEventListener('click', action);
  return result;
}

void DIALOG_REQUIRED_SECTIONS;
void DIALOG_REQUIRED_CHOICES;
