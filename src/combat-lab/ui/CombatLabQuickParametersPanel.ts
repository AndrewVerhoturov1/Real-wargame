import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';
import type { CombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import type { CombatLabParticipantEditContextV1 } from '../editor/CombatLabParticipantEditContext';
import type { CombatLabSelectedEntityV1 } from '../selection/CombatLabSelectionTypes';
import type { CombatLabVisualSnapshotV1 } from '../runtime/CombatLabVisualSession';
import {
  applyCombatLabParticipantQuickParameterValues,
  clearCombatLabParticipantQuickParameterValues,
} from '../parameters/CombatLabParticipantParameterMutations';
import { CombatLabQuickParameterPreferencesStore } from '../parameters/CombatLabQuickParameterPreferencesStore';
import {
  getCombatLabQuickParameterDescriptor,
  listCombatLabQuickParameterDescriptors,
} from '../parameters/CombatLabQuickParameterRegistry';
import { resolveCombatLabQuickParameterPresetIds } from '../parameters/CombatLabQuickParameterPresets';
import { CombatLabTuningSnapshotStore } from '../parameters/CombatLabTuningSnapshotStore';
import {
  CombatLabQuickParameterEditBuffer,
  normalizeQuickParameterValue,
  type CombatLabQuickParameterDescriptorV1,
  type CombatLabQuickParameterIdV1,
  type CombatLabQuickParameterValuesV1,
} from '../parameters/CombatLabQuickParameterTypes';
import { CombatLabQuickParameterPickerDialog } from './CombatLabQuickParameterPickerDialog';
import { CombatLabTuningComparisonView } from './CombatLabTuningComparisonView';
import './combat-lab-quick-parameters.css';

const DEFAULT_PRESET_ID = 'accuracy' as const;

export interface CombatLabQuickParametersPanelOptionsV1 {
  readonly host: HTMLElement;
  readonly services: CombatLabWorkspaceServices;
  readonly isActive: () => boolean;
  readonly isLocked: () => boolean;
  readonly getRuntimeSnapshot: () => CombatLabScenarioRuntimeSnapshotV1 | null;
  readonly getVisualSnapshot: () => CombatLabVisualSnapshotV1 | null;
  readonly onResetAndStart: (seed: number) => void;
  readonly onRequestMapSelection: () => void;
  readonly preferences?: CombatLabQuickParameterPreferencesStore;
  readonly snapshotStore?: CombatLabTuningSnapshotStore;
}

export interface CombatLabQuickParameterApplyResultV1 {
  readonly experiment: CombatLabExperimentV1;
  readonly changed: boolean;
}

export interface CombatLabQuickParameterControlStateV1 {
  readonly descriptor: CombatLabQuickParameterDescriptorV1;
  readonly value: number;
  readonly dirty: boolean;
  readonly effectiveSourceRu: string;
  readonly savedSourceRu: string;
}

export interface CombatLabQuickParametersPanelModelSnapshotV1 {
  readonly roleId: string | null;
  readonly titleRu: string | null;
  readonly unitId: string | null;
  readonly sideRu: string | null;
  readonly pinnedIds: readonly CombatLabQuickParameterIdV1[];
  readonly controls: readonly CombatLabQuickParameterControlStateV1[];
  readonly dirtyIds: readonly CombatLabQuickParameterIdV1[];
  readonly locked: boolean;
}

export class CombatLabQuickParametersPanelModel {
  private readonly buffer = new CombatLabQuickParameterEditBuffer();
  private context: CombatLabParticipantEditContextV1 | null = null;
  private pinnedIds: readonly CombatLabQuickParameterIdV1[] = Object.freeze([]);
  private locked = false;

  constructor(
    private readonly services: CombatLabWorkspaceServices,
    private readonly preferences: CombatLabQuickParameterPreferencesStore,
  ) {}

  select(selection: CombatLabSelectedEntityV1): void {
    if (selection.kind !== 'participant') {
      this.context = null;
      this.pinnedIds = Object.freeze([]);
      this.buffer.load(new Map());
      return;
    }
    this.loadRole(selection.roleId);
  }

  refreshSelectedRole(): void {
    const roleId = this.context?.role.roleId;
    if (!roleId) return;
    this.loadRole(roleId);
  }

  setLocked(value: boolean): void {
    this.locked = value;
  }

  setPinnedIds(ids: readonly CombatLabQuickParameterIdV1[]): void {
    const context = this.context;
    if (!context) return;
    this.pinnedIds = this.preferences.set(context.experiment.experimentId, context.role.roleId, ids);
    this.loadBuffer(context);
  }

  movePinned(id: CombatLabQuickParameterIdV1, offset: -1 | 1): void {
    const index = this.pinnedIds.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= this.pinnedIds.length) return;
    const next = [...this.pinnedIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this.setPinnedIds(next);
  }

  removePinned(id: CombatLabQuickParameterIdV1): void {
    this.setPinnedIds(this.pinnedIds.filter((candidate) => candidate !== id));
  }

  setValue(id: CombatLabQuickParameterIdV1, value: number): void {
    if (this.locked || !this.context || !this.pinnedIds.includes(id)) return;
    this.buffer.set(id, normalizeQuickParameterValue(getCombatLabQuickParameterDescriptor(id), value));
  }

  resetValue(id: CombatLabQuickParameterIdV1): void {
    if (this.locked) return;
    this.buffer.reset(id);
  }

  resetChanges(): void {
    if (this.locked) return;
    this.buffer.resetAll();
  }

  apply(): CombatLabQuickParameterApplyResultV1 | null {
    const context = this.context;
    if (!context || this.locked) return null;
    const dirty = this.buffer.dirtyValues();
    if (Object.keys(dirty).length === 0) {
      return Object.freeze({ experiment: context.experiment, changed: false });
    }
    const previousRevision = context.experiment.revision;
    const next = applyCombatLabParticipantQuickParameterValues(
      this.services.participantMutations,
      context.role.roleId,
      dirty,
    );
    this.loadRole(context.role.roleId);
    return Object.freeze({ experiment: next, changed: next.revision !== previousRevision });
  }

  clearParticipantOverride(): CombatLabExperimentV1 | null {
    const context = this.context;
    if (!context || this.locked) return null;
    const next = clearCombatLabParticipantQuickParameterValues(
      this.services.participantMutations,
      context.role.roleId,
    );
    this.loadRole(context.role.roleId);
    return next;
  }

  currentContext(): CombatLabParticipantEditContextV1 | null {
    return this.context;
  }

  currentValues(): CombatLabQuickParameterValuesV1 {
    const context = this.context;
    if (!context) return Object.freeze({});
    const values: Partial<Record<CombatLabQuickParameterIdV1, number>> = {};
    for (const descriptor of listCombatLabQuickParameterDescriptors()) {
      if (!(descriptor.isAvailable?.(context) ?? true)) continue;
      values[descriptor.id] = descriptor.reader(context).value;
    }
    for (const id of this.pinnedIds) {
      const buffered = this.buffer.get(id);
      if (buffered !== null) values[id] = buffered;
    }
    return Object.freeze(values);
  }

  snapshot(): CombatLabQuickParametersPanelModelSnapshotV1 {
    const context = this.context;
    const dirtyIds = this.buffer.dirtyIds();
    const dirty = new Set(dirtyIds);
    const controls = context
      ? this.pinnedIds.flatMap((id) => {
          const descriptor = getCombatLabQuickParameterDescriptor(id);
          if (!(descriptor.isAvailable?.(context) ?? true)) return [];
          const resolved = descriptor.reader(context);
          return [Object.freeze({
            descriptor,
            value: this.buffer.get(id) ?? resolved.value,
            dirty: dirty.has(id),
            effectiveSourceRu: sourceLabelRu(resolved.effectiveSource),
            savedSourceRu: resolved.savedSource === 'participant'
              ? 'Сохранено у бойца'
              : `Наследуется: ${sourceLabelRu(resolved.inheritedSource)}`,
          })];
        })
      : [];
    return Object.freeze({
      roleId: context?.role.roleId ?? null,
      titleRu: context?.role.titleRu ?? null,
      unitId: context?.role.unitId ?? null,
      sideRu: context ? (context.unit.side === 'red' ? 'Красная сторона' : 'Синяя сторона') : null,
      pinnedIds: this.pinnedIds,
      controls: Object.freeze(controls),
      dirtyIds,
      locked: this.locked,
    });
  }

  private loadRole(roleId: string): void {
    try {
      const context = this.services.participantMutations.get(roleId);
      this.context = context;
      const defaults = resolveCombatLabQuickParameterPresetIds(DEFAULT_PRESET_ID, context);
      this.pinnedIds = this.preferences.get(context.experiment.experimentId, roleId, defaults);
      this.loadBuffer(context);
    } catch {
      this.context = null;
      this.pinnedIds = Object.freeze([]);
      this.buffer.load(new Map());
    }
  }

  private loadBuffer(context: CombatLabParticipantEditContextV1): void {
    const values = new Map<CombatLabQuickParameterIdV1, number>();
    for (const id of this.pinnedIds) {
      const descriptor = getCombatLabQuickParameterDescriptor(id);
      if (!(descriptor.isAvailable?.(context) ?? true)) continue;
      values.set(id, descriptor.reader(context).value);
    }
    this.buffer.load(values);
  }
}

export interface CombatLabQuickParameterRerunFlowOptionsV1 {
  readonly model: CombatLabQuickParametersPanelModel;
  readonly runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null;
  readonly visualSnapshot: CombatLabVisualSnapshotV1 | null;
  readonly onResetAndStart: (seed: number) => void;
}

export function applyCombatLabQuickParametersAndRerun(
  options: CombatLabQuickParameterRerunFlowOptionsV1,
): CombatLabQuickParameterApplyResultV1 | null {
  const seed = resolveRuntimeSeed(
    options.runtimeSnapshot,
    options.visualSnapshot,
    options.model.currentContext(),
  );
  const result = options.model.apply();
  if (!result) return null;
  options.onResetAndStart(seed);
  return result;
}

export class CombatLabQuickParametersPanel {
  private readonly root = node('section', 'combat-lab-quick-parameters');
  private readonly headerHost = node('div', 'combat-lab-quick-parameters-header');
  private readonly noticeHost = node('div', 'combat-lab-quick-parameters-notice-host');
  private readonly controlsHost = node('div', 'combat-lab-quick-parameters-controls');
  private readonly actionsHost = node('div', 'combat-lab-quick-parameters-actions');
  private readonly comparisonHost = node('div', 'combat-lab-tuning-comparison-host');
  private readonly preferences: CombatLabQuickParameterPreferencesStore;
  private readonly snapshots: CombatLabTuningSnapshotStore;
  private readonly comparisonView: CombatLabTuningComparisonView;
  private readonly picker = new CombatLabQuickParameterPickerDialog();
  private readonly model: CombatLabQuickParametersPanelModel;
  private readonly unsubscribeSelection: () => void;
  private readonly unsubscribeDraft: () => void;
  private runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null = null;
  private needsRefresh = true;
  private destroyed = false;

  private constructor(private readonly options: CombatLabQuickParametersPanelOptionsV1) {
    this.preferences = options.preferences ?? new CombatLabQuickParameterPreferencesStore();
    this.snapshots = options.snapshotStore ?? new CombatLabTuningSnapshotStore();
    this.model = new CombatLabQuickParametersPanelModel(options.services, this.preferences);
    this.comparisonView = new CombatLabTuningComparisonView({ host: this.comparisonHost, store: this.snapshots });
    this.root.append(this.headerHost, this.noticeHost, this.controlsHost, this.actionsHost, this.comparisonHost);
    options.host.replaceChildren(this.root);
    this.model.setLocked(options.isLocked());
    this.model.select(options.services.selection.get());
    this.unsubscribeSelection = options.services.selection.subscribe((selection) => {
      this.model.select(selection);
      this.requestRefresh();
    });
    this.unsubscribeDraft = options.services.draft.subscribe(() => {
      this.model.refreshSelectedRole();
      this.requestRefresh();
    });
    this.refresh();
  }

  static create(options: CombatLabQuickParametersPanelOptionsV1): CombatLabQuickParametersPanel {
    return new CombatLabQuickParametersPanel(options);
  }

  setLocked(value: boolean): void {
    this.model.setLocked(value);
    this.requestRefresh();
  }

  setRuntimeSnapshot(snapshot: CombatLabScenarioRuntimeSnapshotV1): void {
    this.runtimeSnapshot = snapshot;
    if (this.options.isActive()) this.refreshComparison();
  }

  acceptExperiment(): void {
    this.model.refreshSelectedRole();
    this.requestRefresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    if (!this.options.isActive()) {
      this.needsRefresh = true;
      return;
    }
    this.needsRefresh = false;
    const state = this.model.snapshot();
    this.renderHeader(state);
    this.renderNotice(state);
    this.renderControls(state);
    this.renderActions(state);
    this.refreshComparison();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeSelection();
    this.unsubscribeDraft();
    this.picker.destroy();
    this.comparisonView.destroy();
    this.options.host.replaceChildren();
  }

  private requestRefresh(): void {
    this.needsRefresh = true;
    if (this.options.isActive()) this.refresh();
  }

  private renderHeader(state: CombatLabQuickParametersPanelModelSnapshotV1): void {
    if (!state.roleId) {
      this.headerHost.replaceChildren(
        node('div', 'combat-lab-empty-tab', 'Выберите бойца на карте или в списке сцены, чтобы открыть его быстрые параметры.'),
        actionButton('Выбрать на карте', () => this.options.onRequestMapSelection()),
      );
      return;
    }
    const identity = node('div', 'combat-lab-quick-parameters-identity');
    identity.append(
      node('strong', '', state.titleRu ?? 'Выбранный боец'),
      node('span', '', state.sideRu ?? 'Сторона не определена'),
    );
    this.headerHost.replaceChildren(identity, actionButton('Выбрать на карте', () => this.options.onRequestMapSelection()));
  }

  private renderNotice(state: CombatLabQuickParametersPanelModelSnapshotV1): void {
    this.noticeHost.replaceChildren();
    if (state.locked) {
      this.noticeHost.append(node(
        'div',
        'combat-lab-quick-parameters-notice is-warning',
        'Параметры заблокированы во время активного или приостановленного прогона. Остановите либо сбросьте прогон.',
      ));
    } else if (state.dirtyIds.length > 0) {
      this.noticeHost.append(node(
        'div',
        'combat-lab-quick-parameters-notice',
        `Есть неприменённые изменения: ${state.dirtyIds.length}.`,
      ));
    }
  }

  private renderControls(state: CombatLabQuickParametersPanelModelSnapshotV1): void {
    if (!state.roleId) {
      this.controlsHost.replaceChildren();
      return;
    }
    if (state.controls.length === 0) {
      this.controlsHost.replaceChildren(node(
        'div',
        'combat-lab-empty-tab',
        'На панели пока нет параметров. Нажмите «Добавить параметр».',
      ));
      return;
    }
    this.controlsHost.replaceChildren(...state.controls.map((control, index) => this.createControl(control, index, state)));
  }

  private createControl(
    control: CombatLabQuickParameterControlStateV1,
    index: number,
    state: CombatLabQuickParametersPanelModelSnapshotV1,
  ): HTMLElement {
    const descriptor = control.descriptor;
    const root = node('article', `combat-lab-quick-parameter-control${control.dirty ? ' is-dirty' : ''}`);
    root.dataset.quickParameterId = descriptor.id;
    const heading = node('div', 'combat-lab-quick-parameter-control-heading');
    const copy = node('div', '');
    copy.append(node('strong', '', descriptor.labelRu), node('small', '', descriptor.descriptionRu));
    const order = node('div', 'combat-lab-quick-parameter-order-actions');
    const up = actionButton('↑', () => { this.model.movePinned(descriptor.id, -1); this.refresh(); });
    up.title = 'Поднять выше';
    up.disabled = state.locked || index === 0;
    const down = actionButton('↓', () => { this.model.movePinned(descriptor.id, 1); this.refresh(); });
    down.title = 'Опустить ниже';
    down.disabled = state.locked || index === state.controls.length - 1;
    const remove = actionButton('Убрать', () => { this.model.removePinned(descriptor.id); this.refresh(); });
    remove.disabled = state.locked;
    order.append(up, down, remove);
    heading.append(copy, order);

    const inputs = node('div', 'combat-lab-quick-parameter-inputs');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(descriptor.minimum);
    range.max = String(descriptor.maximum);
    range.step = String(descriptor.step);
    range.value = String(control.value);
    range.disabled = state.locked;
    range.setAttribute('aria-label', descriptor.labelRu);
    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(descriptor.minimum);
    number.max = String(descriptor.maximum);
    number.step = String(descriptor.step);
    number.value = String(control.value);
    number.disabled = state.locked;
    const unit = node('span', 'combat-lab-quick-parameter-unit', descriptor.unitRu);
    const output = node('output', 'combat-lab-quick-parameter-output', descriptor.formatValueRu(control.value));
    const sync = (source: HTMLInputElement, target: HTMLInputElement): void => {
      const value = normalizeQuickParameterValue(descriptor, Number(source.value));
      source.value = String(value);
      target.value = String(value);
      output.textContent = descriptor.formatValueRu(value);
      this.model.setValue(descriptor.id, value);
      root.classList.toggle('is-dirty', this.model.snapshot().dirtyIds.includes(descriptor.id));
      this.renderNotice(this.model.snapshot());
      this.renderActions(this.model.snapshot());
    };
    range.addEventListener('input', () => sync(range, number));
    number.addEventListener('input', () => sync(number, range));
    inputs.append(range, number, unit, output);

    const meta = node('div', 'combat-lab-quick-parameter-meta');
    meta.append(
      node('span', '', `Диапазон: ${descriptor.minimum}…${descriptor.maximum}`),
      node('span', '', `Эффективный источник: ${control.effectiveSourceRu}`),
      node('span', '', control.savedSourceRu),
    );
    const reset = actionButton('Вернуть сохранённое', () => {
      this.model.resetValue(descriptor.id);
      this.refresh();
    });
    reset.disabled = state.locked || !control.dirty;
    meta.append(reset);
    root.append(heading, inputs, meta);
    return root;
  }

  private renderActions(state: CombatLabQuickParametersPanelModelSnapshotV1): void {
    this.actionsHost.replaceChildren();
    if (!state.roleId) return;
    const add = actionButton('Добавить параметр', () => this.openPicker());
    const apply = actionButton('Применить', () => this.apply(false), 'primary');
    const reset = actionButton('Сбросить изменения', () => { this.model.resetChanges(); this.refresh(); });
    const clear = actionButton('Вернуть наследуемые значения', () => {
      this.model.clearParticipantOverride();
      this.showMessage('Параметры бойца возвращены к наследуемым значениям.', false);
      this.refresh();
    });
    const rerun = actionButton('Применить и перезапустить', () => this.apply(true), 'primary');
    add.disabled = state.locked;
    apply.disabled = state.locked || state.dirtyIds.length === 0;
    reset.disabled = state.locked || state.dirtyIds.length === 0;
    clear.disabled = state.locked || this.model.currentContext()?.role.parameters.accuracy === null;
    rerun.disabled = state.locked;

    const snapshots = node('div', 'combat-lab-quick-parameter-snapshot-actions');
    snapshots.append(
      actionButton('Сохранить A', () => this.saveSnapshot('A')),
      actionButton('Сохранить B', () => this.saveSnapshot('B')),
      actionButton('Очистить A/B', () => {
        this.snapshots.clear();
        this.comparisonView.clear();
      }),
    );
    this.actionsHost.append(add, apply, reset, clear, rerun, snapshots);
  }

  private openPicker(): void {
    const context = this.model.currentContext();
    if (!context || this.options.isLocked()) return;
    this.picker.open({
      context,
      pinnedIds: this.model.snapshot().pinnedIds,
      onApply: (ids) => {
        this.model.setPinnedIds(ids);
        this.refresh();
      },
    });
  }

  private apply(rerun: boolean): void {
    if (this.options.isLocked()) return;
    try {
      const result = rerun
        ? applyCombatLabQuickParametersAndRerun({
            model: this.model,
            runtimeSnapshot: this.runtimeSnapshot,
            visualSnapshot: this.options.getVisualSnapshot(),
            onResetAndStart: this.options.onResetAndStart,
          })
        : this.model.apply();
      if (!result) return;
      const message = rerun
        ? 'Параметры применены; запускается чистый повтор.'
        : result.changed
          ? 'Параметры бойца применены.'
          : 'Сохранённые параметры уже совпадают с выбранными значениями.';
      this.showMessage(message, false);
      this.refresh();
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Не удалось применить параметры.', true);
    }
  }

  private saveSnapshot(slot: 'A' | 'B'): void {
    const context = this.model.currentContext();
    if (!context) return;
    this.snapshots.save(slot, {
      experiment: context.experiment,
      roleId: context.role.roleId,
      participantParameterValues: this.model.currentValues(),
      runtimeSnapshot: this.options.getRuntimeSnapshot(),
      visualSnapshot: this.options.getVisualSnapshot(),
    });
    this.showMessage(`Снимок ${slot} сохранён.`, false);
    this.refreshComparison();
  }

  private refreshComparison(): void {
    const context = this.model.currentContext();
    if (!context) {
      this.comparisonHost.replaceChildren();
      return;
    }
    this.comparisonView.refresh(context.experiment, context.role.roleId);
  }

  private showMessage(messageRu: string, error: boolean): void {
    this.noticeHost.replaceChildren(node(
      'div',
      `combat-lab-quick-parameters-notice${error ? ' is-error' : ''}`,
      messageRu,
    ));
  }
}

function resolveRuntimeSeed(
  runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null,
  visualSnapshot: CombatLabVisualSnapshotV1 | null,
  context: CombatLabParticipantEditContextV1 | null,
): number {
  const runtimeCandidate = runtimeSnapshot as (CombatLabScenarioRuntimeSnapshotV1 & { readonly seed?: number }) | null;
  const value = runtimeCandidate?.seed ?? visualSnapshot?.seed ?? context?.experiment.defaults.seed ?? 1;
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function sourceLabelRu(source: string): string {
  if (source === 'participant') return 'параметры бойца';
  if (source === 'experiment') return 'параметры эксперимента';
  if (source === 'step') return 'шаг программы';
  return 'производственная модель';
}

function actionButton(label: string, callback: () => void, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  control.addEventListener('click', callback);
  return control;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
