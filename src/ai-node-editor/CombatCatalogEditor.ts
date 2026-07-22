import { registerAiEditorSection } from './AiEditorSectionRegistry';
import {
  COMBAT_CATALOG_ID_PATTERN,
  COMBAT_CATALOG_STORAGE_KEY,
  CombatCatalogImportError,
  CombatCatalogRegistry,
  CombatCatalogStorageAdapter,
  CombatCatalogValidationError,
  validateCombatCatalogBundle,
  type AmmoDefinitionV1,
  type CatalogValidationIssue,
  type CombatCatalogBundleV1,
  type CombatCatalogKeyValueStorage,
  type DefinitionRef,
  type FireMode,
  type LoadoutTemplateV1,
  type ReloadStageDefinitionV1,
  type WeaponClass,
  type WeaponDefinitionV1,
  type WeaponProficiency,
} from '../core/infantry-combat/catalogs';
import {
  AMMO_NUMERIC_GROUPS,
  FIRE_MODES,
  LOADOUT_ROLES,
  PROFICIENCIES,
  RELOAD_STAGE_KINDS,
  WEAPON_CLASSES,
  WEAPON_NUMERIC_GROUPS,
  createAmmoDraftTemplate,
  createLoadoutDraftTemplate,
  createWeaponDraftTemplate,
  type CombatCatalogNumericFieldDefinition,
} from './CombatCatalogEditorSchema';

type CatalogKind = 'ammo' | 'weapon' | 'loadout';
type CatalogEntry = AmmoDefinitionV1 | WeaponDefinitionV1 | LoadoutTemplateV1;
type DraftOrigin = 'saved' | 'new-entry' | 'new-revision';

interface CatalogSelection {
  readonly kind: CatalogKind;
  readonly definitionId: string;
  readonly revision: number;
}

interface PreparedDraft {
  readonly entry: CatalogEntry;
  readonly bundle: CombatCatalogBundleV1;
  readonly issues: readonly CatalogValidationIssue[];
}

const EXPORT_FILE_NAME = 'real-wargame-combat-catalog-v1.json';
const installedPanels = new WeakSet<HTMLElement>();
const storage = new CombatCatalogStorageAdapter(resolveBrowserStorage());
const initialLoad = storage.load();

let registry = initialLoad.registry;
let loadError = initialLoad.error;
let activeKind: CatalogKind = 'ammo';
let includeArchived = false;
let selection: CatalogSelection | null = null;
let returnSelection: CatalogSelection | null = null;
let draft: CatalogEntry | null = null;
let draftOrigin: DraftOrigin = 'saved';
let dirty = false;
let currentIssues: readonly CatalogValidationIssue[] = initialLoad.error?.issues ?? [];
let message = initialLoad.error?.messageRu ?? 'Каталоги готовы к редактированию.';
let activePanel: HTMLElement | null = null;

registerAiEditorSection({
  id: 'combatCatalogs',
  labelRu: 'Вооружение',
  order: 35,
  render: renderCombatCatalogEditor,
  beforeLeave: requestCombatCatalogEditorLeave,
  onDeactivate: () => { activePanel = null; },
});

function renderCombatCatalogEditor(panel: HTMLElement): void {
  activePanel = panel;
  panel.dataset.combatCatalogWorkbench = 'true';
  if (!installedPanels.has(panel)) {
    installedPanels.add(panel);
    panel.addEventListener('click', handlePanelClick);
    panel.addEventListener('input', handlePanelInput);
    panel.addEventListener('change', handlePanelChange);
  }
  ensureSelection();
  render();
}

function requestCombatCatalogEditorLeave(): boolean {
  if (!dirty) return true;
  if (!window.confirm('Отменить несохранённые изменения каталога и покинуть раздел?')) return false;
  cancelDraft(false);
  return true;
}

function render(): void {
  const panel = activePanel;
  if (!panel) return;
  ensureSelection();
  panel.innerHTML = `
    <div class="combat-catalog-editor" data-combat-catalog-editor>
      <header class="combat-catalog-toolbar">
        <div>
          <span class="combat-catalog-kicker">Статичные данные проекта · bundle revision ${registry.toData().revision}</span>
          <h1>Вооружение</h1>
          <p>Боеприпасы, оружие и шаблоны снаряжения. Эти данные не являются нодами поведения.</p>
        </div>
        <div class="combat-catalog-global-actions">
          <button type="button" data-combat-action="import">Импорт</button>
          <button type="button" data-combat-action="export">Экспорт</button>
          <button type="button" data-combat-action="reset" class="danger">Сбросить каталоги</button>
          <input type="file" accept="application/json,.json" data-combat-import hidden />
        </div>
      </header>
      <div class="combat-catalog-subtabs" role="tablist" aria-label="Каталоги вооружения">
        ${subtab('ammo', 'Боеприпасы')}
        ${subtab('weapon', 'Оружие')}
        ${subtab('loadout', 'Комплекты снаряжения')}
        <label class="combat-catalog-archived-toggle">
          <input type="checkbox" data-combat-show-archived ${includeArchived ? 'checked' : ''} />
          <span>Показывать архивные ревизии</span>
        </label>
      </div>
      ${loadError ? `<div class="combat-catalog-alert warning"><strong>${escapeHtml(loadError.code)}</strong><span>${escapeHtml(loadError.messageRu)}</span><small>Исходная запись сохранена под ключом <code>${escapeHtml(COMBAT_CATALOG_STORAGE_KEY)}</code> и изменится только после явного сохранения, импорта или сброса.</small></div>` : ''}
      <div class="combat-catalog-layout">
        ${renderEntryList()}
        <main class="combat-catalog-form-panel">
          ${renderEntryForm()}
          ${renderValidationIssues()}
          <p class="combat-catalog-message" data-combat-message>${escapeHtml(message)}</p>
        </main>
      </div>
    </div>
  `;
  applyValidationHighlights(panel);
}

function subtab(kind: CatalogKind, label: string): string {
  return `<button type="button" role="tab" data-combat-kind="${kind}" aria-selected="${kind === activeKind}" class="${kind === activeKind ? 'active' : ''}">${label}</button>`;
}

function renderEntryList(): string {
  const entries = listEntries(activeKind);
  return `
    <aside class="combat-catalog-list-panel">
      <div class="combat-catalog-list-heading">
        <div><h2>${kindLabel(activeKind)}</h2><p>Stable ID и точные ревизии.</p></div>
        <span>${entries.length}</span>
      </div>
      <div class="combat-catalog-entry-list">
        ${entries.map((entry) => entryButton(activeKind, entry)).join('') || '<p class="combat-catalog-empty">Нет записей.</p>'}
      </div>
      <button type="button" data-combat-action="new" class="primary combat-catalog-new-button">Создать новую запись</button>
    </aside>
  `;
}

