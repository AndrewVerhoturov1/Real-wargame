import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import {
  createTacticalPositionProfileCopy,
  deleteTacticalPositionProfile,
  exportTacticalPositionProfile,
  getTacticalPositionProfile,
  importTacticalPositionProfile,
  listTacticalPositionProfiles,
  loadTacticalPositionProfileRegistry,
  resetTacticalPositionProfileRegistry,
  setActiveTacticalPositionProfile,
  subscribeTacticalPositionProfileRegistry,
  updateTacticalPositionProfile,
  type TacticalPositionProfile,
} from '../core/tactical/TacticalPositionProfileStorage';
import type { TacticalPositionSettings } from '../core/tactical/TacticalPositionSettings';
import {
  TACTICAL_POSITION_SETTINGS_GROUPS,
  type TacticalPositionBooleanFieldDefinition,
  type TacticalPositionNumericFieldDefinition,
} from '../core/tactical/TacticalPositionSettingsSchema';
import {
  tacticalPositionObjectiveLabelRu,
  type TacticalPositionSearchObjective,
} from '../core/tactical/TacticalPositionObjective';

interface EditableProfile {
  id: string;
  nameRu: string;
  nameEn: string;
  descriptionRu: string;
  descriptionEn: string;
  revision: number;
  builtIn: boolean;
  defaultObjective: TacticalPositionSearchObjective;
  settings: TacticalPositionSettings;
}

