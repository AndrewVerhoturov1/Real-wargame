import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import { buildExportedScene } from '../../ui/SceneExport';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import {
  CombatLabExperimentFileActions,
  type CombatLabExperimentFileCodecV1,
  type CombatLabExperimentIssueV1Like,
} from './CombatLabExperimentFileActions';
import { CombatLabExperimentLocalStore } from './CombatLabExperimentLocalStore';
import { CombatLabRoleEditor } from './CombatLabRoleEditor';

export function captureCombatLabInitialScene(
  state: SimulationState,
  current: CombatLabExperimentV1,
): CombatLabExperimentV1 {
  return {
    ...current,
    revision: current.revision + 1,
    sceneSnapshot: buildExportedScene(state),
  };
}

export interface CombatLabScenePanelOptions {
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly getSelectedUnitId: () => string | null;
  readonly onSelectRole?: (roleId: string) => void;
  readonly host?: HTMLElement;
  readonly fileCodec?: CombatLabExperimentFileCodecV1;
  readonly storage?: Storage;
}

export class CombatLabScenePanel {
  readonly root = document.createElement('section');
  private readonly message = document.createElement('div');
  private readonly issues = document.createElement('div');
  private readonly roleHost = document.createElement('div');
  private readonly localHost = document.createElement('div');
  private readonly roleEditor: CombatLabRoleEditor;
  private readonly fileActions: CombatLabExperimentFileActions | null;
  private readonly localStore: CombatLabExperimentLocalStore | null;
  private destroyed = false;

  constructor(private readonly options: CombatLabScenePanelOptions) {
    this.root.className = 'combat-lab-scene-panel';
    this.message.className = 'combat-lab-editor-status';
    this.message.setAttribute('role', 'status');
    this.issues.className = 'combat-lab-experiment-issues';
    const metadata = this.buildMetadataEditor();
    const capture = button('Сохранить текущую сцену как начальную', () => this.captureScene(), 'primary');
    const sceneInfo = text('div', 'combat-lab-scene-snapshot-info', sceneSnapshotLabel(options.draft.getExperiment()));
    sceneInfo.dataset.sceneSnapshotInfo = 'true';
    this.root.append(metadata, capture, sceneInfo, this.message, this.issues, this.roleHost, this.localHost);
    options.host?.append(this.root);

    this.roleEditor = new CombatLabRoleEditor({
      host: this.roleHost,
      state: options.state,
      draft: options.draft,
      getSelectedUnitId: options.getSelectedUnitId,
      onSelectRole: options.onSelectRole,
      onExperimentChanged: (experiment) => this.changed(experiment, 'Роль сохранена.'),
      onError: (messageRu) => this.showMessage(messageRu, true),
    });

    if (options.fileCodec) {
      this.fileActions = new CombatLabExperimentFileActions(
        options.fileCodec,
        () => options.draft.getExperiment(),
        (experiment, issues) => {
          options.draft.replaceExperiment(experiment);
          this.changed(experiment, 'Импортированный эксперимент принят.');
          this.renderIssues(issues);
          this.refresh();
        },
        (messageRu, issues) => {
          this.showMessage(messageRu, issues.some((issue) => issue.severity === 'error'));
          this.renderIssues(issues);
        },
      );
      this.root.insertBefore(this.fileActions.root, this.message);
      this.localStore = new CombatLabExperimentLocalStore(options.fileCodec, options.storage ?? window.localStorage);
      this.renderLocalStore();
    } else {
      this.fileActions = null;
      this.localStore = null;
      const note = text('div', 'combat-lab-editor-note', 'Импорт, экспорт и локальные сохранения подключаются через core serializer/parser при интеграции.');
      this.root.insertBefore(note, this.message);
    }
    this.showMessage('Сцена и роли готовы к редактированию.', false);
  }

  refresh(): void {
    if (this.destroyed) return;
    this.roleEditor.render();
    const info = this.root.querySelector<HTMLElement>('[data-scene-snapshot-info]');
    if (info) info.textContent = sceneSnapshotLabel(this.options.draft.getExperiment());
    this.renderLocalStore();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.roleEditor.destroy();
    this.fileActions?.destroy();
    this.root.remove();
  }