function entryButton(kind: CatalogKind, entry: CatalogEntry): string {
  const id = entryId(kind, entry);
  const selected = selection?.kind === kind && selection.definitionId === id && selection.revision === entry.revision;
  return `
    <button type="button" class="combat-catalog-entry ${selected ? 'active' : ''}" data-combat-entry-kind="${kind}" data-combat-entry-id="${escapeAttribute(id)}" data-combat-entry-revision="${entry.revision}">
      <span><strong>${escapeHtml(entry.nameRu)}</strong>${statusBadge(entry.status)}</span>
      <small>${escapeHtml(id)} · r${entry.revision}</small>
    </button>
  `;
}

function renderEntryForm(): string {
  if (!draft) return '<section class="combat-catalog-empty-form"><h2>Нет выбранной записи</h2></section>';
  const readOnly = draft.status !== 'draft';
  const id = entryId(activeKind, draft);
  return `
    <header class="combat-catalog-form-header">
      <div>
        <span>${statusBadge(draft.status)} · revision ${draft.revision} · schema v${draft.schemaVersion}</span>
        <h2>${escapeHtml(draft.nameRu)}</h2>
        <p><code>${escapeHtml(id)}</code>${dirty ? ' · есть несохранённые изменения' : ''}</p>
      </div>
      <div class="combat-catalog-form-actions">
        ${readOnly ? `
          <button type="button" data-combat-action="create-revision">Создать черновик новой ревизии</button>
          ${draft.status === 'published' ? '<button type="button" data-combat-action="archive" class="danger">Архивировать</button>' : ''}
        ` : `
          <button type="button" data-combat-action="validate">Проверить</button>
          <button type="button" data-combat-action="cancel">Отменить изменения</button>
          <button type="button" data-combat-action="save">Сохранить</button>
          <button type="button" data-combat-action="publish" class="primary">Опубликовать</button>
        `}
      </div>
    </header>
    <section class="combat-catalog-group">
      <h3>Идентификация</h3>
      <div class="combat-catalog-field-grid identity">
        ${identityField(id, readOnly)}
        ${textField('nameRu', 'Название по-русски', draft.nameRu, readOnly)}
        ${textField('nameEn', 'Название по-английски', draft.nameEn, readOnly)}
        ${readOnlyField('schemaVersion', 'Версия схемы', String(draft.schemaVersion))}
        ${readOnlyField('revision', 'Ревизия', String(draft.revision))}
        ${readOnlyField('status', 'Статус', draft.status)}
      </div>
    </section>
    ${activeKind === 'ammo' ? renderAmmoForm(draft as AmmoDefinitionV1, readOnly) : ''}
    ${activeKind === 'weapon' ? renderWeaponForm(draft as WeaponDefinitionV1, readOnly) : ''}
    ${activeKind === 'loadout' ? renderLoadoutForm(draft as LoadoutTemplateV1, readOnly) : ''}
  `;
}

function identityField(value: string, readOnly: boolean): string {
  const path = idField(activeKind);
  const disabled = readOnly || draftOrigin !== 'new-entry';
  return fieldWrap(path, 'Stable ID', 'Вводится явно. После первого сохранения не изменяется.', `
    <input type="text" data-combat-path="${path}" data-combat-value-type="text" value="${escapeAttribute(value)}" ${disabled ? 'disabled' : ''} pattern="[a-z][a-z0-9_]{2,63}" />
  `);
}

function renderAmmoForm(entry: AmmoDefinitionV1, readOnly: boolean): string {
  return `
    ${AMMO_NUMERIC_GROUPS.map((group) => numericGroup(group.titleRu, group.fields, readOnly)).join('')}
    <section class="combat-catalog-group">
      <h3>Трассер</h3>
      <div class="combat-catalog-field-grid">
        ${booleanField('tracer', 'Трассирующий боеприпас', 'Включает визуальный профиль трассера.', entry.tracer, readOnly)}
        ${fieldWrap('tracerVisualProfileId', 'Визуальный профиль трассера', 'Пустое значение хранится как null.', `
          <input type="text" data-combat-path="tracerVisualProfileId" data-combat-value-type="text" data-combat-nullable value="${escapeAttribute(entry.tracerVisualProfileId ?? '')}" ${readOnly ? 'disabled' : ''} />
        `)}
      </div>
    </section>
  `;
}

function renderWeaponForm(entry: WeaponDefinitionV1, readOnly: boolean): string {
  return `
    <section class="combat-catalog-group">
      <h3>Класс, боеприпас и режимы</h3>
      <div class="combat-catalog-field-grid">
        ${selectField('weaponClass', 'Класс оружия', 'Владение задаётся по классу, а не по модели.', WEAPON_CLASSES, entry.weaponClass, readOnly)}
        ${fieldWrap('ammo', 'Точная ревизия боеприпаса', 'Сохраняются stable ID и revision.', `
          <select data-combat-exact-ref="ammo" ${readOnly ? 'disabled' : ''}>
            ${ammoReferenceOptions(entry.ammo)}
          </select>
        `)}
        ${booleanField('allowFireWhileMoving', 'Огонь в движении', 'Разрешает физическому оружию стрелять во время перемещения.', entry.allowFireWhileMoving, readOnly)}
      </div>
      <div class="combat-catalog-choice-grid">
        ${FIRE_MODES.map((mode) => `
          <label class="combat-catalog-choice ${fieldErrorClass('availableFireModes')}">
            <input type="checkbox" data-combat-fire-mode="${mode.value}" ${entry.availableFireModes.includes(mode.value) ? 'checked' : ''} ${readOnly ? 'disabled' : ''} />
            <span>${escapeHtml(mode.labelRu)}<small>${mode.value}</small></span>
          </label>
        `).join('')}
      </div>
    </section>
    ${WEAPON_NUMERIC_GROUPS.map((group) => numericGroup(group.titleRu, group.fields, readOnly)).join('')}
    ${renderReloadStages(entry, readOnly)}
  `;
}

function renderReloadStages(entry: WeaponDefinitionV1, readOnly: boolean): string {
  return `
    <section class="combat-catalog-group ${fieldErrorClass('reloadStages')}">
      <div class="combat-catalog-group-heading">
        <div><h3>Этапы перезарядки</h3><p>Порядок является частью физического действия. Правила проверяет Stage 1A.</p></div>
        ${readOnly ? '' : '<button type="button" data-combat-reload-action="add-reload-stage">Добавить этап</button>'}
      </div>
      <div class="combat-catalog-reload-list">
        ${entry.reloadStages.map((stage, index) => renderReloadStage(stage, index, readOnly)).join('')}
      </div>
    </section>
  `;
}