export function mountTacticalPositionProfileEditor(context: GameEditorMountContext): GameEditorInstallation {
  const panel = context.host;
  const initialRegistry = loadTacticalPositionProfileRegistry();
  let selectedProfileId = context.request.profileId
    && initialRegistry.profiles.some((profile) => profile.id === context.request.profileId)
    ? context.request.profileId
    : initialRegistry.activeProfileId;
  let draft = editable(getTacticalPositionProfile(selectedProfileId));
  let baseline = serialize(draft);
  let message = 'Числовые параметры используют ту же схему, что и редактор бойца в игре.';
  let destroyed = false;

  const unsubscribe = subscribeTacticalPositionProfileRegistry((registry) => {
    if (destroyed) return;
    const dirty = isDirty();
    if (!registry.profiles.some((profile) => profile.id === selectedProfileId)) selectedProfileId = registry.activeProfileId;
    if (!dirty) resetDraft();
    render();
  });

  render();

  return {
    beforeClose(): boolean {
      if (!isDirty()) return true;
      return window.confirm('Отменить несохранённые изменения профиля позиции и закрыть редактор?');
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      panel.replaceChildren();
      delete panel.dataset.tacticalPositionProfileWorkbench;
    },
  };

  function isDirty(): boolean {
    return serialize(draft) !== baseline;
  }

  function resetDraft(): void {
    draft = editable(getTacticalPositionProfile(selectedProfileId));
    baseline = serialize(draft);
  }

  function render(): void {
    panel.dataset.tacticalPositionProfileWorkbench = 'true';
    const profiles = listTacticalPositionProfiles();
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      selectedProfileId = profiles[0]?.id ?? 'balanced';
      resetDraft();
    }
    panel.innerHTML = `
      <div class="tactical-position-profile-layout">
        <aside class="tactical-position-profile-list">
          <div class="tactical-position-profile-heading">
            <div><h2>Профили позиций</h2><p>Настройки поиска и выбора позы. Это не ноды графа.</p></div><span>v1</span>
          </div>
          <div class="tactical-position-profile-items">
            ${profiles.map((profile) => `
              <button type="button" data-tactical-profile-id="${escapeAttribute(profile.id)}" class="${profile.id === selectedProfileId ? 'active' : ''}">
                <strong>${escapeHtml(profile.nameRu)}</strong>
                <small>${escapeHtml(profile.id)} · revision ${profile.revision}${profile.builtIn ? ' · встроенный' : ''}</small>
              </button>`).join('')}
          </div>
          <div class="tactical-position-profile-list-actions">
            <button type="button" data-tactical-profile-action="copy">Создать копию</button>
            <button type="button" data-tactical-profile-action="delete" ${draft.builtIn ? 'disabled' : ''}>Удалить</button>
            <button type="button" data-tactical-profile-action="import">Импорт</button>
            <button type="button" data-tactical-profile-action="export">Экспорт</button>
            <button type="button" data-tactical-profile-action="reset" class="danger">Сбросить реестр</button>
            <input type="file" accept="application/json,.json" data-tactical-profile-import hidden />
          </div>
        </aside>
        <main class="tactical-position-profile-form">
          <header class="tactical-position-profile-form-header">
            <div>
              <span>${draft.builtIn ? 'Встроенный профиль — сохранение создаст пользовательскую копию' : 'Пользовательский профиль'} · revision ${draft.revision}</span>
              <h2>${escapeHtml(draft.nameRu)}</h2><p>${escapeHtml(draft.descriptionRu)}</p>
            </div>
            <div class="tactical-position-profile-actions">
              <button type="button" data-tactical-profile-action="cancel">Отменить изменения</button>
              <button type="button" data-tactical-profile-action="save" class="primary">${draft.builtIn ? 'Сохранить как копию' : 'Сохранить изменения'}</button>
            </div>
          </header>
          <section class="tactical-position-profile-identity">
            ${textField('nameRu', 'Название по-русски', draft.nameRu)}
            ${textField('nameEn', 'Название по-английски', draft.nameEn)}
            ${textArea('descriptionRu', 'Описание по-русски', draft.descriptionRu)}
            ${textArea('descriptionEn', 'Описание по-английски', draft.descriptionEn)}
            ${objectiveField(draft.defaultObjective)}
          </section>
          ${TACTICAL_POSITION_SETTINGS_GROUPS.map((group) => `
            <section class="tactical-position-profile-group" data-settings-group="${group.id}">
              <h3>${escapeHtml(group.titleRu)}</h3>
              <div class="tactical-position-profile-field-grid">
                ${group.numericFields.map((field) => numericField(field, draft.settings[field.key])).join('')}
                ${(group.booleanFields ?? []).map((field) => booleanField(field, draft.settings[field.key])).join('')}
              </div>
            </section>`).join('')}
          <p class="tactical-position-profile-message" data-tactical-profile-message>${escapeHtml(message)}</p>
        </main>
      </div>`;
    bind();
  }

  function bind(): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-tactical-profile-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextId = button.dataset.tacticalProfileId ?? 'balanced';
        if (nextId === selectedProfileId) return;
        if (isDirty() && !window.confirm('Отменить несохранённые изменения и открыть другой профиль?')) return;
        selectedProfileId = nextId;
        setActiveTacticalPositionProfile(selectedProfileId);
        resetDraft();
        message = `Открыт профиль: ${draft.nameRu}`;
        render();
      });
    });
    panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-profile-property]').forEach((input) => {
      input.addEventListener('input', () => {
        const property = input.dataset.profileProperty as 'nameRu' | 'nameEn' | 'descriptionRu' | 'descriptionEn';
        draft[property] = input.value;
      });
    });
    panel.querySelector<HTMLSelectElement>('[data-default-objective]')?.addEventListener('change', (event) => {
      draft.defaultObjective = (event.currentTarget as HTMLSelectElement).value as TacticalPositionSearchObjective;
    });
    panel.querySelectorAll<HTMLInputElement>('[data-tactical-setting]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.tacticalSetting as keyof TacticalPositionSettings;
        if (input.type === 'checkbox') {
          (draft.settings as unknown as Record<string, number | boolean>)[key] = input.checked;
          return;
        }
        const definition = findNumericDefinition(key);
        if (!definition) return;
        const parsed = Number(input.value);
        const next = Math.max(definition.min, Math.min(definition.max, Number.isFinite(parsed) ? parsed : 0));
        input.value = formatStepNumber(next, definition.step);
        (draft.settings as unknown as Record<string, number | boolean>)[key] = next;
      });
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-tactical-profile-action]').forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.tacticalProfileAction ?? ''));
    });
    panel.querySelector<HTMLInputElement>('[data-tactical-profile-import]')?.addEventListener('change', (event) => void importProfile(event));
  }

  function handleAction(action: string): void {
    if (action === 'copy') {
      const created = createTacticalPositionProfileCopy(selectedProfileId);
      selectedProfileId = created.id;
      resetDraft();
      message = `Создан профиль: ${created.nameRu}`;
      render();
      return;
    }
    if (action === 'delete') {
      deleteTacticalPositionProfile(selectedProfileId);
      selectedProfileId = loadTacticalPositionProfileRegistry().activeProfileId;
      resetDraft();
      message = 'Пользовательский профиль удалён.';
      render();
      return;
    }
    if (action === 'cancel') {
      resetDraft();
      message = 'Несохранённые изменения отменены.';
      render();
      return;
    }
    if (action === 'save') {
      if (draft.builtIn) {
        const copy = createTacticalPositionProfileCopy(draft.id);
        selectedProfileId = copy.id;
        draft = { ...draft, id: copy.id, builtIn: false, revision: copy.revision };
      }
      const saved = updateTacticalPositionProfile(toProfile(draft));
      selectedProfileId = saved.id;
      resetDraft();
      message = `Профиль сохранён: ${saved.nameRu}`;
      render();
      return;
    }
    if (action === 'export') {
      downloadJson(`${selectedProfileId}.tactical-position-profile.json`, exportTacticalPositionProfile(selectedProfileId));
      message = 'Профиль экспортирован.';
      render();
      return;
    }
    if (action === 'import') {
      panel.querySelector<HTMLInputElement>('[data-tactical-profile-import]')?.click();
      return;
    }
    if (action === 'reset') {
      if (!window.confirm('Сбросить весь реестр профилей позиций?')) return;
      resetTacticalPositionProfileRegistry();
      selectedProfileId = 'balanced';
      resetDraft();
      message = 'Реестр профилей сброшен.';
      render();
    }
  }

  async function importProfile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const imported = importTacticalPositionProfile(JSON.parse(await file.text()));
      selectedProfileId = imported.id;
      resetDraft();
      message = `Импортирован профиль: ${imported.nameRu}`;
    } catch (error) {
      message = `Ошибка импорта: ${error instanceof Error ? error.message : String(error)}`;
    }
    render();
  }
}

