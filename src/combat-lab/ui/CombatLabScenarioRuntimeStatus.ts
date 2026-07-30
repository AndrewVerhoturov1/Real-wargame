import type { CombatLabScenarioRuntimeSnapshotV1 } from '../../core/testing/combat-lab';
import { asCombatLabExperimentVisualSnapshot } from '../runtime/CombatLabExperimentRunState';

export interface CombatLabScenarioRuntimeStatusOptions {
  readonly host: HTMLElement;
}

export class CombatLabScenarioRuntimeStatus {
  private readonly root: HTMLElement;
  private destroyed = false;

  private constructor(private readonly options: CombatLabScenarioRuntimeStatusOptions) {
    this.root = document.createElement('section');
    this.root.className = 'combat-lab-experiment-status';
    this.root.setAttribute('aria-live', 'polite');
    options.host.replaceChildren(this.root);
  }

  static create(options: CombatLabScenarioRuntimeStatusOptions): CombatLabScenarioRuntimeStatus {
    return new CombatLabScenarioRuntimeStatus(options);
  }

  refresh(snapshot: CombatLabScenarioRuntimeSnapshotV1): void {
    if (this.destroyed) return;
    const visual = asCombatLabExperimentVisualSnapshot(snapshot);
    const status = visual?.visualStatus ?? snapshot.status;
    const title = visual?.experimentTitleRu ?? snapshot.experimentId;
    const seed = visual?.seed ?? null;
    const active = visual?.activeStepTitleRu ?? null;
    const attempt = visual?.attemptCount ?? Math.max(0, ...snapshot.steps.map((step) => step.attempt));
    const failure = visual?.failureReasonRu ?? snapshot.stopReasonRu;
    const success = visual?.successConditionStatus
      ?? (snapshot.success === true ? 'satisfied' : snapshot.success === false ? 'failed' : 'pending');

    this.root.dataset.status = status;
    this.root.replaceChildren(
      row('Эксперимент', `${title} · ревизия ${snapshot.experimentRevision}`),
      row('Начальное число случайности', seed === null ? '—' : String(seed)),
      row('Время', `${snapshot.simulatedSeconds.toFixed(3)} с`),
      row('Состояние', statusLabel(status)),
      row('Активный шаг', active ?? '—'),
      row('Попытка', String(attempt)),
      row('Условие успеха', successLabel(success)),
      row('Причина ошибки', failure ?? '—'),
      ...(visual?.representativeRunIndex === null || visual?.representativeRunIndex === undefined
        ? []
        : [row('Повтор серии', `№ ${visual.representativeRunIndex}; ${visual.representativeStopReason ?? 'без причины остановки'}`)]),
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.host.replaceChildren();
  }
}

function row(label: string, value: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'combat-lab-experiment-status-row';
  const name = document.createElement('span');
  name.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  element.append(name, content);
  return element;
}

function statusLabel(status: string): string {
  if (status === 'ready' || status === 'idle') return 'готов';
  if (status === 'running') return 'выполняется';
  if (status === 'paused') return 'пауза';
  if (status === 'completed') return 'завершён';
  if (status === 'failed') return 'ошибка';
  if (status === 'stopped') return 'остановлен';
  return status;
}

function successLabel(status: string): string {
  if (status === 'satisfied') return 'выполнено';
  if (status === 'failed') return 'не выполнено';
  return 'ожидается';
}