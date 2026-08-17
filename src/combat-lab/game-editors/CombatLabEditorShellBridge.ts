import { getSelectedUnit, type SimulationState } from '../../core/simulation/SimulationState';
import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';
import {
  isCombatLabWorkspaceTab,
  type CombatLabWorkspaceTab,
} from '../ui/CombatLabWorkspaceHosts';

const PRESENTED_LEFT_TABS = new Set<CombatLabWorkspaceTab>(['scene', 'parameters']);
const EDITOR_PANEL_TABS = ['scene', 'parameters', 'settings'] as const;
type EditorPanelTab = typeof EDITOR_PANEL_TABS[number];

export interface CombatLabEditorShellBridgeOptions {
  readonly root: HTMLElement;
  readonly eventTarget: HTMLElement;
  readonly state: SimulationState;
  readonly session: CombatLabVisualSession;
  readonly search?: string;
}

/**
 * Presentation-only bridge between the accepted Polygon shell and the already
 * mounted Combat Lab owners. The first screen of Map/Unit editor follows the
 * accepted prototype; the existing product editor remains mounted below as the
 * advanced owner surface. No second editor state or gameplay store is created.
 */
export class CombatLabEditorShellBridge {
  private readonly hiddenHosts: HTMLElement;
  private readonly leftBody: HTMLElement;
  private readonly parityHost: HTMLElement;
  private readonly leftMount: HTMLElement;
  private readonly editorsButton: HTMLButtonElement;
  private readonly portal: HTMLElement;
  private readonly portalBody: HTMLElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly panels: Readonly<Record<EditorPanelTab, HTMLElement>>;
  private readonly initialLeftBodyAriaHidden: string | null;
  private readonly initialEditorsTitle: string;
  private readonly initialEditorsAriaDisabled: string | null;
  private activeTab: CombatLabWorkspaceTab;
  private returnTab: CombatLabWorkspaceTab = 'program';
  private lastUnitCommandMessage = '';
  private destroyed = false;

  private constructor(private readonly options: CombatLabEditorShellBridgeOptions) {
    this.hiddenHosts = requireElement(options.root, '.polygon-shell-hidden-hosts');
    this.leftBody = requireElement(options.root, '.polygon-shell-left > .polygon-shell-panel-body');
    this.editorsButton = requireElement<HTMLButtonElement>(options.root, '.polygon-shell-top-button--editors');
    this.panels = Object.freeze({
      scene: requireElement(options.root, '#combat-lab-workspace-panel-scene'),
      parameters: requireElement(options.root, '#combat-lab-workspace-panel-parameters'),
      settings: requireElement(options.root, '#combat-lab-workspace-panel-settings'),
    });

    this.initialLeftBodyAriaHidden = this.leftBody.getAttribute('aria-hidden');
    this.initialEditorsTitle = this.editorsButton.title;
    this.initialEditorsAriaDisabled = this.editorsButton.getAttribute('aria-disabled');

    this.parityHost = node('div', 'polygon-shell-editor-parity-host');
    this.parityHost.hidden = true;
    this.leftMount = node('div', 'polygon-shell-editor-tab-host');
    this.leftMount.hidden = true;
    this.leftBody.append(this.parityHost);

    this.portal = node('section', 'polygon-shell-editors-portal');
    this.portal.hidden = true;
    this.portal.setAttribute('aria-label', 'Общие редакторы игры');
    const portalHeader = node('header', 'polygon-shell-editors-portal-header');
    const heading = node('div', 'polygon-shell-editors-portal-heading');
    heading.append(
      node('div', 'polygon-shell-panel-kicker', 'ОБЩИЕ РЕДАКТОРЫ'),
      node('h2', 'polygon-shell-editors-portal-title', 'Редакторы игры'),
    );
    this.returnButton = button('← Назад', 'polygon-shell-editors-return');
    this.returnButton.setAttribute('aria-label', 'Вернуться к Полигону');
    portalHeader.append(heading, this.returnButton);
    this.portalBody = node('div', 'polygon-shell-editors-portal-body');
    this.portal.append(portalHeader, this.portalBody);
    options.root.append(this.portal);

    this.editorsButton.removeAttribute('aria-disabled');
    this.editorsButton.setAttribute('aria-pressed', 'false');
    this.editorsButton.title = 'Открыть общие редакторы игры';
    this.editorsButton.addEventListener('click', this.handleEditorsClick);
    this.returnButton.addEventListener('click', this.handleReturnClick);
    options.root.addEventListener('combat-lab-workspace-tab-change', this.handleWorkspaceTabChanged);

    const initialTab = readWorkspaceTab(options.root.dataset.activeWorkspace) ?? 'program';
    this.activeTab = initialTab;
    if (initialTab !== 'settings') this.returnTab = initialTab;
    this.sync(initialTab);

    if (requestsEditorCatalogue(options.search ?? window.location.search)) {
      this.requestTab('settings');
    }
  }

