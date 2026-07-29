import type { CameraController } from '../../input/CameraController';
import { clampGridPositionToMap, worldToGrid } from '../../core/map/MapModel';
import type { SimulationState } from '../../core/simulation/SimulationState';
import { findUnitAtGridPosition, type UnitModel } from '../../core/units/UnitModel';
import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
  CombatLabFireModeV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import type { GameApplicationContext } from '../../game/GameApplicationTypes';
import { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import {
  createCombatLabScenarioStep,
  markerAt,
} from './CombatLabEditorFactories';
import { CombatLabMapContextMenu, type CombatLabMapContextMenuItemV1 } from './CombatLabMapContextMenu';

export type CombatLabMapPickRequestV1 =
  | { readonly kind: 'point_marker'; readonly suggestedTitleRu: string }
  | { readonly kind: 'circle_marker'; readonly suggestedTitleRu: string; readonly defaultRadiusMetres: number }
  | { readonly kind: 'target_role'; readonly actorRoleId: string; readonly actionKind: 'fire' | 'first_aid' | 'transfer' };

export interface CombatLabMapAuthoringControllerOptions {
  readonly context: GameApplicationContext;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getMode: () => 'scenario_editor' | 'manual_control';
  readonly getSelectedActorRoleId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onMessage?: (messageRu: string, error: boolean) => void;
  readonly onSelectHelperRole?: (roleId: string) => void;
}

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
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: CameraController;
  private readonly menu = new CombatLabMapContextMenu();
  private pendingPick: CombatLabMapPickRequestV1 | null = null;
  private destroyed = false;

  private constructor(private readonly options: CombatLabMapAuthoringControllerOptions) {
    const internals = options.context.board as unknown as CombatLabBoardAuthoringInternals;
    if (!internals.app?.canvas || typeof internals.camera?.screenToWorld !== 'function') {
      throw new Error('Production board не предоставляет существующее преобразование координат карты.');
    }
    this.canvas = internals.app.canvas;
    this.camera = internals.camera;
    this.canvas.addEventListener('contextmenu', this.handleContextMenu, true);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.addEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  static create(options: CombatLabMapAuthoringControllerOptions): CombatLabMapAuthoringController {
    return new CombatLabMapAuthoringController(options);
  }

  requestPick(request: CombatLabMapPickRequestV1): void {
    if (this.destroyed) return;
    if (this.options.getMode() !== 'scenario_editor') {
      this.message('Переключитесь в режим «Редактор сценария».', true);
      return;
    }
    this.menu.close();
    this.pendingPick = request;
    this.canvas.dataset.combatLabMapPick = request.kind;
    this.message(request.kind === 'target_role'
      ? 'Выберите бойца левой кнопкой на карте.'
      : 'Укажите место левой кнопкой на карте.', false);
  }

  syncMode(): void {
    if (this.destroyed || this.options.getMode() === 'scenario_editor') return;
    this.cancelActiveAuthoring(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pendingPick = null;
    delete this.canvas.dataset.combatLabMapPick;
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu, true);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.menu.destroy();
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (this.options.getMode() !== 'scenario_editor') {
      this.cancelActiveAuthoring(false);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.options.getMode() !== 'scenario_editor') {
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

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.options.getMode() !== 'scenario_editor' || event.button !== 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (!this.pendingPick && this.menu.root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelActiveAuthoring(true);
  };

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
        const committed = this.commitComposite((draft) => {
          const experiment = draft.getExperiment();
          draft.addMarker(markerAt(
            experiment,
            request.kind === 'circle_marker' ? 'circle' : 'point',
            request.suggestedTitleRu,
            point.xMetres,
            point.yMetres,
            request.kind === 'circle_marker' ? request.defaultRadiusMetres : 5,
          ));
        });
        if (committed) this.message(request.kind === 'circle_marker' ? 'Круглая область создана.' : 'Точечная метка создана.', false);
      } else {
        const unit = findUnitAtGridPosition(this.options.state.units, { x: point.gridX, y: point.gridY });
        if (!unit) throw new Error('В этой точке нет бойца.');
        const committed = this.commitComposite((draft) => {
          const targetRole = ensureRoleForUnit(draft, unit);
          const experiment = draft.getExperiment();
          const actorRole = experiment.roles.find((role) => role.roleId === request.actorRoleId);
          if (!actorRole) throw new Error(`Роль исполнителя «${request.actorRoleId}» не найдена.`);
          const step = createCombatLabScenarioStep(experiment, actorRole.roleId, request.actionKind, {
            targetRoleId: targetRole.roleId,
            markerId: null,
          });
          appendStep(draft, actorRole.roleId, step);
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
    if (!actorRole || !actorUnit) {
      return [disabledItem('actor-required', 'Сначала выберите дорожку исполнителя', 'Действие добавляется только в выбранную дорожку.')];
    }
    if (!target) return this.groundItems(point, actorRole, actorUnit);
    return target.side === actorUnit.side
      ? this.friendlyItems(target, actorRole)
      : this.enemyItems(target, actorRole, actorUnit);
  }

  private enemyItems(target: UnitModel, actorRole: CombatLabExperimentRoleV1, actorUnit: UnitModel): readonly CombatLabMapContextMenuItemV1[] {
    const experiment = this.options.draft.getExperiment();
    const existingTargetRole = experiment.roles.find((role) => role.unitId === target.id);
    const fireModes: ReadonlyArray<readonly [CombatLabFireModeV1, string]> = [
      ['single', 'Одиночный выстрел'],
      ['short_burst', 'Короткая очередь'],
      ['long_burst', 'Длинная очередь'],
      ['suppress', 'Подавляющий огонь'],
    ];
    const items: CombatLabMapContextMenuItemV1[] = fireModes.map(([mode, label]) => {
      const availability = fireModeAvailability(actorUnit, mode);
      return {
        id: `fire-${mode}`,
        labelRu: label,
        disabled: !availability.enabled,
        reasonRu: availability.reasonRu,
        onSelect: () => this.commitTargetAction(actorRole.roleId, target, (draft, targetRole) => {
          const step = createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'fire', {
            targetRoleId: targetRole.roleId,
            markerId: null,
            fireMode: mode,
          });
          appendStep(draft, actorRole.roleId, step);
        }),
      };
    });
    const singleAvailability = fireModeAvailability(actorUnit, 'single');
    items.push({
      id: 'fire-until-incapacitated',
      labelRu: 'Стрелять до потери боеспособности',
      disabled: !singleAvailability.enabled,
      reasonRu: singleAvailability.reasonRu,
      onSelect: () => this.commitTargetAction(actorRole.roleId, target, (draft, targetRole) => {
        const experimentNow = draft.getExperiment();
        const base = createCombatLabScenarioStep(experimentNow, actorRole.roleId, 'fire', {
          targetRoleId: targetRole.roleId,
          markerId: null,
          fireMode: 'single',
        });
        const step: CombatLabScenarioStepV1 = {
          ...base,
          titleRu: `Стрелять по ${targetRole.titleRu} до потери боеспособности`,
          repeat: {
            kind: 'until_condition',
            condition: { kind: 'role_state', roleId: targetRole.roleId, state: 'incapacitated' },
            maximumAttempts: 100,
            retryDelaySeconds: 0,
          },
        };
        appendStep(draft, actorRole.roleId, step);
      }),
    });
    items.push({
      id: 'wait-contact',
      labelRu: 'Ждать обнаружения цели',
      onSelect: () => this.commitTargetAction(actorRole.roleId, target, (draft, targetRole) => {
        const base = createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'wait');
        appendStep(draft, actorRole.roleId, {
          ...base,
          titleRu: `Ждать обнаружения ${targetRole.titleRu}`,
          action: { kind: 'wait', durationSeconds: null },
          completion: {
            kind: 'condition',
            condition: { kind: 'contact', observerRoleId: actorRole.roleId, targetRoleId: targetRole.roleId, present: true },
          },
        });
      }),
    });
    if (!existingTargetRole) {
      items.unshift(disabledItem('role-created', 'Цели будет назначена стабильная роль', `unit: ${target.id}`));
    }
    return items;
  }

  private friendlyItems(target: UnitModel, actorRole: CombatLabExperimentRoleV1): readonly CombatLabMapContextMenuItemV1[] {
    const experiment = this.options.draft.getExperiment();
    const targetRole = experiment.roles.find((role) => role.unitId === target.id);
    const targetTrack = targetRole ? experiment.tracks.find((track) => track.actorRoleId === targetRole.roleId) : null;
    const targetStep = targetTrack?.steps.filter((step) => step.enabled).at(-1) ?? null;
    return [
      {
        id: 'first-aid',
        labelRu: 'Оказать первую помощь',
        onSelect: () => this.commitTargetAction(actorRole.roleId, target, (draft, role) => {
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'first_aid', { targetRoleId: role.roleId }));
        }),
      },
      {
        id: 'transfer-ammo',
        labelRu: 'Передать 30 патронов',
        onSelect: () => this.commitTargetAction(actorRole.roleId, target, (draft, role) => {
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'transfer', { targetRoleId: role.roleId }));
        }),
      },
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
        reasonRu: !targetRole ? 'Бойцу ещё не назначена роль.' : !targetStep ? 'В его дорожке нет действия.' : null,
        onSelect: () => {
          if (!targetRole || !targetTrack || !targetStep) return;
          this.commitComposite((draft) => {
            const base = createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'wait');
            appendStep(draft, actorRole.roleId, {
              ...base,
              titleRu: `Ждать ${targetRole.titleRu}: ${targetStep.titleRu}`,
              action: { kind: 'wait', durationSeconds: null },
              completion: {
                kind: 'condition',
                condition: { kind: 'step_state', trackId: targetTrack.trackId, stepId: targetStep.stepId, state: 'completed' },
              },
            });
          });
        },
      },
    ];
  }

  private groundItems(
    point: AuthoredPoint,
    actorRole: CombatLabExperimentRoleV1,
    actorUnit: UnitModel,
  ): readonly CombatLabMapContextMenuItemV1[] {
    const suppressAvailability = fireModeAvailability(actorUnit, 'suppress');
    return [
      {
        id: 'move-here',
        labelRu: 'Двигаться сюда',
        onSelect: () => this.commitComposite((draft) => {
          const marker = markerAt(draft.getExperiment(), 'point', 'Позиция', point.xMetres, point.yMetres);
          draft.addMarker(marker);
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'move', { markerId: marker.markerId }));
        }),
      },
      {
        id: 'point-marker',
        labelRu: 'Создать точечную метку',
        onSelect: () => this.commitComposite((draft) => {
          draft.addMarker(markerAt(draft.getExperiment(), 'point', 'Точка', point.xMetres, point.yMetres));
        }),
      },
      {
        id: 'circle-marker',
        labelRu: 'Создать круглую область',
        onSelect: () => this.commitComposite((draft) => {
          draft.addMarker(markerAt(draft.getExperiment(), 'circle', 'Область', point.xMetres, point.yMetres, 5));
        }),
      },
      {
        id: 'suppress-area',
        labelRu: 'Подавлять область',
        disabled: !suppressAvailability.enabled,
        reasonRu: suppressAvailability.reasonRu,
        onSelect: () => this.commitComposite((draft) => {
          const marker = markerAt(draft.getExperiment(), 'circle', 'Область подавления', point.xMetres, point.yMetres, 5);
          draft.addMarker(marker);
          appendStep(draft, actorRole.roleId, createCombatLabScenarioStep(draft.getExperiment(), actorRole.roleId, 'fire', {
            markerId: marker.markerId,
            fireMode: 'suppress',
          }));
        }),
      },
    ];
  }

  private commitTargetAction(
    _actorRoleId: string,
    target: UnitModel,
    action: (draft: CombatLabExperimentDraft, targetRole: CombatLabExperimentRoleV1) => void,
  ): void {
    const committed = this.commitComposite((draft) => {
      const role = ensureRoleForUnit(draft, target);
      action(draft, role);
    });
    if (committed) this.message('Действие добавлено в дорожку.', false);
  }

  private commitComposite(mutator: (draft: CombatLabExperimentDraft) => void): boolean {
    if (this.options.getMode() !== 'scenario_editor') {
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

function ensureRoleForUnit(
  draft: CombatLabExperimentDraft,
  unit: UnitModel,
  preferredTitleRu?: string,
): CombatLabExperimentRoleV1 {
  const experiment = draft.getExperiment();
  const existing = experiment.roles.find((role) => role.unitId === unit.id);
  if (existing) return existing;
  const roleId = nextRoleId(experiment, unit.side === 'red' ? 'target' : 'ally');
  const role: CombatLabExperimentRoleV1 = {
    roleId,
    unitId: unit.id,
    titleRu: preferredTitleRu ?? unit.labels.ru,
    selectableAs: unit.side === 'red'
      ? ['target', 'first_aid_target', 'ammo_target']
      : ['shooter', 'target', 'assistant', 'first_aid_actor', 'first_aid_target', 'ammo_source', 'ammo_target'],
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
  throw new Error('Достигнут предел ID ролей.');
}

function fireModeAvailability(unit: UnitModel, mode: CombatLabFireModeV1): { enabled: boolean; reasonRu: string | null } {
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon) return { enabled: false, reasonRu: 'У исполнителя нет основного оружия.' };
  if (!weapon.resolved.weapon.availableFireModes.includes(mode)) {
    return { enabled: false, reasonRu: `Оружие не поддерживает режим ${mode}.` };
  }
  return { enabled: true, reasonRu: null };
}

function disabledItem(id: string, labelRu: string, reasonRu: string): CombatLabMapContextMenuItemV1 {
  return { id, labelRu, disabled: true, reasonRu, onSelect: () => undefined };
}
