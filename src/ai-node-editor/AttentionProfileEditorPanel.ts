import {
  ATTENTION_MODES,
  type AttentionMode,
  type AttentionModeProfile,
  type UnitAttentionSettings,
} from '../core/perception/AttentionModel';
import {
  AttentionProfileRegistry,
  getBuiltInAttentionProfile,
  type AttentionProfile,
} from '../core/perception/AttentionProfiles';
import {
  getAttentionProfileRegistry,
  saveAttentionProfileRegistry,
  subscribeAttentionProfileRegistry,
} from '../core/perception/AttentionProfileStorage';

const MODE_LABELS: Record<AttentionMode, string> = { march: 'Марш', observe: 'Наблюдение', search: 'Поиск', engage: 'Стрельба' };
let registry = getAttentionProfileRegistry();
let selectedProfileId = registry.listProfiles()[0]?.id ?? 'balanced';
let draft = registry.getProfile(selectedProfileId);
let activeMode: AttentionMode = 'observe';
let subscribed = false;

export function renderAttentionProfiles(panel: HTMLElement): void {
  ensureSubscription(panel);
  panel.innerHTML = `
    <div class="navigation-profile-layout attention-profile-editor-layout">
      <aside class="navigation-profile-list-panel">
        <div class="navigation-profile-list-heading"><div><h2>Профили внимания</h2><p>Постоянные правила обзора и обнаружения. Это не ноды ИИ.</p></div><span>Формат v${registry.formatVersion}</span></div>
        <div class="navigation-profile-list">${registry.listProfiles().map(profileButton).join('')}</div>
        <div class="navigation-profile-list-actions">
          <button type="button" data-attention-action="create">Создать</button>
          <button type="button" data-attention-action="copy">Копировать</button>
          <button type="button" data-attention-action="rename">Переименовать</button>
          <button type="button" data-attention-action="delete" ${draft.builtIn ? 'disabled' : ''}>Удалить</button>
          <button type="button" data-attention-action="reset">Сбросить</button>
          <button type="button" data-attention-action="import">Импорт</button>
          <button type="button" data-attention-action="export">Экспорт</button>
          <input type="file" data-attention-import accept="application/json,.json" hidden />
        </div>
      </aside>
      <main class="navigation-profile-form-panel">
        <header class="navigation-profile-form-heading">
          <div><span class="navigation-profile-kicker">${draft.builtIn ? 'Встроенный профиль' : 'Пользовательский профиль'} · revision ${draft.revision}</span><h2>${html(draft.nameRu)}</h2><p>${html(draft.descriptionRu)}</p></div>
          <div class="navigation-profile-form-actions"><button type="button" data-attention-action="cancel">Отменить изменения</button><button type="button" data-attention-action="save" class="primary">Сохранить изменения</button></div>
        </header>
        <section class="navigation-profile-name-card">
          ${textField('nameRu', 'Название по-русски', draft.nameRu)}
          ${textField('nameEn', 'Название по-английски', draft.nameEn)}
          ${textArea('descriptionRu', 'Описание по-русски', draft.descriptionRu)}
          ${textArea('descriptionEn', 'Описание по-английски', draft.descriptionEn)}
        </section>
        <section class="navigation-profile-group"><h3>Зрение и обнаружение</h3><div class="navigation-profile-field-grid">
          ${numberField('vision.maximumVisualRangeMeters', 'Максимальная дальность', 'Дальняя граница, где качество обзора стремится к нулю.', 20, 2000, 10, 'м')}
          ${numberField('vision.distanceFalloffStartMeters', 'Начало падения качества', 'До этой дистанции качество почти не снижается.', 0, 1900, 5, 'м')}
          ${numberField('vision.distanceFalloffExponent', 'Крутизна падения', 'Чем выше, тем быстрее ухудшается дальний обзор.', 0.25, 6, 0.05, 'степень')}
          ${numberField('vision.detectionVariancePercent', 'Небольшая случайность', 'Стабильное отклонение времени обнаружения, а не бросок каждый кадр.', 0, 25, 1, '±%')}
        </div></section>
        <section class="navigation-profile-group"><h3>Режим внимания</h3>
          <label class="navigation-profile-mode-select"><span>Редактируемый режим</span><select data-attention-mode>${ATTENTION_MODES.map((mode) => `<option value="${mode}" ${mode === activeMode ? 'selected' : ''}>${MODE_LABELS[mode]}</option>`).join('')}</select></label>
          <div class="navigation-profile-field-grid">${modeFields(activeMode).join('')}</div>
        </section>
      </main>
    </div>`;
  bind(panel);
}