  static create(options: CombatLabEditorShellBridgeOptions): CombatLabEditorShellBridge {
    return new CombatLabEditorShellBridge(options);
  }

  refresh(): void {
    if (this.destroyed || !PRESENTED_LEFT_TABS.has(this.activeTab)) return;
    this.renderParity(this.activeTab as Extract<EditorPanelTab, 'scene' | 'parameters'>);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.editorsButton.removeEventListener('click', this.handleEditorsClick);
    this.returnButton.removeEventListener('click', this.handleReturnClick);
    this.options.root.removeEventListener('combat-lab-workspace-tab-change', this.handleWorkspaceTabChanged);

    for (const tabId of EDITOR_PANEL_TABS) this.restorePanel(tabId);
    this.parityHost.remove();
    this.leftMount.remove();
    this.portal.remove();
    this.options.root.classList.remove('polygon-shell-editors-open');
    restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
    restoreAttribute(this.editorsButton, 'aria-disabled', this.initialEditorsAriaDisabled);
    this.editorsButton.removeAttribute('aria-pressed');
    this.editorsButton.title = this.initialEditorsTitle;
  }

  private readonly handleEditorsClick = (): void => {
    if (this.destroyed) return;
    if (this.activeTab === 'settings') {
      this.requestTab(this.returnTab);
      return;
    }
    this.returnTab = this.activeTab;
    this.requestTab('settings');
  };

  private readonly handleReturnClick = (): void => {
    if (!this.destroyed) this.requestTab(this.returnTab);
  };

  private readonly handleWorkspaceTabChanged = (event: Event): void => {
    if (this.destroyed) return;
    const requested = (event as CustomEvent<unknown>).detail;
    if (!isCombatLabWorkspaceTab(requested)) return;
    this.activeTab = requested;
    if (requested !== 'settings') this.returnTab = requested;
    this.sync(requested);
  };

  private requestTab(tabId: CombatLabWorkspaceTab): void {
    this.options.eventTarget.dispatchEvent(new CustomEvent<CombatLabWorkspaceTab>(
      'combat-lab:activate-tab',
      { bubbles: true, detail: tabId },
    ));
  }

  private sync(tabId: CombatLabWorkspaceTab): void {
    const settingsOpen = tabId === 'settings';
    this.options.root.classList.toggle('polygon-shell-editors-open', settingsOpen);
    this.editorsButton.setAttribute('aria-pressed', String(settingsOpen));
    this.portal.hidden = !settingsOpen;

    if (settingsOpen) {
      this.restorePanel('scene');
      this.restorePanel('parameters');
      this.parityHost.hidden = true;
      this.leftMount.hidden = true;
      restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
      this.presentPanel('settings', this.portalBody);
      return;
    }

    this.restorePanel('settings');
    if (PRESENTED_LEFT_TABS.has(tabId)) {
      const editorTab = tabId as Extract<EditorPanelTab, 'scene' | 'parameters'>;
      for (const candidate of ['scene', 'parameters'] as const) {
        if (candidate !== editorTab) this.restorePanel(candidate);
      }
      this.leftBody.removeAttribute('aria-hidden');
      this.parityHost.hidden = false;
      this.leftMount.hidden = false;
      this.presentPanel(editorTab, this.leftMount);
      this.renderParity(editorTab);
      return;
    }

    this.restorePanel('scene');
    this.restorePanel('parameters');
    this.parityHost.hidden = true;
    this.leftMount.hidden = true;
    restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
  }

