import {
  getNavigationProfileRegistry,
  readNavigationProfileDebugOverride,
  subscribeNavigationProfileRegistry,
  writeNavigationProfileDebugOverride,
} from '../core/navigation/NavigationProfileStorage';
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
  const currentBlock = document.querySelector<HTMLElement>('.simulation-unit-bar .unit-bar-current');
  const controls = document.createElement('section');
  controls.className = 'route-cost-controls';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.action = 'route-cost-overlay';
  toggle.addEventListener('click', () => {
    const active = toggleRouteCostOverlay(state);
    updateToggle(toggle, active);
    onChanged();
  });

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

  const profileOverride = document.createElement('select');
  profileOverride.dataset.action = 'route-profile-override';
  profileOverride.setAttribute('aria-label', 'Профиль маршрута для диагностики');
  profileOverride.addEventListener('change', () => {
    writeNavigationProfileDebugOverride(profileOverride.value || null);
    onChanged();
  });

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Вид стоимости';
  modeLabel.append(mode);
  const profileLabel = document.createElement('label');
  profileLabel.textContent = 'Профиль для проверки';
  profileLabel.append(profileOverride);
  controls.append(toggle, modeLabel, profileLabel);
  displayPanel?.append(controls);

  const profileStatus = createStatusLine('navigation-profile');
  const routeCostStatus = createStatusLine('route-cost');
  const routeReasonStatus = createStatusLine('route-reason');
  currentBlock?.append(profileStatus, routeCostStatus, routeReasonStatus);

  const refreshProfileOptions = () => {
    const selected = readNavigationProfileDebugOverride() ?? '';
    profileOverride.innerHTML = '<option value="">Автоматически</option>'
      + getNavigationProfileRegistry().listProfiles()
        .map((profile) => `<option value="${escapeAttribute(profile.id)}">${escapeHtml(profile.nameRu)} · ${escapeHtml(profile.id)}</option>`)
        .join('');
    profileOverride.value = getNavigationProfileRegistry().hasProfile(selected) ? selected : '';
  };
  refreshProfileOptions();
  const unsubscribe = subscribeNavigationProfileRegistry(() => {
    refreshProfileOptions();
    onChanged();
  });

  const overlay = getRouteCostOverlayState(state);
  mode.value = overlay.mode;
  updateToggle(toggle, overlay.active);
  updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));

  const interval = window.setInterval(() => {
    updateStatus(profileStatus, routeCostStatus, routeReasonStatus, getSelectedUnit(state));
  }, UPDATE_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
    unsubscribe();
    controls.remove();
    profileStatus.remove();
    routeCostStatus.remove();
    routeReasonStatus.remove();
  };
}

function createStatusLine(role: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.dataset.role = role;
  element.className = `route-cost-status route-cost-status-${role}`;
  return element;
}

function updateStatus(
  profileElement: HTMLElement,
  costElement: HTMLElement,
  reasonElement: HTMLElement,
  unit: UnitModel | undefined,
): void {
  const order = unit?.order;
  if (!unit) {
    setText(profileElement, 'Режим движения: — · профиль маршрута: —');
    setText(costElement, 'Цена маршрута: — · длина: — · обход: —');
    setText(reasonElement, 'Причина маршрута: выберите бойца');
    return;
  }

  const profileId = order?.navigationProfileId ?? unit.activeNavigationProfileId ?? 'normal';
  const source = sourceLabel(order?.navigationProfileSource ?? unit.activeNavigationProfileSource ?? 'default');
  const movementMode = order?.movementMode ?? unit.navigationMovementMode ?? unit.playerCommand?.movementMode ?? 'normal';
  setText(profileElement, `Режим движения: ${movementMode} · профиль: ${profileId} · источник: ${source}`);

  if (!order) {
    setText(costElement, 'Цена маршрута: нет активного пути');
    setText(reasonElement, 'Причина маршрута: —');
    return;
  }
  const detour = order.detourRatio === undefined
    ? '—'
    : `${Math.round(Math.max(0, order.detourRatio - 1) * 100)}%${order.detourLimited ? ' · ограничен' : ''}`;
  setText(
    costElement,
    `Цена: ${formatNumber(order.pathCost)} · длина: ${formatMeters(order.pathDistanceMeters)} · обход: +${detour} · перестроений: ${order.replanCount ?? 0}`,
  );
  setText(reasonElement, `Причина маршрута: ${order.pathReasonRu ?? 'нет диагностической сводки'}`);
}

function updateToggle(button: HTMLButtonElement, active: boolean): void {
  button.textContent = `Стоимость маршрута: ${active ? 'вкл' : 'выкл'}`;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

function sourceLabel(source: string): string {
  return ({
    debugOverride: 'диагностика',
    playerCommand: 'приказ игрока',
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

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
