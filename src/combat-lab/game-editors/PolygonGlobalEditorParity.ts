export const POLYGON_GLOBAL_EDITOR_IDS = [
  'routeProfiles',
  'tacticalPositions',
  'soldierArchetypes',
  'attentionProfiles',
  'perceptionProfiles',
  'movementProfiles',
  'weapons',
  'conditionProfiles',
  'environmentProfiles',
  'directionalTerrain',
] as const;

export type PolygonGlobalEditorId = typeof POLYGON_GLOBAL_EDITOR_IDS[number];

export interface PolygonGlobalEditorParityInstallation {
  destroy(): void;
}

export function isPolygonGlobalEditorId(value: string): value is PolygonGlobalEditorId {
  return (POLYGON_GLOBAL_EDITOR_IDS as readonly string[]).includes(value);
}

export function installPolygonGlobalEditorParity(
  editorId: PolygonGlobalEditorId,
  host: HTMLElement,
): PolygonGlobalEditorParityInstallation {
  let destroyed = false;
  let scheduled = false;

  host.dataset.polygonGlobalEditor = editorId;
  host.classList.add('polygon-global-editor-host', `polygon-global-editor--${editorId}`);

  const apply = (): void => {
    scheduled = false;
    if (destroyed) return;
    decorateEditor(editorId, host);
  };
  const schedule = (): void => {
    if (destroyed || scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(host, { childList: true });
  apply();

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      delete host.dataset.polygonGlobalEditor;
      host.classList.remove('polygon-global-editor-host', `polygon-global-editor--${editorId}`);
    },
  };
}

function decorateEditor(editorId: PolygonGlobalEditorId, host: HTMLElement): void {
  if (editorId === 'routeProfiles') {
    decorateRouteProfileEditor(host);
    return;
  }
  if (editorId === 'tacticalPositions') {
    decorateTacticalPositionEditor(host);
    return;
  }
  if (editorId === 'weapons') {
    decorateCombatCatalogue(host);
    return;
  }
  if (editorId === 'soldierArchetypes' || editorId === 'perceptionProfiles' || editorId === 'conditionProfiles') {
    decorateGameplayTuningEditor(editorId, host);
    return;
  }
  decorateNavigationProfileEditor(editorId, host);
}

function claimRoot(root: HTMLElement | null, editorId: PolygonGlobalEditorId): root is HTMLElement {
  if (!root || root.dataset.polygonParityApplied === 'true') return false;
  root.dataset.polygonParityApplied = 'true';
  root.dataset.polygonParityEditor = editorId;
  root.classList.add('polygon-editor-parity-root', `polygon-editor-parity-root--${editorId}`);
  return true;
}