function renderReloadStage(stage: ReloadStageDefinitionV1, index: number, readOnly: boolean): string {
  const path = `reloadStages[${index}]`;
  return `
    <article class="combat-catalog-reload-stage ${fieldErrorClass(path)}">
      <header><strong>Этап ${index + 1}</strong><code>${escapeHtml(stage.stageId)}</code></header>
      <div class="combat-catalog-field-grid reload">
        ${fieldWrap(`${path}.stageId`, 'Stage ID', 'Уникальный ID этапа.', `<input type="text" data-combat-reload-index="${index}" data-combat-reload-field="stageId" value="${escapeAttribute(stage.stageId)}" ${readOnly ? 'disabled' : ''} />`)}
        ${fieldWrap(`${path}.kind`, 'Вид этапа', 'open, load или close.', `<select data-combat-reload-index="${index}" data-combat-reload-field="kind" ${readOnly ? 'disabled' : ''}>${options(RELOAD_STAGE_KINDS, stage.kind)}</select>`)}
        ${fieldWrap(`${path}.durationSeconds`, 'Длительность', 'Время этапа в секундах.', `<input type="number" min="0.01" max="120" step="0.01" data-combat-reload-index="${index}" data-combat-reload-field="durationSeconds" value="${stage.durationSeconds}" ${readOnly ? 'disabled' : ''} />`)}
        ${reloadBoolean(index, 'interruptible', 'Можно прервать', stage.interruptible, readOnly)}
        ${reloadBoolean(index, 'movementAllowed', 'Движение разрешено', stage.movementAllowed, readOnly)}
        ${reloadBoolean(index, 'loadedRoundsAppliedAtCompletion', 'Применить патроны', stage.loadedRoundsAppliedAtCompletion, readOnly)}
      </div>
      ${readOnly ? '' : `
        <footer>
          <button type="button" data-combat-reload-action="move-reload-stage-up" data-combat-reload-index="${index}" ${index === 0 ? 'disabled' : ''}>Поднять</button>
          <button type="button" data-combat-reload-action="move-reload-stage-down" data-combat-reload-index="${index}" ${index === (draft as WeaponDefinitionV1).reloadStages.length - 1 ? 'disabled' : ''}>Опустить</button>
          <button type="button" data-combat-reload-action="remove-reload-stage" data-combat-reload-index="${index}" class="danger">Удалить</button>
        </footer>
      `}
    </article>
  `;
}

function renderLoadoutForm(entry: LoadoutTemplateV1, readOnly: boolean): string {
  return `
    <section class="combat-catalog-group">
      <h3>Роль и оружие</h3>
      <div class="combat-catalog-field-grid">
        ${selectField('role', 'Роль', 'Роль комплекта в отделении.', LOADOUT_ROLES, entry.role, readOnly)}
        ${fieldWrap('primary.definition', 'Основное оружие', 'Обязательная точная ревизия оружия.', `
          <select data-combat-exact-ref="primary" ${readOnly ? 'disabled' : ''}>${weaponReferenceOptions(entry.primary.definition)}</select>
        `)}
        ${numberInput('primary.loadedRounds', 'Основное: загружено', 'Начальное число патронов в основном оружии.', entry.primary.loadedRounds, 0, 1000, 1, readOnly, true)}
        ${booleanToggle('secondary', 'Дополнительное оружие', 'Включается явным переключателем.', entry.secondary !== null, readOnly, 'data-combat-secondary-toggle')}
        ${entry.secondary ? `
          ${fieldWrap('secondary.definition', 'Дополнительное оружие', 'Точная ревизия дополнительного оружия.', `<select data-combat-exact-ref="secondary" ${readOnly ? 'disabled' : ''}>${weaponReferenceOptions(entry.secondary.definition)}</select>`)}
          ${numberInput('secondary.loadedRounds', 'Дополнительное: загружено', 'Начальное число патронов в дополнительном оружии.', entry.secondary.loadedRounds, 0, 1000, 1, readOnly, true)}
        ` : ''}
        ${numberInput('firstAidCharges', 'Заряды первой помощи', 'Абстрактное число доступных применений первой помощи.', entry.firstAidCharges, 0, 100, 1, readOnly, true)}
      </div>
    </section>
    ${renderReserveTable(entry, readOnly)}
    ${renderProficiency(entry, readOnly)}
  `;
}

function renderReserveTable(entry: LoadoutTemplateV1, readOnly: boolean): string {
  const ammoIds = [...new Set([
    ...Object.keys(entry.reserveRoundsByAmmoDefinitionId),
    ...Object.keys(entry.maximumReserveRoundsByAmmoDefinitionId),
  ])].sort();
  const availableToAdd = uniqueAmmoIds().filter((id) => !ammoIds.includes(id));
  return `
    <section class="combat-catalog-group ${fieldErrorClass('reserveRoundsByAmmoDefinitionId')}">
      <div class="combat-catalog-group-heading">
        <div><h3>Резерв боеприпасов</h3><p>Агрегированные патроны по stable ID, без физических магазинов.</p></div>
        ${readOnly || availableToAdd.length === 0 ? '' : `
          <div class="combat-catalog-reserve-add">
            <select data-combat-reserve-add>${availableToAdd.map((id) => `<option value="${escapeAttribute(id)}">${escapeHtml(ammoName(id))} · ${escapeHtml(id)}</option>`).join('')}</select>
            <button type="button" data-combat-reserve-action="add">Добавить боеприпас</button>
          </div>
        `}
      </div>
      <div class="combat-catalog-reserve-table" role="table">
        <div class="combat-catalog-reserve-row heading" role="row"><span>Ammo ID</span><span>Начальный</span><span>Максимальный</span><span></span></div>
        ${ammoIds.map((ammoId) => `
          <div class="combat-catalog-reserve-row" role="row">
            <span><strong>${escapeHtml(ammoName(ammoId))}</strong><code>${escapeHtml(ammoId)}</code></span>
            <input type="number" min="0" max="100000" step="1" data-combat-reserve-ammo="${escapeAttribute(ammoId)}" data-combat-reserve-kind="initial" value="${entry.reserveRoundsByAmmoDefinitionId[ammoId] ?? 0}" ${readOnly ? 'disabled' : ''} />
            <input type="number" min="0" max="100000" step="1" data-combat-reserve-ammo="${escapeAttribute(ammoId)}" data-combat-reserve-kind="maximum" value="${entry.maximumReserveRoundsByAmmoDefinitionId[ammoId] ?? 0}" ${readOnly ? 'disabled' : ''} />
            ${readOnly ? '<span></span>' : `<button type="button" class="danger" data-combat-reserve-action="remove" data-combat-reserve-ammo="${escapeAttribute(ammoId)}">Удалить</button>`}
          </div>
        `).join('') || '<p class="combat-catalog-empty">Резерв не задан.</p>'}
      </div>
    </section>
  `;
}

