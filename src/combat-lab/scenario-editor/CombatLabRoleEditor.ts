import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabParticipantEditor } from './CombatLabParticipantEditor';

export interface CombatLabRoleEditorOptions {
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getSelectedUnitId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
}

/**
 * Совместимая точка монтажа Stage 10. Пользовательское представление ролей
 * заменено редактором участников, но ScenePanel не требуется менять.
 * Инварианты создания перенесены в CombatLabParticipantDialog:
 * roleId: existing?.roleId ?? id
 * roleId.disabled = existing !== null
 */
export class CombatLabRoleEditor {
  readonly root: HTMLElement;
  private readonly participants: CombatLabParticipantEditor;

  constructor(options: CombatLabRoleEditorOptions) {
    this.participants = new CombatLabParticipantEditor({
      host: options.host,
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
  destroy(): void { this.participants.destroy(); }
}
