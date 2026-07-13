import type {
  NavigationDirectionalTerrainWeights,
  NavigationProfile,
} from '../core/navigation/NavigationProfiles';
import {
  getNavigationProfileRegistry,
  saveNavigationProfileRegistry,
  subscribeNavigationProfileRegistry,
} from '../core/navigation/NavigationProfileStorage';

const TAB_ID = 'directionalTerrain';
const navigation = document.querySelector<HTMLElement>('.navigation-profile-tabs');
const mainTabs = navigation?.querySelector<HTMLElement>('.navigation-profile-main-tabs');
const panel = document.querySelector<HTMLElement>('.navigation-profile-workbench');

if (navigation && mainTabs && panel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.navigationTab = TAB_ID;
  button.textContent = 'Направленный рельеф';
  mainTabs.append(button);

  let registry = getNavigationProfileRegistry();
  let selectedProfileId = registry.hasProfile('stealth') ? 'stealth' : 'normal';
  let draft = cloneWeights(registry.getProfile(selectedProfileId).directionalTerrain);
  let active = false;

  navigation.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-navigation-tab]')
      : null;
    active = target?.dataset.navigationTab === TAB_ID;
    if (active) queueMicrotask(render);
  });

  subscribeNavigationProfileRegistry((nextRegistry) => {
    registry = nextRegistry;
    if (!registry.hasProfile(selectedProfileId)) selectedProfileId = 'normal';
    draft = cloneWeights(registry.getProfile(selectedProfileId).directionalTerrain);
    if (active) render();
  });

  function render(): void {
    const profile = registry.getProfile(selectedProfileId);
    panel.hidden = false;
    panel.innerHTML = `
      <div class="navigation-profile-layout">
        <aside class="navigation-profile-list-panel">
          <div class="navigation-profile-list-heading">
            <div>
              <h2>Направленный рельеф</h2>
              <p>Как профиль движения относится к прямым и обратным склонам относительно известных бойцу угроз.</p>
            </div>
            <span>8 секторов угрозы</span>
          </div>
          <div class="navigation-profile-list">
            ${registry.listProfiles().map((item) => profileButton(item)).join('')}
          </div>
        </aside>
        <main class="navigation-profile-form-panel">
          <header class="navigation-profile-form-heading">
            <div>
              <span class="navigation-profile-kicker">Профиль движения · ${escapeHtml(profile.id)}</span>
              <h2>${escapeHtml(profile.nameRu)}</h2>
              <p>Значения применяются к существующему A*. Скрытые враги не используются: направление берётся только из личной памяти бойца.</p>
            </div>
            <div class="navigation-profile-form-actions">
              <button type="button" data-directional-action="cancel">Отменить</button>
              <button type="button" data-directional-action="save" class="primary">Сохранить</button>
            </div>
          </header>
          <section class="navigation-profile-group">
            <h3>Склоны и границы видимости</h3>
            <div class="navigation-profile-field-grid">
              ${field('forwardSlopePenalty', 'Штраф прямого склона', 'Повышает цену склона, обращённого к предполагаемому противнику.', 0, 4, 0.05)}
              ${field('reverseSlopePreference', 'Предпочтение обратного склона', 'Снижает цену местности, скрытой от главного направления угрозы.', 0, 3, 0.05)}
              ${field('crestPenalty', 'Штраф за гребень', 'Не даёт без необходимости идти по вершинам и пересекать линии гребней.', 0, 4, 0.05)}
              ${field('silhouettePenalty', 'Штраф силуэтной позиции', 'Избегает геометрически заметных вершин и выступов.', 0, 4, 0.05)}
              ${field('valleyPreference', 'Предпочтение ложбин', 'Снижает цену оврагов, ложбин и других вогнутых участков.', 0, 3, 0.05)}
              ${field('criticalSectorMultiplier', 'Вес критического сектора', 'Не позволяет одной опасной стороне потеряться при усреднении нескольких направлений.', 0, 3, 0.05)}
            </div>
          </section>
          <section class="navigation-profile-placeholder">
            <h3>Как это работает</h3>
            <p>Сначала рельеф карты рассчитывается один раз и хранится в числовых массивах. При изменении знаний бойца пересчитывается только субъективная направленная цена. Камера, курсор и отрисовка не запускают анализ заново.</p>
          </section>
        </main>
      </div>
    `;

    panel.querySelectorAll<HTMLButtonElement>('[data-directional-profile]').forEach((profileButtonElement) => {
      profileButtonElement.addEventListener('click', () => {
        selectedProfileId = profileButtonElement.dataset.directionalProfile ?? 'normal';
        draft = cloneWeights(registry.getProfile(selectedProfileId).directionalTerrain);
        render();
      });
    });
    panel.querySelectorAll<HTMLInputElement>('[data-directional-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.directionalField as keyof NavigationDirectionalTerrainWeights | undefined;
        if (!key) return;
        const minimum = Number(input.min);
        const maximum = Number(input.max);
        const value = Number(input.value);
        draft[key] = Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
        panel.querySelector<HTMLElement>(`[data-directional-value="${key}"]`)!.textContent = draft[key].toFixed(2);
      });
    });
    panel.querySelector<HTMLButtonElement>('[data-directional-action="cancel"]')?.addEventListener('click', () => {
      draft = cloneWeights(registry.getProfile(selectedProfileId).directionalTerrain);
      render();
    });
    panel.querySelector<HTMLButtonElement>('[data-directional-action="save"]')?.addEventListener('click', () => {
      registry.updateProfile(selectedProfileId, { directionalTerrain: cloneWeights(draft) });
      saveNavigationProfileRegistry(registry);
      draft = cloneWeights(registry.getProfile(selectedProfileId).directionalTerrain);
      render();
    });
  }

  function profileButton(profile: NavigationProfile): string {
    return `
      <button type="button" data-directional-profile="${escapeHtml(profile.id)}" class="${profile.id === selectedProfileId ? 'active' : ''}">
        <strong>${escapeHtml(profile.nameRu)}</strong>
        <span>${escapeHtml(profile.id)}${profile.builtIn ? ' · встроенный' : ' · пользовательский'}</span>
      </button>`;
  }

  function field(
    key: keyof NavigationDirectionalTerrainWeights,
    label: string,
    help: string,
    min: number,
    max: number,
    step: number,
  ): string {
    const value = draft[key];
    return `
      <article class="navigation-profile-field">
        <div class="navigation-profile-field-title"><strong>${label}</strong><span data-directional-value="${key}">${value.toFixed(2)}</span></div>
        <p>${help}</p>
        <div class="navigation-profile-field-control">
          <input type="range" data-directional-field="${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
          <input type="number" data-directional-field="${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
        </div>
      </article>`;
  }
}

function cloneWeights(value: NavigationDirectionalTerrainWeights): NavigationDirectionalTerrainWeights {
  return { ...value };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character));
}