function editable(profile: TacticalPositionProfile): EditableProfile {
  return { ...profile, settings: { ...profile.settings } };
}

function toProfile(profile: EditableProfile): TacticalPositionProfile {
  return { ...profile, settings: { ...profile.settings } };
}

function serialize(profile: EditableProfile): string {
  return JSON.stringify(profile);
}

function numericField(definition: TacticalPositionNumericFieldDefinition, value: number): string {
  return `<label class="tactical-position-profile-field" title="${escapeAttribute(definition.helpRu)}"><span>${escapeHtml(definition.labelRu)}</span><small>${escapeHtml(definition.helpRu)}</small><input type="number" data-tactical-setting="${definition.key}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${formatStepNumber(value, definition.step)}" /></label>`;
}

function booleanField(definition: TacticalPositionBooleanFieldDefinition, value: boolean): string {
  return `<label class="tactical-position-profile-field checkbox" title="${escapeAttribute(definition.helpRu)}"><span>${escapeHtml(definition.labelRu)}</span><input type="checkbox" data-tactical-setting="${definition.key}" ${value ? 'checked' : ''} /><small>${escapeHtml(definition.helpRu)}</small></label>`;
}

function objectiveField(value: TacticalPositionSearchObjective): string {
  const objectives: TacticalPositionSearchObjective[] = ['balanced', 'advance_to_threat', 'withdraw_from_threat', 'continue_order'];
  return `<label class="tactical-position-profile-field"><span>Цель поиска по умолчанию</span><small>Используется новым запросом, если граф или интерфейс не задали другую цель.</small><select data-default-objective>${objectives.map((objective) => `<option value="${objective}" ${objective === value ? 'selected' : ''}>${escapeHtml(tacticalPositionObjectiveLabelRu(objective))}</option>`).join('')}</select></label>`;
}

function textField(property: string, label: string, value: string): string {
  return `<label class="tactical-position-profile-field"><span>${escapeHtml(label)}</span><input data-profile-property="${property}" value="${escapeAttribute(value)}" /></label>`;
}

function textArea(property: string, label: string, value: string): string {
  return `<label class="tactical-position-profile-field"><span>${escapeHtml(label)}</span><textarea data-profile-property="${property}">${escapeHtml(value)}</textarea></label>`;
}

function findNumericDefinition(key: string): TacticalPositionNumericFieldDefinition | undefined {
  return TACTICAL_POSITION_SETTINGS_GROUPS.flatMap((group) => group.numericFields).find((field) => field.key === key);
}

function formatStepNumber(value: number, step: number): string {
  const precision = Math.min(4, (String(step).split('.')[1] ?? '').length);
  return Number(value.toFixed(precision)).toString();
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
