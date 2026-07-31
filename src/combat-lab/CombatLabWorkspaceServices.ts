import type { SimulationState } from '../core/simulation/SimulationState';
import type { CombatLabExperimentV1 } from '../core/testing/combat-lab/experiment';
import { CombatLabParticipantMutationPort } from './editor/CombatLabParticipantMutationPort';
import {
  CombatLabMapToolCoordinator,
  type CombatLabMapToolEventTargetV1,
  type CombatLabMapToolStatusHostV1,
} from './map-tools/CombatLabMapToolCoordinator';
import type { CombatLabPersistentMapToolModeV1 } from './map-tools/CombatLabMapToolTypes';
import type { CombatLabExperimentDraft } from './scenario-editor/CombatLabExperimentDraft';
import { CombatLabSelectionController } from './selection/CombatLabSelectionController';

export type CombatLabDraftChangeSourceV1 = 'participant' | 'editor' | 'external';
export type CombatLabDraftListenerV1 = (
  experiment: CombatLabExperimentV1,
  source: CombatLabDraftChangeSourceV1,
) => void;

export interface CombatLabWorkspaceDraftPortV1 {
  get(): CombatLabExperimentV1;
  replace(experiment: CombatLabExperimentV1, source: CombatLabDraftChangeSourceV1): CombatLabExperimentV1;
  announce(experiment: CombatLabExperimentV1, source: CombatLabDraftChangeSourceV1): void;
  subscribe(listener: CombatLabDraftListenerV1): () => void;
}

export interface CombatLabWorkspaceServicesOptionsV1 {
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly initialMapToolMode?: CombatLabPersistentMapToolModeV1;
  readonly mapToolEventTarget?: CombatLabMapToolEventTargetV1;
  readonly mapToolStatusHost?: CombatLabMapToolStatusHostV1;
  readonly getMapToolStatusOverride?: () => string | null;
}

export class CombatLabWorkspaceServices {
  readonly selection: CombatLabSelectionController;
  readonly mapTools: CombatLabMapToolCoordinator;
  readonly participantMutations: CombatLabParticipantMutationPort;
  readonly draft: CombatLabWorkspaceDraftPortV1;
  private readonly draftService: CombatLabWorkspaceDraftService;
  private _destroyed = false;

  private constructor(options: CombatLabWorkspaceServicesOptionsV1) {
    this.draftService = new CombatLabWorkspaceDraftService(options.draft, options.onExperimentChanged);
    this.draft = this.draftService;
    this.selection = CombatLabSelectionController.create({
      state: options.state,
      resolveParticipantByUnitId: (unitId) => {
        const role = options.draft.getExperiment().roles.find((candidate) => candidate.unitId === unitId);
        return role ? { kind: 'participant', roleId: role.roleId, unitId: role.unitId } : null;
      },
    });
    this.mapTools = CombatLabMapToolCoordinator.create({
      initialPersistentMode: options.initialMapToolMode ?? 'program_authoring',
      eventTarget: options.mapToolEventTarget,
      statusHost: options.mapToolStatusHost,
      getStatusOverride: options.getMapToolStatusOverride,
    });
    this.participantMutations = CombatLabParticipantMutationPort.create({
      state: options.state,
      draft: options.draft,
      onExperimentChanged: (experiment) => {
        this.draftService.announce(experiment, 'participant');
        options.onExperimentChanged(experiment);
      },
    });
  }

  static create(options: CombatLabWorkspaceServicesOptionsV1): CombatLabWorkspaceServices {
    return new CombatLabWorkspaceServices(options);
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.selection.destroy();
    this.mapTools.destroy();
    this.draftService.destroy();
  }
}

class CombatLabWorkspaceDraftService implements CombatLabWorkspaceDraftPortV1 {
  private readonly listeners = new Set<CombatLabDraftListenerV1>();
  private destroyed = false;

  constructor(
    private readonly draft: Pick<CombatLabExperimentDraft, 'getExperiment' | 'replaceExperiment'>,
    private readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void,
  ) {}

  get(): CombatLabExperimentV1 {
    return this.draft.getExperiment();
  }

  replace(experiment: CombatLabExperimentV1, source: CombatLabDraftChangeSourceV1): CombatLabExperimentV1 {
    if (this.destroyed) return this.draft.getExperiment();
    this.draft.replaceExperiment(experiment);
    const published = this.draft.getExperiment();
    this.announce(published, source);
    this.onExperimentChanged(published);
    return published;
  }

  announce(experiment: CombatLabExperimentV1, source: CombatLabDraftChangeSourceV1): void {
    if (this.destroyed) return;
    for (const listener of [...this.listeners]) listener(experiment, source);
  }

  subscribe(listener: CombatLabDraftListenerV1): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
  }
}

const workspaceServicesByRoot = new WeakMap<HTMLElement, CombatLabWorkspaceServices>();

export function registerCombatLabWorkspaceServices(
  root: HTMLElement,
  services: CombatLabWorkspaceServices,
): () => void {
  const existing = workspaceServicesByRoot.get(root);
  if (existing && existing !== services) {
    throw new Error('Для этого Combat Lab уже зарегистрирован другой набор общих служб.');
  }
  workspaceServicesByRoot.set(root, services);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    if (workspaceServicesByRoot.get(root) === services) workspaceServicesByRoot.delete(root);
  };
}

export function getCombatLabWorkspaceServices(root: HTMLElement): CombatLabWorkspaceServices {
  const services = workspaceServicesByRoot.get(root);
  if (!services) throw new Error('Общие службы Combat Lab ещё не подключены.');
  return services;
}
