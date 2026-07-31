import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import {
  getCombatLabWorkspaceServices,
  type CombatLabWorkspaceServices,
} from '../CombatLabWorkspaceServices';
import { CombatLabUnifiedInspectorHost } from '../editor/CombatLabUnifiedInspectorHost';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabParticipantEditor } from './CombatLabParticipantEditor';

export interface CombatLabRoleEditorOptions {
  readonly host: HTMLElement;
  readonly parametersHost?: HTMLElement;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getSelectedUnitId: () => string | null;
  readonly onSelectRole?: (roleId: string) => void;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
}

/**
 * Список сцены отвечает только за выбор и операции над бойцами. Все свойства
 * выбранного бойца редактируются одним production-инспектором справа.
 */
export class CombatLabRoleEditor {
  readonly root: HTMLElement;
  private readonly participants: CombatLabParticipantEditor;
  private readonly inspector: CombatLabUnifiedInspectorHost;
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
      draft: options.draft,
      getSelectedUnitId: options.getSelectedUnitId,
      onSelectRole: options.onSelectRole,
      onExperimentChanged: options.onExperimentChanged,
      onError: options.onError,
    });
    this.root = this.participants.root;
    const located = locateWorkspaceServices(options.host);
    this.inspector = new CombatLabUnifiedInspectorHost({
      root: located.root,
      host: parametersHost,
      state: options.state,
      services: located.services,
      onError: options.onError,
    });
  }

  render(): void {
    this.participants.refresh();
    this.inspector.render();
  }

  setSelectedStepAccuracyOverride(stepId: string | null, accuracy: CombatLabAccuracyOverridesV1 | null): void {
    this.participants.setSelectedStepAccuracyOverride(stepId, accuracy);
  }

  destroy(): void {
    this.inspector.destroy();
    this.participants.destroy();
    this.fallbackParametersHost?.remove();
  }
}

function locateWorkspaceServices(start: HTMLElement): { root: HTMLElement; services: CombatLabWorkspaceServices } {
  let current: HTMLElement | null = start;
  while (current) {
    try {
      return { root: current, services: getCombatLabWorkspaceServices(current) };
    } catch {
      current = current.parentElement;
    }
  }
  throw new Error('Не найден корневой контейнер общих служб Combat Lab.');
}