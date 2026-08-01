import {
  getGameplayTuningRegistry,
  type ConditionProfileDefinition,
  type GameplayTuningBundleV1,
  type GameplayTuningRegistry,
  type PerceptionProfileDefinition,
  type SoldierArchetypeDefinition,
} from '../core/tuning/GameplayTuningProfiles';
import {
  getActiveConditionProfileId,
  setActiveConditionProfileId,
} from '../core/tuning/GameplayTuningRuntime';
import type { GameEditorMountContext } from '../game-editors/GameEditorTypes';
import {
  replaceStoredGameplayTuningProfiles,
  resetGameplayTuningProfiles,
  saveGameplayTuningProfiles,
  subscribeGameplayTuningProfiles,
} from '../ui/GameplayTuningProfileStorage';

export type GameplayTuningEditorKind = 'perception' | 'archetype' | 'condition';
type EditableProfile = PerceptionProfileDefinition | SoldierArchetypeDefinition | ConditionProfileDefinition;
type ArchetypeReferenceKey = 'perceptionProfileId' | 'conditionProfileId';

interface NumberFieldDefinition {
  readonly path: string;
  readonly labelRu: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unitRu: string;
  readonly helpRu: string;
}

export class GameplayTuningProfileEditor {
  private registry: GameplayTuningRegistry = getGameplayTuningRegistry();
  private selectedProfileId: string;
  private draft: EditableProfile;
  private dirty = false;
  private destroyed = false;
  private readonly unsubscribe: () => void;
  private readonly handleClickBound = (event: Event) => this.handleClick(event);
  private readonly handleChangeBound = (event: Event) => this.handleChange(event);

  constructor(
    private readonly context: GameEditorMountContext,
    private readonly kind: GameplayTuningEditorKind,
  ) {
    this.selectedProfileId = this.resolveInitialProfileId(context.request.profileId);
    this.draft = cloneProfile(this.requireSelected());
    this.context.host.addEventListener('click', this.handleClickBound);
    this.context.host.addEventListener('change', this.handleChangeBound);
    this.unsubscribe = subscribeGameplayTuningProfiles((registry) => {
      if (this.destroyed) return;
      this.registry = registry;
      if (!this.hasProfile(this.selectedProfileId)) this.selectedProfileId = this.defaultProfileId();
      if (!this.dirty) this.draft = cloneProfile(this.requireSelected());
      this.render();
    });
    this.render();
  }

  beforeClose(): boolean {
    return !this.dirty || window.confirm('Отменить несохранённые изменения профиля?');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.context.host.removeEventListener('click', this.handleClickBound);
    this.context.host.removeEventListener('change', this.handleChangeBound);
    this.context.host.replaceChildren();
  }

