import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import {
  getCombatLabWorkspaceServices,
  type CombatLabWorkspaceServices,
} from '../CombatLabWorkspaceServices';
import { CombatLabParticipantDialogController } from '../editor/CombatLabParticipantDialogController';
import {
  getCombatLabParticipantMapInteractionController,
  type CombatLabParticipantMapInteractionController,
} from '../editor/CombatLabParticipantMapInteractionController';
import { getOnlyCombatLabWorkspaceRoot } from '../ui/CombatLabWorkspaceTabs';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';

export interface CombatLabParticipantDialogOptions {
  readonly anchor?: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly roleId: string | null;
  readonly onSaved: (experiment: CombatLabExperimentV1, roleId: string) => void;
  readonly onError: (messageRu: string) => void;
}

export class CombatLabParticipantDialog {
  static open(options: CombatLabParticipantDialogOptions): CombatLabParticipantDialogController {
    const located = locateWorkspace(options.anchor ?? getOnlyCombatLabWorkspaceRoot());
    return CombatLabParticipantDialogController.open({
      draft: options.draft,
      services: located.services,
      mapInteraction: located.mapInteraction,
      roleId: options.roleId,
      onSaved: options.onSaved,
      onError: options.onError,
    });
  }
}

function locateWorkspace(start: HTMLElement): {
  root: HTMLElement;
  services: CombatLabWorkspaceServices;
  mapInteraction: CombatLabParticipantMapInteractionController | null;
} {
  let candidate: HTMLElement | null = start;
  while (candidate) {
    try {
      return {
        root: candidate,
        services: getCombatLabWorkspaceServices(candidate),
        mapInteraction: getCombatLabParticipantMapInteractionController(candidate),
      };
    } catch {
      candidate = candidate.parentElement;
    }
  }
  throw new Error('Не найдено рабочее пространство Combat Lab для редактора бойца.');
}