function renderProficiency(entry: LoadoutTemplateV1, readOnly: boolean): string {
  return `
    <section class="combat-catalog-group">
      <h3>Владение классами оружия</h3>
      <div class="combat-catalog-field-grid">
        ${WEAPON_CLASSES.map((weaponClass) => fieldWrap(
          `proficiencyByWeaponClass.${weaponClass.value}`,
          weaponClass.labelRu,
          'Уровень владения этим классом оружия.',
          `<select data-combat-proficiency="${weaponClass.value}" ${readOnly ? 'disabled' : ''}>${options(PROFICIENCIES, entry.proficiencyByWeaponClass[weaponClass.value])}</select>`,
        )).join('')}
      </div>
    </section>
  `;
}

function numericGroup(title: string, fields: readonly CombatCatalogNumericFieldDefinition[], readOnly: boolean): string {
  return `<section class="combat-catalog-group"><h3>${escapeHtml(title)}</h3><div class="combat-catalog-field-grid">${fields.map((field) => numericField(field, readOnly)).join('')}</div></section>`;
}

function numericField(field: CombatCatalogNumericFieldDefinition, readOnly: boolean): string {
  const value = Number(readPath(draft, field.path));
  return numberInput(field.path, field.labelRu, `${field.helpRu} Единица: ${field.unitRu}.`, value, field.min, field.max, field.step, readOnly, field.integer === true);
}

function numberInput(path: string, label: string, help: string, value: number, min: number, max: number, step: number, readOnly: boolean, integerValue: boolean): string {
  return fieldWrap(path, label, help, `<input type="number" min="${min}" max="${max}" step="${step}" data-combat-path="${escapeAttribute(path)}" data-combat-value-type="${integerValue ? 'integer' : 'number'}" value="${Number.isFinite(value) ? value : ''}" ${readOnly ? 'disabled' : ''} />`);
}

function textField(path: string, label: string, value: string, readOnly: boolean): string {
  return fieldWrap(path, label, '', `<input type="text" data-combat-path="${path}" data-combat-value-type="text" value="${escapeAttribute(value)}" ${readOnly ? 'disabled' : ''} />`);
}

function readOnlyField(path: string, label: string, value: string): string {
  return fieldWrap(path, label, 'Управляется реестром и не редактируется вручную.', `<input type="text" value="${escapeAttribute(value)}" disabled />`);
}

function booleanField(path: string, label: string, help: string, checked: boolean, readOnly: boolean): string {
  return booleanToggle(path, label, help, checked, readOnly, `data-combat-path="${path}" data-combat-value-type="boolean"`);
}

function booleanToggle(path: string, label: string, help: string, checked: boolean, readOnly: boolean, attributes: string): string {
  return fieldWrap(path, label, help, `<label class="combat-catalog-toggle"><input type="checkbox" ${attributes} ${checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''} /><span></span></label>`);
}

function selectField<T extends string>(path: string, label: string, help: string, values: readonly { value: T; labelRu: string }[], selected: T, readOnly: boolean): string {
  return fieldWrap(path, label, help, `<select data-combat-path="${path}" data-combat-value-type="text" ${readOnly ? 'disabled' : ''}>${options(values, selected)}</select>`);
}

function fieldWrap(path: string, label: string, help: string, control: string): string {
  return `<label class="combat-catalog-field ${fieldErrorClass(path)}" data-combat-field-path="${escapeAttribute(path)}"><span>${escapeHtml(label)}</span>${help ? `<small>${escapeHtml(help)}</small>` : ''}${control}</label>`;
}

function reloadBoolean(index: number, field: keyof ReloadStageDefinitionV1, label: string, checked: boolean, readOnly: boolean): string {
  return fieldWrap(`reloadStages[${index}].${field}`, label, '', `<label class="combat-catalog-toggle"><input type="checkbox" data-combat-reload-index="${index}" data-combat-reload-field="${field}" ${checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''} /><span></span></label>`);
}

function renderValidationIssues(): string {
  const issues = currentIssues;
  return `
    <section class="combat-catalog-validation ${issues.length ? 'has-issues' : ''}">
      <div><h3>Проверка данных</h3><span>${issues.length ? `${issues.length} проблем` : 'Ошибок не показано'}</span></div>
      ${issues.length ? `<ol>${issues.map((issue) => `
        <li class="${issue.severity}">
          <strong>${escapeHtml(issue.severity)}</strong>
          <code>${escapeHtml(issue.path)}</code>
          <span>${escapeHtml(issue.code)}</span>
          <p>${escapeHtml(issue.messageRu)}</p>
        </li>
      `).join('')}</ol>` : '<p>Нажмите «Проверить» или сохраните черновик.</p>'}
    </section>
  `;
}

function handlePanelClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-combat-catalog-editor]')) return;

  const kindButton = target.closest<HTMLButtonElement>('[data-combat-kind]');
  if (kindButton) {
    const nextKind = kindButton.dataset.combatKind as CatalogKind;
    if (nextKind !== activeKind && requestDiscardWithinEditor()) {
      activeKind = nextKind;
      selection = null;
      draft = null;
      currentIssues = [];
      message = `Открыт раздел «${kindLabel(nextKind)}».`;
      render();
    }
    return;
  }

  const entryButtonElement = target.closest<HTMLButtonElement>('[data-combat-entry-id]');
  if (entryButtonElement) {
    if (!requestDiscardWithinEditor()) return;
    const kind = entryButtonElement.dataset.combatEntryKind as CatalogKind;
    const definitionId = entryButtonElement.dataset.combatEntryId;
    const revision = Number(entryButtonElement.dataset.combatEntryRevision);
    if (!definitionId || !Number.isInteger(revision)) return;
    selectEntry({ kind, definitionId, revision });
    render();
    return;
  }

  const actionButton = target.closest<HTMLButtonElement>('[data-combat-action]');
  if (actionButton) {
    void handleAction(actionButton.dataset.combatAction ?? '');
    return;
  }

  const reloadButton = target.closest<HTMLButtonElement>('[data-combat-reload-action]');
  if (reloadButton) {
    handleReloadAction(reloadButton.dataset.combatReloadAction ?? '', Number(reloadButton.dataset.combatReloadIndex));
    return;
  }

  const reserveButton = target.closest<HTMLButtonElement>('[data-combat-reserve-action]');
  if (reserveButton) {
    handleReserveAction(reserveButton.dataset.combatReserveAction ?? '', reserveButton.dataset.combatReserveAmmo ?? null);
  }
}