function ensureSubscription(panel: HTMLElement): void {
  if (subscribed) return;
  subscribed = true;
  subscribeAttentionProfileRegistry((next) => {
    registry = next;
    if (!registry.hasProfile(selectedProfileId)) selectedProfileId = 'balanced';
    draft = registry.getProfile(selectedProfileId);
    if (!panel.hidden) renderAttentionProfiles(panel);
  });
}

function bind(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-attention-profile-id]').forEach((button) => button.addEventListener('click', () => {
    selectedProfileId = button.dataset.attentionProfileId ?? 'balanced';
    draft = registry.getProfile(selectedProfileId);
    renderAttentionProfiles(panel);
  }));
  panel.querySelector<HTMLSelectElement>('[data-attention-mode]')?.addEventListener('change', (event) => {
    activeMode = (event.currentTarget as HTMLSelectElement).value as AttentionMode;
    renderAttentionProfiles(panel);
  });
  panel.querySelectorAll<HTMLInputElement>('[data-attention-number]').forEach((input) => input.addEventListener('input', () => setDraftPath(input.dataset.attentionNumber ?? '', Number(input.value))));
  panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-attention-text]').forEach((input) => input.addEventListener('input', () => setDraftPath(input.dataset.attentionText ?? '', input.value)));
  panel.querySelectorAll<HTMLButtonElement>('[data-attention-action]').forEach((button) => button.addEventListener('click', () => handleAction(panel, button.dataset.attentionAction ?? '')));
  panel.querySelector<HTMLInputElement>('[data-attention-import]')?.addEventListener('change', (event) => void importRegistry(panel, event));
}

