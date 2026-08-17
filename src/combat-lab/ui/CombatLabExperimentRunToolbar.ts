import type {
  CombatLabExperimentIssueV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';
import { getCombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import { updateCombatLabExperimentRuntimeSettings } from '../scenario-editor/CombatLabExperimentRuntimeSettings';
import type { CombatLabExperimentVisualController } from '../runtime/CombatLabExperimentVisualController';
import { asCombatLabExperimentVisualSnapshot } from '../runtime/CombatLabExperimentRunState';
import { CombatLabExperimentSettingsDialog } from './CombatLabExperimentSettingsDialog';
import { CombatLabExperimentSettingsSummary } from './CombatLabExperimentSettingsSummary';
import './combat-lab-runtime-controls.css';

export interface CombatLabExperimentRunToolbarOptions {
  readonly host: HTMLElement;
  readonly controller: CombatLabExperimentVisualController;
  readonly getValidationIssues: () => readonly CombatLabExperimentIssueV1[];
  readonly onRequestBatch: () => void;
}

export class CombatLabExperimentRunToolbar {
  private readonly root = document.createElement('div');
  private readonly resetButton = button('↶');
  private readonly startButton = button('', 'primary combat-lab-run-start');
  private readonly playButton = button('▶', 'combat-lab-run-play');
  private readonly pauseButton = button('Ⅱ', 'combat-lab-run-pause');
  private readonly stepButton = button('Шаг', 'combat-lab-run-step');
  private readonly stopButton = button('■ Остановить', 'combat-lab-run-stop');
  private readonly batchButton = button('Серия', 'combat-lab-run-batch');
  private readonly speedSelect = document.createElement('select');
  private readonly topStatus = document.createElement('div');
  private readonly topStatusTime = document.createElement('span');
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private readonly settingsDialog: CombatLabExperimentSettingsDialog;
  private readonly settingsSummary: CombatLabExperimentSettingsSummary;
  private readonly unsubscribeDraft: () => void;
  private destroyed = false;

  private constructor(private readonly options: CombatLabExperimentRunToolbarOptions) {
    const workspaceRoot = options.host.closest<HTMLElement>('.combat-lab-workspace');
    if (!workspaceRoot) throw new Error('Панель запуска Combat Lab находится вне рабочей области.');
    const services = getCombatLabWorkspaceServices(workspaceRoot);

    this.root.className = 'combat-lab-experiment-run-toolbar combat-lab-run-toolbar';
    this.resetButton.classList.add('combat-lab-run-reset');
    this.resetButton.textContent = '↺';
    this.resetButton.setAttribute('aria-label', 'Сбросить эксперимент');
    this.resetButton.title = 'Сбросить эксперимент';
    const startIcon = element('span', 'combat-lab-run-start-icon', '▶');
    startIcon.setAttribute('aria-hidden', 'true');
    this.startButton.append(
      startIcon,
      element('span', 'combat-lab-run-start-label', 'ПУСК'),
    );
    this.startButton.setAttribute('aria-label', 'Запустить прогон');
    this.pauseButton.setAttribute('aria-label', 'Пауза');
    this.playButton.setAttribute('aria-label', 'Продолжить');
    this.playButton.title = 'Продолжить';
    this.speedSelect.className = 'combat-lab-experiment-speed';
    this.speedSelect.setAttribute('aria-label', 'Скорость визуального прогона');
    for (const speed of options.controller.getAvailableSpeeds()) {
      const option = document.createElement('option');
      option.value = String(speed);
      option.textContent = `×${formatSpeed(speed)}`;
      this.speedSelect.append(option);
    }
    const speedField = document.createElement('label');
    speedField.className = 'combat-lab-experiment-speed-field';
    const speedLabel = document.createElement('span');
    speedLabel.textContent = '×';
    speedField.append(speedLabel, this.speedSelect);
    this.root.append(
      this.startButton,
      this.resetButton,
      speedField,
      this.playButton,
      this.pauseButton,
      this.stepButton,
      this.stopButton,
      this.batchButton,
    );
    options.host.replaceChildren(this.root);

    this.settingsDialog = new CombatLabExperimentSettingsDialog({
      host: options.host,
      getExperiment: () => services.draft.get(),
      onApply: (maximumSimulationSeconds) => {
        const updated = updateCombatLabExperimentRuntimeSettings(
          services.draft.get(),
          { maximumSimulationSeconds },
        );
        services.draft.replace(updated, 'external');
      },
    });
    this.settingsSummary = new CombatLabExperimentSettingsSummary({
      host: this.root,
      getExperiment: () => services.draft.get(),
      onOpenSettings: () => this.settingsDialog.open(),
      onRandomizeSeed: () => {
        const current = services.draft.get();
        const seed = Math.floor(Math.random() * 2_147_483_647) + 1;
        services.draft.replace({
          ...current,
          revision: current.revision + 1,
          defaults: {
            ...current.defaults,
            seed,
          },
        }, 'external');
      },
      onUpdateDuration: (maximumSimulationSeconds) => {
        const current = services.draft.get();
        services.draft.replace(
          updateCombatLabExperimentRuntimeSettings(current, { maximumSimulationSeconds }),
          'external',
        );
      },
      onUpdateSeed: (seed) => {
        const current = services.draft.get();
        services.draft.replace({
          ...current,
          revision: current.revision + 1,
          defaults: {
            ...current.defaults,
            seed,
          },
        }, 'external');
      },
    });
    this.topStatus.className = 'combat-lab-experiment-top-status';
    this.topStatus.setAttribute('aria-live', 'polite');
    const topStatusDot = document.createElement('span');
    topStatusDot.className = 'combat-lab-experiment-top-status__dot';
    topStatusDot.setAttribute('aria-hidden', 'true');
    this.topStatusTime.className = 'combat-lab-experiment-top-status__time';
    this.topStatus.append(topStatusDot, this.topStatusTime);
    this.root.append(this.topStatus);
    this.unsubscribeDraft = services.draft.subscribe(() => this.settingsSummary.refresh());

    this.listen(this.resetButton, 'click', () => options.controller.reset());
    this.listen(this.startButton, 'click', () => options.controller.start());
    this.listen(this.playButton, 'click', () => options.controller.start());
    this.listen(this.pauseButton, 'click', () => options.controller.pause());
    this.listen(this.stepButton, 'click', () => options.controller.stepOnce());
    this.listen(this.stopButton, 'click', () => options.controller.stop());
    this.listen(this.batchButton, 'click', () => options.onRequestBatch());
    this.listen(this.speedSelect, 'change', () => options.controller.setSpeed(Number(this.speedSelect.value)));
  }

  static create(options: CombatLabExperimentRunToolbarOptions): CombatLabExperimentRunToolbar {
    return new CombatLabExperimentRunToolbar(options);
  }

  refresh(snapshot: CombatLabScenarioRuntimeSnapshotV1): void {
    if (this.destroyed) return;
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    const status = visual?.visualStatus ?? snapshot.status;
    const terminal = status === 'completed' || status === 'failed' || status === 'stopped';
    const validationBlocked = this.options.getValidationIssues().some((issue) => issue.severity === 'error');
    this.startButton.disabled = validationBlocked || status === 'running' || terminal;
    this.playButton.disabled = validationBlocked || status === 'running' || terminal;
    this.pauseButton.disabled = status !== 'running';
    this.stepButton.disabled = terminal;
    this.stopButton.disabled = status === 'ready' || status === 'idle' || terminal;
    this.resetButton.disabled = false;
    this.batchButton.disabled = validationBlocked;
    this.speedSelect.value = String(visual?.speed ?? this.options.controller.getSpeed());
    this.topStatusTime.textContent = formatTopTime(snapshot.simulatedSeconds);
    this.topStatus.dataset.status = status;
    this.root.dataset.status = status;
    this.root.dataset.validation = validationBlocked ? 'blocked' : 'valid';
    this.settingsSummary.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.unsubscribeDraft();
    this.settingsSummary.destroy();
    this.settingsDialog.destroy();
    this.options.host.replaceChildren();
  }

  private listen(target: EventTarget, type: string, callback: () => void): void {
    const listener: EventListener = () => callback();
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}

function button(text: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function formatSpeed(value: number): string {
  return String(value);
}

function formatTopTime(seconds: number): string {
  const normalized = Math.max(0, seconds);
  const minutes = Math.floor(normalized / 60);
  const remainder = normalized - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
}
