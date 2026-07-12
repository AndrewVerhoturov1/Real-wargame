import { createDirectPlayerMovePlan } from '../core/ai/UnitPlan';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { updatePlayerCommandStatus } from '../core/orders/PlayerCommand';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  getCommandPlanRouteOverlayState,
  toggleCommandPlanRouteOverlay,
} from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';

const UPDATE_INTERVAL_MS = 300;
const OVERLAY_OFF_CLASS = 'command-plan-route-overlay-off';
const LEGACY_PLAYER_MOVE_SELECTOR = '.selected-cover-card button, .stealth-position-card button';

export function installCommandPlanRouteUi(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const displayPanel = document.querySelector<HTMLElement>('.workspace-display-panel');
  const currentBlock = document.querySelector<HTMLElement>('.simulation-unit-bar .unit-bar-current');
  const clearButton = document.querySelector<HTMLButtonElement>('[data-action="clear-order"]');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.action = 'command-plan-route-overlay';
  toggle.addEventListener('click', () => {
    const active = toggleCommandPlanRouteOverlay(state);
    applyOverlayVisibility(active);
    updateToggle(toggle, active);
    onChanged();
  });
  displayPanel?.append(toggle);

  const command = createStatusLine('player-command');
  const plan = createStatusLine('unit-plan');
  const route = createStatusLine('unit-route');
  if (currentBlock) {
    const legacyOrder = currentBlock.querySelector<HTMLElement>('[data-role="order"]');
    if (legacyOrder) legacyOrder.hidden = true;
    currentBlock.append(command, plan, route);
  }

  if (clearButton) {
    clearButton.textContent = 'Отменить приказ';
    clearButton.onclick = () => {
      const unit = getSelectedUnit(state);
      if (!unit) return;
      cancelSelectedPlayerCommand(unit);
      updateStatus(command, plan, route, unit, state);
      onChanged();
    };
  }

  const handleLegacyPlayerMove = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target?.matches(LEGACY_PLAYER_MOVE_SELECTOR)) return;
    const unit = getSelectedUnit(state);
    const requestedTarget = unit?.order?.target;
    if (!requestedTarget) return;
    issueRoutedMoveOrderToSelectedUnits(state, requestedTarget);
    updateStatus(command, plan, route, getSelectedUnit(state), state);
    onChanged();
  };
  document.addEventListener('click', handleLegacyPlayerMove);

  const initialActive = getCommandPlanRouteOverlayState(state).active;
  applyOverlayVisibility(initialActive);
  updateToggle(toggle, initialActive);
  updateStatus(command, plan, route, getSelectedUnit(state), state);

  const interval = window.setInterval(() => {
    updateStatus(command, plan, route, getSelectedUnit(state), state);
  }, UPDATE_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('click', handleLegacyPlayerMove);
    toggle.remove();
    command.remove();
    plan.remove();
    route.remove();
  };
}

function createStatusLine(role: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.dataset.role = role;
  element.className = `command-plan-route-status command-plan-route-status-${role}`;
  return element;
}

function updateStatus(
  commandElement: HTMLElement,
  planElement: HTMLElement,
  routeElement: HTMLElement,
  unit: UnitModel | undefined,
  state: SimulationState,
): void {
  setText(commandElement, `Приказ: ${formatCommand(unit, state)}`);
  setText(planElement, `План: ${formatPlan(unit)}`);
  setText(routeElement, `Маршрут: ${formatRoute(unit)}`);
}

function formatCommand(unit: UnitModel | undefined, state: SimulationState): string {
  const command = unit?.playerCommand;
  if (!unit || !command) return 'нет';
  const status = ({
    active: 'выполняется',
    blocked: 'заблокирован',
    completed: 'выполнен',
    cancelled: 'отменён',
  } as const)[command.status];
  const distanceMeters = Math.hypot(
    command.target.x - unit.position.x,
    command.target.y - unit.position.y,
  ) * state.map.metersPerCell;
  return `двигаться к ${command.target.x.toFixed(1)}, ${command.target.y.toFixed(1)} · ${Math.round(distanceMeters)} м · ${status}`;
}

function formatPlan(unit: UnitModel | undefined): string {
  const plan = unit?.plan;
  if (!plan) return 'не построен';
  const active = plan.stages[Math.max(0, Math.min(plan.stages.length - 1, plan.activeStageIndex))];
  if (!active) return plan.branchLabelRu;
  return `${plan.branchLabelRu} · ${active.labelRu} · этап ${plan.activeStageIndex + 1}/${plan.stages.length}`;
}

function formatRoute(unit: UnitModel | undefined): string {
  const order = unit?.order;
  if (!order) return 'нет активного пути';
  const waypointCount = order.waypoints?.length ?? 1;
  const waypointIndex = Math.min(waypointCount, (order.waypointIndex ?? 0) + 1);
  const status = ({ planned: 'построен', following: 'выполняется', replanned: 'перестроен' } as const)[order.routeStatus ?? 'following'];
  return `${status} · точка ${waypointIndex}/${waypointCount}`;
}

function cancelSelectedPlayerCommand(unit: UnitModel): void {
  const command = unit.playerCommand;
  if (!command) {
    unit.order = null;
    unit.behaviorRuntime.lastEvent = 'manual_order_cleared';
    unit.behaviorRuntime.reason = 'Приказ очищен вручную.';
    return;
  }

  unit.playerCommand = updatePlayerCommandStatus(
    command,
    'cancelled',
    'Player command cancelled manually.',
    'Приказ игрока отменён вручную.',
  );
  if (unit.order?.playerCommandId === command.id) unit.order = null;
  if (unit.plan?.source === 'player_fallback' && unit.plan.commandId === command.id) {
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, unit.plan.stages[0]?.target ?? command.target);
  }
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.lastEvent = 'player_command_cancelled';
  unit.behaviorRuntime.reason = 'Приказ игрока отменён вручную.';
}

function applyOverlayVisibility(active: boolean): void {
  document.body.classList.toggle(OVERLAY_OFF_CLASS, !active);
}

function updateToggle(button: HTMLButtonElement, active: boolean): void {
  button.textContent = `Приказ · план · маршрут: ${active ? 'вкл' : 'выкл'}`;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}
