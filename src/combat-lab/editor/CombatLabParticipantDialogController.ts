import { listAvailableAiGraphCatalogEntries } from '../../core/ai/AiGraphCatalog';
import { SOLDIER_PARAMETERS_BY_PROFILE } from '../../core/behavior/BehaviorModel';
import { createDefaultCombatCatalogRegistry } from '../../core/infantry-combat/catalogs/CombatCatalogRegistry';
import {
  createCombatLabParticipant,
  type CombatLabExperimentV1,
  type CombatLabParticipantInitialDraftV1,
  type CombatLabParticipantScenePatchV1,
} from '../../core/testing/combat-lab/experiment';
import type {
  ProductionUnitEditorAdapterV1,
  ProductionUnitEditorGraphOptionV1,
  ProductionUnitEditorLoadoutOptionV1,
  ProductionUnitEditorPatchV1,
  ProductionUnitEditorSnapshotV1,
} from '../../ui/ProductionUnitEditor';
import type { CombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import type { CombatLabExperimentDraft } from '../scenario-editor/CombatLabExperimentDraft';
import type { CombatLabParticipantMapInteractionController } from './CombatLabParticipantMapInteractionController';
import { CombatLabParticipantDialogView } from './CombatLabParticipantDialogView';

export interface CombatLabParticipantDialogControllerOptionsV1 {
  readonly draft: CombatLabExperimentDraft;
  readonly services: CombatLabWorkspaceServices;
  readonly mapInteraction: CombatLabParticipantMapInteractionController | null;
  readonly roleId: string | null;
  readonly onSaved: (experiment: CombatLabExperimentV1, roleId: string) => void;
  readonly onError: (messageRu: string) => void;
}

export class CombatLabParticipantDialogController {
  readonly adapter: ProductionUnitEditorAdapterV1;
  private readonly registry = createDefaultCombatCatalogRegistry();
  private readonly originalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private readonly removeMapCompletionListener: () => void;
  private view: CombatLabParticipantDialogView | null = null;
  private localDraft: ProductionUnitEditorSnapshotV1;
  private destroyed = false;

  private constructor(private readonly options: CombatLabParticipantDialogControllerOptionsV1) {
    this.localDraft = options.roleId
      ? snapshotFromInitial(options.services.participantMutations.get(options.roleId).initial)
      : createDefaultSnapshot();
    this.adapter = {
      mode: 'local_dialog_draft',
      read: () => this.localDraft,
      update: (patch) => this.updateLocalDraft(patch),
      listGraphOptions: () => this.listGraphOptions(),
      listLoadoutOptions: () => this.listLoadoutOptions(),
      beginPlacement: () => this.beginPlacement(),
      beginFacing: () => this.beginFacing(),
      onError: (messageRu) => this.options.onError(messageRu),
    };
    this.removeMapCompletionListener = options.mapInteraction?.subscribeCompletion(() => this.finishMapInteraction()) ?? (() => undefined);
  }

  static open(options: CombatLabParticipantDialogControllerOptionsV1): CombatLabParticipantDialogController {
    const controller = new CombatLabParticipantDialogController(options);
    controller.view = new CombatLabParticipantDialogView({
      adapter: controller.adapter,
      titleRu: options.roleId ? 'Изменить бойца' : 'Создать бойца',
      onSave: () => controller.save(),
      onCancel: () => controller.close(),
      onRequestPlacement: () => controller.beginPlacement(),
      onRequestFacing: () => controller.beginFacing(),
    });
    return controller;
  }

  save(): void {
    if (this.destroyed) return;
    try {
      if (this.options.roleId) {
        const next = this.options.services.participantMutations.update(this.options.roleId, (context) => ({
          scenePatch: snapshotToPatch(this.localDraft, context.initial),
        }));
        this.options.onSaved(next, this.options.roleId);
        this.close();
        return;
      }
      const input = {
        titleRu: this.localDraft.titleRu,
        side: this.localDraft.side,
        unitType: this.localDraft.unitType,
        x: this.localDraft.x,
        y: this.localDraft.y,
        facingDegrees: this.localDraft.facingDegrees,
        posture: this.localDraft.posture,
        behaviorProfile: this.localDraft.behaviorProfile,
        speedCellsPerSecond: this.localDraft.speedCellsPerSecond,
        viewAngleDegrees: this.localDraft.viewAngleDegrees,
        viewRangeCells: this.localDraft.viewRangeCells,
        soldierTraits: this.localDraft.soldierTraits,
        soldierCondition: this.localDraft.soldierCondition,
        stress: this.localDraft.stress,
        suppression: this.localDraft.suppression,
        loadoutRef: this.localDraft.loadoutRef,
        loadedRounds: this.localDraft.loadedRounds,
        reserveRoundsByAmmoDefinitionId: this.localDraft.reserveRoundsByAmmoDefinitionId,
        firstAidCharges: this.localDraft.firstAidCharges,
        initialHealth: this.localDraft.bloodLoss > 0
          ? { mode: 'wound_set' as const, bloodLoss: this.localDraft.bloodLoss, wounds: [] }
          : { mode: 'healthy' as const },
        aiBrain: this.localDraft.aiBrain,
        aiGraphDefinition: this.localDraft.aiBrain.kind === 'graph'
          ? this.listGraphOptions().find((entry) => entry.graphId === this.localDraft.aiBrain.graphId)?.graph
          : undefined,
      };
      const next = createCombatLabParticipant(this.options.draft.getExperiment(), input);
      const createdRoleId = next.roles[next.roles.length - 1]?.roleId;
      if (!createdRoleId) throw new Error('Созданный участник не найден.');
      this.options.services.draft.replace(next, 'editor');
      this.options.onSaved(next, createdRoleId);
      this.close();
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : 'Не удалось сохранить бойца.');
    }
  }

  beginPlacement(): void {
    if (this.destroyed) return;
    if (!this.options.roleId || !this.options.mapInteraction) {
      this.options.onError('Для нового бойца сначала сохраните карточку, затем задайте точное место на карте.');
      return;
    }
    this.view?.hideForMapInteraction();
    this.options.mapInteraction.beginPlacement({
      roleId: this.options.roleId,
      initialX: this.localDraft.x,
      initialY: this.localDraft.y,
    });
  }

  beginFacing(): void {
    if (this.destroyed) return;
    if (!this.options.roleId || !this.options.mapInteraction) {
      this.options.onError('Для нового бойца сначала сохраните карточку, затем задайте направление на карте.');
      return;
    }
    this.view?.hideForMapInteraction();
    this.options.mapInteraction.beginFacing({
      roleId: this.options.roleId,
      x: this.localDraft.x,
      y: this.localDraft.y,
      facingDegrees: this.localDraft.facingDegrees,
    });
  }

  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.mapInteraction?.cancel();
    this.removeMapCompletionListener();
    this.view?.destroy();
    this.view = null;
    this.originalFocus?.focus();
  }

  private finishMapInteraction(): void {
    if (this.destroyed || !this.options.roleId) return;
    const refreshed = snapshotFromInitial(this.options.services.participantMutations.get(this.options.roleId).initial);
    this.localDraft = {
      ...this.localDraft,
      x: refreshed.x,
      y: refreshed.y,
      facingDegrees: refreshed.facingDegrees,
    };
    this.view?.showAfterMapInteraction();
  }

  private updateLocalDraft(patch: ProductionUnitEditorPatchV1): void {
    const loadoutCleared = patch.loadoutRef === null;
    this.localDraft = Object.freeze({
      ...this.localDraft,
      ...withoutNested(patch),
      soldierTraits: Object.freeze({ ...this.localDraft.soldierTraits, ...patch.soldierTraits }),
      soldierCondition: Object.freeze({ ...this.localDraft.soldierCondition, ...patch.soldierCondition }),
      reserveRoundsByAmmoDefinitionId: Object.freeze({
        ...this.localDraft.reserveRoundsByAmmoDefinitionId,
        ...patch.reserveRoundsByAmmoDefinitionId,
      }),
      loadoutRef: loadoutCleared ? null : patch.loadoutRef === undefined ? this.localDraft.loadoutRef : patch.loadoutRef,
      loadedRounds: loadoutCleared ? 0 : patch.loadedRounds ?? this.localDraft.loadedRounds,
      aiBrain: patch.aiBrain ?? this.localDraft.aiBrain,
    });
  }

  private listGraphOptions(): readonly ProductionUnitEditorGraphOptionV1[] {
    return listAvailableAiGraphCatalogEntries().map((entry) => Object.freeze({
      graphId: entry.graphId,
      titleRu: entry.titleRu,
      graph: entry.graph,
    }));
  }

  private listLoadoutOptions(): readonly ProductionUnitEditorLoadoutOptionV1[] {
    return this.registry.listLoadoutTemplates()
      .filter((loadout) => loadout.status === 'published')
      .map((loadout) => {
        const weapon = this.registry.resolveWeapon(loadout.primary.definition);
        return Object.freeze({
          ref: Object.freeze({ definitionId: loadout.loadoutTemplateId, revision: loadout.revision }),
          titleRu: loadout.nameRu,
          weaponTitleRu: weapon.nameRu,
          magazineCapacity: weapon.capacityRounds,
        });
      });
  }
}