  private buildMetadataEditor(): HTMLElement {
    const experiment = this.options.draft.getExperiment();
    const panel = document.createElement('section');
    panel.className = 'combat-lab-panel';
    panel.append(text('h3', 'combat-lab-section-title', 'Начальная сцена'));
    const title = document.createElement('input');
    title.type = 'text';
    title.value = experiment.titleRu;
    const description = document.createElement('textarea');
    description.rows = 3;
    description.value = experiment.descriptionRu;
    const apply = button('Сохранить название и описание', () => {
      const current = this.options.draft.getExperiment();
      const next: CombatLabExperimentV1 = {
        ...current,
        revision: current.revision + 1,
        titleRu: title.value.trim() || current.titleRu,
        descriptionRu: description.value.trim(),
      };
      this.options.draft.replaceExperiment(next);
      this.changed(next, 'Описание эксперимента сохранено.');
    });
    panel.append(field('Название', title), field('Описание', description), apply);
    return panel;
  }

  private captureScene(): void {
    try {
      const next = captureCombatLabInitialScene(this.options.state, this.options.draft.getExperiment());
      this.options.draft.replaceExperiment(next);
      this.changed(next, `Начальная сцена сохранена: бойцов ${next.sceneSnapshot.units.length}.`);
      this.refresh();
    } catch {
      this.showMessage('Не удалось сохранить текущую production scene.', true);
    }
  }

  private changed(experiment: CombatLabExperimentV1, messageRu: string): void {
    this.options.onExperimentChanged(experiment);
    this.showMessage(`${messageRu} revision ${experiment.revision}.`, false);
    this.renderLocalStore();
  }

  private renderIssues(issues: readonly CombatLabExperimentIssueV1Like[]): void {
    this.issues.replaceChildren(...issues.slice(0, 50).map((issue) => {
      const row = text('div', 'combat-lab-experiment-issue', `${issue.messageRu} · ${issue.path}`);
      row.dataset.severity = issue.severity;
      return row;
    }));
    this.issues.hidden = issues.length === 0;
  }

  private renderLocalStore(): void {
    if (!this.localStore || this.destroyed) return;
    const list = this.localStore.list();
    const panel = document.createElement('details');
    panel.className = 'combat-lab-editor-details combat-lab-local-experiments';
    panel.append(text('summary', '', 'Локальные эксперименты'));
    const save = button('Сохранить текущий', () => {
      const result = this.localStore!.save(this.options.draft.getExperiment());
      this.showMessage(result.messageRu, !result.ok);
      this.renderLocalStore();
    });
    panel.append(save);
    for (const entry of list.value ?? []) {
      const row = document.createElement('div');
      row.className = 'combat-lab-local-experiment-row';
      row.append(
        text('span', '', `${entry.titleRu} · r${entry.revision}`),
        button('Загрузить', () => {
          const result = this.localStore!.load(entry.experimentId);
          this.showMessage(result.messageRu, !result.ok);
          if (result.value) {
            this.options.draft.replaceExperiment(result.value);
            this.options.onExperimentChanged(result.value);
            this.refresh();
          }
        }),
        button('Удалить', () => {
          const result = this.localStore!.remove(entry.experimentId);
          this.showMessage(result.messageRu, !result.ok);
          this.renderLocalStore();
        }, 'danger'),
      );
      panel.append(row);
    }
    if ((list.value?.length ?? 0) === 0) panel.append(text('div', 'combat-lab-editor-empty', list.messageRu));
    this.localHost.replaceChildren(panel);
  }

  private showMessage(messageRu: string, error: boolean): void {
    this.message.textContent = messageRu;
    this.message.classList.toggle('is-error', error);
  }
}

function sceneSnapshotLabel(experiment: CombatLabExperimentV1): string {
  const scene = experiment.sceneSnapshot;
  return `Снимок: ${scene.map.width}×${scene.map.height}, бойцов ${scene.units.length}, время ${scene.simulationTimeSeconds.toFixed(3)} с.`;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  control.addEventListener('click', onClick);
  return control;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'combat-lab-field';
  root.append(text('span', '', label), control);
  return root;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