function handlePanelInput(event: Event): void {
  const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement
    ? event.target
    : null;
  if (!input || !input.closest('[data-combat-catalog-editor]') || !draft || draft.status !== 'draft') return;

  const fireMode = input instanceof HTMLInputElement ? input.dataset.combatFireMode as FireMode | undefined : undefined;
  if (fireMode && input instanceof HTMLInputElement) {
    const weapon = draft as WeaponDefinitionV1;
    weapon.availableFireModes = input.checked
      ? [...new Set([...weapon.availableFireModes, fireMode])]
      : weapon.availableFireModes.filter((mode) => mode !== fireMode);
    markDirty();
    return;
  }

  const reloadIndex = Number(input.dataset.combatReloadIndex);
  const reloadField = input.dataset.combatReloadField as keyof ReloadStageDefinitionV1 | undefined;
  if (Number.isInteger(reloadIndex) && reloadField && activeKind === 'weapon') {
    const stage = (draft as WeaponDefinitionV1).reloadStages[reloadIndex];
    if (!stage) return;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      (stage as unknown as Record<string, unknown>)[reloadField] = input.checked;
    } else if (reloadField === 'durationSeconds') {
      stage.durationSeconds = finiteNumber(input.value, stage.durationSeconds);
    } else {
      (stage as unknown as Record<string, unknown>)[reloadField] = input.value;
    }
    markDirty();
    return;
  }

  const reserveAmmo = input.dataset.combatReserveAmmo;
  const reserveKind = input.dataset.combatReserveKind;
  if (reserveAmmo && reserveKind && activeKind === 'loadout') {
    const loadout = draft as LoadoutTemplateV1;
    const value = Math.max(0, Math.trunc(finiteNumber(input.value, 0)));
    if (reserveKind === 'initial') loadout.reserveRoundsByAmmoDefinitionId[reserveAmmo] = value;
    else loadout.maximumReserveRoundsByAmmoDefinitionId[reserveAmmo] = value;
    markDirty();
    return;
  }

  const proficiencyClass = input.dataset.combatProficiency as WeaponClass | undefined;
  if (proficiencyClass && activeKind === 'loadout') {
    (draft as LoadoutTemplateV1).proficiencyByWeaponClass[proficiencyClass] = input.value as WeaponProficiency;
    markDirty();
    return;
  }

  const path = input.dataset.combatPath;
  if (!path) return;
  let value: unknown = input.value;
  if (input instanceof HTMLInputElement && input.type === 'checkbox') value = input.checked;
  else if (input.dataset.combatValueType === 'number') value = finiteNumber(input.value, Number(readPath(draft, path)));
  else if (input.dataset.combatValueType === 'integer') value = Math.trunc(finiteNumber(input.value, Number(readPath(draft, path))));
  else if (input.dataset.combatNullable !== undefined && input.value.trim() === '') value = null;
  writePath(draft, path, value);
  markDirty();
}

function handlePanelChange(event: Event): void {
  const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target : null;
  if (!input || !input.closest('[data-combat-catalog-editor]')) return;

  if (input.matches('[data-combat-show-archived]')) {
    includeArchived = (input as HTMLInputElement).checked;
    ensureSelection(true);
    render();
    return;
  }

  if (input.matches('[data-combat-import]')) {
    void importBundle(input as HTMLInputElement);
    return;
  }

  if (!draft || draft.status !== 'draft') return;
  const exactRef = input.dataset.combatExactRef;
  if (exactRef) {
    const ref = parseReference(input.value);
    if (!ref) return;
    if (exactRef === 'ammo' && activeKind === 'weapon') (draft as WeaponDefinitionV1).ammo = ref;
    else if (exactRef === 'primary' && activeKind === 'loadout') (draft as LoadoutTemplateV1).primary.definition = ref;
    else if (exactRef === 'secondary' && activeKind === 'loadout' && (draft as LoadoutTemplateV1).secondary) {
      (draft as LoadoutTemplateV1).secondary!.definition = ref;
    }
    markDirty();
    return;
  }

  if (input.matches('[data-combat-secondary-toggle]') && activeKind === 'loadout') {
    const loadout = draft as LoadoutTemplateV1;
    if ((input as HTMLInputElement).checked) {
      const weapon = listWeaponReferences()[0];
      if (!weapon) {
        message = 'Нельзя добавить дополнительное оружие: каталог оружия пуст.';
      } else {
        loadout.secondary = { definition: refOfWeapon(weapon), loadedRounds: 0 };
        markDirty();
      }
    } else {
      loadout.secondary = null;
      markDirty();
    }
    render();
  }
}

async function handleAction(action: string): Promise<void> {
  if (action === 'new') {
    createNewEntry();
    return;
  }
  if (action === 'create-revision') {
    createRevisionDraft();
    return;
  }
  if (action === 'cancel') {
    cancelDraft(true);
    return;
  }
  if (action === 'validate') {
    validateCurrentDraft();
    render();
    return;
  }
  if (action === 'save') {
    saveCurrentDraft();
    return;
  }
  if (action === 'publish') {
    publishCurrentDraft();
    return;
  }
  if (action === 'archive') {
    archiveCurrentRevision();
    return;
  }
  if (action === 'export') {
    downloadJson(EXPORT_FILE_NAME, storage.exportJson());
    message = `Экспортирован полный bundle: ${EXPORT_FILE_NAME}`;
    render();
    return;
  }
  if (action === 'import') {
    activePanel?.querySelector<HTMLInputElement>('[data-combat-import]')?.click();
    return;
  }
  if (action === 'reset') {
    if (!window.confirm('Сбросить все каталоги к стандартным данным Stage 1A? Это заменит сохранённый bundle.')) return;
    try {
      registry = storage.reset();
      loadError = null;
      resetEditorState();
      message = 'Каталоги явно сброшены к стандартным значениям Stage 1A.';
    } catch (error) {
      showError('Не удалось сбросить каталоги.', error);
    }
    render();
  }
}

