import {
  NavigationProfileRegistry,
  getBuiltInNavigationProfile,
  isBuiltInNavigationProfileId,
  type NavigationProfile,
} from '../core/navigation/NavigationProfiles';
import {
  getNavigationProfileRegistry,
  saveNavigationProfileRegistry,
  subscribeNavigationProfileRegistry,
} from '../core/navigation/NavigationProfileStorage';

const graphRootElement = document.querySelector<HTMLElement>('#ai-node-editor-root');
if (!graphRootElement) throw new Error('AI node editor root is missing for navigation profile editor.');
const graphRoot: HTMLElement = graphRootElement;

type EditorTab = 'graph' | 'blackboard' | 'profiles' | 'diagnostics';
type NumericPath =
  | `terrainCosts.${keyof NavigationProfile['terrainCosts']}`
  | 'slopeWeight'
  | 'dangerWeight'
  | 'exposureWeight'
  | 'coverWeight'
  | 'enemyDistanceWeight'
  | `territoryWeights.${keyof NavigationProfile['territoryWeights']}`
  | 'maximumDetourRatio'
  | 'maximumRouteCost'
  | `replanRules.${'minimumCostImprovement' | 'minimumDangerRevisionInterval' | 'replanCooldownSeconds'}`;

interface NumericDefinition {
  readonly path: NumericPath;
  readonly label: string;
  readonly help: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

const groups: ReadonlyArray<{ title: string; fields: readonly NumericDefinition[] }> = [
  {
    title: 'Местность',
    fields: [
      numeric('terrainCosts.road', 'Цена дороги', 'Меньше 1,0 — солдат предпочитает дорогу. Больше 1,0 — старается её обходить.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.field', 'Цена поля', 'Открытая земля. 1,0 — нейтральная цена.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.sparseForest', 'Цена редкого леса', 'Меньше 1,0 — маршрут чаще проходит через редкий лес.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.denseForest', 'Цена густого леса', 'Чем выше значение, тем сильнее солдат избегает густого леса.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.rough', 'Цена пересечённой местности', 'Штраф за камни, неровности и сложную поверхность.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.swamp', 'Цена болота', 'Высокое значение заставляет искать обход болота.', 0.1, 6, 0.05, 'множитель'),
      numeric('terrainCosts.bridge', 'Цена моста', 'Цена прохода по мосту. Непроходимая вода от этого не становится проходимой.', 0.1, 4, 0.05, 'множитель'),
      numeric('terrainCosts.ditch', 'Цена канавы', 'Можно сделать канаву выгодным скрытым путём или неудобным препятствием.', 0.1, 4, 0.05, 'множитель'),
      numeric('slopeWeight', 'Штраф за уклон', 'Чем выше значение, тем сильнее маршрут избегает перепадов высоты.', 0, 4, 0.05, 'за уровень высоты'),
    ],
  },
  {
    title: 'Тактические факторы',
    fields: [
      numeric('dangerWeight', 'Избегание известной опасности', 'Использует только угрозы, которые известны выбранному бойцу.', 0, 5, 0.05, 'вес'),
      numeric('exposureWeight', 'Избегание видимости противнику', 'Контракт подготовлен. Пока честные субъективные данные видимости недоступны, фактор равен нулю.', 0, 5, 0.05, 'вес'),
      numeric('coverWeight', 'Предпочтение укрытий и маскировки', 'Положительное значение снижает цену леса и канав как маскирующих участков.', 0, 3, 0.05, 'вес'),
      numeric('enemyDistanceWeight', 'Отношение к близости противника', 'Контракт подготовлен. Точная субъективная дистанция пока не используется.', -3, 3, 0.05, 'вес'),
    ],
  },
  {
    title: 'Территория',
    fields: [
      numeric('territoryWeights.friendly', 'Своя территория', 'Будущий штраф или бонус своей территории. Пока слой территории не подключён к стоимости.', -3, 3, 0.05, 'вес'),
      numeric('territoryWeights.neutral', 'Серая зона', 'Будущий штраф или бонус нейтральной территории.', -3, 3, 0.05, 'вес'),
      numeric('territoryWeights.enemy', 'Вражеская территория', 'Будущий штраф или бонус вражеской территории.', -3, 3, 0.05, 'вес'),
    ],
  },
  {
    title: 'Ограничения маршрута',
    fields: [
      numeric('maximumDetourRatio', 'Максимальный обход', '1,0 — только кратчайший проходимый путь. 1,6 — обход может быть длиннее на 60%.', 1, 3, 0.05, 'отношение'),
      numeric('maximumRouteCost', 'Максимальная цена маршрута', 'Если заполнено, более дорогой маршрут считается недоступным. Пустое поле отключает предел.', 1, 100000, 1, 'цена'),
    ],
  },
  {
    title: 'Перестроение маршрута',
    fields: [
      numeric('replanRules.minimumCostImprovement', 'Минимальное улучшение', 'Новый путь принимается, только если он дешевле старого хотя бы на эту долю.', 0, 1, 0.01, 'доля'),
      numeric('replanRules.minimumDangerRevisionInterval', 'Интервал ревизий опасности', 'Защита от перестроения при каждом незначительном обновлении знаний.', 1, 20, 1, 'ревизий'),
      numeric('replanRules.replanCooldownSeconds', 'Пауза между перестроениями', 'Минимальное время между двумя перестроениями маршрута.', 0, 30, 0.1, 'сек'),
    ],
  },
];

let activeTab: EditorTab = 'graph';
let registry = getNavigationProfileRegistry();
let selectedProfileId = registry.listProfiles()[0]?.id ?? 'normal';
let draft = registry.getProfile(selectedProfileId);

const navigation = document.createElement('nav');
navigation.className = 'navigation-profile-tabs';
navigation.setAttribute('aria-label', 'Разделы редактора ИИ');
navigation.innerHTML = `
  <button type="button" data-navigation-tab="graph">Граф поведения</button>
  <button type="button" data-navigation-tab="blackboard">Чёрная доска</button>
  <button type="button" data-navigation-tab="profiles">Профили движения</button>
  <button type="button" data-navigation-tab="diagnostics">Диагностика</button>
`;
const panel = document.createElement('section');
panel.className = 'navigation-profile-workbench';
panel.hidden = true;
graphRoot.before(navigation);
graphRoot.after(panel);

navigation.addEventListener('click', (event) => {
  const button = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>('[data-navigation-tab]')
    : null;
  if (!button) return;
  showTab(button.dataset.navigationTab as EditorTab);
});

subscribeNavigationProfileRegistry((nextRegistry) => {
  registry = nextRegistry;
  if (!registry.hasProfile(selectedProfileId)) selectedProfileId = 'normal';
  draft = registry.getProfile(selectedProfileId);
  if (activeTab === 'profiles') renderProfiles();
});

showTab('graph');

function showTab(tab: EditorTab): void {
  activeTab = tab;
  graphRoot.hidden = tab !== 'graph';
  panel.hidden = tab === 'graph';
  navigation.querySelectorAll<HTMLButtonElement>('[data-navigation-tab]').forEach((button) => {
    const selected = button.dataset.navigationTab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  if (tab === 'profiles') renderProfiles();
  else if (tab === 'blackboard') renderBlackboard();
  else if (tab === 'diagnostics') renderDiagnostics();
}

function renderProfiles(): void {
  panel.innerHTML = `
    <div class="navigation-profile-layout">
      <aside class="navigation-profile-list-panel">
        <div class="navigation-profile-list-heading">
          <div><h2>Профили движения</h2><p>Постоянные правила оценки пути. Это не ноды ИИ.</p></div>
          <span>Формат v${registry.formatVersion}</span>
        </div>
        <div class="navigation-profile-list">
          ${registry.listProfiles().map((profile) => `
            <button type="button" data-profile-id="${escapeAttribute(profile.id)}" class="${profile.id === selectedProfileId ? 'active' : ''}">
              <strong>${escapeHtml(profile.nameRu)}</strong>
              <span>${escapeHtml(profile.id)}${profile.builtIn ? ' · встроенный' : ' · пользовательский'}</span>
            </button>
          `).join('')}
        </div>
        <div class="navigation-profile-list-actions">
          <button type="button" data-profile-action="create">Создать</button>
          <button type="button" data-profile-action="copy">Копировать</button>
          <button type="button" data-profile-action="rename">Переименовать</button>
          <button type="button" data-profile-action="delete" ${draft.builtIn ? 'disabled' : ''}>Удалить</button>
          <button type="button" data-profile-action="reset">Сбросить</button>
          <button type="button" data-profile-action="import">Импорт</button>
          <button type="button" data-profile-action="export">Экспорт</button>
          <input type="file" data-profile-import accept="application/json,.json" hidden />
        </div>
      </aside>
      <main class="navigation-profile-form-panel">
        <header class="navigation-profile-form-heading">
          <div>
            <span class="navigation-profile-kicker">${draft.builtIn ? 'Встроенный профиль' : 'Пользовательский профиль'} · revision ${draft.revision}</span>
            <h2>${escapeHtml(draft.nameRu)}</h2>
            <p>${escapeHtml(draft.descriptionRu)}</p>
          </div>
          <div class="navigation-profile-form-actions">
            <button type="button" data-profile-action="cancel">Отменить изменения</button>
            <button type="button" data-profile-action="save" class="primary">Сохранить изменения</button>
          </div>
        </header>
        <section class="navigation-profile-name-card">
          ${textField('nameRu', 'Название по-русски', draft.nameRu)}
          ${textField('nameEn', 'Название по-английски', draft.nameEn)}
          ${textArea('descriptionRu', 'Описание по-русски', draft.descriptionRu)}
          ${textArea('descriptionEn', 'Описание по-английски', draft.descriptionEn)}
        </section>
        ${groups.map((group) => `
          <section class="navigation-profile-group">
            <h3>${group.title}</h3>
            <div class="navigation-profile-field-grid">
              ${group.fields.map(renderNumericField).join('')}
            </div>
          </section>
        `).join('')}
        <section class="navigation-profile-group">
          <h3>Правила и доступность</h3>
          <div class="navigation-profile-checkbox-grid">
            ${checkbox('allowGoalAdjustment', 'Разрешать перенос цели', 'Если точная клетка непроходима, искать ближайшую доступную.')}
            ${checkbox('replanRules.replanOnBlocked', 'Перестраивать при блокировке', 'Немедленно искать новый путь, когда ближайшие клетки маршрута стали непроходимыми.')}
            ${checkbox('replanRules.replanOnProfileChange', 'Перестраивать при изменении профиля', 'Применять сохранённые изменения профиля к активному маршруту с учётом паузы.')}
            ${checkbox('replanRules.replanOnDangerChange', 'Перестраивать при изменении опасности', 'Учитывать новые знания бойца только после интервала ревизий и при достаточном улучшении.')}
          </div>
        </section>
      </main>
    </div>
  `;
  installProfileHandlers();
}

function installProfileHandlers(): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-profile-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.profileId;
      if (!id) return;
      selectedProfileId = id;
      draft = registry.getProfile(id);
      renderProfiles();
    });
  });
  panel.querySelectorAll<HTMLInputElement>('[data-profile-number]').forEach((input) => {
    input.addEventListener('input', () => handleNumericInput(input));
  });
  panel.querySelectorAll<HTMLInputElement>('[data-profile-checkbox]').forEach((input) => {
    input.addEventListener('change', () => setDraftPath(input.dataset.profileCheckbox ?? '', input.checked));
  });
  panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-profile-text]').forEach((input) => {
    input.addEventListener('input', () => setDraftPath(input.dataset.profileText ?? '', input.value));
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-reset-field]').forEach((button) => {
    button.addEventListener('click', () => resetDraftField(button.dataset.resetField ?? ''));
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.dataset.profileAction ?? ''));
  });
  panel.querySelector<HTMLInputElement>('[data-profile-import]')?.addEventListener('change', importRegistry);
}

