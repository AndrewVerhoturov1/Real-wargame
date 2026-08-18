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

interface LiveSummaryCardSpec {
  readonly label: string;
  readonly selector: string;
  readonly format?: (element: HTMLElement) => string;
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
  form.classList.add('polygon-editor-main', 'ge-route-main');
  formHeading.classList.add('polygon-editor-main-header');

  const profileButtons = [...list.querySelectorAll<HTMLButtonElement>('[data-profile-id]')];
  const selectedButton = profileButtons.find((button) => button.classList.contains('active')) ?? profileButtons[0];
  const profileId = selectedButton?.dataset.profileId ?? '—';
  const profileName = selectedButton?.querySelector('strong')?.textContent?.trim()
    ?? formHeading.querySelector('h2')?.textContent?.trim()
    ?? 'Профиль';
  const description = formHeading.querySelector('p')?.textContent?.trim() ?? '';
  const kicker = formHeading.querySelector('.navigation-profile-kicker')?.textContent?.trim() ?? '';
  const revision = kicker.match(/revision\s+(\d+)/i)?.[1] ?? '—';
  const builtIn = kicker.toLowerCase().includes('встроенный');

  const profileHeading = node('div', '');
  profileHeading.append(node('span', '', 'Профили'), node('strong', '', 'Профили маршрута'));
  const profileCount = node('span', 'ge-count', String(profileButtons.length));
  profileCount.title = 'Количество доступных профилей';
  listHeading.classList.add('ge-profile-head');
  listHeading.replaceChildren(profileHeading, profileCount);

  const builtInButtons: HTMLButtonElement[] = [];
  const customButtons: HTMLButtonElement[] = [];
  for (const button of profileButtons) {
    const detail = button.querySelector<HTMLElement>('small, span:last-child');
    const builtInProfile = detail?.textContent?.toLowerCase().includes('встроенн') ?? true;
    if (detail) detail.textContent = builtInProfile ? 'Встроенный' : detail.textContent?.replace(/^[^.]+\.\s*/u, '') ?? 'Свой профиль';
    button.classList.add('ge-profile-row');
    (builtInProfile ? builtInButtons : customButtons).push(button);
  }
  list.classList.add('ge-profile-scroll');
  list.replaceChildren(
    node('div', 'ge-profile-section-label', 'Встроенные'),
    ...builtInButtons,
    node('div', 'ge-profile-section-label ge-profile-section-label--spaced', 'Мои профили'),
    ...(customButtons.length > 0
      ? customButtons
      : [node('div', 'ge-profile-empty', 'Пока нет собственных профилей')]),
  );

  const createButton = listActions.querySelector<HTMLButtonElement>('[data-profile-action="create"]');
  if (createButton) {
    createButton.textContent = '+ Создать профиль';
    createButton.classList.add('action-button');
  }
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
  listActions.classList.add('ge-profile-actions');
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

  const title = node('div', 'ge-route-title');
  const titleRow = node('div', 'ge-title-row');
  titleRow.append(
    node('h2', '', profileName),
    node('span', `ge-profile-chip ${builtIn ? 'is-built-in' : 'is-custom'}`, builtIn ? 'Встроенный' : 'Свой профиль'),
  );
  title.append(
    node('div', 'ge-breadcrumb', `Профили маршрута / ${profileName}`),
    titleRow,
    node('p', '', description || 'Описание хранится в авторитетном профиле маршрута.'),
  );
  const headerActions = node('div', 'ge-route-header-actions');
  if (copyButton) headerActions.append(copyButton);
  formHeading.classList.add('ge-route-header');
  formHeading.replaceChildren(title, headerActions);

  const tabs = node('nav', 'ge-route-tabs polygon-route-profile-tabs polygon-editor-tabs');
  tabs.setAttribute('aria-label', 'Разделы профиля маршрута');
  const summary = node('section', 'ge-tab-intro polygon-route-profile-summary polygon-editor-summary');
  const summaryCopy = node('div', '');
  summaryCopy.append(
    node('span', '', 'Краткое резюме'),
    node('h3', '', 'Как будет вести себя боец'),
    node('p', '', 'Это расшифровка текущих чисел, а не отдельная игровая настройка.'),
  );
  summary.append(summaryCopy);