function snapshotFromInitial(initial: CombatLabParticipantInitialDraftV1): ProductionUnitEditorSnapshotV1 {
  return Object.freeze({
    roleId: initial.roleId,
    unitId: initial.unitId,
    titleRu: initial.titleRu,
    side: initial.side,
    unitType: initial.unitType,
    x: initial.x,
    y: initial.y,
    facingDegrees: initial.facingDegrees,
    posture: initial.posture,
    behaviorProfile: initial.behaviorProfile,
    speedCellsPerSecond: initial.speedCellsPerSecond,
    viewAngleDegrees: initial.viewAngleDegrees,
    viewRangeCells: initial.viewRangeCells,
    soldierTraits: Object.freeze({ ...initial.soldierTraits }),
    soldierCondition: Object.freeze({ ...initial.soldierCondition }),
    stress: initial.unit.initialState.stress,
    suppression: initial.unit.initialState.suppression,
    loadoutRef: initial.loadoutRef ? Object.freeze({ ...initial.loadoutRef }) : null,
    loadedRounds: initial.loadedRounds,
    reserveRoundsByAmmoDefinitionId: Object.freeze(Object.fromEntries(initial.reserves.map((entry) => [entry.ammoDefinitionId, entry.rounds]))),
    firstAidCharges: initial.firstAidCharges,
    bloodLoss: initial.bloodLoss,
    aiBrain: initial.aiBrain,
  });
}