function handleNumericInput(input: HTMLInputElement): void {
  const path = input.dataset.profileNumber as NumericPath | undefined;
  if (!path) return;
  const definition = groups.flatMap((group) => group.fields).find((item) => item.path === path);
  if (!definition) return;
  const nullable = path === 'maximumRouteCost';
  const raw = input.value.trim();
  const value = nullable && raw === '' ? null : clamp(Number(raw), definition.min, definition.max);
  setDraftPath(path, value);
  panel.querySelectorAll<HTMLInputElement>(`[data-profile-number="${cssEscape(path)}"]`).forEach((peer) => {
    if (peer !== input) peer.value = value === null ? '' : String(value);
  });
  updateExtremeWarning(path, value, definition);
}

function handleAction(action: string): void {
  if (action === 'save') {
    const { id: _id, revision: _revision, builtIn: _builtIn, ...changes } = draft;
    registry.updateProfile(selectedProfileId, changes);
    saveNavigationProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
    return;
  }
  if (action === 'cancel') {
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
    return;
  }
  if (action === 'reset') {
    if (!window.confirm(`Сбросить профиль «${draft.nameRu}» к стандартным значениям?`)) return;
    registry.resetProfile(selectedProfileId);
    saveNavigationProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
    return;
  }
  if (action === 'create' || action === 'copy') {
    const nameRu = window.prompt('Название нового профиля по-русски:', action === 'copy' ? `${draft.nameRu} — копия` : 'Новый профиль');
    if (!nameRu) return;
    const id = window.prompt('Технический id латиницей:', slugify(nameRu));
    if (!id) return;
    try {
      const created = registry.createCustomProfile(id, id, nameRu, action === 'copy' ? selectedProfileId : 'normal');
      selectedProfileId = created.id;
      saveNavigationProfileRegistry(registry);
      draft = registry.getProfile(created.id);
      renderProfiles();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
    return;
  }
  if (action === 'rename') {
    const nameRu = window.prompt('Новое русское название:', draft.nameRu);
    if (!nameRu) return;
    const nameEn = window.prompt('Новое английское название:', draft.nameEn) || draft.nameEn;
    registry.renameProfile(selectedProfileId, nameEn, nameRu);
    saveNavigationProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
    return;
  }
  if (action === 'delete') {
    if (draft.builtIn || !window.confirm(`Удалить пользовательский профиль «${draft.nameRu}»?`)) return;
    registry.deleteProfile(selectedProfileId);
    selectedProfileId = 'normal';
    saveNavigationProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
    return;
  }
  if (action === 'export') {
    downloadJson('real-wargame-navigation-profiles.json', registry.exportJson());
    return;
  }
  if (action === 'import') {
    panel.querySelector<HTMLInputElement>('[data-profile-import]')?.click();
  }
}

async function importRegistry(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    registry = NavigationProfileRegistry.importJson(await file.text());
    selectedProfileId = registry.hasProfile(selectedProfileId) ? selectedProfileId : 'normal';
    saveNavigationProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderProfiles();
  } catch (error) {
    window.alert(`Не удалось импортировать профили: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderBlackboard(): void {
  const raw = window.localStorage.getItem('real-wargame.ai-node-editor.graph.v6');
  let defaults: unknown = {};
  try { defaults = raw ? (JSON.parse(raw) as { blackboardDefaults?: unknown }).blackboardDefaults ?? {} : {}; } catch { defaults = {}; }
  panel.innerHTML = `
    <section class="navigation-profile-placeholder">
      <h2>Чёрная доска</h2>
      <p>Постоянные профили маршрута здесь не хранятся. Ниже показаны текущие исходные значения памяти графа.</p>
      <pre>${escapeHtml(JSON.stringify(defaults, null, 2))}</pre>
    </section>`;
}

function renderDiagnostics(): void {
  panel.innerHTML = `
    <section class="navigation-profile-placeholder">
      <h2>Диагностика маршрута</h2>
      <p>В игре выбери бойца и включи «Стоимость маршрута». Слой показывает базовую или итоговую цену клетки, а жёлтый приказ, синий план и зелёный маршрут остаются поверх.</p>
      <div class="navigation-profile-diagnostic-cards">
        <article><strong>Реализовано честно</strong><span>местность, лес, мосты, канавы, уклон, проходимость, известные бойцу угрозы, маскировка леса и канав.</span></article>
        <article><strong>Подготовлено архитектурно</strong><span>субъективная видимость противнику, точная известная дистанция до врага и стоимость линии фронта. Пока они явно показываются как недоступные.</span></article>
        <article><strong>Производительность</strong><span>два растровых слоя, typed arrays, ревизионные кеши; движение курсора читает одну готовую клетку и не запускает A*.</span></article>
      </div>
    </section>`;
}

function renderNumericField(definition: NumericDefinition): string {
  const value = getDraftPath(definition.path) as number | null;
  const defaultValue = getDefaultValue(definition.path);
  const nullable = definition.path === 'maximumRouteCost';
  return `
    <article class="navigation-profile-field" data-field-card="${escapeAttribute(definition.path)}">
      <div class="navigation-profile-field-title"><strong>${definition.label}</strong><span>${definition.unit}</span></div>
      <p>${definition.help}</p>
      <div class="navigation-profile-field-control">
        <input type="range" data-profile-number="${escapeAttribute(definition.path)}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${value ?? definition.max}" />
        <input type="number" data-profile-number="${escapeAttribute(definition.path)}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${value ?? ''}" placeholder="без предела" />
        <button type="button" data-reset-field="${escapeAttribute(definition.path)}" title="Сбросить поле">↺</button>
      </div>
      <div class="navigation-profile-field-meta"><span>Стандарт: ${defaultValue === null ? 'без предела' : defaultValue}</span><span data-extreme-warning="${escapeAttribute(definition.path)}">${extremeText(value, definition)}</span></div>
      ${nullable ? '<small>Чтобы отключить предел, очисти точное числовое поле.</small>' : ''}
    </article>`;
}

function checkbox(path: string, label: string, help: string): string {
  const checked = Boolean(getDraftPath(path));
  return `<label class="navigation-profile-checkbox"><input type="checkbox" data-profile-checkbox="${escapeAttribute(path)}" ${checked ? 'checked' : ''} /><span><strong>${label}</strong><small>${help}</small></span></label>`;
}

function textField(path: string, label: string, value: string): string {
  return `<label><span>${label}</span><input type="text" data-profile-text="${path}" value="${escapeAttribute(value)}" /></label>`;
}

function textArea(path: string, label: string, value: string): string {
  return `<label><span>${label}</span><textarea data-profile-text="${path}" rows="3">${escapeHtml(value)}</textarea></label>`;
}

function resetDraftField(path: string): void {
  setDraftPath(path, getDefaultValue(path));
  renderProfiles();
}

function getDefaultValue(path: string): unknown {
  const defaults = isBuiltInNavigationProfileId(selectedProfileId)
    ? getBuiltInNavigationProfile(selectedProfileId)
    : getBuiltInNavigationProfile('normal');
  return getPath(defaults, path);
}

function getDraftPath(path: string): unknown {
  return getPath(draft, path);
}

function setDraftPath(path: string, value: unknown): void {
  const clone = structuredClone(draft) as unknown as Record<string, unknown>;
  const parts = path.split('.');
  let target = clone;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts[parts.length - 1]] = value;
  draft = clone as unknown as NavigationProfile;
}

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => (
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined
  ), source);
}

function updateExtremeWarning(path: string, value: number | null, definition: NumericDefinition): void {
  const warning = panel.querySelector<HTMLElement>(`[data-extreme-warning="${cssEscape(path)}"]`);
  if (warning) warning.textContent = extremeText(value, definition);
}

function extremeText(value: number | null, definition: NumericDefinition): string {
  if (value === null) return '';
  const range = definition.max - definition.min;
  const edge = range * 0.08;
  return value <= definition.min + edge || value >= definition.max - edge ? 'Экстремальное значение' : '';
}

function numeric(path: NumericPath, label: string, help: string, min: number, max: number, step: number, unit: string): NumericDefinition {
  return { path, label, help, min, max, step, unit };
}

function downloadJson(name: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const latin = value.trim().toLowerCase().split('').map((character) => transliteration[character] ?? character).join('');
  return latin.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `custom_${Date.now().toString(36)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