  const primary = node('section', 'ge-section polygon-route-profile-primary polygon-editor-primary');
  const primaryHead = node('div', 'ge-section-head');
  const primaryTitle = node('div', '');
  primaryTitle.append(
    node('h3', '', 'Основное ограничение'),
    node('p', '', 'Насколько длинный обход профиль готов принять ради безопасности, укрытия и других факторов.'),
  );
  primaryHead.append(primaryTitle);
  const detourCard = node('div', 'ge-detour-card');
  const detourCopy = node('div', '');
  const detourOutput = node('output', '');
  const detourText = node('span', '');
  detourText.append('до +', detourOutput, '% относительно короткого допустимого пути');
  detourCopy.append(node('strong', '', 'Максимальный обход'), detourText);
  const maximumInput = host.querySelector<HTMLInputElement>('input[type="number"][data-profile-number="maximumDetourRatio"]');
  const maximumRange = host.querySelector<HTMLInputElement>('input[type="range"][data-profile-number="maximumDetourRatio"]');
  const maximumField = maximumInput?.closest<HTMLElement>('.navigation-profile-field');
  const detourControl = node('div', 'ge-detour-control');
  if (maximumInput && maximumRange) {
    const initialRatio = Number(maximumInput.value);
    const percentInput = document.createElement('input');
    percentInput.type = 'number';
    percentInput.min = '0';
    percentInput.max = '200';
    percentInput.step = '5';
    percentInput.dataset.polygonRouteDetourPercent = 'true';
    const renderDetour = (): void => {
      const percent = Math.round((Number(maximumInput.value) - 1) * 100);
      percentInput.value = String(Number.isFinite(percent) ? percent : 0);
      detourOutput.textContent = percentInput.value;
    };
    const writeDetour = (): void => {
      const percent = Math.min(200, Math.max(0, Number(percentInput.value) || 0));
      const ratio = 1 + percent / 100;
      maximumInput.value = String(ratio);
      maximumRange.value = String(ratio);
      maximumInput.dispatchEvent(new Event('input', { bubbles: true }));
      maximumInput.dispatchEvent(new Event('change', { bubbles: true }));
      renderDetour();
    };
    percentInput.addEventListener('input', writeDetour);
    maximumInput.addEventListener('input', renderDetour);
    maximumRange.addEventListener('input', renderDetour);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '↺';
    reset.title = 'Вернуть исходное значение профиля';
    reset.addEventListener('click', () => {
      maximumInput.value = String(initialRatio);
      maximumRange.value = String(initialRatio);
      maximumInput.dispatchEvent(new Event('input', { bubbles: true }));
      maximumInput.dispatchEvent(new Event('change', { bubbles: true }));
      renderDetour();
    });
    maximumField?.remove();
    maximumInput.hidden = true;
    detourControl.append(maximumRange, percentInput, node('span', '', '%'), reset, maximumInput);
    renderDetour();
  } else {
    detourControl.append(node('span', '', 'Параметр максимального обхода недоступен.'));
  }
  detourCard.append(detourCopy, detourControl);
  primary.append(primaryHead, detourCard);

  const featureGrid = node('section', 'ge-route-summary polygon-route-profile-feature-grid');
  featureGrid.append(
    routeProfileFeature(host, 'Опасность', 'dangerWeight', (value) => routeStrength(Number(value))),
    routeProfileFeature(host, 'Укрытия', 'coverWeight', (value) => routeStrength(Number(value), [.02, .1, .25, .4])),
    routeProfileFeature(host, 'Дороги', 'terrainCosts.road', (value) => routeTerrainMeaning(Number(value))),
    routeProfileFeature(host, 'Допустимый обход', 'maximumDetourRatio', (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? `до +${Math.round((numeric - 1) * 100)}%` : '—';
    }),
  );
  const detourFeatureValue = featureGrid.lastElementChild?.querySelector<HTMLElement>('strong');
  const renderDetourFeature = (): void => {
    const ratio = Number(maximumInput?.value);
    if (detourFeatureValue) {
      detourFeatureValue.textContent = Number.isFinite(ratio) ? `до +${Math.round((ratio - 1) * 100)}%` : '—';
    }
  };
  maximumInput?.addEventListener('input', renderDetourFeature);
  maximumInput?.addEventListener('change', renderDetourFeature);
  renderDetourFeature();