function createNewEntry(): void {
  if (!requestDiscardWithinEditor()) return;
  const requestedId = window.prompt('Введите stable ID новой записи. Допустимы строчные латинские буквы, цифры и подчёркивания:', defaultIdPrefix(activeKind));
  if (requestedId === null) return;
  const definitionId = requestedId.trim();
  if (!COMBAT_CATALOG_ID_PATTERN.test(definitionId)) {
    message = 'Stable ID должен соответствовать /^[a-z][a-z0-9_]{2,63}$/.';
    render();
    return;
  }
  if (definitionIdExists(activeKind, definitionId)) {
    message = `ID ${definitionId} уже существует. Для изменения используйте новую ревизию.`;
    render();
    return;
  }

  let created: CatalogEntry | null = null;
  if (activeKind === 'ammo') created = createAmmoDraftTemplate(definitionId);
  if (activeKind === 'weapon') {
    const ammo = listAmmoReferences()[0];
    if (ammo) created = createWeaponDraftTemplate(definitionId, refOfAmmo(ammo));
  }
  if (activeKind === 'loadout') {
    const weapon = listWeaponReferences()[0];
    if (weapon) {
      const ammoId = registry.resolveWeapon(refOfWeapon(weapon)).ammo.definitionId;
      created = createLoadoutDraftTemplate(definitionId, refOfWeapon(weapon), ammoId);
    }
  }
  if (!created) {
    message = 'Сначала создайте и опубликуйте требуемую зависимость каталога.';
    render();
    return;
  }

  returnSelection = selection;
  selection = { kind: activeKind, definitionId, revision: created.revision };
  draft = created;
  draftOrigin = 'new-entry';
  dirty = true;
  currentIssues = [];
  message = 'Новая запись создана локально. Проверьте и сохраните черновик.';
  render();
}

function createRevisionDraft(): void {
  if (!draft || draft.status === 'draft') return;
  const definitionId = entryId(activeKind, draft);
  const existingDraft = listEntries(activeKind, true).find((entry) => entryId(activeKind, entry) === definitionId && entry.status === 'draft');
  if (existingDraft) {
    selectEntry({ kind: activeKind, definitionId, revision: existingDraft.revision });
    message = 'Для этого stable ID уже существует черновик. Открыт существующий черновик.';
    render();
    return;
  }
  returnSelection = selection;
  const nextRevision = nextRevisionFor(activeKind, definitionId);
  draft = { ...clone(draft), revision: nextRevision, status: 'draft' } as CatalogEntry;
  selection = { kind: activeKind, definitionId, revision: nextRevision };
  draftOrigin = 'new-revision';
  dirty = true;
  currentIssues = [];
  message = 'Создан локальный черновик новой ревизии. Номер окончательно определит реестр при сохранении.';
  render();
}

function validateCurrentDraft(): boolean {
  const prepared = prepareDraft();
  if (!prepared) return false;
  currentIssues = prepared.issues;
  if (prepared.issues.length) {
    message = 'Черновик содержит ошибки. Исправьте каждую указанную проблему.';
    return false;
  }
  draft = clone(prepared.entry);
  selection = { kind: activeKind, definitionId: entryId(activeKind, prepared.entry), revision: prepared.entry.revision };
  message = 'Черновик и все точные ссылки прошли полную проверку bundle.';
  return true;
}

function saveCurrentDraft(): void {
  const prepared = prepareDraft();
  if (!prepared || prepared.issues.length) {
    currentIssues = prepared?.issues ?? currentIssues;
    message = 'Сохранение отменено: черновик не прошёл проверку.';
    render();
    return;
  }
  try {
    const candidateRegistry = CombatCatalogRegistry.fromUnknown(registry.toData());
    const saved = saveDraftToRegistry(candidateRegistry, prepared.entry);
    registry = storage.save(candidateRegistry);
    selectEntry({ kind: activeKind, definitionId: entryId(activeKind, saved), revision: saved.revision });
    loadError = null;
    dirty = false;
    draftOrigin = 'saved';
    currentIssues = [];
    message = `Черновик сохранён: ${entryId(activeKind, saved)} · r${saved.revision}.`;
  } catch (error) {
    showError('Не удалось сохранить черновик.', error);
  }
  render();
}

function publishCurrentDraft(): void {
  const prepared = prepareDraft();
  if (!prepared || prepared.issues.length) {
    currentIssues = prepared?.issues ?? currentIssues;
    message = 'Публикация отменена: черновик не прошёл проверку.';
    render();
    return;
  }
  try {
    const candidateRegistry = CombatCatalogRegistry.fromUnknown(registry.toData());
    if (dirty || draftOrigin !== 'saved') saveDraftToRegistry(candidateRegistry, prepared.entry);
    const definitionId = entryId(activeKind, prepared.entry);
    const published = publishDraftInRegistry(candidateRegistry, definitionId);
    registry = storage.save(candidateRegistry);
    selectEntry({ kind: activeKind, definitionId, revision: published.revision });
    loadError = null;
    dirty = false;
    draftOrigin = 'saved';
    currentIssues = [];
    message = `Опубликована immutable-ревизия ${definitionId} · r${published.revision}.`;
  } catch (error) {
    showError('Не удалось опубликовать черновик.', error);
  }
  render();
}

function archiveCurrentRevision(): void {
  if (!draft || draft.status !== 'published') return;
  const definitionId = entryId(activeKind, draft);
  try {
    const candidateRegistry = CombatCatalogRegistry.fromUnknown(registry.toData());
    archiveRevisionInRegistry(candidateRegistry, { definitionId, revision: draft.revision });
    registry = storage.save(candidateRegistry);
    dirty = false;
    currentIssues = [];
    message = `Ревизия ${definitionId} · r${draft.revision} архивирована без физического удаления.`;
    selection = includeArchived ? { kind: activeKind, definitionId, revision: draft.revision } : null;
    draft = null;
    ensureSelection();
  } catch (error) {
    showError('Не удалось архивировать ревизию.', error);
  }
  render();
}

function prepareDraft(): PreparedDraft | null {
  if (!draft || draft.status !== 'draft') return null;
  const bundle = registry.toData();
  bundle.revision += 1;
  const definitionId = entryId(activeKind, draft);
  const revision = existingDraftRevision(bundle, activeKind, definitionId) ?? nextStableRevision(bundle, activeKind, definitionId);
  const entry = { ...clone(draft), schemaVersion: 1, revision, status: 'draft' } as CatalogEntry;
  replaceDraft(bundle, activeKind, entry);
  const validation = validateCombatCatalogBundle(bundle);
  const issues = [...validation.issues];
  if (draftOrigin === 'new-entry' && definitionIdExists(activeKind, definitionId)) {
    issues.push({
      severity: 'error',
      path: `$.${collectionName(activeKind)}[${definitionId}@${revision}].${idField(activeKind)}`,
      code: 'new_entry_id_already_exists',
      messageRu: 'Новая запись должна использовать новый stable ID. Для существующего ID создайте новую ревизию.',
    });
  }
  return { entry, bundle, issues: sortIssues(issues) };
}

async function importBundle(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    registry = storage.importJson(await file.text());
    loadError = null;
    resetEditorState();
    message = 'Полный bundle успешно импортирован, проверен и сохранён.';
  } catch (error) {
    showError('Импорт отклонён. Текущий registry и storage не изменены.', error);
  }
  render();
}