  private render(): void {
    if (this.destroyed) return;
    const profile = this.draft;
    const builtIn = profile.builtIn;
    const active = this.isActiveProfile(profile.id);
    const archetypeReferences = this.kind === 'archetype'
      ? this.renderArchetypeReferences(profile as SoldierArchetypeDefinition, builtIn)
      : '';
    this.context.host.innerHTML = `
      <div class="gameplay-tuning-editor" data-gameplay-tuning-editor="${this.kind}">
        <aside class="gameplay-tuning-editor-list-panel">
          <header class="gameplay-tuning-editor-list-heading">
            <div><h2>${escapeHtml(this.editorTitle())}</h2><p>${escapeHtml(this.editorDescription())}</p></div>
            <span>Формат v${this.registry.formatVersion}</span>
          </header>
          <div class="gameplay-tuning-editor-list" role="listbox" aria-label="Профили">
            ${this.listProfiles().map((item) => `
              <button type="button" role="option" aria-selected="${item.id === profile.id}" data-tuning-profile-id="${escapeAttribute(item.id)}" class="${item.id === profile.id ? 'active' : ''}">
                <strong>${escapeHtml(item.nameRu)}</strong>
                <span>${item.builtIn ? 'встроенный' : `изменение ${item.revision}`}${this.isActiveProfile(item.id) ? ' · активный' : ''}</span>
              </button>`).join('')}
          </div>
          <div class="gameplay-tuning-editor-list-actions">
            <button type="button" data-tuning-action="copy">Создать копию</button>
            <button type="button" data-tuning-action="rename" ${builtIn ? 'disabled' : ''}>Переименовать</button>
            <button type="button" data-tuning-action="delete" ${builtIn ? 'disabled' : ''}>Удалить</button>
            <button type="button" data-tuning-action="reset">Сбросить реестр</button>
            <button type="button" data-tuning-action="import">Импорт</button>
            <button type="button" data-tuning-action="export">Экспорт</button>
            <input type="file" accept="application/json,.json" data-tuning-import hidden />
          </div>
        </aside>
        <main class="gameplay-tuning-editor-form-panel">
          <header class="gameplay-tuning-editor-form-heading">
            <div>
              <span class="gameplay-tuning-editor-kicker">${builtIn ? 'Встроенный профиль' : 'Пользовательский профиль'} · ${escapeHtml(profile.id)}</span>
              <h2>${escapeHtml(profile.nameRu)}</h2>
              <p>${builtIn ? 'Встроенные значения неизменяемы. Создайте копию для настройки.' : 'Поля меняют только существующие расчёты и проходят ту же нормализацию, что импорт.'}</p>
            </div>
            <div class="gameplay-tuning-editor-active">
              ${this.kind === 'archetype' ? '' : `<button type="button" data-tuning-action="activate" ${active ? 'disabled' : ''}>${active ? 'Активный профиль' : 'Сделать активным'}</button>`}
            </div>
          </header>
          <div class="gameplay-tuning-editor-fields">
            ${archetypeReferences}
            ${this.fieldDefinitions().map((field) => renderNumberField(profile, field, builtIn)).join('')}
          </div>
          <footer class="gameplay-tuning-editor-save-bar">
            <span>${this.dirty ? 'Есть несохранённые изменения.' : `Ревизия профиля: ${profile.revision}`}</span>
            <button type="button" data-tuning-action="cancel" ${!this.dirty ? 'disabled' : ''}>Отменить</button>
            <button type="button" data-tuning-action="save" ${builtIn || !this.dirty ? 'disabled' : ''}>Сохранить</button>
          </footer>
        </main>
      </div>`;
  }

  private renderArchetypeReferences(
    profile: SoldierArchetypeDefinition,
    disabled: boolean,
  ): string {
    return `
      <label class="gameplay-tuning-editor-field gameplay-tuning-editor-reference">
        <span class="gameplay-tuning-editor-field-label">Профиль восприятия</span>
        <select data-tuning-reference="perceptionProfileId" ${disabled ? 'disabled' : ''}>
          ${this.registry.listPerceptionProfiles().map((item) => option(item.id, item.nameRu, item.id === profile.perceptionProfileId)).join('')}
        </select>
        <small>Снимок этого профиля копируется в бойца при создании и затем не меняется самопроизвольно.</small>
      </label>
      <label class="gameplay-tuning-editor-field gameplay-tuning-editor-reference">
        <span class="gameplay-tuning-editor-field-label">Ранения и подавление</span>
        <select data-tuning-reference="conditionProfileId" ${disabled ? 'disabled' : ''}>
          ${this.registry.listConditionProfiles().map((item) => option(item.id, item.nameRu, item.id === profile.conditionProfileId)).join('')}
        </select>
        <small>Снимок задаёт штрафы ранений и параметры подавления именно для созданного бойца.</small>
      </label>`;
  }