function decorateRouteProfileEditor(host: HTMLElement): void {
  const layout = host.querySelector<HTMLElement>('.navigation-profile-layout');
  if (!claimRoot(layout, 'routeProfiles')) return;
  const listPanel = layout.querySelector<HTMLElement>('.navigation-profile-list-panel');
  const listHeading = layout.querySelector<HTMLElement>('.navigation-profile-list-heading');
  const list = layout.querySelector<HTMLElement>('.navigation-profile-list');
  const listActions = layout.querySelector<HTMLElement>('.navigation-profile-list-actions');
  const form = layout.querySelector<HTMLElement>('.navigation-profile-form-panel');
  const formHeading = layout.querySelector<HTMLElement>('.navigation-profile-form-heading');
  const formActions = layout.querySelector<HTMLElement>('.navigation-profile-form-actions');
  const nameCard = layout.querySelector<HTMLElement>('.navigation-profile-name-card');
  if (!listPanel || !listHeading || !list || !listActions || !form || !formHeading) return;

  host.classList.add('polygon-route-profile-editor');
  layout.classList.add('polygon-profile-editor-layout');
  listPanel.classList.add('polygon-profile-column');
  form.classList.add('polygon-editor-main');
  formHeading.classList.add('polygon-editor-main-header');
  insertBreadcrumb(formHeading, 'Профили маршрута');

  const profileButtons = [...list.querySelectorAll<HTMLButtonElement>('[data-profile-id]')];
  const selectedButton = profileButtons.find((button) => button.classList.contains('active')) ?? profileButtons[0];
  const profileId = selectedButton?.dataset.profileId ?? '—';
  const profileName = selectedButton?.querySelector('strong')?.textContent?.trim()
    ?? formHeading.querySelector('h2')?.textContent?.trim()
    ?? 'Профиль';
  const description = formHeading.querySelector('p')?.textContent?.trim() ?? '';
  const kicker = formHeading.querySelector('.navigation-profile-kicker')?.textContent?.trim() ?? '';

  const headingCount = listHeading.querySelector<HTMLElement>('span');
  if (headingCount) {
    headingCount.textContent = String(profileButtons.length);
    headingCount.title = 'Количество доступных профилей';
  }
  const headingTitle = listHeading.querySelector<HTMLElement>('h2');
  if (headingTitle) headingTitle.textContent = 'Профили маршрута';
  const headingDescription = listHeading.querySelector<HTMLElement>('p');
  if (headingDescription) headingDescription.textContent = 'Выберите профиль';

  const createButton = listActions.querySelector<HTMLButtonElement>('[data-profile-action="create"]');
  if (createButton) createButton.textContent = '+ Создать профиль';
  const copyButton = listActions.querySelector<HTMLButtonElement>('[data-profile-action="copy"]');
  const management = document.createElement('details');
  management.className = 'polygon-route-profile-management polygon-editor-management';
  const managementSummary = document.createElement('summary');
  managementSummary.textContent = '⋯ Управление';
  const managementBody = node('div', 'polygon-route-profile-management-body');
  management.append(managementSummary, managementBody);

  for (const child of [...listActions.children]) {
    if (child === createButton || child === copyButton) continue;
    managementBody.append(child);
  }
  listActions.append(management);

  if (formActions) {
    for (const child of [...formActions.children]) managementBody.append(child);
    if (copyButton) {
      copyButton.textContent = 'Создать свою копию';
      formActions.append(copyButton);
    }
  } else if (copyButton) {
    managementBody.append(copyButton);
  }

  const tabs = node('nav', 'polygon-route-profile-tabs polygon-editor-tabs');
  tabs.setAttribute('aria-label', 'Разделы профиля маршрута');
  const summary = node('section', 'polygon-route-profile-summary polygon-editor-summary');
  summary.append(
    node('span', 'polygon-route-profile-summary-kicker', 'КРАТКОЕ РЕЗЮМЕ'),
    node('strong', '', profileName),
    node('p', '', description || 'Описание хранится в авторитетном профиле маршрута.'),
  );

  const primary = node('section', 'polygon-route-profile-primary polygon-editor-primary');
  primary.append(node('header', '', 'Основное ограничение'));
  const maximumInput = host.querySelector<HTMLInputElement>('input[type="number"][data-profile-number="maximumDetourRatio"]');
  const maximumField = maximumInput?.closest<HTMLElement>('.navigation-profile-field');
  if (maximumField) primary.append(maximumField);
  else primary.append(node('p', '', 'Параметр максимального обхода недоступен.'));

  const featureGrid = node('section', 'polygon-route-profile-feature-grid');
  featureGrid.append(
    profileFeature(host, 'Опасность', 'dangerWeight'),
    profileFeature(host, 'Укрытия', 'coverWeight'),
    profileFeature(host, 'Цена дороги', 'terrainCosts.road'),
    profileFeature(host, 'Допустимый обход', 'maximumDetourRatio', (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? `+${Math.round((numeric - 1) * 100)}%` : '—';
    }),
  );

  const metadata = node('section', 'polygon-route-profile-metadata polygon-editor-metadata');
  metadata.append(
    node('header', '', 'О ПРОФИЛЕ'),
    metaRow('Название', profileName),
    metaRow('Тип', kicker.toLowerCase().includes('встроенный') ? 'Встроенный' : 'Пользовательский'),
    metaRow('Технический ID', profileId),
    metaRow('Ревизия', kicker.match(/revision\s+(\d+)/i)?.[1] ?? '—'),
  );

  const groups = [...form.querySelectorAll<HTMLElement>(':scope > .navigation-profile-group')];
  if (nameCard) form.append(nameCard);
  formHeading.after(tabs, summary, primary, featureGrid, metadata);

  const views = [
    { id: 'main', label: 'Основное', groups: [] as HTMLElement[], showName: false },
    { id: 'terrain', label: 'Местность', groups: groups.slice(0, 1), showName: false },
    { id: 'tactics', label: 'Тактика', groups: groups.slice(1, 3), showName: false },
    { id: 'route', label: 'Маршрут', groups: groups.slice(3), showName: true },
  ] as const;

  const activate = (id: string): void => {
    const main = id === 'main';
    summary.hidden = !main;
    primary.hidden = !main;
    featureGrid.hidden = !main;
    metadata.hidden = !main;
    groups.forEach((group) => { group.hidden = true; });
    if (nameCard) nameCard.hidden = true;
    const view = views.find((candidate) => candidate.id === id) ?? views[0];
    for (const group of view.groups) group.hidden = false;
    if (nameCard) nameCard.hidden = !view.showName;
    setActiveTab(tabs, 'routeProfileTab', view.id);
  };

  for (const view of views) {
    const control = tabButton(view.label, 'routeProfileTab', view.id, () => activate(view.id));
    tabs.append(control);
  }
  activate('main');
}

