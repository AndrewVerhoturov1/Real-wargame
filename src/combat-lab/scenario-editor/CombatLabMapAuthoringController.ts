import { clampGridPositionToMap, worldToGrid } from '../../core/map/MapModel';
import type { SimulationState } from '../../core/simulation/SimulationState';
import { findUnitAtGridPosition, type UnitModel } from '../../core/units/UnitModel';
import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import type { GameApplicationContext } from '../../game/GameApplicationTypes';
import type { CameraController } from '../../input/CameraController';
import { getCombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import type { CombatLabMapToolCoordinator } from '../map-tools/CombatLabMapToolCoordinator';
import type { CombatLabSelectionControllerV1 } from '../selection/CombatLabSelectionController';
import type { CombatLabActionDescriptorV1 } from './CombatLabActionCatalog';
import { getCombatLabActionDescriptor } from './CombatLabActionCatalog';
import { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import {
  createCombatLabScenarioStep,
  createCombatLabScenarioStepFromCatalog,
  markerAt,
} from './CombatLabEditorFactories';
import { CombatLabMapContextMenu, type CombatLabMapContextMenuItemV1 } from './CombatLabMapContextMenu';
import { CombatLabMarkerInspector } from './CombatLabMarkerInspector';
import { CombatLabMarkerManager } from './CombatLabMarkerManager';
import type { CombatLabProgramMapModeV1 } from './CombatLabProgramMapMode';

export type CombatLabMapPickRequestV1 =
  | { readonly kind: 'point_marker'; readonly suggestedTitleRu: string }
  | { readonly kind: 'circle_marker'; readonly suggestedTitleRu: string; readonly defaultRadiusMetres: number }
  | { readonly kind: 'target_role'; readonly actorRoleId: string; readonly actionKind: 'fire' | 'first_aid' | 'transfer' };

export interface CombatLabMapAuthoringControllerOptions {
  readonly context: GameApplicationContext;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly mapTools?: CombatLabMapToolCoordinator;
  readonly selection?: CombatLabSelectionControllerV1;
  readonly getMode: () => CombatLabProgramMapModeV1;
  readonly getSelectedActorRoleId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onMessage?: (messageRu: string, error: boolean) => void;
  readonly onSelectHelperRole?: (roleId: string) => void;
  readonly onMarkerPreviewChanged?: (marker: CombatLabMarkerV1 | null) => void;
}

type ResolvedCombatLabMapAuthoringControllerOptions = Omit<
  CombatLabMapAuthoringControllerOptions,
  'mapTools' | 'selection'
> & {
  readonly mapTools: CombatLabMapToolCoordinator;
  readonly selection: CombatLabSelectionControllerV1;
};

interface CombatLabBoardAuthoringInternals {
  readonly app: { readonly canvas: HTMLCanvasElement };
  readonly camera: CameraController;
}

interface AuthoredPoint {
  readonly gridX: number;
  readonly gridY: number;
  readonly xMetres: number;
  readonly yMetres: number;
}

export class CombatLabMapAuthoringController {
  private readonly options: ResolvedCombatLabMapAuthoringControllerOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: CameraController;
  private readonly menu = new CombatLabMapContextMenu();
  private readonly markerManager: CombatLabMarkerManager;
  private readonly markerInspector: CombatLabMarkerInspector | null;
  private pendingPick: CombatLabMapPickRequestV1 | null = null;
  private destroyed = false;

  private constructor(options: CombatLabMapAuthoringControllerOptions) {
    const internals = options.context.board as unknown as CombatLabBoardAuthoringInternals;
    if (!internals.app?.canvas || typeof internals.camera?.screenToWorld !== 'function') {
      throw new Error('Карта не предоставляет штатное преобразование координат.');
    }
    const workspaceRoot = document.querySelector<HTMLElement>('.combat-lab-workspace');
    const services = workspaceRoot ? getCombatLabWorkspaceServices(workspaceRoot) : null;
    const mapTools = options.mapTools ?? services?.mapTools;
    const selection = options.selection ?? services?.selection;
    if (!mapTools || !selection) throw new Error('Общие службы Combat Lab ещё не подключены.');

    this.options = { ...options, mapTools, selection };
    this.canvas = internals.app.canvas;
    this.camera = internals.camera;
    this.markerManager = CombatLabMarkerManager.create({
      draft: options.draft,
      mapTools,
      selection,
      onExperimentChanged: options.onExperimentChanged,
      onPreviewChanged: (marker) => {
        options.onMarkerPreviewChanged?.(marker);
        this.canvas.dispatchEvent(new CustomEvent('combat-lab:marker-preview', { detail: marker }));
        options.context.forceRender();
      },
      onMessage: (messageRu, error) => this.message(messageRu, error),
    });
    const markerHost = workspaceRoot?.querySelector<HTMLElement>('.combat-lab-editor-marker-host') ?? null;
    this.markerInspector = markerHost
      ? new CombatLabMarkerInspector({
          host: markerHost,
          draft: options.draft,
          manager: this.markerManager,
          selection,
        })
      : null;
    this.canvas.addEventListener('contextmenu', this.handleContextMenu, true);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.addEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.addEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  static create(options: CombatLabMapAuthoringControllerOptions): CombatLabMapAuthoringController {
    return new CombatLabMapAuthoringController(options);
  }

  getMarkerManager(): CombatLabMarkerManager {
    return this.markerManager;
  }

  requestPick(request: CombatLabMapPickRequestV1): void {
    if (this.destroyed) return;
    if (this.options.getMode() !== 'program_authoring') {
      this.message('Переключитесь в режим «Редактор программы».', true);
      return;
    }
    this.options.mapTools.cancel();
    this.menu.close();
    this.pendingPick = request;
    this.canvas.dataset.combatLabMapPick = request.kind;
    this.message(request.kind === 'target_role' ? 'Выберите бойца левой кнопкой на карте.' : 'Укажите место левой кнопкой на карте.', false);
  }

  syncMode(): void {
    if (this.destroyed || this.options.getMode() === 'program_authoring') return;
    this.cancelActiveAuthoring(false);
    this.options.mapTools.cancel();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pendingPick = null;
    delete this.canvas.dataset.combatLabMapPick;
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu, true);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.markerInspector?.destroy();
    this.markerManager.destroy();
    this.menu.destroy();
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (this.options.getMode() !== 'program_authoring') {
      this.cancelActiveAuthoring(false);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const temporaryMode = this.options.mapTools.getMode();
    if ((temporaryMode === 'move_marker' || temporaryMode === 'resize_circle_marker') && event.button === 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.previewMapTool(event);
      return;
    }
    if (this.options.getMode() !== 'program_authoring') {
      this.cancelActiveAuthoring(false);
      return;
    }
    if (event.button === 0 && this.pendingPick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.completePick(this.pendingPick, this.resolvePoint(event));
      return;
    }
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pendingPick = null;
    delete this.canvas.dataset.combatLabMapPick;
    const point = this.resolvePoint(event);
    const target = findUnitAtGridPosition(this.options.state.units, { x: point.gridX, y: point.gridY });
    this.menu.open(event.clientX, event.clientY, this.buildMenuItems(point, target));
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const mode = this.options.mapTools.getMode();
    if (mode !== 'move_marker' && mode !== 'resize_circle_marker') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.previewMapTool(event);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const temporaryMode = this.options.mapTools.getMode();
    if ((temporaryMode === 'move_marker' || temporaryMode === 'resize_circle_marker') && event.button === 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.previewMapTool(event);
      this.options.mapTools.confirm();
      return;
    }
    if (this.options.getMode() !== 'program_authoring' || event.button !== 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    const mode = this.options.mapTools.getMode();
    if (mode !== 'move_marker' && mode !== 'resize_circle_marker') return;
    event.preventDefault();
    this.options.mapTools.cancel();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (!this.pendingPick && this.menu.root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelActiveAuthoring(true);
  };

  private previewMapTool(event: { readonly clientX: number; readonly clientY: number }): void {
    const point = this.resolvePoint(event);
    this.options.mapTools.preview({ xMetres: point.xMetres, yMetres: point.yMetres });
  }

  private resolvePoint(event: { readonly clientX: number; readonly clientY: number }): AuthoredPoint {
    const world = this.camera.screenToWorld(event);
    const grid = clampGridPositionToMap(this.options.state.map, worldToGrid(this.options.state.map, world));
    return {
      gridX: grid.x,
      gridY: grid.y,
      xMetres: grid.x * this.options.state.map.metersPerCell,
      yMetres: grid.y * this.options.state.map.metersPerCell,
    };
  }

  private completePick(request: CombatLabMapPickRequestV1, point: AuthoredPoint): void {
    try {
      if (request.kind === 'point_marker' || request.kind === 'circle_marker') {
        let markerId: string | null = null;
        const committed = this.commitComposite((draft) => {
          const experiment = draft.getExperiment();
          const marker = markerAt(
            experiment,
            request.kind === 'circle_marker' ? 'circle' : 'point',
            request.suggestedTitleRu,
            point.xMetres,
            point.yMetres,
            request.kind === 'circle_marker' ? request.defaultRadiusMetres : 5,
          );
          markerId = marker.markerId;
          draft.addMarker(marker);
        });
        if (committed && markerId) {
          this.markerManager.select(markerId);
          this.message(request.kind === 'circle_marker' ? 'Круглая область создана.' : 'Точечная метка создана.', false);
        }
      } else {
        const unit = findUnitAtGridPosition(this.options.state.units, { x: point.gridX, y: point.gridY });
        if (!unit) throw new Error('В этой точке нет бойца.');
        const committed = this.commitComposite((draft) => {
          const targetRole = ensureRoleForUnit(draft, unit);
          const experiment = draft.getExperiment();
          const actorRole = experiment.roles.find((role) => role.roleId === request.actorRoleId);
          if (!actorRole) throw new Error('Исполнитель не найден.');
          const descriptorId = request.actionKind === 'fire' ? 'fire-single' : request.actionKind === 'first_aid' ? 'first-aid' : 'transfer';
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(experiment, actorRole.roleId, descriptorId, { targetRoleId: targetRole.roleId, markerId: null }));
        });
        if (committed) this.message('Цель выбрана, действие добавлено в дорожку.', false);
      }
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Не удалось добавить объект на карту.', true);
    } finally {
      this.pendingPick = null;
      delete this.canvas.dataset.combatLabMapPick;
    }
  }

  private buildMenuItems(point: AuthoredPoint, target: UnitModel | undefined): readonly CombatLabMapContextMenuItemV1[] {
    const experiment = this.options.draft.getExperiment();
    const actorRoleId = this.options.getSelectedActorRoleId();
    const actorRole = experiment.roles.find((role) => role.roleId === actorRoleId);
    const actorUnit = actorRole ? this.options.state.units.find((unit) => unit.id === actorRole.unitId) : undefined;
    if (!actorRole || !actorUnit) return [disabledItem('actor-required', 'Сначала выберите дорожку бойца', 'Действие добавляется в выбранную дорожку.')];
    if (!target) return this.groundItems(point, actorRole);
    return target.side === actorUnit.side ? this.friendlyItems(target, actorRole) : this.enemyItems(target, actorRole, actorUnit);
  }

  private enemyItems(target: UnitModel, actorRole: CombatLabExperimentRoleV1, actorUnit: UnitModel): readonly CombatLabMapContextMenuItemV1[] {
    const ids = ['fire-single', 'fire-short', 'fire-long'] as const;
    const items: CombatLabMapContextMenuItemV1[] = ids.map((id) => {
      const descriptor = getCombatLabActionDescriptor(id);
      const availability = fireModeAvailability(actorUnit, descriptor.fireMode ?? 'single');
      return this.targetCatalogItem(descriptor, actorRole, target, availability);
    });
    items.push({
      id: 'face-enemy',
      labelRu: 'Повернуться к цели',
      onSelect: () => this.commitComposite((draft) => {
        const marker = markerAt(draft.getExperiment(), 'point', `Направление: ${target.labels.ru}`, target.position.x * this.options.state.map.metersPerCell, target.position.y * this.options.state.map.metersPerCell);
        draft.addMarker(marker);
        appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(draft.getExperiment(), actorRole.roleId, 'face', { markerId: marker.markerId }));
      }),
    });
    return items;
  }

  private friendlyItems(target: UnitModel, actorRole: CombatLabExperimentRoleV1): readonly CombatLabMapContextMenuItemV1[] {
    const experiment = this.options.draft.getExperiment();
    const targetRole = experiment.roles.find((role) => role.unitId === target.id);
    const targetTrack = targetRole ? experiment.tracks.find((track) => track.actorRoleId === targetRole.roleId) : null;
    const targetStep = targetTrack?.steps.filter((step) => step.enabled).at(-1) ?? null;
    return [
      this.targetCatalogItem(getCombatLabActionDescriptor('first-aid'), actorRole, target),
      this.targetCatalogItem(getCombatLabActionDescriptor('transfer'), actorRole, target),
      {
        id: 'select-helper',
        labelRu: 'Выбрать как помощника',
        onSelect: () => this.commitComposite((draft) => {
          const role = ensureRoleForUnit(draft, target, 'Помощник');
          this.options.onSelectHelperRole?.(role.roleId);
          this.canvas.dispatchEvent(new CustomEvent('combat-lab:helper-role-selected', { detail: { roleId: role.roleId } }));
        }),
      },
      {
        id: 'wait-friendly-step',
        labelRu: 'Ждать завершения его действия',
        disabled: !targetRole || !targetTrack || !targetStep,
        reasonRu: !targetRole ? 'Боец ещё не включён в программу.' : !targetStep ? 'В его дорожке нет действия.' : null,
        onSelect: () => {
          if (!targetRole || !targetTrack || !targetStep) return;
          this.commitComposite((draft) => {
            const base = createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'wait');
            appendStep(draft, actorRole.roleId, {
              ...base,
              titleRu: `Ждать: ${targetStep.titleRu}`,
              action: { kind: 'wait', durationSeconds: null },
              completion: { kind: 'condition', condition: { kind: 'step_state', trackId: targetTrack.trackId, stepId: targetStep.stepId, state: 'completed' } },
            });
          });
        },
      },
    ];
  }

  private groundItems(point: AuthoredPoint, actorRole: CombatLabExperimentRoleV1): readonly CombatLabMapContextMenuItemV1[] {
    const moveItems = (['move', 'recon', 'assault'] as const).map((id) => ({
      id: `ground-${id}`,
      labelRu: getCombatLabActionDescriptor(id).labelRu,
      onSelect: () => this.commitComposite((draft) => {
        const marker = markerAt(draft.getExperiment(), 'point', 'Позиция', point.xMetres, point.yMetres);
        draft.addMarker(marker);
        appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(draft.getExperiment(), actorRole.roleId, id, { markerId: marker.markerId }));
      }),
    }));
    const cancellations = (['cancel-movement', 'cancel-fire', 'cancel-reload', 'cancel-deployment', 'cancel-transfer', 'cancel-first-aid'] as const).map((id) => ({
      id: `ground-${id}`,
      labelRu: getCombatLabActionDescriptor(id).labelRu,
      onSelect: () => this.commitComposite((draft) => appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(draft.getExperiment(), actorRole.roleId, id))),
    }));
    return [
      ...moveItems,
      {
        id: 'face-here',
        labelRu: 'Повернуться сюда',
        onSelect: () => this.commitComposite((draft) => {
          const marker = markerAt(draft.getExperiment(), 'point', 'Направление', point.xMetres, point.yMetres);
          draft.addMarker(marker);
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(draft.getExperiment(), actorRole.roleId, 'face', { markerId: marker.markerId }));
        }),
      },
      {
        id: 'point-marker',
        labelRu: 'Создать точечную метку',
        onSelect: () => this.commitComposite((draft) => draft.addMarker(markerAt(draft.getExperiment(), 'point', 'Точка', point.xMetres, point.yMetres))),
      },
      {
        id: 'circle-marker',
        labelRu: 'Создать круглую область',
        onSelect: () => this.commitComposite((draft) => draft.addMarker(markerAt(draft.getExperiment(), 'circle', 'Область', point.xMetres, point.yMetres, 5))),
      },
      ...cancellations,
    ];
  }

  private targetCatalogItem(
    descriptor: CombatLabActionDescriptorV1,
    actorRole: CombatLabExperimentRoleV1,
    target: UnitModel,
    availability: { enabled: boolean; reasonRu: string | null } = { enabled: true, reasonRu: null },
  ): CombatLabMapContextMenuItemV1 {
    return {
      id: descriptor.id,
      labelRu: descriptor.labelRu,
      disabled: !availability.enabled,
      reasonRu: availability.reasonRu,
      onSelect: () => this.commitTargetAction(target, (draft, targetRole) => {
        appendStep(draft, actorRole.roleId, createCombatLabScenarioStepFromCatalog(draft.getExperiment(), actorRole.roleId, descriptor.id, { targetRoleId: targetRole.roleId, markerId: null }));
      }),
    };
  }

  private commitTargetAction(target: UnitModel, action: (draft: CombatLabExperimentDraft, targetRole: CombatLabExperimentRoleV1) => void): void {
    const committed = this.commitComposite((draft) => action(draft, ensureRoleForUnit(draft, target)));
    if (committed) this.message('Действие добавлено в дорожку.', false);
  }

  private commitComposite(mutator: (draft: CombatLabExperimentDraft) => void): boolean {
    if (this.options.getMode() !== 'program_authoring') {
      this.cancelActiveAuthoring(false);
      this.message('Действие не добавлено: включено ручное управление.', true);
      return false;
    }
    try {
      const before = this.options.draft.getExperiment();
      const temporary = new CombatLabExperimentDraft(before);
      mutator(temporary);
      const mutated = temporary.getExperiment();
      if (mutated.revision === before.revision) return true;
      const next: CombatLabExperimentV1 = { ...mutated, revision: before.revision + 1 };
      this.options.draft.replaceExperiment(next);
      this.options.onExperimentChanged(next);
      this.options.context.forceRender();
      return true;
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Не удалось изменить программу.', true);
      return false;
    }
  }

  private cancelActiveAuthoring(notify: boolean): void {
    const hadActiveState = this.pendingPick !== null || !this.menu.root.hidden;
    this.pendingPick = null;
    delete this.canvas.dataset.combatLabMapPick;
    this.menu.close();
    if (notify && hadActiveState) this.message('Добавление на карту отменено.', false);
  }

  private message(messageRu: string, error: boolean): void {
    this.options.onMessage?.(messageRu, error);
    this.canvas.dispatchEvent(new CustomEvent('combat-lab:authoring-message', { detail: { messageRu, error } }));
  }
}

