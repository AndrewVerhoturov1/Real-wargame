import type {
  CombatLabExperimentIssueV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';
import type { CombatLabExperimentVisualController } from '../runtime/CombatLabExperimentVisualController';
import { asCombatLabExperimentVisualSnapshot } from '../runtime/CombatLabExperimentRunState';

export interface CombatLabExperimentRunToolbarOptions {
  readonly host: HTMLElement;
  readonly controller: CombatLabExperimentVisualController;
  readonly getValidationIssues: () => readonly CombatLabExperimentIssueV1[];
  readonly onRequestBatch: () => void;
}

export class CombatLabExperimentRunToolbar {
  private readonly root = document.createElement('div');
  private readonly resetButton = button('Сбросить');
  private readonly startButton = button('▶ Запустить', 'primary');
  private readonly pauseButton = button('Пауза');
  private readonly stepButton = button('Шаг');
  private readonly stopButton = button('■ Остановить');
  private readonly batchButton = button('Серия');
  private readonly speedSelect = document.createElement('select');
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private destroyed = false;

  private constructor(private readonly options: CombatLabExperimentRunToolbarOptions) {
    this.root.className = 'combat-lab-experiment-run-toolbar';
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
    speedLabel.textContent = 'Скорость';
    speedField.append(speedLabel, this.speedSelect);
    this.root.append(
      this.resetButton,
      this.startButton,
      this.pauseButton,
      this.stepButton,
      this.stopButton,
      speedField,
      this.batchButton,
    );
    options.host.replaceChildren(this.root);

    this.listen(this.resetButton, 'click', () => options.controller.reset());
    this.listen(this.startButton, 'click', () => options.controller.start());
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
    this.pauseButton.disabled = status !== 'running';
    this.stepButton.disabled = terminal;
    this.stopButton.disabled = status === 'ready' || status === 'idle' || terminal;
    this.resetButton.disabled = false;
    this.batchButton.disabled = validationBlocked;
    this.speedSelect.value = String(visual?.speed ?? this.options.controller.getSpeed());
    this.root.dataset.status = status;
    this.root.dataset.validation = validationBlocked ? 'blocked' : 'valid';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
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

function formatSpeed(value: number): string {
  return String(value).replace('.', ',');
}