function decorateNavigationProfileEditor(
  editorId: Exclude<PolygonGlobalEditorId, 'routeProfiles' | 'tacticalPositions' | 'soldierArchetypes' | 'perceptionProfiles' | 'weapons' | 'conditionProfiles'>,
  host: HTMLElement,
): void {
  const layout = host.querySelector<HTMLElement>('.navigation-profile-layout');
  if (!claimRoot(layout, editorId)) return;
  layout.classList.add('polygon-profile-editor-layout');
  const listPanel = layout.querySelector<HTMLElement>('.navigation-profile-list-panel');
  const form = layout.querySelector<HTMLElement>('.navigation-profile-form-panel');
  const heading = layout.querySelector<HTMLElement>('.navigation-profile-form-heading');
  if (listPanel) listPanel.classList.add('polygon-profile-column');
  if (!form || !heading) return;
  form.classList.add('polygon-editor-main');
  heading.classList.add('polygon-editor-main-header');
  insertBreadcrumb(heading, editorLabel(editorId));

  if (editorId === 'attentionProfiles') decorateAttentionEditor(host, form, heading);
  else if (editorId === 'movementProfiles') decorateMovementEditor(host, form, heading);
  else if (editorId === 'environmentProfiles') decorateEnvironmentEditor(host, form, heading);
  else decorateDirectionalEditor(form, heading);
}