  const metadata = node('section', 'ge-section polygon-route-profile-metadata polygon-editor-metadata');
  const metadataHead = node('div', 'ge-section-head');
  const metadataTitle = node('div', '');
  metadataTitle.append(
    node('h3', '', 'О профиле'),
    node('p', '', 'Технические данные спрятаны, но доступны для проверки.'),
  );
  metadataHead.append(metadataTitle);
  const metadataGrid = node('div', 'ge-profile-meta-grid');
  metadataGrid.append(
    metaRow('Русское название', profileName),
    metaRow('Тип', builtIn ? 'Встроенный' : 'Пользовательский'),
    metaRow('Технический ID', profileId),
    metaRow('Ревизия', revision),
  );
  metadata.append(metadataHead, metadataGrid);

  const groups = [...form.querySelectorAll<HTMLElement>(':scope > .navigation-profile-group')];
  const subtabs = decorateRouteProfileSubtabs(groups);
  const scroll = node('div', 'ge-route-scroll');
  scroll.append(
    summary,
    featureGrid,
    primary,
    metadata,
    subtabs.terrain,
    subtabs.tactics,
    subtabs.territoryFuture,
    subtabs.routeIntro,
    subtabs.limits,
    subtabs.rules,
    subtabs.replanning,
  );
  if (nameCard) scroll.append(nameCard);
  const savebar = node('footer', 'ge-savebar');
  savebar.append(
    node(
      'span',
      '',
      builtIn
        ? 'Встроенный профиль · изменения разрешены, исходные значения можно вернуть сбросом.'
        : 'Пользовательский профиль · изменения применяются к текущему продукту.',
    ),
  );
  const usage = node('div', 'ge-route-usage');
  usage.dataset.polygonRouteUsagePending = 'true';
  usage.append(
    node('strong', '', 'Используется'),
    node('span', '', 'Бойцы: 0'),
    node('span', '', 'Программа: 0'),
    node('span', '', 'Лаборатория: 0'),
  );
  savebar.append(usage);
  form.replaceChildren(formHeading, tabs, scroll, savebar);

  const views = [
    { id: 'main', label: 'Основное', groups: [] as HTMLElement[], showName: false },
    { id: 'terrain', label: 'Местность', groups: [subtabs.terrain], showName: false },
    { id: 'tactics', label: 'Тактика', groups: [subtabs.tactics, subtabs.territoryFuture], showName: false },
    { id: 'route', label: 'Маршрут', groups: [subtabs.routeIntro, subtabs.limits, subtabs.rules, subtabs.replanning], showName: true },
  ] as const;
  const tabSurfaces = [
    subtabs.terrain,
    subtabs.tactics,
    subtabs.territoryFuture,
    subtabs.routeIntro,
    subtabs.limits,
    subtabs.rules,
    subtabs.replanning,
  ];

  const activate = (id: string): void => {
    const main = id === 'main';
    summary.hidden = !main;
    primary.hidden = !main;
    featureGrid.hidden = !main;
    metadata.hidden = !main;
    tabSurfaces.forEach((surface) => { surface.hidden = true; });
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
  const summary = buildControlSummary(heading, form, 'ЧТО ЭТО ЗА СПОСОБ ДВИЖЕНИЯ', [
    {
      label: 'Скорость',
      selector: 'input[type="number"][data-movement-number="settings.speed.speedMultiplier"]',
      format: (element) => withUnit(readControlValue(element), '×'),
    },
    {
      label: 'Выносливость',
      selector: 'input[type="number"][data-movement-number="settings.stamina.drainPerSecond"]',
      format: (element) => withUnit(readControlValue(element), 'ед/с'),
    },
    {
      label: 'Шум',
      selector: 'input[type="number"][data-movement-number="settings.noise.loudness"]',
    },
    {
      label: 'Огонь в движении',
      selector: 'input[type="checkbox"][data-movement-checkbox="settings.weapon.allowFireWhileMoving"]',
    },
  ]);
  summary.classList.add('polygon-movement-summary');
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
    if (nameCard) nameCard.hidden = true;
    if (status) status.hidden = true;
    summary.hidden = view.id !== 'basic';
    sections.forEach((section) => {
      const title = section.querySelector('h3')?.textContent?.trim() ?? '';
      section.hidden = !view.titles.includes(title as never);
    });
    setActiveTab(tabs, 'polygonTab', view.id);
  };