  private renderParity(tabId: Extract<EditorPanelTab, 'scene' | 'parameters'>): void {
    if (tabId === 'scene') this.renderMapEditorParity();
    else this.renderUnitEditorParity();
  }

  private renderMapEditorParity(): void {
    const map = this.options.state.map;
    const widthMeters = Math.round(map.width * map.metersPerCell);
    const heightMeters = Math.round(map.height * map.metersPerCell);
    const wrapper = node('div', 'polygon-map-editor-parity polygon-editor-parity');

    const toolbar = node('div', 'polygon-editor-toolbar');
    toolbar.append(
      disabledButton('↶', 'Отменить'),
      disabledButton('↷', 'Повторить'),
      disabledButton('◉', 'Центрировать карту'),
      statusPill('Карта продукта'),
      disabledButton('ЗАПЕЧЬ', 'Запекание карты ещё не подключено к product owner', 'is-bake'),
    );
    wrapper.append(toolbar);

    const tabs = node('div', 'polygon-editor-subtabs');
    for (const label of ['КАРТА', 'РЕЛЬЕФ', 'ПОВЕРХНОСТЬ', 'РАСТИТЕЛЬНОСТЬ', 'ЛИНИИ', 'ЗДАНИЯ', 'ОБЪЕКТЫ', 'СЛОИ']) {
      const control = disabledButton(label, `${label}: capability будет подключена отдельным owner`);
      if (label === 'КАРТА') control.classList.add('is-active');
      tabs.append(control);
    }
    wrapper.append(tabs);

    const base = node('section', 'polygon-editor-summary-card');
    base.append(
      node('span', 'polygon-editor-summary-icon', '▦'),
      node('div', 'polygon-editor-summary-main'),
      node('strong', 'polygon-editor-summary-value', `${map.width}×${map.height}`),
    );
    const baseMain = base.querySelector<HTMLElement>('.polygon-editor-summary-main')!;
    baseMain.append(
      node('strong', '', 'Основа карты'),
      node('small', '', `${widthMeters} × ${heightMeters} м · сетка ${map.metersPerCell} × ${map.metersPerCell} м`),
    );
    wrapper.append(base);

    const sizeSection = paritySection('РАЗМЕР КАРТЫ');
    const sizeGrid = node('div', 'polygon-editor-form-grid');
    sizeGrid.append(
      readonlyField('Ширина, м', String(widthMeters)),
      readonlyField('Высота, м', String(heightMeters)),
      readonlyField('Сетка', `${map.metersPerCell} × ${map.metersPerCell} м`),
      readonlyField('Изменять от', 'Центра'),
    );
    sizeSection.append(sizeGrid, disabledButton('Применить размер', 'Изменение размера карты пока не имеет безопасного product owner', 'is-wide is-primary'));
    sizeSection.append(note('Размеры читаются из живой карты. Изменение не имитируется в UI.'));
    wrapper.append(sizeSection);

    const dataSection = paritySection('ДАННЫЕ КАРТЫ');
    const dataGrid = node('div', 'polygon-editor-action-grid');
    for (const label of ['Экспорт карты', 'Импорт карты', 'Новая карта', 'Очистить']) {
      const control = disabledButton(label, 'Команда не подключена к authoritative map owner');
      if (label === 'Очистить') control.classList.add('is-danger');
      dataGrid.append(control);
    }
    dataSection.append(dataGrid, note('JSON-команды карты остаются недоступными, пока для них нет штатной product-границы.'));
    wrapper.append(dataSection);

    const underlay = paritySection('ПОДЛОЖКА');
    underlay.append(disabledButton('Загрузить PNG / JPG', 'Подложка пока не подключена к product owner', 'is-wide'));
    const sliderRow = node('div', 'polygon-editor-slider-row');
    sliderRow.append(node('span', '', 'Прозрачность'), node('strong', '', '55%'));
    const fakeSlider = node('div', 'polygon-editor-fake-slider');
    fakeSlider.append(node('i', 'polygon-editor-fake-slider-fill'));
    underlay.append(sliderRow, fakeSlider);
    wrapper.append(underlay);

    wrapper.append(this.createLegacyDetails('Текущая сцена эксперимента'));
    this.parityHost.replaceChildren(wrapper);
  }

