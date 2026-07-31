import { listAvailableAiGraphCatalogEntries } from '../../core/ai/AiGraphCatalog';
import { createDefaultCombatCatalogRegistry } from '../../core/infantry-combat/catalogs/CombatCatalogRegistry';
import type { CombatLabParticipantScenePatchV1 } from '../../core/testing/combat-lab/experiment';
import type {
  ProductionUnitEditorAdapterV1,
  ProductionUnitEditorGraphOptionV1,
  ProductionUnitEditorLoadoutOptionV1,
  ProductionUnitEditorPatchV1,
  ProductionUnitEditorSnapshotV1,
} from '../../ui/ProductionUnitEditor';
import type { CombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import type { CombatLabParticipantMapInteractionController } from './CombatLabParticipantMapInteractionController';

export interface CombatLabSceneEditorAdapterOptionsV1 {
  readonly services: CombatLabWorkspaceServices;
  readonly roleId: string;
  readonly mapInteraction?: CombatLabParticipantMapInteractionController | null;
  readonly onError?: (messageRu: string) => void;
}

export class CombatLabSceneEditorAdapter implements ProductionUnitEditorAdapterV1 {
  readonly mode = 'experiment_draft' as const;
  private readonly catalogRegistry = createDefaultCombatCatalogRegistry();

  constructor(private readonly options: CombatLabSceneEditorAdapterOptionsV1) {}

  read(): ProductionUnitEditorSnapshotV1 | null {
    const context = this.options.services.participantMutations.get(this.options.roleId);
    const initial = context.initial;
    const unit = initial.unit;
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
      stress: unit.initialState.stress,
      suppression: unit.initialState.suppression,
      loadoutRef: initial.loadoutRef ? Object.freeze({ ...initial.loadoutRef }) : null,
      loadedRounds: initial.loadedRounds,
      reserveRoundsByAmmoDefinitionId: Object.freeze(Object.fromEntries(initial.reserves.map((entry) => [entry.ammoDefinitionId, entry.rounds]))),
      firstAidCharges: initial.firstAidCharges,
      bloodLoss: initial.bloodLoss,
      aiBrain: initial.aiBrain,
    });
  }

  update(patch: ProductionUnitEditorPatchV1): void {
    this.options.services.participantMutations.update(this.options.roleId, (context) => ({
      scenePatch: this.toScenePatch(context.initial, patch),
    }));
  }

  listGraphOptions(): readonly ProductionUnitEditorGraphOptionV1[] {
    return listAvailableAiGraphCatalogEntries().map((entry) => Object.freeze({
      graphId: entry.graphId,
      titleRu: entry.titleRu,
      graph: entry.graph,
    }));
  }

  listLoadoutOptions(): readonly ProductionUnitEditorLoadoutOptionV1[] {
    return this.catalogRegistry.listLoadoutTemplates()
      .filter((loadout) => loadout.status === 'published')
      .map((loadout) => {
        const weapon = this.catalogRegistry.resolveWeapon(loadout.primary.definition);
        return Object.freeze({
          ref: Object.freeze({ definitionId: loadout.loadoutTemplateId, revision: loadout.revision }),
          titleRu: loadout.nameRu,
          weaponTitleRu: weapon.nameRu,
          magazineCapacity: weapon.capacityRounds,
        });
      });
  }

  beginPlacement(): void {
    const initial = this.options.services.participantMutations.get(this.options.roleId).initial;
    this.options.mapInteraction?.beginPlacement({
      roleId: this.options.roleId,
      initialX: initial.x,
      initialY: initial.y,
    });
  }

  beginFacing(): void {
    const initial = this.options.services.participantMutations.get(this.options.roleId).initial;
    this.options.mapInteraction?.beginFacing({
      roleId: this.options.roleId,
      x: initial.x,
      y: initial.y,
      facingDegrees: initial.facingDegrees,
    });
  }

  onError(messageRu: string): void {
    this.options.onError?.(messageRu);
  }

  private toScenePatch(
    initial: ReturnType<CombatLabWorkspaceServices['participantMutations']['get']>['initial'],
    patch: ProductionUnitEditorPatchV1,
  ): CombatLabParticipantScenePatchV1 {
    const scenePatch: CombatLabParticipantScenePatchV1 = {
      titleRu: patch.titleRu,
      side: patch.side,
      unitType: patch.unitType,
      x: patch.x,
      y: patch.y,
      facingDegrees: patch.facingDegrees,
      posture: patch.posture,
      behaviorProfile: patch.behaviorProfile,
      speedCellsPerSecond: patch.speedCellsPerSecond,
      viewAngleDegrees: patch.viewAngleDegrees,
      viewRangeCells: patch.viewRangeCells,
      soldierTraits: patch.soldierTraits,
      soldierCondition: patch.soldierCondition,
      stress: patch.stress,
      suppression: patch.suppression,
      loadoutRef: patch.loadoutRef,
      loadedRounds: patch.loadedRounds,
      reserveRoundsByAmmoDefinitionId: patch.reserveRoundsByAmmoDefinitionId,
      firstAidCharges: patch.firstAidCharges,
      aiBrain: patch.aiBrain,
      aiGraphDefinition: patch.aiGraphDefinition,
      initialHealth: patch.bloodLoss === undefined
        ? undefined
        : {
            mode: 'wound_set',
            bloodLoss: patch.bloodLoss,
            wounds: initial.wounds,
          },
    };
    return compactUndefined(scenePatch);
  }
}

function compactUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}