  private handleClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-tuning-profile-id], [data-tuning-action]')
      : null;
    if (!target) return;
    const profileId = target.dataset.tuningProfileId;
    if (profileId) {
      this.selectProfile(profileId);
      return;
    }
    const action = target.dataset.tuningAction;
    if (!action) return;
    if (action === 'copy') this.copySelected();
    else if (action === 'rename') this.renameSelected();
    else if (action === 'delete') this.deleteSelected();
    else if (action === 'reset') this.resetRegistry();
    else if (action === 'import') this.context.host.querySelector<HTMLInputElement>('[data-tuning-import]')?.click();
    else if (action === 'export') this.exportSelected();
    else if (action === 'activate') this.activateSelected();
    else if (action === 'cancel') this.cancelDraft();
    else if (action === 'save') this.saveDraft();
  }

  private handleChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-tuning-import]')) {
      const file = target.files?.[0];
      target.value = '';
      if (file) void this.importFile(file);
      return;
    }
    if (target instanceof HTMLSelectElement) {
      const reference = target.dataset.tuningReference as ArchetypeReferenceKey | undefined;
      if (!reference || this.kind !== 'archetype' || this.draft.builtIn) return;
      const archetypeDraft = this.draft as SoldierArchetypeDefinition;
      this.draft = { ...archetypeDraft, [reference]: target.value } as SoldierArchetypeDefinition;
      this.dirty = true;
      this.render();
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    const path = target.dataset.tuningPath;
    if (!path || this.draft.builtIn) return;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return;
    setNumberAtPath(this.draft as unknown as Record<string, unknown>, path, value);
    this.dirty = true;
    this.render();
  }

  private selectProfile(profileId: string): void {
    if (profileId === this.selectedProfileId || !this.hasProfile(profileId)) return;
    if (this.dirty && !window.confirm('Отменить несохранённые изменения профиля?')) return;
    this.selectedProfileId = profileId;
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private copySelected(): void {
    const source = this.requireSelected();
    const requestedId = window.prompt('Устойчивый идентификатор копии', `${source.id}-copy`);
    const profileId = normalizeProfileId(requestedId);
    if (!profileId) return;
    if (this.hasProfile(profileId)) {
      window.alert('Профиль с таким идентификатором уже существует.');
      return;
    }
    const nameRu = window.prompt('Название копии', `${source.nameRu} — копия`)?.trim();
    if (!nameRu) return;
    const copy = cloneProfile({ ...source, id: profileId, nameRu, builtIn: false, revision: 1 } as EditableProfile);
    this.replaceProfile(copy);
    saveGameplayTuningProfiles(this.registry);
    this.selectedProfileId = profileId;
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private renameSelected(): void {
    if (this.draft.builtIn) return;
    const nameRu = window.prompt('Новое название профиля', this.draft.nameRu)?.trim();
    if (!nameRu || nameRu === this.draft.nameRu) return;
    this.draft = { ...this.draft, nameRu } as EditableProfile;
    this.dirty = true;
    this.render();
  }

  private deleteSelected(): void {
    if (this.draft.builtIn || !window.confirm(`Удалить профиль «${this.draft.nameRu}»?`)) return;
    if (this.kind === 'perception') this.registry.deletePerceptionProfile(this.draft.id);
    else if (this.kind === 'archetype') this.registry.deleteSoldierArchetype(this.draft.id);
    else this.registry.deleteConditionProfile(this.draft.id);
    saveGameplayTuningProfiles(this.registry);
    this.selectedProfileId = this.defaultProfileId();
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private resetRegistry(): void {
    if (!window.confirm('Сбросить все пользовательские профили настройки игры?')) return;
    this.registry = resetGameplayTuningProfiles();
    this.selectedProfileId = this.defaultProfileId();
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private activateSelected(): void {
    if (this.kind === 'perception') this.registry.setActivePerceptionProfileId(this.draft.id);
    else if (this.kind === 'condition') setActiveConditionProfileId(this.draft.id);
    else return;
    saveGameplayTuningProfiles(this.registry);
    this.render();
  }

  private cancelDraft(): void {
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private saveDraft(): void {
    if (this.draft.builtIn || !this.dirty) return;
    this.replaceProfile(this.draft);
    saveGameplayTuningProfiles(this.registry);
    this.draft = cloneProfile(this.requireSelected());
    this.dirty = false;
    this.render();
  }

  private async importFile(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (isGameplayBundle(parsed)) {
        this.registry = replaceStoredGameplayTuningProfiles(parsed);
        this.selectedProfileId = this.defaultProfileId();
      } else if (isRecord(parsed)) {
        const imported = { ...parsed, builtIn: false } as unknown as EditableProfile;
        this.replaceProfile(imported);
        saveGameplayTuningProfiles(this.registry);
        this.selectedProfileId = imported.id;
      } else {
        throw new Error('Ожидался объект профиля или пакет v1.');
      }
      this.draft = cloneProfile(this.requireSelected());
      this.dirty = false;
      this.render();
    } catch (error) {
      window.alert(`Импорт не выполнен: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private exportSelected(): void {
    const blob = new Blob([JSON.stringify(this.requireSelected(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.kind}-${this.draft.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private replaceProfile(profile: EditableProfile): void {
    if (this.kind === 'perception') this.registry.replacePerceptionProfile(profile as PerceptionProfileDefinition);
    else if (this.kind === 'archetype') this.registry.replaceSoldierArchetype(profile as SoldierArchetypeDefinition);
    else this.registry.replaceConditionProfile(profile as ConditionProfileDefinition);
  }

  private requireSelected(): EditableProfile {
    if (this.kind === 'perception') return this.registry.requirePerceptionProfile(this.selectedProfileId);
    if (this.kind === 'archetype') return this.registry.requireSoldierArchetype(this.selectedProfileId);
    return this.registry.requireConditionProfile(this.selectedProfileId);
  }

  private listProfiles(): readonly EditableProfile[] {
    if (this.kind === 'perception') return this.registry.listPerceptionProfiles();
    if (this.kind === 'archetype') return this.registry.listSoldierArchetypes();
    return this.registry.listConditionProfiles();
  }

  private hasProfile(profileId: string): boolean {
    return this.listProfiles().some((profile) => profile.id === profileId);
  }

  private resolveInitialProfileId(requested: string | undefined): string {
    return requested && this.hasProfile(requested) ? requested : this.defaultProfileId();
  }

  private defaultProfileId(): string {
    return this.listProfiles()[0]?.id ?? 'standard';
  }

  private isActiveProfile(profileId: string): boolean {
    if (this.kind === 'perception') return this.registry.getActivePerceptionProfileId() === profileId;
    if (this.kind === 'condition') return getActiveConditionProfileId() === profileId;
    return false;
  }

  private editorTitle(): string {
    if (this.kind === 'perception') return 'Профили восприятия';
    if (this.kind === 'archetype') return 'Архетипы бойцов';
    return 'Ранения и подавление';
  }

  private editorDescription(): string {
    if (this.kind === 'perception') return 'Качество накопления, сохранения и уточнения контактов.';
    if (this.kind === 'archetype') return 'Исходные характеристики и ссылки на профили, копируемые в бойца при создании.';
    return 'Действующие штрафы ранений и параметры накопления подавления.';
  }

  private fieldDefinitions(): readonly NumberFieldDefinition[] {
    return this.kind === 'perception'
      ? PERCEPTION_FIELDS
      : this.kind === 'archetype'
        ? ARCHETYPE_FIELDS
        : CONDITION_FIELDS;
  }
}

export function mountGameplayTuningProfileEditor(
  context: GameEditorMountContext,
  kind: GameplayTuningEditorKind,
): GameplayTuningProfileEditor {
  return new GameplayTuningProfileEditor(context, kind);
}

const PERCEPTION_FIELDS: readonly NumberFieldDefinition[] = [
  field('contact.confidenceEvidenceDivisor', 'Делитель уверенности', 0.1, 10, 0.05, '×', 'Перевод накопленного свидетельства в уверенность контакта.'),
  field('contact.minimumUncertaintyCells', 'Минимальная неопределённость', 0.05, 20, 0.05, 'клетки', 'Нижняя граница ошибки положения контакта.'),
  field('contact.initialUncertaintyCells', 'Начальная неопределённость', 0.05, 100, 0.05, 'клетки', 'Ошибка положения при слабом наблюдении.'),
  field('contact.uncertaintyEvidenceDivisor', 'Уточнение от свидетельства', 0.1, 500, 0.1, 'делитель', 'Скорость уменьшения ошибки при накоплении свидетельства.'),
  field('contact.evidenceDecayPerSecond', 'Потеря свидетельства', 0, 50, 0.05, 'в секунду', 'Скорость забывания неподтверждённого контакта.'),
  field('contact.confidenceDecayPerSecond', 'Потеря уверенности', 0, 50, 0.05, 'в секунду', 'Скорость снижения уверенности без наблюдения.'),
  field('contact.uncertaintyGrowthMetersPerSecond', 'Рост ошибки положения', 0, 20, 0.01, 'м/с', 'Расширение предполагаемой области контакта.'),
  field('contact.soundEvidenceMultiplier', 'Свидетельство от звука', 0, 4, 0.01, '×', 'Перевод уверенности звукового события в свидетельство.'),
  field('contact.reportedEvidenceMultiplier', 'Свидетельство от доклада', 0, 4, 0.01, '×', 'Перевод уверенности доклада в свидетельство.'),
];

const ARCHETYPE_FIELDS: readonly NumberFieldDefinition[] = [
  ...['resilience', 'caution', 'decisiveness', 'discipline', 'initiative', 'tactics', 'weaponSkill'].map((key) => field(`traits.${key}`, traitLabel(key), 0, 100, 1, '%', 'Исходная характеристика бойца, копируемая при создании.')),
  ...['fatigue', 'morale', 'confusion', 'health', 'attention', 'view', 'intuition', 'speed', 'stealth'].map((key) => field(`condition.${key}`, conditionLabel(key), 0, 100, 1, '%', 'Исходное состояние бойца, копируемое при создании.')),
];

const CONDITION_FIELDS: readonly NumberFieldDefinition[] = [
  field('wound.woundedMovementMultiplier', 'Движение после лёгкого ранения', 0, 1, 0.01, '×', 'Множитель скорости для состояния wounded.'),
  field('wound.severelyWoundedMovementMultiplier', 'Движение после тяжёлого ранения', 0, 1, 0.01, '×', 'Множитель скорости для состояния severely wounded.'),
  field('wound.woundedAimMultiplier', 'Прицеливание после лёгкого ранения', 0, 1, 0.01, '×', 'Множитель точности для состояния wounded.'),
  field('wound.severelyWoundedAimMultiplier', 'Прицеливание после тяжёлого ранения', 0, 1, 0.01, '×', 'Множитель точности для состояния severely wounded.'),
  field('wound.limbHitStressGain', 'Стресс от попадания в конечность', 0, 100, 1, 'ед.', 'Разовый прирост уже существующего стресса.'),
  field('wound.bodyHitStressGain', 'Стресс от попадания в корпус или голову', 0, 100, 1, 'ед.', 'Разовый прирост уже существующего стресса.'),
  field('suppression.gainMultiplier', 'Накопление подавления', 0, 4, 0.01, '×', 'Множитель подавления от попаданий, близких пролётов и ударов рядом.'),
  field('suppression.decayPerSecond', 'Спад подавления', 0, 100, 0.1, 'ед./с', 'Скорость уменьшения существующего подавления.'),
  field('suppression.stressMultiplier', 'Стресс от подавления', 0, 4, 0.01, '×', 'Множитель прироста существующего стресса от огня.'),
  field('suppression.maximumSuppression', 'Предел подавления', 0, 100, 1, 'ед.', 'Верхняя граница накопленного подавления.'),
];

function field(
  path: string,
  labelRu: string,
  minimum: number,
  maximum: number,
  step: number,
  unitRu: string,
  helpRu: string,
): NumberFieldDefinition {
  return Object.freeze({ path, labelRu, minimum, maximum, step, unitRu, helpRu });
}

function renderNumberField(profile: EditableProfile, definition: NumberFieldDefinition, disabled: boolean): string {
  const value = getNumberAtPath(profile as unknown as Record<string, unknown>, definition.path);
  return `
    <label class="gameplay-tuning-editor-field">
      <span class="gameplay-tuning-editor-field-label">${escapeHtml(definition.labelRu)}</span>
      <span class="gameplay-tuning-editor-field-control">
        <input type="number" value="${value}" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" data-tuning-path="${escapeAttribute(definition.path)}" ${disabled ? 'disabled' : ''} />
        <span>${escapeHtml(definition.unitRu)}</span>
      </span>
      <small>${escapeHtml(definition.helpRu)} Допустимо: ${definition.minimum}–${definition.maximum}.</small>
    </label>`;
}

function option(id: string, nameRu: string, selected: boolean): string {
  return `<option value="${escapeAttribute(id)}" ${selected ? 'selected' : ''}>${escapeHtml(nameRu)} · ${escapeHtml(id)}</option>`;
}

function getNumberAtPath(root: Record<string, unknown>, path: string): number {
  let current: unknown = root;
  for (const segment of path.split('.')) current = isRecord(current) ? current[segment] : undefined;
  return typeof current === 'number' && Number.isFinite(current) ? current : 0;
}

function setNumberAtPath(root: Record<string, unknown>, path: string, value: number): void {
  const segments = path.split('.');
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = current[segment];
    if (!isRecord(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
}

function cloneProfile<T extends EditableProfile>(profile: T): T {
  return JSON.parse(JSON.stringify(profile)) as T;
}

function normalizeProfileId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || null;
}

function isGameplayBundle(value: unknown): value is Partial<GameplayTuningBundleV1> {
  return isRecord(value) && value.formatVersion === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value);
}

function traitLabel(key: string): string {
  return ({
    resilience: 'Стойкость', caution: 'Осторожность', decisiveness: 'Решительность', discipline: 'Дисциплина',
    initiative: 'Инициатива', tactics: 'Тактика', weaponSkill: 'Навык оружия',
  } as Record<string, string>)[key] ?? key;
}

function conditionLabel(key: string): string {
  return ({
    fatigue: 'Усталость', morale: 'Боевой дух', confusion: 'Растерянность', health: 'Здоровье',
    attention: 'Внимательность', view: 'Наблюдательность', intuition: 'Интуиция', speed: 'Физическая скорость', stealth: 'Скрытность',
  } as Record<string, string>)[key] ?? key;
}