  for (const view of views) tabs.append(tabButton(view.label, 'polygonTab', view.id, () => activate(view.id)));
  heading.after(tabs, summary);
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
    node('p', '', 'Штрафы гребня и силуэта используют реальные коэффициенты выбранного профиля.'),
  );
  const compass = node('article', 'polygon-directional-visual');
  compass.append(
    node('strong', '', '8 секторов угрозы'),
    node('p', '', 'Направление остаётся частью субъективной информации бойца.'),
  );
  visuals.append(slope, compass);
  heading.after(visuals);
  moveHeaderActionsToSavebar(form, heading, 'Направленный рельеф');
}

function decorateRouteProfileSubtabs(groups: HTMLElement[]): {
  terrain: HTMLElement;
  tactics: HTMLElement;
  territoryFuture: HTMLElement;
  routeIntro: HTMLElement;
  limits: HTMLElement;
  rules: HTMLElement;
  replanning: HTMLElement;
} {
  const [terrain, tactics, territory, limits, replanning, rules] = groups;
  const fallback = (): HTMLElement => node('section', 'ge-route-missing', 'Параметры профиля недоступны.');
  if (!terrain || !tactics || !territory || !limits || !replanning || !rules) {
    const missing = fallback();
    return {
      terrain: missing,
      tactics: missing.cloneNode(true) as HTMLElement,
      territoryFuture: missing.cloneNode(true) as HTMLElement,
      routeIntro: missing.cloneNode(true) as HTMLElement,
      limits: missing.cloneNode(true) as HTMLElement,
      rules: missing.cloneNode(true) as HTMLElement,
      replanning: missing.cloneNode(true) as HTMLElement,
    };
  }

  decorateRouteFieldGroup(terrain, {
    label: 'Местность',
    title: 'Что маршрут предпочитает проходить, а что обходить',
    description: 'Для большинства типов 1,0 — нейтральная цена; меньше — предпочтение, больше — избегание.',
    fields: {
      'terrainCosts.road': ['Дорога', 'Меньше 1,0 — маршрут охотнее использует дорогу; больше 1,0 — избегает.', '×', true],
      'terrainCosts.field': ['Поле', 'Открытая земля. 1,0 — нейтральная цена.', '×', true],
      'terrainCosts.sparseForest': ['Редкий лес', 'Можно сделать редкий лес предпочтительным скрытым путём.', '×', true],
      'terrainCosts.denseForest': ['Густой лес', 'Чем выше значение, тем сильнее боец избегает густого леса.', '×', true],
      'terrainCosts.rough': ['Пересечённая местность', 'Цена камней, неровностей и сложной поверхности.', '×', true],
      'terrainCosts.swamp': ['Болото', 'Высокое значение заставляет искать обход болота.', '×', true],
      'terrainCosts.bridge': ['Мост', 'Цена прохода по мосту. Непроходимая вода от этого не становится проходимой.', '×', true],
      'terrainCosts.ditch': ['Канава', 'Канава может быть выгодным скрытым путём или неудобным препятствием.', '×', true],
      slopeWeight: ['Уклон', 'Чем выше значение, тем сильнее маршрут избегает перепадов высоты.', 'вес', false],
    },
  });

  decorateRouteFieldGroup(tactics, {
    label: 'Тактика',
    title: 'Как знания бойца меняют цену пути',
    description: 'Редактор использует только субъективно известную бойцу информацию. Неподключённые факторы отмечены явно.',
    fields: {
      dangerWeight: ['Избегание известной опасности', 'Использует только угрозы, которые известны выбранному бойцу.', 'вес', false],
      coverWeight: ['Предпочтение укрытий и маскировки', 'Положительное значение снижает цену укрытых и маскирующих участков.', 'вес', false],
      exposureWeight: ['Избегание видимости противнику', 'Пока честные субъективные данные видимости недоступны, этот фактор фактически не участвует в расчёте.', 'вес', false, 'Ещё не подключено'],
      enemyDistanceWeight: ['Отношение к близости противника', 'Точная субъективная дистанция до противника пока не используется.', 'вес', false, 'Ещё не подключено'],
    },
  });

  decorateRouteFieldGroup(territory, {
    fields: {
      'territoryWeights.friendly': ['Своя территория', 'Будущий штраф или бонус этой категории территории.', 'вес', false, 'Будущая механика'],
      'territoryWeights.neutral': ['Серая зона', 'Будущий штраф или бонус этой категории территории.', 'вес', false, 'Будущая механика'],
      'territoryWeights.enemy': ['Вражеская территория', 'Будущий штраф или бонус этой категории территории.', 'вес', false, 'Будущая механика'],
    },
  });
  territory.classList.add('ge-route-future-body');
  const territoryFuture = document.createElement('details');
  territoryFuture.className = 'ge-route-future';
  const territorySummary = document.createElement('summary');
  territorySummary.className = 'ge-future-head';
  territorySummary.append(
    node('span', '', 'Территориальные предпочтения'),
    node('small', '', 'Будущая механика · сейчас не влияет на маршрут'),
  );
  territoryFuture.append(territorySummary, territory);

  decorateRouteSection(limits, 'Ограничения', 'Жёсткие границы допустимого маршрута.');
  decorateRouteLimit(limits);

  decorateRouteSection(rules, 'Когда искать новый маршрут', 'Причины, которые разрешают пересчёт уже выбранного пути.');
  decorateRouteChecks(rules, {
    allowGoalAdjustment: ['Если конечная точка недоступна', 'Найти ближайшую доступную клетку вместо точного назначения.'],
    'replanRules.replanOnBlocked': ['Если путь оказался заблокирован', 'Искать обход при блокировке ближайших клеток.'],
    'replanRules.replanOnProfileChange': ['Если изменился профиль', 'Применять сохранённые изменения к активному маршруту.'],
    'replanRules.replanOnDangerChange': ['Если изменилась известная опасность', 'Учитывать новые знания после минимального интервала.'],
  });

  decorateRouteSection(replanning, 'Чувствительность перестроения', 'Защищает движение от постоянного дёрганья из-за мелких изменений.');
  decorateRouteFieldGroup(replanning, {
    fields: {
      'replanRules.minimumCostImprovement': ['Минимальное улучшение', 'Новый путь принимается только при достаточном выигрыше.', 'доля', false],
      'replanRules.minimumDangerRevisionInterval': ['Минимум изменений опасности', 'Не перестраивать путь после каждого небольшого обновления знаний.', 'изменений', false],
      'replanRules.replanCooldownSeconds': ['Пауза между перестроениями', 'Минимальное время между двумя пересчётами маршрута.', 'с', false],
    },
    keepSectionHead: true,
  });

  return {
    terrain,
    tactics,
    territoryFuture,
    routeIntro: routeSubtabIntro('Маршрут', 'Ограничения и перестроение пути', 'Когда текущий путь можно менять и насколько существенным должно быть улучшение.'),
    limits,
    rules,
    replanning,
  };
}

