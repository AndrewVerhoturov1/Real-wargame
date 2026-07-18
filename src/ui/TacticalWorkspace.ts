import '../tactical-workspace-stage8.css';
import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { getCombatRuntime } from '../core/combat/CombatDamage';
import { findBestDirectFireContact } from '../core/combat/CombatDecision';
import { getFireAction, requestFireAction } from '../core/combat/FireAction';
import { getWeaponRuntime } from '../core/combat/WeaponModel';
import {
  getCoverSuitability,
  type CoverCandidateDiagnostic,
} from '../core/cover/CoverSuitability';
import { getCell, type MapCell } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import { getNavigationProfileRegistry, subscribeNavigationProfileRegistry } from '../core/navigation/NavigationProfileStorage';
import { readPublishedRouteDanger } from '../core/navigation/RouteDangerDiagnostic';
import { isPlayerCommandOutstanding, updatePlayerCommandNavigationProfile } from '../core/orders/PlayerCommand';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../core/perception/AttentionController';
import { degreesToRadians, type AttentionMode } from '../core/perception/AttentionModel';
import { applyAttentionProfileToUnit } from '../core/perception/AttentionProfiles';
import { getAttentionProfileRegistry, subscribeAttentionProfileRegistry } from '../core/perception/AttentionProfileStorage';
import { evaluateThreatsAtPosition } from '../core/pressure/ThreatEvaluation';
import { getSelectedUnit, issueMoveOrderToSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import { sampleSmoothHeightLevel } from '../core/terrain/SmoothTerrain';
import {
  AI_TEST_TIME_SCALES,
  getAiTestPaused,
  getAiTestTimeScale,
  resetSelectedUnitForTest,
  setAiTestPaused,
  setAiTestTimeScale,
} from '../core/testing/AiTestLabRuntime';
import {
  getRealReliefOverlayState,
  getTacticalOverlayMode,
  getUnitCommandToolState,
  setSimulationLayerMode,
  setTacticalOverlayMode,
  setTurnToolActive,
  toggleRealReliefOverlay,
  type SimulationLayerMode,
  type TacticalOverlayMode,
} from '../core/ui/RuntimeUiState';
import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';
import { exitLab } from '../shared/AppShellMenu';
import { bindTacticalStatePlanPanel, renderTacticalStatePlanPanelMarkup } from './AiStatePlanPanel';

export type TacticalWorkspaceMode = 'simulation' | 'editor';
type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory';

type StableDecision = {
  signature: string;
  decision: string;
  reason: string;
  postureReason: string;
  stateReason: string;
};

const TABS: Array<[SimulationTab, string]> = [
  ['info', 'Инфо'],
  ['danger', 'Опасность'],
  ['stealth', 'Скрытность'],
  ['memory', 'Обзор и память'],
];
const OVERLAY_MODES: Array<[TacticalOverlayMode, string]> = [
  ['danger', 'Опасность'],
  ['cover', 'Укрытия'],
  ['combined', 'Вместе'],
];
const TACTICAL_OVERLAY_MODE_CHANGED_EVENT = 'real-wargame:tactical-overlay-mode-changed';

export function installTacticalWorkspace(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): () => void {
  let mode: TacticalWorkspaceMode = state.editor.enabled ? 'editor' : 'simulation';
  let tab: SimulationTab = 'info';
  let collapsed = false;
  let lastRenderKey = '';
  const stableDecisions = new Map<string, StableDecision>();

  const shell = document.createElement('div');
  shell.className = 'tactical-workspace-shell';
  shell.innerHTML = `
    <header class="tactical-workspace-bar">
      <div class="workspace-brand"><strong>Тактическая карта</strong><span>симуляция и редактор</span></div>
      <div class="workspace-mode-switch"><button data-mode="simulation">Симуляция</button><button data-mode="editor">Редактирование</button></div>
      <div class="workspace-top-actions">
        <button class="editor-place-button primary" data-action="editor-place">Поставить</button>
        <button data-action="ai-editor">Редактор ИИ</button><button data-action="new-game">Новая игра</button>
        <details class="workspace-file-menu"><summary>Файл</summary><div class="workspace-file-panel" data-role="file-tools"></div></details>
        <details class="workspace-display-menu"><summary>Вид</summary><div class="workspace-display-panel" data-role="display"></div></details>
        <button class="danger" data-action="exit">Выход</button>
      </div>
    </header>
    <aside class="simulation-sidebar">
      <header class="simulation-sidebar-header"><div><strong data-role="sidebar-title">Информация о бойце</strong><span>Субъективные данные выбранного солдата</span></div><button class="workspace-icon-button" data-action="collapse">‹</button></header>
      <nav class="simulation-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</nav>
      <div class="simulation-sidebar-body" data-role="sidebar-body"></div>
    </aside>
    <section class="simulation-unit-bar">
      <div class="unit-bar-identity">
        <strong data-role="unit-name">Боец не выбран</strong>
        <span data-role="unit-meta">Левый клик по солдату — выбрать</span>
        <div class="unit-bar-current"><span data-role="action">Действие: —</span><span data-role="order">Приказ: —</span></div>
      </div>
      ${renderTacticalStatePlanPanelMarkup()}
      <div class="unit-bar-stats">${['health:Здоровье','morale:Дух','fatigue:Усталость','stress:Стресс','suppression:Подавление','ammo:Патроны'].map((item) => { const [id,label]=item.split(':'); return `<div class="unit-bar-stat"><span>${label}</span><b data-stat="${id}">—</b></div>`; }).join('')}</div>
      <div class="unit-bar-route-controls">
        <label class="unit-route-profile"><span>Маршрут</span><select data-action="unit-navigation-profile"></select></label>
        <label class="unit-attention-profile"><span>Профиль внимания</span><select data-action="unit-attention-profile"></select></label>
        <label class="unit-attention-mode"><span>Внимание</span><select data-action="unit-attention-mode"><option value="automatic">Автоматически</option><option value="march">Марш</option><option value="observe">Наблюдение</option><option value="search">Поиск</option><option value="engage">Стрельба</option></select></label>
        <button type="button" data-action="turn-unit" aria-pressed="false">Повернуть</button>
        <button type="button" data-action="route-cost-quick-toggle" aria-pressed="false">Карта стоимости: выкл</button>
        <details class="unit-route-details"><summary data-role="route-summary">Маршрут: —</summary><div class="unit-route-details-panel">
          <span data-role="route-details-command">Приказ: —</span><span data-role="route-details-plan">План: —</span><span data-role="route-details-route">Маршрут: —</span><span data-role="route-details-profile">Профиль: —</span><span data-role="route-details-cost">Цена: —</span><span data-role="route-details-reason">Причина: —</span>
        </div></details>
      </div>
      <div class="unit-bar-command-group posture-group"><button data-posture="standing">Стоять</button><button data-posture="crouched">Пригнуться</button><button data-posture="prone">Лечь</button></div>
      <div class="unit-bar-command-group simulation-controls">
        <button class="primary" data-action="pause">Пауза</button><button data-action="step">Один шаг</button>
        <button data-action="evaluate">Диагностика ИИ</button><button class="primary" data-action="execute">Рассчитать и выполнить</button>
        <button class="primary" data-action="fire-contact">Огонь по контакту</button><button data-action="clear-order">Очистить приказ</button><button data-action="reset-unit">Сбросить бойца</button>
      </div>
      <div class="unit-bar-speed-group">${AI_TEST_TIME_SCALES.map((scale) => `<button data-speed="${scale}">×${scale}</button>`).join('')}</div>
    </section>`;
  document.body.append(shell);

  const q = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Tactical workspace element missing: ${selector}`);
    return element;
  };
  const sidebar = q<HTMLElement>('.simulation-sidebar');
  const bottom = q<HTMLElement>('.simulation-unit-bar');
  const sidebarBody = q<HTMLElement>('[data-role="sidebar-body"]');
  const sidebarTitle = q<HTMLElement>('[data-role="sidebar-title"]');
  const display = q<HTMLElement>('[data-role="display"]');
  const fileTools = q<HTMLElement>('[data-role="file-tools"]');
  const editorPlace = q<HTMLButtonElement>('[data-action="editor-place"]');
  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');
  const attentionProfileSelect = q<HTMLSelectElement>('[data-action="unit-attention-profile"]');
  const attentionModeSelect = q<HTMLSelectElement>('[data-action="unit-attention-mode"]');
  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');
  const fireContactButton = q<HTMLButtonElement>('[data-action="fire-contact"]');
  const statePlanPanel = bindTacticalStatePlanPanel(shell);

  moveExistingButton('#grid-toggle', display);
  moveExistingButton('#height-toggle', display);
  moveExistingButton('#language-toggle', display);
  const relief = button(`Реальный рельеф: ${getRealReliefOverlayState(state).active ? 'вкл' : 'выкл'}`);
  relief.onclick = () => {
    const active = toggleRealReliefOverlay(state);
    relief.textContent = `Реальный рельеф: ${active ? 'вкл' : 'выкл'}`;
    relief.classList.toggle('active', active);
    onChanged();
  };
  display.append(relief);
  moveWorkspaceFileTools(fileTools);

  const refreshNavigationProfiles = (): void => {
    const registry = getNavigationProfileRegistry();
    navigationProfile.innerHTML = registry.listProfiles().map((profile) => `<option value="${esc(profile.id)}">${esc(profile.nameRu)}</option>`).join('');
    const requested = getSelectedUnit(state)?.playerNavigationProfileId ?? 'normal';
    navigationProfile.value = registry.hasProfile(requested) ? requested : 'normal';
  };
  const refreshAttentionProfiles = (): void => {
    const registry = getAttentionProfileRegistry();
    attentionProfileSelect.innerHTML = '<option value="individual">Индивидуальный</option>'
      + registry.listProfiles().map((profile) => `<option value="${esc(profile.id)}">${esc(profile.nameRu)}</option>`).join('');
    const requested = getSelectedUnit(state)?.playerAttentionProfileId ?? 'individual';
    attentionProfileSelect.value = registry.hasProfile(requested) ? requested : 'individual';
  };
  refreshNavigationProfiles();
  refreshAttentionProfiles();
  const unsubscribeNavigation = subscribeNavigationProfileRegistry(() => { refreshNavigationProfiles(); update(true); onChanged(); });
  const unsubscribeAttention = subscribeAttentionProfileRegistry(() => { refreshAttentionProfiles(); update(true); onChanged(); });

  navigationProfile.onchange = () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const registry = getNavigationProfileRegistry();
    const profileId = registry.hasProfile(navigationProfile.value) ? navigationProfile.value : 'normal';
    unit.playerNavigationProfileId = profileId;
    if (isPlayerCommandOutstanding(unit.playerCommand)) unit.playerCommand = updatePlayerCommandNavigationProfile(unit.playerCommand!, profileId);
    update(true);
    onChanged();
  };
  attentionProfileSelect.onchange = () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const profileId = attentionProfileSelect.value;
    if (profileId === 'individual') unit.playerAttentionProfileId = null;
    else {
      const registry = getAttentionProfileRegistry();
      if (registry.hasProfile(profileId)) applyAttentionProfileToUnit(unit, registry.getProfile(profileId));
    }
    update(true);
    onChanged();
  };
  attentionModeSelect.onchange = () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const requested = attentionModeSelect.value;
    if (requested === 'automatic') clearAttentionOverride(unit);
    else if (requested === 'search') setSearchSector(unit, unit.facingRadians, degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees), 'player');
    else setAttentionMode(unit, requested as AttentionMode, 'player');
    update(true);
    onChanged();
  };
  turnUnitButton.onclick = () => {
    if (!getSelectedUnit(state)) return;
    setTurnToolActive(state, !getUnitCommandToolState(state).turnToolActive);
    window.dispatchEvent(new CustomEvent('real-wargame:unit-command-tool-changed'));
    update(true);
    onChanged();
  };

  const handleOverlayHotkey = (): void => { syncOverlayButtons(); update(true); onChanged(); };
  window.addEventListener(TACTICAL_OVERLAY_MODE_CHANGED_EVENT, handleOverlayHotkey);

  q<HTMLButtonElement>('[data-action="ai-editor"]').onclick = () => window.open('/ai-node-editor.html', '_blank');
  q<HTMLButtonElement>('[data-action="new-game"]').onclick = () => window.location.reload();
  q<HTMLButtonElement>('[data-action="exit"]').onclick = exitLab;
  q<HTMLButtonElement>('[data-action="collapse"]').onclick = () => { collapsed = !collapsed; syncLayout(); onChanged(); };
  editorPlace.onclick = () => { findCurrentEditorPlacementTool()?.click(); updateEditorPlaceButton(); };

  for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-mode]')) item.onclick = () => setMode(item.dataset.mode as TacticalWorkspaceMode);
  for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.onclick = () => {
    tab = item.dataset.tab as SimulationTab;
    setSimulationLayerMode(state, tab as SimulationLayerMode);
    update(true);
    onChanged();
  };
  for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-posture]')) item.onclick = () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    setManualPosture(unit, item.dataset.posture as UnitPosture);
    update(true);
    onChanged();
  };
  for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) item.onclick = () => {
    setAiTestTimeScale(state, Number(item.dataset.speed));
    update(true);
  };

  q<HTMLButtonElement>('[data-action="pause"]').onclick = () => { setAiTestPaused(state, !getAiTestPaused(state)); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="step"]').onclick = () => { tickSimulation(state, 0.1); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="evaluate"]').onclick = () => { aiBridge.evaluateNow(); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="execute"]').onclick = () => { tickSimulation(state, 0.1); update(true); onChanged(); };
  fireContactButton.onclick = () => {
    const unit = getSelectedUnit(state);
    const contact = unit ? findBestDirectFireContact(state, unit) : null;
    if (unit && contact) requestFireAction(state, unit, contact.id);
    update(true);
    onChanged();
  };
  q<HTMLButtonElement>('[data-action="clear-order"]').onclick = () => { const unit = getSelectedUnit(state); if (unit) unit.order = null; update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="reset-unit"]').onclick = () => {
    const reset = resetSelectedUnitForTest(state);
    const unit = getSelectedUnit(state);
    if (!reset && unit) applyInitialStateToRuntime(unit);
    stableDecisions.delete(unit?.id ?? '');
    update(true);
    onChanged();
  };

  function setMode(next: TacticalWorkspaceMode): void {
    mode = next;
    state.editor.enabled = next === 'editor';
    state.editor.panelOpen = state.editor.enabled;
    state.editor.tool = 'select';
    state.editor.drag = null;
    if (state.editor.enabled) {
      setAiTestPaused(state, true);
      setSimulationLayerMode(state, 'info');
      state.editor.lastMessage = 'Редактор открыт. Симуляция поставлена на паузу.';
    } else {
      setSimulationLayerMode(state, tab);
      state.editor.lastMessage = 'Симуляция открыта и оставлена на паузе до команды пользователя.';
    }
    syncLayout();
    update(true);
    onChanged();
  }

  function syncLayout(): void {
    document.body.classList.toggle('workspace-simulation', mode === 'simulation');
    document.body.classList.toggle('workspace-editor', mode === 'editor');
    document.body.classList.toggle('editor-mode', mode === 'editor');
    document.body.classList.toggle('sidebar-open', mode === 'simulation' && !collapsed);
    document.body.classList.toggle('sidebar-collapsed', mode === 'simulation' && collapsed);
    sidebar.hidden = mode !== 'simulation';
    bottom.hidden = mode !== 'simulation';
    q<HTMLButtonElement>('[data-action="collapse"]').textContent = collapsed ? '›' : '‹';
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-mode]')) item.classList.toggle('active', item.dataset.mode === mode);
    updateEditorPlaceButton();
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function update(force = false): void {
    const key = buildWorkspaceKey(state, mode, tab, collapsed);
    const unit = getSelectedUnit(state);
    if (!force && key === lastRenderKey) {
      if (mode === 'simulation' && tab === 'info' && unit) updateInfoPanelLive(sidebarBody, state, unit, stableDecisions);
      return;
    }
    lastRenderKey = key;
    updateBottom();
    renderSidebar();
    updateEditorPlaceButton();
    syncOverlayButtons();
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.classList.toggle('active', item.dataset.tab === tab);
  }

  function syncOverlayButtons(): void {
    const active = getTacticalOverlayMode(state);
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-overlay-mode]')) {
      const selected = item.dataset.overlayMode === active;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    }
  }

  function updateBottom(): void {
    const unit = getSelectedUnit(state);
    statePlanPanel.update(unit);
    const combat = unit ? getCombatRuntime(unit) : null;
    const weapon = unit ? getWeaponRuntime(unit) : null;
    const fireAction = unit ? getFireAction(unit) : null;
    q('[data-role="unit-name"]').textContent = unit?.labels.ru ?? 'Боец не выбран';
    q('[data-role="unit-meta"]').textContent = unit
      ? `${unit.id} · ${unit.side === 'red' ? 'Противник' : 'Свои'} · ${postureLabel(unit.behaviorRuntime.posture)} · ${combatCapabilityLabel(combat!.capability)}`
      : 'Левый клик по солдату — выбрать';
    const values: Record<string, string> = unit ? {
      health: pct(unit.soldier.condition.health),
      morale: pct(unit.soldier.condition.morale),
      fatigue: pct(unit.soldier.condition.fatigue),
      stress: pct(unit.behaviorRuntime.stress),
      suppression: pct(unit.behaviorRuntime.suppression),
      ammo: `${weapon!.roundsLoaded}+${weapon!.roundsReserve}`,
    } : { health:'—', morale:'—', fatigue:'—', stress:'—', suppression:'—', ammo:'—' };
    for (const item of shell.querySelectorAll<HTMLElement>('[data-stat]')) item.textContent = values[item.dataset.stat ?? ''] ?? '—';
    q('[data-role="action"]').textContent = `Действие: ${unit ? actionLabel(unit.behaviorRuntime.currentAction) : '—'}${fireAction ? ` · стрельба: ${fireAction.phase}` : ''}`;
    q('[data-role="order"]').textContent = `Приказ: ${unit ? orderLabel(state, unit) : '—'}`;
    navigationProfile.disabled = !unit;
    attentionProfileSelect.disabled = !unit;
    attentionModeSelect.disabled = !unit;
    turnUnitButton.disabled = !unit;
    const contact = unit ? findBestDirectFireContact(state, unit) : null;
    fireContactButton.disabled = !unit || !contact?.visibleNow || Boolean(unit && getFireAction(unit));
    turnUnitButton.classList.toggle('active', getUnitCommandToolState(state).turnToolActive);
    turnUnitButton.textContent = getUnitCommandToolState(state).turnToolActive ? 'Куда?' : 'Повернуть';
    if (unit) {
      const navigationRegistry = getNavigationProfileRegistry();
      const navigationId = navigationRegistry.hasProfile(unit.playerNavigationProfileId ?? 'normal') ? unit.playerNavigationProfileId ?? 'normal' : 'normal';
      navigationProfile.value = navigationId;
      const attentionRegistry = getAttentionProfileRegistry();
      const attentionId = unit.playerAttentionProfileId ?? 'individual';
      attentionProfileSelect.value = attentionRegistry.hasProfile(attentionId) ? attentionId : 'individual';
      attentionModeSelect.value = unit.attentionRuntime.modeSource === 'automatic' ? 'automatic' : unit.attentionRuntime.mode;
    }
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-posture]')) {
      item.disabled = !unit;
      item.classList.toggle('active', item.dataset.posture === unit?.behaviorRuntime.posture);
    }
    const pause = q<HTMLButtonElement>('[data-action="pause"]');
    pause.textContent = getAiTestPaused(state) ? 'Продолжить' : 'Пауза';
    pause.classList.toggle('active', getAiTestPaused(state));
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) item.classList.toggle('active', Number(item.dataset.speed) === getAiTestTimeScale(state));
  }

  function renderSidebar(): void {
    if (mode !== 'simulation') return;
    const unit = getSelectedUnit(state);
    const scrollTop = sidebarBody.scrollTop;
    sidebarTitle.textContent = ({ info:'Информация о бойце', danger:'Опасность и укрытия', stealth:'Скрытность', memory:'Обзор и память' })[tab];
    if (!unit) {
      sidebarBody.innerHTML = empty('Выберите бойца на карте.');
    } else if (tab === 'info') {
      sidebarBody.innerHTML = infoPanel();
      updateInfoPanelLive(sidebarBody, state, unit, stableDecisions);
    } else if (tab === 'danger') {
      renderDanger(sidebarBody, state, unit, onChanged);
    } else if (tab === 'stealth') {
      renderStealth(sidebarBody, state, unit);
    } else {
      sidebarBody.innerHTML = memoryPanel(state, unit);
    }
    sidebarBody.scrollTop = scrollTop;
  }

  function updateEditorPlaceButton(): void {
    const placement = mode === 'editor' ? findCurrentEditorPlacementTool() : null;
    editorPlace.disabled = !placement;
    editorPlace.textContent = placement ? shortPlacementLabel(placement.textContent ?? 'Поставить') : 'Поставить';
    editorPlace.classList.toggle('active', Boolean(placement?.classList.contains('active')));
  }

  setSimulationLayerMode(state, tab);
  syncLayout();
  update(true);
  const interval = window.setInterval(() => {
    if (mode !== 'simulation' || document.hidden) return;
    const previousKey = lastRenderKey;
    update(false);
    if (tab === 'danger' && previousKey !== lastRenderKey) onChanged();
  }, 300);

  return () => {
    window.clearInterval(interval);
    window.removeEventListener(TACTICAL_OVERLAY_MODE_CHANGED_EVENT, handleOverlayHotkey);
    unsubscribeNavigation();
    unsubscribeAttention();
    shell.remove();
  };
}

function renderDanger(target: HTMLElement, state: SimulationState, unit: UnitModel, onChanged: () => void): void {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const result = getCoverSuitability(state, unit);
  target.innerHTML = `${heading('Единый тактический слой','Опасность — каноническое цветное поле. Укрытия — нейтральные достижимые области, рассчитанные по опасности и стоимости маршрута.')}
    <section class="workspace-panel-section tactical-overlay-mode-section">
      <h3>Отображение на карте</h3>
      <div class="tactical-overlay-segmented tactical-overlay-segmented-panel" role="group" aria-label="Режим тактического слоя">${OVERLAY_MODES.map(([id, label]) => `<button type="button" data-overlay-mode="${id}" title="Горячая клавиша V">${label}</button>`).join('')}</div>
    </section>
    ${result.preparationStatus === 'pending' ? '<div class="workspace-empty">Поля опасности и маршрута подготавливаются. Слой укрытий появится автоматически.</div>' : ''}
    ${grid([
      ['Текущая опасность', pct(result.preparationStatus === 'ready' ? result.currentDanger : threats.danger)],
      ['Подавление', pct(threats.suppression)],
      ['Оценка активного маршрута', readPublishedRouteDanger(unit.order) === null ? 'нет маршрута' : pct(readPublishedRouteDanger(unit.order)!)],
      ['Проверено клеток', String(result.visitedCellCount)],
      ['Быстрых областей', String(result.bestQuickCoverCandidates.length)],
      ['Дальних областей', String(result.bestQualityCoverCandidates.length)],
    ])}
    <section class="workspace-panel-section"><h3>Быстрое укрытие · маршрут ≤ 10 м</h3><div data-role="quick-cover-list"></div></section>
    <section class="workspace-panel-section"><h3>Качественное дальнее укрытие</h3><div data-role="quality-cover-list"></div></section>`;

  for (const item of target.querySelectorAll<HTMLButtonElement>('[data-overlay-mode]')) {
    const selected = item.dataset.overlayMode === getTacticalOverlayMode(state);
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
    item.onclick = () => {
      setTacticalOverlayMode(state, item.dataset.overlayMode as TacticalOverlayMode);
      renderDanger(target, state, unit, onChanged);
      onChanged();
    };
  }

  renderCandidateList(target.querySelector<HTMLElement>('[data-role="quick-cover-list"]')!, result.bestQuickCoverCandidates, state, onChanged);
  renderCandidateList(target.querySelector<HTMLElement>('[data-role="quality-cover-list"]')!, result.bestQualityCoverCandidates, state, onChanged);
}

function renderCandidateList(
  target: HTMLElement,
  candidates: readonly CoverCandidateDiagnostic[],
  state: SimulationState,
  onChanged: () => void,
): void {
  if (!candidates.length) {
    target.innerHTML = empty('Подходящих устойчивых областей не найдено.');
    return;
  }
  for (const candidate of candidates) {
    const item = button(
      `${candidate.routeLengthMeters.toFixed(1)} м · опасность ${Math.round(candidate.positionDanger)}% · снижение ${Math.round(candidate.absoluteDangerReduction)} п.п. · область ${candidate.regionAreaCells} кл.`,
      'cover-list-card',
    );
    item.title = `Стоимость ${candidate.routeCost.toFixed(1)}; максимум опасности маршрута ${Math.round(candidate.routeDanger)}%; пригодность ${Math.round(candidate.suitability)}`;
    item.onclick = () => {
      issueMoveOrderToSelectedUnit(state, candidate.position);
      onChanged();
    };
    target.append(item);
  }
}

function infoPanel(): string {
  return `${heading('Инфо','Оверлей на карту не накладывается.')}${liveGrid([
    ['Положение','position'], ['Высота','height'], ['Местность','terrain'], ['Поза','posture'], ['Действие','action'], ['Приказ','order'],
  ])}${liveMetrics([
    ['Здоровье','health'],['Боевой дух','morale'],['Усталость','fatigue'],['Стресс','stress'],['Подавление','suppression'],['Патроны','ammo'],
  ])}
  ${liveDetails('Текущее состояние',[['Состояние','state'],['Готовность оружия','weaponReady'],['Замешательство','confusion'],['Последнее событие','lastEvent']],true)}
  ${liveDetails('Навыки',[['Стойкость','resilience'],['Осторожность','caution'],['Решительность','decisiveness'],['Дисциплина','discipline'],['Инициатива','initiative'],['Тактика','tactics'],['Владение оружием','weaponSkill']])}
  ${liveDetails('Чувства и физические данные',[['Внимание','attention'],['Зрение','view'],['Интуиция','intuition'],['Физическая подготовка','speed'],['Личная скрытность','stealth'],['Дальность обзора','viewRange']])}
  ${liveDetails('Последнее решение ИИ',[['Решение','aiDecision'],['Причина','aiReason'],['Почему поза','postureReason'],['Почему состояние','stateReason']],true)}`;
}

function updateInfoPanelLive(target: HTMLElement, state: SimulationState, unit: UnitModel, decisions: Map<string, StableDecision>): void {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
  const runtime = unit.behaviorRuntime;
  const condition = unit.soldier.condition;
  const traits = unit.soldier.traits;
  const decision = stableDecision(unit, decisions);
  const smoothHeight = sampleSmoothHeightLevel(state.map, unit.position.x, unit.position.y);
  const values: Record<string, string> = {
    position: `${unit.position.x.toFixed(1)}, ${unit.position.y.toFixed(1)}`,
    height: cell ? elevation(smoothHeight) : 'вне карты',
    terrain: cell ? terrain(cell) : 'вне карты',
    posture: postureLabel(runtime.posture),
    action: actionLabel(runtime.currentAction),
    order: orderLabel(state, unit),
    state: runtime.state,
    weaponReady: runtime.weaponReady ? 'готово' : 'не готово',
    confusion: pct(condition.confusion),
    lastEvent: runtime.lastEvent ?? 'нет',
    resilience: pct(traits.resilience), caution: pct(traits.caution), decisiveness: pct(traits.decisiveness), discipline: pct(traits.discipline),
    initiative: pct(traits.initiative), tactics: pct(traits.tactics), weaponSkill: pct(traits.weaponSkill),
    attention: pct(condition.attention), view: pct(condition.view), intuition: pct(condition.intuition), speed: pct(condition.speed), stealth: pct(condition.stealth),
    viewRange: `${Math.round(unit.attentionSettings.vision.maximumVisualRangeMeters)} м`,
    aiDecision: decision.decision,
    aiReason: decision.reason,
    postureReason: decision.postureReason,
    stateReason: decision.stateReason,
  };
  for (const [key, value] of Object.entries(values)) setLiveText(target, key, value);
  const metrics: Record<string, number> = {
    health: condition.health,
    morale: condition.morale,
    fatigue: condition.fatigue,
    stress: runtime.stress,
    suppression: runtime.suppression,
    ammo: Math.min(100, runtime.ammo),
  };
  for (const [key, value] of Object.entries(metrics)) setLiveMetric(target, key, value);
}

function stableDecision(unit: UnitModel, decisions: Map<string, StableDecision>): StableDecision {
  const runtime = unit.behaviorRuntime;
  const order = unit.order ? `${unit.order.target.x.toFixed(1)}:${unit.order.target.y.toFixed(1)}` : 'none';
  const signature = [runtime.currentAction, runtime.state, runtime.posture, runtime.lastEvent ?? '', order].join('|');
  const existing = decisions.get(unit.id);
  if (existing?.signature === signature) return existing;
  const next: StableDecision = {
    signature,
    decision: runtime.aiGraphReason || runtime.reason || 'ещё не рассчитывалось',
    reason: runtime.reason || 'нет',
    postureReason: runtime.postureChangedBecause || 'нет',
    stateReason: runtime.stateChangedBecause || 'нет',
  };
  decisions.set(unit.id, next);
  return next;
}

function renderStealth(target: HTMLElement, state: SimulationState, unit: UnitModel): void {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
  const concealment = resolveLocalConcealment(cell);
  const confidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence))
    : 0;
  target.innerHTML = `${heading('Слой скрытности','Полная карта скрытности рисуется фоновым worker.')}${legend([
    ['legend-stealth-best','очень трудно заметить'],
    ['legend-stealth-good','хорошая скрытность'],
    ['legend-stealth-medium','заметен'],
    ['legend-stealth-bad','хорошо заметен'],
  ])}${grid([
    ['Скрытность клетки', pct(concealment)],
    ['Открытость', pct(100 - concealment)],
    ['Поза', postureLabel(unit.behaviorRuntime.posture)],
    ['Тип клетки', cell ? terrain(cell) : 'вне карты'],
    ['Уверенность', pct(confidence)],
  ])}`;
}

function memoryPanel(state: SimulationState, unit: UnitModel): string {
  const result = getCoverSuitability(state, unit);
  const threats = unit.tacticalKnowledge.threats.map((threat) => `<div class="memory-card"><strong>${esc(threat.labelRu)}</strong><span>${threat.visibleNow ? 'видит сейчас' : `обновлено ${Math.max(0, state.simulationTimeSeconds - threat.lastUpdatedSeconds).toFixed(1)} с назад`}</span><b>уверенность ${Math.round(threat.confidence)}%</b><em>неточность ±${threat.uncertaintyCells.toFixed(1)} клетки</em></div>`).join('') || empty('Солдат пока не знает ни об одной угрозе.');
  const covers = [...result.bestQuickCoverCandidates, ...result.bestQualityCoverCandidates].slice(0, 16).map((candidate) => `<div class="memory-card"><strong>${candidate.coverClass === 'quick' ? 'Быстрое укрытие' : 'Качественное укрытие'}</strong><span>${candidate.routeLengthMeters.toFixed(1)} м</span><b>${Math.round(candidate.suitability)}/100</b><em>опасность ${Math.round(candidate.positionDanger)}%</em></div>`).join('') || empty('Подходящих укрытий пока нет.');
  const knownAreaMeters = Math.max(unit.viewRangeCells * state.map.metersPerCell, 500);
  return `${heading('Обзор и память','Текущая видимость показывается тепловой картой, а старые знания остаются субъективными метками бойца.')}${grid([
    ['Известная область', `${Math.round(knownAreaMeters)} м`],
    ['Угроз в памяти', String(unit.tacticalKnowledge.threats.length)],
    ['Известных укрытий', String(result.bestQuickCoverCandidates.length + result.bestQualityCoverCandidates.length)],
    ['Версия знаний', String(unit.tacticalKnowledge.revision)],
  ])}<section class="workspace-panel-section"><h3>Опасности и противник</h3>${threats}</section><section class="workspace-panel-section"><h3>Известные предметы и укрытия</h3>${covers}</section>`;
}

function buildWorkspaceKey(state: SimulationState, mode: TacticalWorkspaceMode, tab: SimulationTab, collapsed: boolean): string {
  const unit = getSelectedUnit(state);
  const revisions = getMapRevisionSnapshot(state.map);
  const cover = tab === 'danger' && unit ? getCoverSuitability(state, unit) : null;
  return [
    mode,
    tab,
    collapsed ? 1 : 0,
    getTacticalOverlayMode(state),
    unit?.id ?? 'none',
    unit?.position.x.toFixed(2) ?? '',
    unit?.position.y.toFixed(2) ?? '',
    unit?.behaviorRuntime.posture ?? '',
    unit?.behaviorRuntime.currentAction ?? '',
    unit?.tacticalKnowledge.revision ?? 0,
    unit?.order?.target.x.toFixed(2) ?? '',
    unit?.order?.target.y.toFixed(2) ?? '',
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    cover?.preparationStatus ?? '',
    cover?.cacheKey ?? '',
  ].join('|');
}

function setManualPosture(unit: UnitModel, posture: UnitPosture): void {
  if (unit.behaviorRuntime.posture === posture) return;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = 'Поза изменена вручную.';
  unit.behaviorRuntime.lastEvent = `manual_posture_${posture}`;
}

function combatCapabilityLabel(value: ReturnType<typeof getCombatRuntime>['capability']): string {
  if (value === 'wounded') return 'ранен';
  if (value === 'severely_wounded') return 'тяжело ранен';
  if (value === 'incapacitated') return 'выведен из строя';
  if (value === 'dead') return 'погиб';
  return 'боеспособен';
}

function orderLabel(_state: SimulationState, unit: UnitModel): string {
  if (!unit.order) return 'нет';
  return `${unit.order.target.x.toFixed(1)}, ${unit.order.target.y.toFixed(1)}${unit.order.routeStatus ? ` · ${unit.order.routeStatus}` : ''}`;
}

function actionLabel(value: string): string {
  const labels: Record<string, string> = { idle:'ожидает', moving:'движется', firing:'стреляет', reloading:'перезаряжается', observing:'наблюдает' };
  return labels[value] ?? value;
}

function postureLabel(value: UnitPosture): string {
  return value === 'standing' ? 'стоит' : value === 'crouched' ? 'пригнулся' : 'лежит';
}

function elevation(value: number): string {
  return `${value.toFixed(1)} уровня`;
}

function terrain(cell: MapCell): string {
  const labels: Record<MapCell['terrain'], string> = {
    road:'дорога',
    field:'поле',
    forest:'лес',
    rough:'пересечённая местность',
    swamp:'болото',
    water:'вода',
  };
  return labels[cell.terrain] ?? cell.terrain;
}

function resolveLocalConcealment(cell: MapCell | null): number {
  if (!cell) return 0;
  const terrainBase: Record<MapCell['terrain'], number> = {
    field: 8,
    forest: 35,
    road: 2,
    swamp: 18,
    rough: 16,
    water: 0,
  };
  return Math.max(0, Math.min(100, terrainBase[cell.terrain] + cell.forest * 24));
}

function heading(title: string, description: string): string {
  return `<section class="workspace-panel-heading"><h2>${esc(title)}</h2><p>${esc(description)}</p></section>`;
}

function grid(rows: Array<[string, string]>): string {
  return `<div class="workspace-data-grid">${rows.map(([label, value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;
}

function liveGrid(rows: Array<[string, string]>): string {
  return `<div class="workspace-data-grid">${rows.map(([label, key]) => `<div><span>${esc(label)}</span><b data-live="${esc(key)}">—</b></div>`).join('')}</div>`;
}

function liveMetrics(rows: Array<[string, string]>): string {
  return `<div class="workspace-live-metrics">${rows.map(([label, key]) => `<div><span>${esc(label)}</span><b data-live-metric="${esc(key)}">—</b><i><em data-live-bar="${esc(key)}"></em></i></div>`).join('')}</div>`;
}

function liveDetails(title: string, rows: Array<[string, string]>, open = false): string {
  return `<details class="workspace-live-details"${open ? ' open' : ''}><summary>${esc(title)}</summary>${liveGrid(rows)}</details>`;
}

function setLiveText(target: HTMLElement, key: string, value: string): void {
  const element = target.querySelector<HTMLElement>(`[data-live="${key}"]`);
  if (element) element.textContent = value;
}

function setLiveMetric(target: HTMLElement, key: string, value: number): void {
  const normalized = Math.max(0, Math.min(100, value));
  const label = target.querySelector<HTMLElement>(`[data-live-metric="${key}"]`);
  const bar = target.querySelector<HTMLElement>(`[data-live-bar="${key}"]`);
  if (label) label.textContent = pct(value);
  if (bar) bar.style.width = `${normalized}%`;
}

function legend(rows: Array<[string, string]>): string {
  return `<div class="workspace-legend">${rows.map(([className, label]) => `<span><i class="${esc(className)}"></i>${esc(label)}</span>`).join('')}</div>`;
}

function empty(message: string): string {
  return `<div class="workspace-empty">${esc(message)}</div>`;
}

function button(label: string, className = ''): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.className = className;
  result.textContent = label;
  return result;
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char] ?? char);
}

function moveExistingButton(selector: string, target: HTMLElement): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) target.append(element);
}

function moveWorkspaceFileTools(target: HTMLElement): void {
  for (const selector of ['#scene-export', '#scene-import', '#scene-reset']) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) target.append(element);
  }
}

function findCurrentEditorPlacementTool(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.game-editor-workbench button.active[data-tool], .game-editor-workbench button[data-action="place"]');
}

function shortPlacementLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 24 ? `${trimmed.slice(0, 21)}…` : trimmed || 'Поставить';
}