  private renderUnitEditorParity(): void {
    const unit = getSelectedUnit(this.options.state);
    const wrapper = node('div', 'polygon-unit-editor-parity polygon-editor-parity');
    const details = this.createLegacyDetails('Расширенные product-параметры');

    const toolbar = node('div', 'polygon-unit-editor-toolbar');
    toolbar.append(
      disabledButton('+', 'Создание нового live-юнита не входит в текущий контракт'),
      node('strong', 'polygon-unit-editor-count', `ЮНИТЫ ${this.options.state.units.length}`),
    );
    const advanced = button('Подробно', 'polygon-unit-editor-details-button');
    advanced.addEventListener('click', () => {
      details.open = true;
      details.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    toolbar.append(advanced);
    wrapper.append(toolbar);

    if (!unit) {
      const empty = node('div', 'polygon-editor-empty');
      empty.append(node('strong', '', 'Юнит не выбран'), node('p', '', 'Выберите настоящий юнит на карте.'));
      wrapper.append(empty, details);
      this.parityHost.replaceChildren(wrapper);
      return;
    }

    const heading = node('section', 'polygon-unit-editor-identity');
    const symbol = node('div', `polygon-unit-editor-symbol is-${unit.behaviorRuntime.posture}`);
    symbol.textContent = unit.behaviorRuntime.posture === 'prone' ? '▬' : unit.behaviorRuntime.posture === 'crouched' ? '▲' : '●';
    const identityMain = node('div', 'polygon-unit-editor-identity-main');
    identityMain.append(
      node('strong', '', unit.labels.ru),
      node('small', '', `${sideLabel(unit.side)} · ${unitTypeLabel(unit.type)}`),
    );
    const tools = node('div', 'polygon-unit-editor-mini-tools');
    tools.append(disabledButton('⌖', 'Позиция задаётся существующим map owner'), disabledButton('↗', 'Направление задаётся существующим owner'), disabledButton('⋮', 'Дополнительные действия пока не подключены'));
    heading.append(symbol, identityMain, tools);
    wrapper.append(heading);

    const basic = paritySection('ОСНОВНОЕ');
    const basics = node('div', 'polygon-editor-form-grid');
    basics.append(
      readonlyField('Имя', unit.labels.ru),
      readonlyField('Сторона', sideLabel(unit.side)),
      readonlyField('Роль', unitTypeLabel(unit.type)),
      readonlyField('ID', unit.id),
    );
    basic.append(basics);

    const postureLabel = node('div', 'polygon-unit-editor-posture-label', 'Поза');
    const postureRow = node('div', 'polygon-unit-editor-postures');
    for (const posture of ['standing', 'crouched', 'prone'] as const) {
      const control = button(postureGlyph(posture), 'polygon-unit-editor-posture');
      control.title = postureTitle(posture);
      control.setAttribute('aria-label', postureTitle(posture));
      control.classList.toggle('is-active', unit.behaviorRuntime.posture === posture);
      control.addEventListener('click', () => this.requestPosture(unit.id, posture));
      postureRow.append(control);
    }
    basic.append(postureLabel, postureRow);
    if (this.lastUnitCommandMessage) basic.append(note(this.lastUnitCommandMessage, 'is-status'));
    wrapper.append(basic);

    const tactical = paritySection('ТАКТИЧЕСКИЙ ЗНАК');
    const tacticalPreview = node('div', 'polygon-unit-editor-tactical-preview');
    tacticalPreview.append(
      node('div', 'polygon-unit-editor-tactical-icon', postureGlyph(unit.behaviorRuntime.posture)),
      node('div', 'polygon-unit-editor-tactical-copy'),
    );
    const tacticalCopy = tacticalPreview.querySelector<HTMLElement>('.polygon-unit-editor-tactical-copy')!;
    tacticalCopy.append(
      node('strong', '', unitTypeLabel(unit.type)),
      node('small', '', unit.behaviorRuntime.currentAction || 'Ожидает'),
    );
    tactical.append(tacticalPreview);
    const tacticalGrid = node('div', 'polygon-editor-form-grid');
    tacticalGrid.append(
      readonlyField('Отделение', '—'),
      readonlyField('Угол корпуса, °', String(Math.round(normalizeDegrees(unit.facingRadians * 180 / Math.PI)))),
      readonlyField('Угол оружия, °', String(Math.round(normalizeDegrees(unit.facingRadians * 180 / Math.PI)))),
      readonlyField('Оружие', unit.infantryCombatRuntime.primaryWeapon?.resolved.weapon.nameRu ?? 'Нет'),
    );
    tactical.append(tacticalGrid);
    wrapper.append(tactical, details);
    this.parityHost.replaceChildren(wrapper);
  }

  private requestPosture(unitId: string, targetPosture: UnitPosture): void {
    const result = this.options.session.executeInteractive({ kind: 'posture', unitId, targetPosture });
    this.lastUnitCommandMessage = result.reasonRu;
    this.refresh();
  }

  private createLegacyDetails(label: string): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'polygon-editor-legacy-details';
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.append(summary, this.leftMount);
    return details;
  }

  private presentPanel(tabId: EditorPanelTab, host: HTMLElement): void {
    const panel = this.panels[tabId];
    panel.classList.add('polygon-shell-presented-editor-panel');
    host.append(panel);
  }

  private restorePanel(tabId: EditorPanelTab): void {
    const panel = this.panels[tabId];
    panel.classList.remove('polygon-shell-presented-editor-panel');
    if (panel.parentElement !== this.hiddenHosts) this.hiddenHosts.append(panel);
  }
}

export function requestsEditorCatalogue(search: string): boolean {
  try {
    return new URLSearchParams(search).get('tab') === 'settings';
  } catch {
    return false;
  }
}

function paritySection(title: string): HTMLElement {
  const section = node('section', 'polygon-editor-parity-section');
  section.append(node('header', 'polygon-editor-parity-section-title', title));
  return section;
}

function readonlyField(label: string, value: string): HTMLElement {
  const field = node('label', 'polygon-editor-parity-field');
  field.append(node('span', '', label));
  const input = document.createElement('input');
  input.value = value;
  input.readOnly = true;
  input.setAttribute('aria-readonly', 'true');
  field.append(input);
  return field;
}

function disabledButton(label: string, title: string, extraClass = ''): HTMLButtonElement {
  const control = button(label, `polygon-editor-parity-button ${extraClass}`.trim());
  control.disabled = true;
  control.title = title;
  return control;
}

function statusPill(text: string): HTMLElement {
  const pill = node('span', 'polygon-editor-status-pill');
  pill.append(node('i', ''), node('span', '', text));
  return pill;
}

function note(text: string, extraClass = ''): HTMLElement {
  return node('div', `polygon-editor-parity-note ${extraClass}`.trim(), text);
}

function postureGlyph(posture: UnitPosture): string {
  return posture === 'prone' ? '▬' : posture === 'crouched' ? '▲' : '●';
}

function postureTitle(posture: UnitPosture): string {
  return posture === 'prone' ? 'Лёжа' : posture === 'crouched' ? 'Пригнувшись' : 'Стоя';
}

function sideLabel(side: string): string {
  return side === 'red' ? 'Красные' : 'Синие';
}

function unitTypeLabel(type: string): string {
  if (type === 'infantry') return 'Пехотинец';
  if (type === 'vehicle') return 'Техника';
  return type || 'Юнит';
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function readWorkspaceTab(value: unknown): CombatLabWorkspaceTab | null {
  return isCombatLabWorkspaceTab(value) ? value : null;
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент нового Полигона: ${selector}`);
  return element;
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function button(label: string, className: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