function routeSubtabIntro(label: string, title: string, description: string): HTMLElement {
  const intro = node('section', 'ge-tab-intro');
  const copy = node('div', '');
  copy.append(node('span', '', label), node('h3', '', title), node('p', '', description));
  intro.append(copy);
  return intro;
}

type RouteFieldPresentation = [label: string, help: string, unit: string, showMeaning: boolean, badge?: string];

function decorateRouteFieldGroup(
  group: HTMLElement,
  options: {
    label?: string;
    title?: string;
    description?: string;
    fields: Record<string, RouteFieldPresentation>;
    keepSectionHead?: boolean;
  },
): void {
  group.classList.add('ge-route-fields-surface');
  const heading = group.querySelector<HTMLElement>(':scope > h3');
  const grid = group.querySelector<HTMLElement>(':scope > .navigation-profile-field-grid');
  if (options.label && options.title && options.description) {
    heading?.replaceWith(routeSubtabIntro(options.label, options.title, options.description));
  } else if (!options.keepSectionHead) {
    heading?.remove();
  }
  grid?.classList.add('ge-field-grid');
  for (const [path, presentation] of Object.entries(options.fields)) {
    const field = group.querySelector<HTMLElement>(`[data-field-card="${path}"]`);
    if (field) decorateRouteField(field, presentation);
  }
}