function appendStep(draft: CombatLabExperimentDraft, actorRoleId: string, step: CombatLabScenarioStepV1): void {
  const experiment = draft.getExperiment();
  const trackId = experiment.tracks.find((track) => track.actorRoleId === actorRoleId)?.trackId ?? draft.addTrack(actorRoleId);
  draft.addStep(trackId, step);
}

function ensureRoleForUnit(draft: CombatLabExperimentDraft, unit: UnitModel, preferredTitleRu?: string): CombatLabExperimentRoleV1 {
  const experiment = draft.getExperiment();
  const existing = experiment.roles.find((role) => role.unitId === unit.id);
  if (existing) return existing;
  const role: CombatLabExperimentRoleV1 = {
    roleId: nextRoleId(experiment, unit.side === 'red' ? 'target' : 'ally'),
    unitId: unit.id,
    titleRu: preferredTitleRu ?? unit.labels.ru,
    parameters: { schemaVersion: 1, accuracy: null },
  };
  draft.assignRole(role);
  return role;
}

function nextRoleId(experiment: CombatLabExperimentV1, prefix: string): string {
  const used = new Set(experiment.roles.map((role) => role.roleId));
  for (let index = 1; index <= 1000; index += 1) {
    const roleId = `${prefix}-${index}`;
    if (!used.has(roleId)) return roleId;
  }
  throw new Error('Достигнут предел идентификаторов бойцов.');
}

function disabledItem(id: string, labelRu: string, reasonRu: string): CombatLabMapContextMenuItemV1 {
  return { id, labelRu, disabled: true, reasonRu, onSelect: () => undefined };
}

function fireModeAvailability(unit: UnitModel, mode: 'single' | 'short_burst' | 'long_burst' | 'suppress'): { enabled: boolean; reasonRu: string | null } {
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon) return { enabled: false, reasonRu: 'У бойца нет оружия.' };
  return weapon.resolved.weapon.availableFireModes.includes(mode)
    ? { enabled: true, reasonRu: null }
    : { enabled: false, reasonRu: 'Оружие не поддерживает этот режим огня.' };
}
