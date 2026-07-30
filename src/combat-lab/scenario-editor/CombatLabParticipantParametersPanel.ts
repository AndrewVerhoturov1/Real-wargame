import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import {
  readCombatLabParticipantInitialDraft,
  updateCombatLabParticipantParameters,
} from '../../core/testing/combat-lab/experiment';
import { CombatLabAccuracyControls } from '../ui/CombatLabAccuracyControls';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';

export interface CombatLabParticipantParametersPanelOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly roleId: string;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
  readonly stepAccuracyOverride?: { readonly stepId: string; readonly accuracy: CombatLabAccuracyOverridesV1 } | null;
}

export class CombatLabParticipantParametersPanel {
  readonly root = document.createElement('section');
  private readonly source = document.createElement('div');
  private readonly controls: CombatLabAccuracyControls;
  private destroyed = false;
  private stepAccuracyOverride: { readonly stepId: string; readonly accuracy: CombatLabAccuracyOverridesV1 } | null;

  constructor(private readonly options: CombatLabParticipantParametersPanelOptions) {
    this.stepAccuracyOverride = options.stepAccuracyOverride ?? null;
    this.root.className = 'combat-lab-participant-parameters combat-lab-panel';
    this.source.className = 'combat-lab-participant-parameters__source';
    this.controls = new CombatLabAccuracyControls(
      () => this.resetParticipant(),
      () => this.source.classList.add('is-dirty'),
    );
    const save = button('Сохранить параметры бойца', () => this.saveParticipant(), 'primary');
    this.root.append(
      heading('Параметры бойца'),
      this.source,
      this.controls.root,
      note('Параметры отдельного шага имеют приоритет над значением бойца. Значение бойца имеет приоритет над общими параметрами эксперимента.'),
      save,
    );
    options.host.append(this.root);
    this.refresh();
  }

  setStepAccuracyOverride(stepId: string | null, accuracy: CombatLabAccuracyOverridesV1 | null): void {
    this.stepAccuracyOverride = stepId && accuracy ? { stepId, accuracy } : null;
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    try {
      const experiment = this.options.draft.getExperiment();
      const role = experiment.roles.find((candidate) => candidate.roleId === this.options.roleId);
      if (!role) throw new Error(`Участник «${this.options.roleId}» не найден.`);
      const initial = readCombatLabParticipantInitialDraft(experiment, role.roleId);
      const saved = role.parameters.accuracy;
      const aimState = { map: { metersPerCell: initial.runtimeMetersPerCell } } as unknown as Pick<SimulationState, 'map'>;
      this.controls.loadForUnit(aimState, initial.unit, saved);
      this.source.textContent = this.stepAccuracyOverride
        ? `Источник выполнения: значение отдельного шага «${this.stepAccuracyOverride.stepId}». Ниже редактируется значение бойца.`
        : saved
          ? 'Источник: значение бойца.'
          : experiment.defaults.accuracyOverrides
            ? 'Источник: общие параметры эксперимента. Для бойца отдельное значение не задано.'
            : 'Источник: штатные параметры бойца и оружия.';
      this.source.classList.remove('is-dirty');
    } catch (error) {
      this.options.onError(message(error, 'Не удалось прочитать параметры бойца.'));
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
  }

  private saveParticipant(): void {
    try {
      const current = this.options.draft.getExperiment();
      const accuracy = this.controls.read(current.defaults.seed).accuracyOverrides;
      const next = updateCombatLabParticipantParameters(current, this.options.roleId, accuracy);
      this.options.draft.replaceExperiment(next);
      this.options.onExperimentChanged(next);
      this.refresh();
    } catch (error) {
      this.options.onError(message(error, 'Не удалось сохранить параметры бойца.'));
    }
  }

  private resetParticipant(): void {
    try {
      const current = this.options.draft.getExperiment();
      const next = updateCombatLabParticipantParameters(current, this.options.roleId, null);
      this.options.draft.replaceExperiment(next);
      this.options.onExperimentChanged(next);
      this.refresh();
    } catch (error) {
      this.options.onError(message(error, 'Не удалось сбросить параметры бойца.'));
    }
  }
}

function heading(value: string): HTMLElement { const result = document.createElement('h3'); result.className = 'combat-lab-section-title'; result.textContent = value; return result; }
function note(value: string): HTMLElement { const result = document.createElement('div'); result.className = 'combat-lab-editor-note'; result.textContent = value; return result; }
function button(label: string, onClick: () => void, className = ''): HTMLButtonElement { const result = document.createElement('button'); result.type = 'button'; result.textContent = label; result.className = className; result.addEventListener('click', onClick); return result; }
function message(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