function decorateRouteField(field: HTMLElement, presentation: RouteFieldPresentation): void {
  const [label, help, unit, showMeaning, badge] = presentation;
  field.classList.add('ge-field-card');
  const title = field.querySelector<HTMLElement>('.navigation-profile-field-title');
  const strong = title?.querySelector<HTMLElement>('strong');
  const unitNode = title?.querySelector<HTMLElement>('span');
  if (strong) strong.textContent = label;
  if (unitNode) unitNode.textContent = unit;
  if (title && strong && !title.querySelector('.ge-field-title-copy')) {
    const copy = node('div', 'ge-field-title-copy');
    strong.replaceWith(copy);
    copy.append(strong);
    if (showMeaning) {
      const meaning = node('span', 'ge-field-meaning');
      copy.append(meaning);
      const input = field.querySelector<HTMLInputElement>('input[type="number"]');
      const renderMeaning = (): void => { meaning.textContent = routeTerrainMeaning(Number(input?.value)); };
      input?.addEventListener('input', renderMeaning);
      input?.addEventListener('change', renderMeaning);
      renderMeaning();
    }
  }
  const description = field.querySelector<HTMLElement>('p');
  if (description) description.textContent = help;
  if (badge && !field.querySelector('.ge-field-badge')) {
    const badgeNode = node('span', 'ge-field-badge', badge);
    description?.insertAdjacentElement('afterend', badgeNode);
  }
}

function decorateRouteSection(group: HTMLElement, title: string, description: string): void {
  group.classList.add('ge-section', 'ge-route-section');
  const heading = group.querySelector<HTMLElement>(':scope > h3');
  const head = node('div', 'ge-section-head');
  const copy = node('div', '');
  copy.append(node('h3', '', title), node('p', '', description));
  head.append(copy);
  heading?.replaceWith(head);
}

function decorateRouteChecks(group: HTMLElement, labels: Record<string, [string, string]>): void {
  const grid = group.querySelector<HTMLElement>(':scope > .navigation-profile-checkbox-grid');
  grid?.classList.add('ge-check-grid');
  for (const [path, [label, help]] of Object.entries(labels)) {
    const check = group.querySelector<HTMLElement>(`[data-profile-checkbox="${path}"]`)?.closest<HTMLElement>('.navigation-profile-checkbox');
    if (!check) continue;
    check.classList.add('ge-check');
    const strong = check.querySelector<HTMLElement>('strong');
    const small = check.querySelector<HTMLElement>('small');
    if (strong) strong.textContent = label;
    if (small) small.textContent = help;
  }
}

