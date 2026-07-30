import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabParticipantEditor } from './CombatLabParticipantEditor';

export interface CombatLabRoleEditorOptions {
  readonly host: HTMLElement;
  readonly parametersHost?: HTMLElement;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getSelectedUnitId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
}

/**
 * Совместимая точка монтажа Stage 10. Список бойцов монтируется в `host`,
 * а параметры выбранного бойца — в отдельный `parametersHost`.
 * До подключения внешней вкладки создаётся запасной соседний контейнер.
 */
export class CombatLabRoleEditor {
  readonly root: HTMLElement;
  private readonly participants: CombatLabParticipantEditor;
  private readonly fallbackParametersHost: HTMLElement | null;

  constructor(options: CombatLabRoleEditorOptions) {
    const parametersHost = options.parametersHost ?? document.createElement('div');
    this.fallbackParametersHost = options.parametersHost ? null : parametersHost;
    if (this.fallbackParametersHost) {
      this.fallbackParametersHost.dataset.combatLabParametersHost = 'selected-unit-fallback';
      options.host.append(this.fallbackParametersHost);
    }
    this.participants = new CombatLabParticipantEditor({
      host: options.host,
      parametersHost,
      draft: options.draft,
      getSelectedUnitId: options.getSelectedUnitId,
      onExperimentChanged: options.onExperimentChanged,
      onError: options.onError,
    });
    this.root = this.participants.root;
  }

  render(): void { this.participants.refresh(); }
  setSelectedStepAccuracyOverride(stepId: string | null, accuracy: CombatLabAccuracyOverridesV1 | null): void {
    this.participants.setSelectedStepAccuracyOverride(stepId, accuracy);
  }
  destroy(): void {
    this.participants.destroy();
    this.fallbackParametersHost?.remove();
  }
}