function decorateAttentionEditor(host: HTMLElement, form: HTMLElement, heading: HTMLElement): void {
  const nameCard = form.querySelector<HTMLElement>(':scope > .navigation-profile-name-card');
  const sections = [...form.querySelectorAll<HTMLElement>(':scope > .navigation-profile-group')];
  const modeSelect = form.querySelector<HTMLSelectElement>('[data-attention-mode]');
  const tabs = node('nav', 'polygon-editor-tabs polygon-attention-tabs');
  const views = [
    ['vision', 'Зрение'],
    ['march', 'Марш'],
    ['observe', 'Наблюдение'],
    ['search', 'Поиск'],
    ['engage', 'Бой'],
  ] as const;
  const desired = host.dataset.polygonAttentionTab ?? 'vision';

  const activate = (id: string, dispatch = true): void => {
    host.dataset.polygonAttentionTab = id;
    if (nameCard) nameCard.hidden = true;
    sections.forEach((section, index) => {
      section.hidden = id === 'vision' ? index > 1 : index !== 2;
    });
    setActiveTab(tabs, 'polygonTab', id);
    if (id !== 'vision' && modeSelect && modeSelect.value !== id && dispatch) {
      modeSelect.value = id;
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  for (const [id, label] of views) tabs.append(tabButton(label, 'polygonTab', id, () => activate(id)));
  heading.after(tabs);
  moveHeaderActionsToSavebar(form, heading, 'Профиль внимания');
  activate(views.some(([id]) => id === desired) ? desired : 'vision', false);
}

function decorateMovementEditor(host: HTMLElement, form: HTMLElement, heading: HTMLElement): void {
  const nameCard = form.querySelector<HTMLElement>(':scope > .navigation-profile-name-card');
  const sections = [...form.querySelectorAll<HTMLElement>(':scope > .navigation-profile-group')];
  const status = form.querySelector<HTMLElement>(':scope > .movement-profile-status');
  const tabs = node('nav', 'polygon-editor-tabs polygon-movement-tabs');
  const views = [
    { id: 'basic', label: 'Основное', titles: ['Основное'] },
    { id: 'movement', label: 'Движение', titles: ['Скорость и переходы', 'Выносливость'] },
    { id: 'visibility', label: 'Заметность', titles: ['Визуальная заметность', 'Шум', 'Материалы местности'] },
    { id: 'combat', label: 'Бой', titles: ['Обзор во время движения', 'Оружие'] },
    { id: 'restrictions', label: 'Ограничения', titles: ['Ограничения', 'Логические правила'] },
  ] as const;
  const desired = host.dataset.polygonMovementTab ?? 'basic';

  const activate = (id: string): void => {
    host.dataset.polygonMovementTab = id;
    const view = views.find((item) => item.id === id) ?? views[0];
    if (nameCard) nameCard.hidden = view.id !== 'basic';
    if (status) status.hidden = true;
    sections.forEach((section) => {
      const title = section.querySelector('h3')?.textContent?.trim() ?? '';
      section.hidden = !view.titles.includes(title as never);
    });
    setActiveTab(tabs, 'polygonTab', view.id);
  };

  for (const view of views) tabs.append(tabButton(view.label, 'polygonTab', view.id, () => activate(view.id)));
  heading.after(tabs);
  moveHeaderActionsToSavebar(form, heading, 'Профиль движения', status?.textContent?.trim());
  activate(views.some((view) => view.id === desired) ? desired : 'basic');
}

function decorateEnvironmentEditor(host: HTMLElement, form: HTMLElement, heading: HTMLElement): void {
  const sections = [...form.querySelectorAll<HTMLElement>(':scope > .navigation-profile-group')];
  const tabs = node('nav', 'polygon-editor-tabs polygon-environment-tabs');
  const summary = buildLiveSummary(heading, 'ПРОФИЛЬ МЕСТНОСТИ');
  summary.classList.add('polygon-environment-summary');
  const groupButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-environment-group]')];
  const views = [
    ['overview', 'Обзор'],
    ['vegetation', 'Растительность'],
    ['surfaces', 'Поверхности'],
  ] as const;
  const desired = host.dataset.polygonEnvironmentTab ?? 'overview';

  const activate = (id: string, dispatch = true): void => {
    host.dataset.polygonEnvironmentTab = id;
    const overview = id === 'overview';
    summary.hidden = !overview;
    sections.forEach((section) => { section.hidden = overview; });
    setActiveTab(tabs, 'polygonTab', id);
    if (!overview && dispatch) {
      const target = groupButtons.find((button) => button.dataset.environmentGroup === id);
      if (target && !target.classList.contains('active')) target.click();
    }
  };

  for (const [id, label] of views) tabs.append(tabButton(label, 'polygonTab', id, () => activate(id)));
  heading.after(tabs, summary);
  const autoSave = node('footer', 'polygon-editor-savebar polygon-editor-autosave', 'Изменения сохраняются автоматически и применяются в открытой игре.');
  form.append(autoSave);
  activate(views.some(([id]) => id === desired) ? desired : 'overview', false);
}

function decorateDirectionalEditor(form: HTMLElement, heading: HTMLElement): void {
  const visuals = node('section', 'polygon-directional-visuals');
  const slope = node('article', 'polygon-directional-visual');
  slope.append(
    node('strong', '', 'Склон и силуэт'),
    node('div', 'polygon-directional-slope', '●  ╱╲  ●'),
    node('p', '', 'Штрафы гребня и силуэта используют реальные коэффициенты выбранного профиля.'),
  );
  const compass = node('article', 'polygon-directional-visual');
  compass.append(
    node('strong', '', '8 секторов угрозы'),
    node('div', 'polygon-directional-compass', 'N · NE · E · SE · S · SW · W · NW'),
    node('p', '', 'Направление остаётся частью субъективной информации бойца.'),
  );
  visuals.append(slope, compass);
  heading.after(visuals);
  moveHeaderActionsToSavebar(form, heading, 'Направленный рельеф');
}

function decorateTacticalPositionEditor(host: HTMLElement): void {
  const layout = host.querySelector<HTMLElement>('.tactical-position-profile-layout');
  if (!claimRoot(layout, 'tacticalPositions')) return;
  layout.classList.add('polygon-profile-editor-layout', 'polygon-tactical-editor-layout');
  const list = layout.querySelector<HTMLElement>('.tactical-position-profile-list');
  const form = layout.querySelector<HTMLElement>('.tactical-position-profile-form');
  const heading = layout.querySelector<HTMLElement>('.tactical-position-profile-form-header');
  const identity = layout.querySelector<HTMLElement>('.tactical-position-profile-identity');
  const groups = [...layout.querySelectorAll<HTMLElement>('.tactical-position-profile-group[data-settings-group]')];
  if (list) list.classList.add('polygon-profile-column');
  if (!form || !heading) return;
  form.classList.add('polygon-editor-main');
  heading.classList.add('polygon-editor-main-header');
  insertBreadcrumb(heading, 'Тактические позиции');

  const tabs = node('nav', 'polygon-editor-tabs polygon-tactical-tabs');
  const views = [
    ['main', 'Основное'],
    ['posture', 'Поза'],
    ['selection', 'Отбор'],
    ['ranking', 'Оценка'],
    ['display', 'Стабильность'],
  ] as const;
  const summary = buildLiveSummary(heading, 'ТАКТИЧЕСКИЕ ПОЗИЦИИ');
  const activate = (id: string): void => {
    if (identity) identity.hidden = id !== 'main';
    summary.hidden = id !== 'main';
    groups.forEach((group) => { group.hidden = group.dataset.settingsGroup !== id; });
    setActiveTab(tabs, 'polygonTab', id);
  };
  for (const [id, label] of views) tabs.append(tabButton(label, 'polygonTab', id, () => activate(id)));
  heading.after(tabs, summary);
  moveTacticalActionsToSavebar(form, heading);
  activate('main');
}

function decorateGameplayTuningEditor(
  editorId: 'soldierArchetypes' | 'perceptionProfiles' | 'conditionProfiles',
  host: HTMLElement,
): void {
  const root = host.querySelector<HTMLElement>('.gameplay-tuning-editor');
  if (!claimRoot(root, editorId)) return;
  root.classList.add('polygon-gameplay-tuning-editor', 'polygon-profile-editor-layout');
  const list = root.querySelector<HTMLElement>('.gameplay-tuning-editor-list-panel');
  const form = root.querySelector<HTMLElement>('.gameplay-tuning-editor-form-panel');
  const heading = root.querySelector<HTMLElement>('.gameplay-tuning-editor-form-heading');
  if (list) list.classList.add('polygon-profile-column');
  if (!form || !heading) return;
  form.classList.add('polygon-editor-main');
  heading.classList.add('polygon-editor-main-header');
  insertBreadcrumb(heading, editorLabel(editorId));

  if (editorId === 'perceptionProfiles') {
    decoratePerceptionFields(form, heading);
    return;
  }

  const fieldsHost = form.querySelector<HTMLElement>('.gameplay-tuning-editor-fields');
  if (!fieldsHost) return;
  const fields = [...fieldsHost.querySelectorAll<HTMLElement>(':scope > .gameplay-tuning-editor-field')];
  const tabs = node('nav', 'polygon-editor-tabs');
  const summary = buildFieldSummary(heading, fields);
  const views = editorId === 'soldierArchetypes'
    ? [
        ['overview', 'Обзор'],
        ['traits', 'Характер'],
        ['condition', 'Исходное состояние'],
        ['links', 'Связанные профили'],
      ] as const
    : [
        ['overview', 'Обзор'],
        ['wound', 'Ранения'],
        ['suppression', 'Подавление'],
      ] as const;

  const activate = (id: string): void => {
    summary.hidden = id !== 'overview';
    fields.forEach((field) => {
      const input = field.querySelector<HTMLInputElement>('[data-tuning-path]');
      const path = input?.dataset.tuningPath ?? '';
      const reference = field.classList.contains('gameplay-tuning-editor-reference');
      if (id === 'overview') field.hidden = true;
      else if (editorId === 'soldierArchetypes') {
        field.hidden = id === 'traits' ? !path.startsWith('traits.')
          : id === 'condition' ? !path.startsWith('condition.')
            : !reference;
      } else {
        field.hidden = id === 'wound' ? !path.startsWith('wound.') : !path.startsWith('suppression.');
      }
    });
    setActiveTab(tabs, 'polygonTab', id);
  };

  for (const [id, label] of views) tabs.append(tabButton(label, 'polygonTab', id, () => activate(id)));
  heading.after(tabs, summary);
  activate('overview');
}

function decoratePerceptionFields(form: HTMLElement, heading: HTMLElement): void {
  const fieldsHost = form.querySelector<HTMLElement>('.gameplay-tuning-editor-fields');
  if (!fieldsHost) return;
  const fields = [...fieldsHost.querySelectorAll<HTMLElement>(':scope > .gameplay-tuning-editor-field')];
  const flow = node('div', 'polygon-perception-flow');
  for (const text of ['Зрение / звук / доклад', '→', 'Свидетельство', '→', 'Уверенность', '→', 'Известное положение', '→', 'Забывание']) {
    flow.append(node(text === '→' ? 'b' : 'span', '', text));
  }
  const groups = [
    ['Уверенность в контакте', (path: string) => path === 'contact.confidenceEvidenceDivisor'],
    ['Точность положения', (path: string) => ['contact.minimumUncertaintyCells', 'contact.initialUncertaintyCells', 'contact.uncertaintyEvidenceDivisor', 'contact.uncertaintyGrowthMetersPerSecond'].includes(path)],
    ['Память и источники', (path: string) => ['contact.evidenceDecayPerSecond', 'contact.confidenceDecayPerSecond', 'contact.soundEvidenceMultiplier', 'contact.reportedEvidenceMultiplier'].includes(path)],
  ] as const;
  heading.after(flow);
  fieldsHost.replaceChildren();
  for (const [title, match] of groups) {
    const section = node('section', 'polygon-editor-section');
    section.append(node('h3', '', title));
    const grid = node('div', 'polygon-editor-field-grid');
    for (const field of fields) {
      const path = field.querySelector<HTMLInputElement>('[data-tuning-path]')?.dataset.tuningPath ?? '';
      if (match(path)) grid.append(field);
    }
    section.append(grid);
    fieldsHost.append(section);
  }
}

function decorateCombatCatalogue(host: HTMLElement): void {
  const root = host.querySelector<HTMLElement>('.combat-catalog-editor');
  if (!claimRoot(root, 'weapons')) return;
  root.classList.add('polygon-combat-catalogue');
  const toolbar = root.querySelector<HTMLElement>('.combat-catalog-toolbar');
  const layout = root.querySelector<HTMLElement>('.combat-catalog-layout');
  const list = root.querySelector<HTMLElement>('.combat-catalog-list-panel');
  const form = root.querySelector<HTMLElement>('.combat-catalog-form-panel');
  if (toolbar) {
    toolbar.classList.add('polygon-editor-main-header', 'polygon-combat-header');
    insertBreadcrumb(toolbar, 'Вооружение');
  }
  if (layout) layout.classList.add('polygon-combat-layout');
  if (list) list.classList.add('polygon-profile-column');
  if (form) form.classList.add('polygon-editor-main');
  root.querySelector<HTMLElement>('.combat-catalog-subtabs')?.classList.add('polygon-editor-tabs');
}

function insertBreadcrumb(heading: HTMLElement, editorName: string): void {
  const titleWrap = heading.firstElementChild instanceof HTMLElement ? heading.firstElementChild : heading;
  if (titleWrap.querySelector(':scope > .polygon-editor-breadcrumb')) return;
  const title = titleWrap.querySelector('h1, h2')?.textContent?.trim();
  titleWrap.prepend(node('div', 'polygon-editor-breadcrumb', `${editorName}${title ? ` / ${title}` : ''}`));
}

function moveHeaderActionsToSavebar(
  form: HTMLElement,
  heading: HTMLElement,
  label: string,
  statusText = 'Изменения применяются через реальные команды этого редактора.',
): void {
  const actions = heading.querySelector<HTMLElement>('.navigation-profile-form-actions');
  if (!actions || form.querySelector(':scope > .polygon-editor-savebar')) return;
  const footer = node('footer', 'polygon-editor-savebar');
  footer.append(node('span', '', statusText || label), actions);
  form.append(footer);
}

function moveTacticalActionsToSavebar(form: HTMLElement, heading: HTMLElement): void {
  const actions = heading.querySelector<HTMLElement>('.tactical-position-profile-actions');
  if (!actions || form.querySelector(':scope > .polygon-editor-savebar')) return;
  const footer = node('footer', 'polygon-editor-savebar');
  footer.append(node('span', '', 'Изменения профиля применяются штатной командой сохранения.'), actions);
  form.append(footer);
}

function buildLiveSummary(heading: HTMLElement, kicker: string): HTMLElement {
  const title = heading.querySelector('h1, h2')?.textContent?.trim() ?? 'Профиль';
  const description = heading.querySelector('p')?.textContent?.trim() ?? '';
  const summary = node('section', 'polygon-editor-summary');
  summary.append(node('span', 'polygon-editor-summary-kicker', kicker), node('strong', '', title));
  if (description) summary.append(node('p', '', description));
  return summary;
}

function buildFieldSummary(heading: HTMLElement, fields: readonly HTMLElement[]): HTMLElement {
  const summary = buildLiveSummary(heading, 'ОБЗОР');
  const grid = node('div', 'polygon-editor-summary-grid');
  for (const field of fields.filter((item) => !item.classList.contains('gameplay-tuning-editor-reference')).slice(0, 4)) {
    const label = field.querySelector<HTMLElement>('.gameplay-tuning-editor-field-label')?.textContent?.trim() ?? 'Параметр';
    const value = field.querySelector<HTMLInputElement>('[data-tuning-path]')?.value ?? '—';
    const card = node('article', 'polygon-editor-summary-card');
    card.append(node('span', '', label), node('strong', '', value));
    grid.append(card);
  }
  summary.append(grid);
  return summary;
}

function profileFeature(
  host: HTMLElement,
  label: string,
  path: string,
  format: (value: string) => string = (value) => value || '—',
): HTMLElement {
  const card = node('article', 'polygon-route-profile-feature');
  const value = node('strong', '');
  const input = host.querySelector<HTMLInputElement>(`input[type="number"][data-profile-number="${path}"]`);
  const render = (): void => { value.textContent = format(input?.value.trim() ?? ''); };
  input?.addEventListener('input', render);
  card.append(node('span', '', label), value);
  render();
  return card;
}

function metaRow(label: string, value: string): HTMLElement {
  const row = node('div', 'polygon-route-profile-meta-row');
  row.append(node('span', '', label), node('strong', '', value));
  return row;
}

function tabButton(
  label: string,
  datasetKey: string,
  value: string,
  onClick: () => void,
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.dataset[datasetKey] = value;
  control.addEventListener('click', onClick);
  return control;
}

function setActiveTab(tabs: HTMLElement, datasetKey: string, value: string): void {
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((control) => {
    const active = control.dataset[datasetKey] === value;
    control.classList.toggle('is-active', active);
    control.setAttribute('aria-selected', String(active));
  });
}

function editorLabel(editorId: PolygonGlobalEditorId): string {
  return ({
    routeProfiles: 'Профили маршрута',
    tacticalPositions: 'Тактические позиции',
    soldierArchetypes: 'Архетипы бойцов',
    attentionProfiles: 'Профили внимания',
    perceptionProfiles: 'Профили восприятия',
    movementProfiles: 'Профили движения',
    weapons: 'Вооружение',
    conditionProfiles: 'Ранения и подавление',
    environmentProfiles: 'Профили местности',
    directionalTerrain: 'Направленный рельеф',
  } satisfies Record<PolygonGlobalEditorId, string>)[editorId];
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