function handleReloadAction(action: string, index: number): void {
  if (!draft || draft.status !== 'draft' || activeKind !== 'weapon') return;
  const stages = (draft as WeaponDefinitionV1).reloadStages;
  if (action === 'add-reload-stage') {
    stages.push({
      stageId: nextReloadStageId(stages),
      kind: 'open',
      durationSeconds: 0.5,
      interruptible: true,
      movementAllowed: false,
      loadedRoundsAppliedAtCompletion: false,
    });
  } else if (action === 'remove-reload-stage' && Number.isInteger(index)) {
    stages.splice(index, 1);
  } else if (action === 'move-reload-stage-up' && index > 0) {
    [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]];
  } else if (action === 'move-reload-stage-down' && index >= 0 && index < stages.length - 1) {
    [stages[index], stages[index + 1]] = [stages[index + 1], stages[index]];
  } else {
    return;
  }
  markDirty();
  render();
}

function handleReserveAction(action: string, ammoId: string | null): void {
  if (!draft || draft.status !== 'draft' || activeKind !== 'loadout') return;
  const loadout = draft as LoadoutTemplateV1;
  if (action === 'add') {
    const selected = activePanel?.querySelector<HTMLSelectElement>('[data-combat-reserve-add]')?.value;
    if (!selected) return;
    loadout.reserveRoundsByAmmoDefinitionId[selected] = 0;
    loadout.maximumReserveRoundsByAmmoDefinitionId[selected] = 0;
  } else if (action === 'remove' && ammoId) {
    delete loadout.reserveRoundsByAmmoDefinitionId[ammoId];
    delete loadout.maximumReserveRoundsByAmmoDefinitionId[ammoId];
  } else {
    return;
  }
  markDirty();
  render();
}

function showError(prefix: string, error: unknown): void {
  currentIssues = error instanceof CombatCatalogValidationError ? error.issues : [];
  const suffix = error instanceof CombatCatalogImportError || error instanceof Error ? error.message : String(error);
  message = `${prefix} ${suffix}`;
}

function ensureSelection(forceVisible = false): void {
  if (draft && !forceVisible) return;
  const entries = listEntries(activeKind);
  const current = selection && selection.kind === activeKind
    ? entries.find((entry) => entryId(activeKind, entry) === selection?.definitionId && entry.revision === selection.revision)
    : null;
  const entry = current ?? entries[0] ?? null;
  if (!entry) {
    selection = null;
    draft = null;
    dirty = false;
    return;
  }
  selectEntry({ kind: activeKind, definitionId: entryId(activeKind, entry), revision: entry.revision });
}

function selectEntry(next: CatalogSelection): void {
  const entry = resolveEntry(next);
  selection = next;
  draft = entry ? clone(entry) : null;
  draftOrigin = 'saved';
  returnSelection = null;
  dirty = false;
  currentIssues = [];
}

function resolveEntry(next: CatalogSelection): CatalogEntry | null {
  try {
    if (next.kind === 'ammo') return registry.resolveAmmo({ definitionId: next.definitionId, revision: next.revision });
    if (next.kind === 'weapon') return registry.resolveWeapon({ definitionId: next.definitionId, revision: next.revision });
    return registry.resolveLoadout({ definitionId: next.definitionId, revision: next.revision });
  } catch {
    return null;
  }
}

function cancelDraft(shouldRender: boolean): void {
  if (draftOrigin === 'saved' && selection) selectEntry(selection);
  else if (returnSelection) selectEntry(returnSelection);
  else {
    draft = null;
    selection = null;
    dirty = false;
    ensureSelection();
  }
  currentIssues = [];
  message = 'Несохранённые изменения отменены.';
  if (shouldRender) render();
}

function requestDiscardWithinEditor(): boolean {
  if (!dirty) return true;
  if (!window.confirm('Отменить несохранённые изменения?')) return false;
  cancelDraft(false);
  return true;
}

function resetEditorState(): void {
  selection = null;
  returnSelection = null;
  draft = null;
  draftOrigin = 'saved';
  dirty = false;
  currentIssues = [];
  ensureSelection();
}

function markDirty(): void {
  dirty = true;
  currentIssues = [];
  message = 'Есть несохранённые изменения.';
  const messageElement = activePanel?.querySelector<HTMLElement>('[data-combat-message]');
  if (messageElement) messageElement.textContent = message;
}

function listEntries(kind: CatalogKind, alwaysIncludeArchived = false): CatalogEntry[] {
  const options = { includeArchived: alwaysIncludeArchived || includeArchived };
  if (kind === 'ammo') return registry.listAmmoDefinitions(options);
  if (kind === 'weapon') return registry.listWeaponDefinitions(options);
  return registry.listLoadoutTemplates(options);
}

function listAmmoReferences(): AmmoDefinitionV1[] {
  return registry.listAmmoDefinitions({ includeArchived: true });
}

function listWeaponReferences(): WeaponDefinitionV1[] {
  return registry.listWeaponDefinitions({ includeArchived: true });
}

function ammoReferenceOptions(selected: DefinitionRef): string {
  return listAmmoReferences().map((entry) => referenceOption(refOfAmmo(entry), selected, `${entry.nameRu} · ${entry.ammoDefinitionId} · r${entry.revision} · ${entry.status}`)).join('');
}

function weaponReferenceOptions(selected: DefinitionRef): string {
  return listWeaponReferences().map((entry) => referenceOption(refOfWeapon(entry), selected, `${entry.nameRu} · ${entry.weaponDefinitionId} · r${entry.revision} · ${entry.status}`)).join('');
}

