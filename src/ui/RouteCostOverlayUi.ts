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
const ROUTE_COST_INSPECTOR_RENDERED_EVENT = 'real-wargame:route-cost-inspector-rendered';

export function installRouteCostOverlayUi(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const profileStatus = document.querySelector<HTMLElement>('[data-role="route-details-profile"]');
  const routeCostStatus = document.querySelector<HTMLElement>('[data-role="route-details-cost"]');
  const routeReasonStatus = document.querySelector<HTMLElement>('[data-role="route-details-reason"]');
  const controls = document.createElement('section');
  controls.className = 'route-cost-controls';

  const heading = document.createElement('h3');
  heading.textContent = 'Слой стоимости маршрута';

  const description = document.createElement('p');
  description.textContent = 'Показывает цену перемещения по клеткам. Итоговая стоимость использует профиль и известные данные выбранного бойца.';

  const menuToggle = document.createElement('button');
  menuToggle.type = 'button';
  menuToggle.dataset.action = 'route-cost-overlay';

  const toggle = () => {
    const active = toggleRouteCostOverlay(state);
    updateToggle(menuToggle, active, 'Стоимость маршрута');
    onChanged();
  };
  menuToggle.addEventListener('click', toggle);

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
  controls.append(heading, description, menuToggle, modeLabel);

  const mountInspectorControls = () => {
    const host = document.querySelector<HTMLElement>('[data-role="route-cost-inspector-host"]');
    if (host && controls.parentElement !== host) host.append(controls);
  };
  window.addEventListener(ROUTE_COST_INSPECTOR_RENDERED_EVENT, mountInspectorControls);
  mountInspectorControls();

  const overlay = getRouteCostOverlayState(state);
  mode.value = overlay.mode === 'directionalTerrain' ? 'finalCost' : overlay.mode;
  updateToggle(menuToggle, overlay.active, 'Стоимость маршрута');
  updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));

  const interval = window.setInterval(() => {
    const current = getRouteCostOverlayState(state);
    const visibleMode = current.mode === 'directionalTerrain' ? 'finalCost' : current.mode;
    if (mode.value !== visibleMode) mode.value = visibleMode;
    updateToggle(menuToggle, current.active, 'Стоимость маршрута');
    updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));
  }, UPDATE_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
    window.removeEventListener(ROUTE_COST_INSPECTOR_RENDERED_EVENT, mountInspectorControls);
    menuToggle.removeEventListener('click', toggle);
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
  const directionalCost = order.pathCostBreakdown?.directionalTerrainCost;
  const directionalSummary = directionalCost === undefined
    ? ''
    : ` · учёт рельефа: ${formatSignedNumber(directionalCost)}`;
  setText(
    costElement,
    `Цена: ${formatNumber(order.pathCost)} · длина: ${formatMeters(order.pathDistanceMeters)} · обход: +${detour}${directionalSummary} · перестроений: ${order.replanCount ?? 0}`,
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

function formatSignedNumber(value: number): string {
  const prefix = value > 0.0005 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace('.', ',')}`;
}

function formatMeters(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} м`;
}

function setText(element: HTMLElement | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}