function decorateRouteLimit(group: HTMLElement): void {
  const field = group.querySelector<HTMLElement>('[data-field-card="maximumRouteCost"]');
  const number = field?.querySelector<HTMLInputElement>('input[type="number"]');
  const range = field?.querySelector<HTMLInputElement>('input[type="range"]');
  const reset = field?.querySelector<HTMLButtonElement>('[data-reset-field="maximumRouteCost"]');
  if (!field || !number || !range) return;
  field.classList.add('ge-route-limit');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = number.value.trim().length > 0;
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'ge-check ge-check--compact';
  const toggleCopy = node('span', '');
  toggleCopy.append(
    node('strong', '', 'Ограничивать максимальную цену маршрута'),
    node('small', '', 'Если выключено, верхнего предела нет.'),
  );
  toggleLabel.append(toggle, toggleCopy);
  const inline = node('div', 'ge-inline-number');
  inline.append(node('span', '', 'Предел'), number, node('span', '', 'цена'));
  const sync = (): void => {
    const enabled = toggle.checked;
    inline.classList.toggle('is-disabled', !enabled);
    number.disabled = !enabled;
    range.disabled = !enabled;
    if (!enabled) {
      number.value = '';
    } else if (!number.value.trim()) {
      number.value = number.min || '1';
    }
    number.dispatchEvent(new Event('input', { bubbles: true }));
    number.dispatchEvent(new Event('change', { bubbles: true }));
  };
  toggle.addEventListener('change', sync);
  number.addEventListener('input', () => { toggle.checked = number.value.trim().length > 0; });
  range.hidden = true;
  reset?.setAttribute('hidden', '');
  field.replaceChildren(toggleLabel, inline, range, reset ?? document.createTextNode(''));
  inline.classList.toggle('is-disabled', !toggle.checked);
  number.disabled = !toggle.checked;
  range.disabled = !toggle.checked;
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
  const summary = buildControlSummary(heading, form, 'ТАКТИЧЕСКИЕ ПОЗИЦИИ', [
    { label: 'Цель поиска', selector: '[data-default-objective]' },
    { label: 'Опасность стоя', selector: 'input[data-tactical-setting="standingMaximumDanger"]' },
    { label: 'Опасность пригнувшись', selector: 'input[data-tactical-setting="crouchedMaximumDanger"]' },
    { label: 'Вес безопасности', selector: 'input[data-tactical-setting="safetyWeight"]' },
  ]);
  summary.classList.add('polygon-tactical-summary');
  const activate = (id: string): void => {
    if (identity) identity.hidden = true;
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

  const weaponSelected = root.querySelector<HTMLButtonElement>('[data-combat-kind="weapon"][aria-selected="true"]');
  const formHeading = form?.querySelector<HTMLElement>('.combat-catalog-form-header');
  if (!weaponSelected || !form || !formHeading) return;

  const tabs = node('nav', 'polygon-editor-tabs polygon-weapon-tabs');
  tabs.setAttribute('aria-label', 'Разделы оружия');
  const summary = buildControlSummary(formHeading, form, 'КРАТКОЕ РЕЗЮМЕ', [
    {
      label: 'Темп огня',
      selector: 'input[data-combat-path="roundsPerMinute"]',
      format: (element) => withUnit(readControlValue(element), 'выстр./мин'),
    },
    {
      label: 'Магазин',
      selector: 'input[data-combat-path="capacityRounds"]',
      format: (element) => withUnit(readControlValue(element), 'патронов'),
    },
    {
      label: 'Режимы огня',
      selector: '.combat-catalog-choice-grid',
      format: (element) => String(element.querySelectorAll<HTMLInputElement>('[data-combat-fire-mode]:checked').length),
    },
    {
      label: 'Огонь в движении',
      selector: 'input[type="checkbox"][data-combat-path="allowFireWhileMoving"]',
    },
  ]);
  summary.classList.add('polygon-weapon-summary');
  const groups = [...form.querySelectorAll<HTMLElement>(':scope > .combat-catalog-group')];
  const views = [
    { id: 'overview', label: 'Основное', titles: ['Идентификация', 'Класс, боеприпас и режимы'] },
    { id: 'fire', label: 'Огонь', titles: ['Огонь и ёмкость'] },
    { id: 'accuracy', label: 'Точность', titles: ['Отдача и восстановление', 'Движение и поза'] },
    { id: 'reload', label: 'Перезарядка', titles: ['Этапы перезарядки'] },
    { id: 'use', label: 'Использование', titles: ['Установка и расчёт'] },
    { id: 'signals', label: 'Демаскировка', titles: ['Звук, вспышка и ствол'] },
  ] as const;

  const activate = (id: string): void => {
    const view = views.find((candidate) => candidate.id === id) ?? views[0];
    summary.hidden = view.id !== 'overview';
    groups.forEach((group) => {
      const title = group.querySelector('h3')?.textContent?.trim() ?? '';
      group.hidden = !view.titles.includes(title as never);
    });
    setActiveTab(tabs, 'polygonWeaponTab', view.id);
  };

  for (const view of views) tabs.append(tabButton(view.label, 'polygonWeaponTab', view.id, () => activate(view.id)));
  formHeading.after(tabs, summary);
  activate('overview');
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

function buildControlSummary(
  heading: HTMLElement,
  root: HTMLElement,
  kicker: string,
  specs: readonly LiveSummaryCardSpec[],
): HTMLElement {
  const summary = buildLiveSummary(heading, kicker);
  const grid = node('div', 'polygon-editor-summary-grid');
  for (const spec of specs) {
    const card = node('article', 'polygon-editor-summary-card');
    const value = node('strong', '');
    const control = root.querySelector<HTMLElement>(spec.selector);
    const render = (): void => {
      value.textContent = control ? (spec.format?.(control) ?? readControlValue(control)) : '—';
    };
    if (control) {
      control.addEventListener('input', render);
      control.addEventListener('change', render);
    }
    card.append(node('span', '', spec.label), value);
    grid.append(card);
    render();
  }
  summary.append(grid);
  return summary;
}

function buildFieldSummary(heading: HTMLElement, fields: readonly HTMLElement[]): HTMLElement {
  const summary = buildLiveSummary(heading, 'ОБЗОР');
  const grid = node('div', 'polygon-editor-summary-grid');
  for (const field of fields.filter((item) => !item.classList.contains('gameplay-tuning-editor-reference')).slice(0, 4)) {
    const label = field.querySelector<HTMLElement>('.gameplay-tuning-editor-field-label')?.textContent?.trim() ?? 'Параметр';
    const input = field.querySelector<HTMLInputElement>('[data-tuning-path]');
    const value = node('strong', '');
    const render = (): void => { value.textContent = input?.value ?? '—'; };
    input?.addEventListener('input', render);
    input?.addEventListener('change', render);
    const card = node('article', 'polygon-editor-summary-card');
    card.append(node('span', '', label), value);
    grid.append(card);
    render();
  }
  summary.append(grid);
  return summary;
}

function readControlValue(element: HTMLElement): string {
  if (element instanceof HTMLSelectElement) {
    return element.selectedOptions[0]?.textContent?.trim() || element.value || '—';
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') return element.checked ? 'Да' : 'Нет';
    return element.value.trim() || '—';
  }
  if (element instanceof HTMLTextAreaElement) return element.value.trim() || '—';
  return element.textContent?.trim() || '—';
}

function withUnit(value: string, unit: string): string {
  return value === '—' ? value : `${value} ${unit}`;
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

function routeProfileFeature(
  host: HTMLElement,
  label: string,
  path: string,
  format: (value: string) => string,
): HTMLElement {
  const card = node('article', '');
  const value = node('strong', '');
  const input = host.querySelector<HTMLInputElement>(`input[type="number"][data-profile-number="${path}"]`);
  const render = (): void => { value.textContent = format(input?.value.trim() ?? ''); };
  input?.addEventListener('input', render);
  input?.addEventListener('change', render);
  card.append(node('span', '', label), value);
  render();
  return card;
}

function routeStrength(value: number, thresholds = [.2, .7, 1.4, 2.2]): string {
  if (!Number.isFinite(value)) return '—';
  if (value <= thresholds[0]) return 'почти не учитывает';
  if (value <= thresholds[1]) return 'слабо';
  if (value <= thresholds[2]) return 'умеренно';
  if (value <= thresholds[3]) return 'сильно';
  return 'очень сильно';
}

function routeTerrainMeaning(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < .9) return 'предпочитает';
  if (value > 1.1) return 'избегает';
  return 'нейтрально';
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