function referenceOption(ref: DefinitionRef, selected: DefinitionRef, label: string): string {
  return `<option value="${escapeAttribute(referenceValue(ref))}" ${sameRef(ref, selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function refOfAmmo(entry: AmmoDefinitionV1): DefinitionRef {
  return { definitionId: entry.ammoDefinitionId, revision: entry.revision };
}

function refOfWeapon(entry: WeaponDefinitionV1): DefinitionRef {
  return { definitionId: entry.weaponDefinitionId, revision: entry.revision };
}

function parseReference(value: string): DefinitionRef | null {
  const split = value.lastIndexOf('@');
  if (split < 1) return null;
  const revision = Number(value.slice(split + 1));
  return Number.isInteger(revision) && revision >= 1
    ? { definitionId: value.slice(0, split), revision }
    : null;
}

function referenceValue(ref: DefinitionRef): string {
  return `${ref.definitionId}@${ref.revision}`;
}

function sameRef(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.definitionId === right.definitionId && left.revision === right.revision;
}

function saveDraftToRegistry(target: CombatCatalogRegistry, entry: CatalogEntry): CatalogEntry {
  if (activeKind === 'ammo') return target.saveAmmoDraft(entry as AmmoDefinitionV1);
  if (activeKind === 'weapon') return target.saveWeaponDraft(entry as WeaponDefinitionV1);
  return target.saveLoadoutDraft(entry as LoadoutTemplateV1);
}

function publishDraftInRegistry(target: CombatCatalogRegistry, definitionId: string): CatalogEntry {
  if (activeKind === 'ammo') return target.publishAmmoRevision(definitionId);
  if (activeKind === 'weapon') return target.publishWeaponRevision(definitionId);
  return target.publishLoadoutRevision(definitionId);
}

function archiveRevisionInRegistry(target: CombatCatalogRegistry, ref: DefinitionRef): CatalogEntry {
  if (activeKind === 'ammo') return target.archiveAmmoRevision(ref);
  if (activeKind === 'weapon') return target.archiveWeaponRevision(ref);
  return target.archiveLoadoutRevision(ref);
}

function replaceDraft(bundle: CombatCatalogBundleV1, kind: CatalogKind, entry: CatalogEntry): void {
  const definitionId = entryId(kind, entry);
  if (kind === 'ammo') {
    bundle.ammoDefinitions = bundle.ammoDefinitions
      .filter((candidate) => !(candidate.ammoDefinitionId === definitionId && candidate.status === 'draft'))
      .concat(entry as AmmoDefinitionV1);
  } else if (kind === 'weapon') {
    bundle.weaponDefinitions = bundle.weaponDefinitions
      .filter((candidate) => !(candidate.weaponDefinitionId === definitionId && candidate.status === 'draft'))
      .concat(entry as WeaponDefinitionV1);
  } else {
    bundle.loadoutTemplates = bundle.loadoutTemplates
      .filter((candidate) => !(candidate.loadoutTemplateId === definitionId && candidate.status === 'draft'))
      .concat(entry as LoadoutTemplateV1);
  }
}

function existingDraftRevision(bundle: CombatCatalogBundleV1, kind: CatalogKind, definitionId: string): number | null {
  const entry = entriesFromBundle(bundle, kind).find((candidate) => entryId(kind, candidate) === definitionId && candidate.status === 'draft');
  return entry?.revision ?? null;
}

function nextStableRevision(bundle: CombatCatalogBundleV1, kind: CatalogKind, definitionId: string): number {
  return Math.max(0, ...entriesFromBundle(bundle, kind)
    .filter((entry) => entryId(kind, entry) === definitionId && entry.status !== 'draft')
    .map((entry) => entry.revision)) + 1;
}

function nextRevisionFor(kind: CatalogKind, definitionId: string): number {
  return nextStableRevision(registry.toData(), kind, definitionId);
}

function entriesFromBundle(bundle: CombatCatalogBundleV1, kind: CatalogKind): CatalogEntry[] {
  if (kind === 'ammo') return bundle.ammoDefinitions;
  if (kind === 'weapon') return bundle.weaponDefinitions;
  return bundle.loadoutTemplates;
}

function definitionIdExists(kind: CatalogKind, definitionId: string): boolean {
  return listEntries(kind, true).some((entry) => entryId(kind, entry) === definitionId);
}

function entryId(kind: CatalogKind, entry: CatalogEntry): string {
  if (kind === 'ammo') return (entry as AmmoDefinitionV1).ammoDefinitionId;
  if (kind === 'weapon') return (entry as WeaponDefinitionV1).weaponDefinitionId;
  return (entry as LoadoutTemplateV1).loadoutTemplateId;
}

function idField(kind: CatalogKind): 'ammoDefinitionId' | 'weaponDefinitionId' | 'loadoutTemplateId' {
  if (kind === 'ammo') return 'ammoDefinitionId';
  if (kind === 'weapon') return 'weaponDefinitionId';
  return 'loadoutTemplateId';
}

function collectionName(kind: CatalogKind): 'ammoDefinitions' | 'weaponDefinitions' | 'loadoutTemplates' {
  if (kind === 'ammo') return 'ammoDefinitions';
  if (kind === 'weapon') return 'weaponDefinitions';
  return 'loadoutTemplates';
}

function kindLabel(kind: CatalogKind): string {
  if (kind === 'ammo') return 'Боеприпасы';
  if (kind === 'weapon') return 'Оружие';
  return 'Комплекты снаряжения';
}

function defaultIdPrefix(kind: CatalogKind): string {
  if (kind === 'ammo') return 'ammo_new';
  if (kind === 'weapon') return 'weapon_new';
  return 'loadout_new';
}

function uniqueAmmoIds(): string[] {
  return [...new Set(listAmmoReferences().map((entry) => entry.ammoDefinitionId))].sort();
}

function ammoName(ammoId: string): string {
  return listAmmoReferences().find((entry) => entry.ammoDefinitionId === ammoId)?.nameRu ?? 'Неизвестный боеприпас';
}

function nextReloadStageId(stages: readonly ReloadStageDefinitionV1[]): string {
  let suffix = 1;
  while (stages.some((stage) => stage.stageId === `stage_${suffix}`)) suffix += 1;
  return `stage_${suffix}`;
}

function sortIssues(issues: readonly CatalogValidationIssue[]): CatalogValidationIssue[] {
  return [...issues].sort((left, right) => compareText(left.path, right.path) || compareText(left.code, right.code));
}

function fieldErrorClass(path: string): string {
  return currentIssues.some((issue) => issueMatchesPath(issue.path, path)) ? 'has-error' : '';
}

function applyValidationHighlights(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>('[data-combat-field-path]').forEach((element) => {
    const path = element.dataset.combatFieldPath ?? '';
    element.classList.toggle('has-error', currentIssues.some((issue) => issueMatchesPath(issue.path, path)));
  });
}

function issueMatchesPath(issuePath: string, fieldPath: string): boolean {
  const normalizedField = fieldPath.replace(/\[(\d+)\]/g, '[$1]');
  return issuePath.endsWith(`.${normalizedField}`)
    || issuePath.includes(`.${normalizedField}.`)
    || (normalizedField === 'reloadStages' && issuePath.includes('.reloadStages'))
    || (normalizedField === 'reserveRoundsByAmmoDefinitionId' && issuePath.includes('.reserveRoundsByAmmoDefinitionId'));
}

function options<T extends string>(values: readonly { value: T; labelRu: string }[], selected: T): string {
  return values.map((item) => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.labelRu)} · ${item.value}</option>`).join('');
}

function statusBadge(status: CatalogEntry['status']): string {
  return `<span class="combat-catalog-status ${status}">${status}</span>`;
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => (
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined
  ), source);
}

function writePath(source: unknown, path: string, value: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  const parts = path.split('.');
  let target = source as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (typeof next !== 'object' || next === null) return;
    target = next as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
}

function finiteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resolveBrowserStorage(): CombatCatalogKeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    return new VolatileKeyValueStorage();
  }
}

class VolatileKeyValueStorage implements CombatCatalogKeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