function createDefaultSnapshot(): ProductionUnitEditorSnapshotV1 {
  const defaults = SOLDIER_PARAMETERS_BY_PROFILE.regular;
  return Object.freeze({
    roleId: null,
    unitId: 'будет создан автоматически',
    titleRu: 'Новый боец',
    side: 'blue',
    unitType: 'infantry_squad',
    x: 0,
    y: 0,
    facingDegrees: 0,
    posture: 'standing',
    behaviorProfile: 'regular',
    speedCellsPerSecond: 0.45,
    viewAngleDegrees: 110,
    viewRangeCells: 16,
    soldierTraits: Object.freeze({ ...defaults.traits }),
    soldierCondition: Object.freeze({ ...defaults.condition }),
    stress: 0,
    suppression: 0,
    loadoutRef: null,
    loadedRounds: 0,
    reserveRoundsByAmmoDefinitionId: Object.freeze({}),
    firstAidCharges: 0,
    bloodLoss: 0,
    aiBrain: Object.freeze({ schemaVersion: 1, kind: 'manual' }),
  });
}

function snapshotToPatch(
  snapshot: ProductionUnitEditorSnapshotV1,
  initial: CombatLabParticipantInitialDraftV1,
): CombatLabParticipantScenePatchV1 {
  return {
    titleRu: snapshot.titleRu,
    side: snapshot.side,
    unitType: snapshot.unitType,
    x: snapshot.x,
    y: snapshot.y,
    facingDegrees: snapshot.facingDegrees,
    posture: snapshot.posture,
    behaviorProfile: snapshot.behaviorProfile,
    speedCellsPerSecond: snapshot.speedCellsPerSecond,
    viewAngleDegrees: snapshot.viewAngleDegrees,
    viewRangeCells: snapshot.viewRangeCells,
    soldierTraits: snapshot.soldierTraits,
    soldierCondition: snapshot.soldierCondition,
    stress: snapshot.stress,
    suppression: snapshot.suppression,
    loadoutRef: snapshot.loadoutRef,
    loadedRounds: snapshot.loadoutRef ? snapshot.loadedRounds : 0,
    reserveRoundsByAmmoDefinitionId: snapshot.loadoutRef ? snapshot.reserveRoundsByAmmoDefinitionId : {},
    firstAidCharges: snapshot.firstAidCharges,
    initialHealth: {
      mode: 'wound_set',
      bloodLoss: snapshot.bloodLoss,
      wounds: initial.wounds,
    },
    aiBrain: snapshot.aiBrain,
    aiGraphDefinition: snapshot.aiBrain.kind === 'graph'
      ? listAvailableAiGraphCatalogEntries().find((entry) => entry.graphId === snapshot.aiBrain.graphId)?.graph
      : undefined,
  };
}

function withoutNested(patch: ProductionUnitEditorPatchV1): Omit<ProductionUnitEditorPatchV1, 'soldierTraits' | 'soldierCondition' | 'reserveRoundsByAmmoDefinitionId' | 'aiGraphDefinition'> {
  const {
    soldierTraits: _soldierTraits,
    soldierCondition: _soldierCondition,
    reserveRoundsByAmmoDefinitionId: _reserve,
    aiGraphDefinition: _graph,
    ...rest
  } = patch;
  return rest;
}