function handleAction(panel: HTMLElement, action: string): void {
  if (action === 'save') {
    const { id: _id, revision: _revision, builtIn: _builtIn, ...changes } = draft;
    registry.updateProfile(selectedProfileId, changes);
    saveAttentionProfileRegistry(registry);
    draft = registry.getProfile(selectedProfileId);
    renderAttentionProfiles(panel);
    return;
  }
  if (action === 'cancel') { draft = registry.getProfile(selectedProfileId); renderAttentionProfiles(panel); return; }
  if (action === 'reset') {
    if (!window.confirm(`Сбросить профиль «${draft.nameRu}»?`)) return;
    registry.resetProfile(selectedProfileId); saveAttentionProfileRegistry(registry); draft = registry.getProfile(selectedProfileId); renderAttentionProfiles(panel); return;
  }
  if (action === 'create' || action === 'copy') {
    const nameRu = window.prompt('Название нового профиля:', action === 'copy' ? `${draft.nameRu} — копия` : 'Новый профиль внимания');
    if (!nameRu) return;
    const id = window.prompt('Технический id латиницей:', slugify(nameRu));
    if (!id) return;
    try {
      const created = registry.createCustomProfile(id, id, nameRu, action === 'copy' ? selectedProfileId : 'balanced');
      selectedProfileId = created.id; saveAttentionProfileRegistry(registry); draft = registry.getProfile(created.id); renderAttentionProfiles(panel);
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (action === 'rename') {
    const ru = window.prompt('Новое русское название:', draft.nameRu); if (!ru) return;
    const en = window.prompt('Новое английское название:', draft.nameEn) || draft.nameEn;
    registry.renameProfile(selectedProfileId, en, ru); saveAttentionProfileRegistry(registry); draft = registry.getProfile(selectedProfileId); renderAttentionProfiles(panel); return;
  }
  if (action === 'delete') {
    if (draft.builtIn || !window.confirm(`Удалить профиль «${draft.nameRu}»?`)) return;
    registry.deleteProfile(selectedProfileId); selectedProfileId = 'balanced'; saveAttentionProfileRegistry(registry); draft = registry.getProfile(selectedProfileId); renderAttentionProfiles(panel); return;
  }
  if (action === 'export') { download('real-wargame-attention-profiles.json', registry.exportJson()); return; }
  if (action === 'import') panel.querySelector<HTMLInputElement>('[data-attention-import]')?.click();
}

async function importRegistry(panel: HTMLElement, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = ''; if (!file) return;
  try {
    registry = AttentionProfileRegistry.importJson(await file.text());
    selectedProfileId = registry.hasProfile(selectedProfileId) ? selectedProfileId : 'balanced';
    saveAttentionProfileRegistry(registry); draft = registry.getProfile(selectedProfileId); renderAttentionProfiles(panel);
  } catch (error) { window.alert(`Не удалось импортировать профили: ${error instanceof Error ? error.message : String(error)}`); }
}

function profileButton(profile: AttentionProfile): string {
  return `<button type="button" data-attention-profile-id="${attr(profile.id)}" class="${profile.id === selectedProfileId ? 'active' : ''}"><strong>${html(profile.nameRu)}</strong><span>${html(profile.id)}${profile.builtIn ? ' · встроенный' : ' · пользовательский'}</span></button>`;
}
function modeFields(mode: AttentionMode): string[] {
  return [
    numberField(`profiles.${mode}.focusAngleDegrees`, 'Угол фокуса', 'Центральная область наиболее внимательного наблюдения.', 1, 180, 1, '°'),
    numberField(`profiles.${mode}.directAngleDegrees`, 'Прямое внимание', 'Широкая область перед бойцом.', 1, 360, 1, '°'),
    numberField(`profiles.${mode}.focusWeight`, 'Сила фокуса', 'Множитель накопления признаков в центре.', 0, 2, 0.05, '×'),
    numberField(`profiles.${mode}.directWeight`, 'Сила прямого внимания', 'Множитель в широком переднем секторе.', 0, 2, 0.05, '×'),
    numberField(`profiles.${mode}.peripheralWeight`, 'Периферия и тыл', 'Слабое вероятностное внимание вне прямого сектора.', 0, 1, 0.02, '×'),
    numberField(`profiles.${mode}.focusCheckIntervalSeconds`, 'Проверка фокуса', 'Интервал расчёта центральной области.', 0.05, 5, 0.05, 'с'),
    numberField(`profiles.${mode}.directCheckIntervalSeconds`, 'Проверка прямого сектора', 'Интервал расчёта широкой передней области.', 0.05, 5, 0.05, 'с'),
    numberField(`profiles.${mode}.peripheralCheckIntervalSeconds`, 'Проверка периферии', 'Интервал вероятностной проверки боков.', 0.05, 10, 0.05, 'с'),
    numberField(`profiles.${mode}.rearCheckIntervalSeconds`, 'Проверка тыла', 'Как часто учитываются очевидные события сзади.', 0.25, 60, 0.25, 'с'),
    numberField(`profiles.${mode}.defaultSearchArcDegrees`, 'Сектор поиска', 'Стандартная ширина назначенного сектора поиска.', 1, 360, 1, '°'),
  ];
}
function numberField(path: string, label: string, help: string, min: number, max: number, step: number, unit: string): string {
  const value = Number(getPath(draft.settings, path));
  return `<article class="navigation-profile-field"><div class="navigation-profile-field-title"><strong>${label}</strong><span>${unit}</span></div><p>${help}</p><div class="navigation-profile-field-control"><input type="range" data-attention-number="${attr(path)}" min="${min}" max="${max}" step="${step}" value="${value}"/><input type="number" data-attention-number="${attr(path)}" min="${min}" max="${max}" step="${step}" value="${value}"/></div></article>`;
}
function textField(path: string, label: string, value: string): string { return `<label><span>${label}</span><input data-attention-text="${path}" value="${attr(value)}"/></label>`; }
function textArea(path: string, label: string, value: string): string { return `<label><span>${label}</span><textarea data-attention-text="${path}" rows="2">${html(value)}</textarea></label>`; }
function setDraftPath(path: string, value: unknown): void {
  const clone = structuredClone(draft) as unknown as Record<string, unknown>;
  const rootPath = path.startsWith('profiles.') || path.startsWith('vision.') ? ['settings', ...path.split('.')] : path.split('.');
  let target = clone;
  for (const part of rootPath.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[rootPath[rootPath.length - 1]] = value;
  draft = clone as unknown as AttentionProfile;
}
function getPath(settings: UnitAttentionSettings, path: string): unknown { return path.split('.').reduce<unknown>((value, part) => typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined, settings); }
function download(name: string, content: string): void { const blob = new Blob([content], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function slugify(value: string): string { return value.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '').replace(/[а-яё]/gi, '') || `attention_${Date.now().toString(36)}`; }
function html(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char)); }
function attr(value: string): string { return html(value); }
