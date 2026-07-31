import type { SimulationState } from '../../core/simulation/SimulationState';
import { createProductionUnitEditorSection } from '../../ui/ProductionUnitEditor';
import '../../ui/production-unit-editor.css';
import type { CombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import { CombatLabParticipantMapInteractionController } from './CombatLabParticipantMapInteractionController';
import { CombatLabSceneEditorAdapter } from './CombatLabSceneEditorAdapter';

export interface CombatLabUnifiedInspectorHostOptionsV1 {
  readonly root: HTMLElement;
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly services: CombatLabWorkspaceServices;
  readonly onError?: (messageRu: string) => void;
}

export class CombatLabUnifiedInspectorHost {
  private readonly mapInteraction: CombatLabParticipantMapInteractionController;
  private readonly removeSelectionListener: () => void;
  private readonly removeDraftListener: () => void;
  private destroyed = false;

  constructor(private readonly options: CombatLabUnifiedInspectorHostOptionsV1) {
    this.mapInteraction = CombatLabParticipantMapInteractionController.create({
      root: options.root,
      state: options.state,
      services: options.services,
    });
    this.removeSelectionListener = options.services.selection.subscribe(() => this.render());
    this.removeDraftListener = options.services.draft.subscribe(() => this.render());
    this.render();
  }

  render(): void {
    if (this.destroyed) return;
    const selection = this.options.services.selection.get();
    if (selection.kind === 'participant') {
      const adapter = new CombatLabSceneEditorAdapter({
        services: this.options.services,
        roleId: selection.roleId,
        mapInteraction: this.mapInteraction,
        onError: this.options.onError,
      });
      const section = createProductionUnitEditorSection(adapter, {
        showTitle: false,
        collapsible: true,
        initiallyCollapsed: false,
        placementButtons: true,
      });
      section.dataset.combatLabUnifiedInspector = 'participant';
      this.options.host.replaceChildren(section);
      return;
    }
    if (selection.kind === 'marker') {
      this.options.host.replaceChildren(message(`Выбрана метка «${selection.markerId}». Её параметры редактируются в программе.`));
      return;
    }
    if (selection.kind === 'scene') {
      this.options.host.replaceChildren(message('Выбрана сцена. Выберите бойца на карте или в списке.'));
      return;
    }
    this.options.host.replaceChildren(message('Выберите бойца на карте или во вкладке «Сцена».'));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeDraftListener();
    this.removeSelectionListener();
    this.mapInteraction.destroy();
    this.options.host.replaceChildren();
  }
}

function message(value: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'combat-lab-editor-empty';
  root.textContent = value;
  return root;
}