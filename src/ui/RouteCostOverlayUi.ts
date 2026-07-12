import { getNavigationProfileRegistry } from '../core/navigation/NavigationProfileStorage';
import {
  getRouteCostOverlayState,
  setRouteCostOverlayMode,
  toggleRouteCostOverlay,
  type RouteCostOverlayMode,
} from '../core/navigation/RouteCostOverlayState';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

const UPDATE_INTERVAL_MS = 300;

export function installRouteCostOverlayUi(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const displayPanel = document.querySelector<HTMLElement>('.workspace-display-panel');
  const quickToggle = document.querySelector<HTMLButtonElement>('[data-action="route-cost-quick-toggle"]');
  const profileStatus = document.querySelector<HTMLElement>('[data-role="route-details-profile"]');
  const routeCostStatus = document.querySelector<HTMLElement>('[data-role="route-details-cost"]');
  const routeReasonStatus = document.querySelector<HTMLElement>('[data-role="route-details-reason"]');
  const controls = document.createElement('section');
  controls.className = 'route-cost-controls';

  const menuToggle = document.createElement('button');
  menuToggle.type = 'button';
  menuToggle.dataset.action = 'route-cost-overlay';

  const toggle = () => {
    const active = toggleRouteCostOverlay(state);
    updateToggle(menuToggle, active, 'Стоимость маршрута');
    if (quickToggle) updateToggle(quickToggle, active, 'Карта стоимости');
    onChanged();
  };
  menuToggle.addEventListener('click', toggle);
  quickToggle?.addEventListener('click', toggle);

  const mode = document.createElement('select');
  mode.dataset.action = 'route-cost-mode';
  mode.setAttribute('aria-label', 'Режим слоя стоимости маршрута');
  mode.innerHTML = `
    <option value="baseTerrain">Базовая местность</option>
    <option value="finalCost">Итоговая стоимость</option>
  `;
  mode.addEventListener('change', () => {
    setRouteCostOverlayMode(state, mode.value as RouteCostOverlayMode);
    onChanged();
  });

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Вид стоимости';
  modeLabel.append(mode);
  controls.append(menuToggle, modeLabel);
  displayPanel?.append(controls);

  const overlay = getRouteCostOverlayState(state);
  mode.value = overlay.mode;
  updateToggle(menuToggle, overlay.active, 'Стоимость маршрута');
  if (quickToggle) updateToggle(quickToggle, overlay.active, 'Карта стоимости');
  updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));

  const interval = window.setInterval(() => {
    const current = getRouteCostOverlayState(state);
    if (mode.value !== current.mode) mode.value = current.mode;
    updateToggle(menuToggle, current.active, 'Стоимость маршрута');
    if (quickToggle) updateToggle(quickToggle, current.active, 'Карта стоимости');
    updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));
  }, UPDATE_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
    quickToggle?.removeEventListener('click', toggle);
    controls.remove();
  };
}

function updateStatus(
  profileElement: HTMLElement | null,
  costElement: HTMLElement | null,
  reasonElement: HTMLElement | null,
  unit: UnitModel | undefined,
): void {
  const order = unit?.order;
  if (!unit) {
    setText(profileElement, 'Профиль: —');
    setText(costElement, 'Цена: — · длина: — · обход: —');
    setText(reasonElement, 'Причина: выберите бойца');
    return;
  }

  const profileId = order?.navigationProfileId
    ?? unit.playerCommand?.navigationProfileId
    ?? unit.playerNavigationProfileId
    ?? unit.activeNavigationProfileId
    ?? 'normal';
  const registry = getNavigationProfileRegistry();
  const profileName = registry.hasProfile(profileId) ? registry.getProfile(profileId).nameRu : profileId;
  const source = sourceLabel(order?.navigationProfileSource ?? unit.activeNavigationProfileSource ?? 'default');
  setText(profileElement, `Профиль: ${profileName} · ${profileId} · источник: ${source}`);

  if (!order) {
    setText(costElement, 'Цена: нет активного пути');
    setText(reasonElement, 'Причина: —');
    return;
  }
  const detour = order.detourRatio === undefined
    ? '—'
    : `${Math.round(Math.max(0, order.detourRatio - 1) * 100)}%${order.detourLimited ? ' · ограничен' : ''}`;
  setText(
    costElement,
    `Цена: ${formatNumber(order.pathCost)} · длина: ${formatMeters(order.pathDistanceMeters)} · обход: +${detour} · перестроений: ${order.replanCount ?? 0}`,
  );
  setText(reasonElement, `Причина: ${order.pathReasonRu ?? 'нет диагностической сводки'}`);
}

function updateToggle(button: HTMLButtonElement, active: boolean, label: string): void {
  const value = `${label}: ${active ? 'вкл' : 'выкл'}`;
  if (button.textContent !== value) button.textContent = value;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

function sourceLabel(source: string): string {
  return ({
    debugOverride: 'диагностика',
    playerCommand: 'приказ игрока',
    playerSelection: 'выбор игрока',
    behaviorMode: 'режим ИИ',
    unitRole: 'роль бойца',
    default: 'по умолчанию',
  } as Record<string, string>)[source] ?? source;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(1).replace('.', ',');
}

function formatMeters(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} м`;
}

function setText(element: HTMLElement | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}
