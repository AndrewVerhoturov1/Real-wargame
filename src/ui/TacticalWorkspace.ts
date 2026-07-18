import { readPublishedRouteDanger } from '../core/navigation/RouteDangerDiagnostic';
import '../tactical-workspace-stage8.css';
import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import { measurePerformancePhase } from '../core/debug/PerformancePhases';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { getCombatRuntime } from '../core/combat/CombatDamage';
import { findBestDirectFireContact } from '../core/combat/CombatDecision';
import { getFireAction, requestFireAction } from '../core/combat/FireAction';
import { getWeaponRuntime } from '../core/combat/WeaponModel';
import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../core/perception/AttentionController';
import { applyAttentionProfileToUnit } from '../core/perception/AttentionProfiles';
import { getAttentionProfileRegistry, subscribeAttentionProfileRegistry } from '../core/perception/AttentionProfileStorage';
import { degreesToRadians, type AttentionMode } from '../core/perception/AttentionModel';
import { getSelectedSimulationCover, getSimulationCovers, hoverSimulationCoverAtPosition } from '../core/knowledge/SimulationCoverSelection';
import { buildUnitKnowledgeReport } from '../core/knowledge/UnitKnowledge';
import { getCell, resolveObjectCoverProperties, type MapCell } from '../core/map/MapModel';
import { getSurfaceMaterial, getVegetationMaterial } from '../core/map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import { evaluateThreatsAtPosition } from '../core/pressure/ThreatEvaluation';
import { getNavigationProfileRegistry, subscribeNavigationProfileRegistry } from '../core/navigation/NavigationProfileStorage';
import { isPlayerCommandOutstanding, updatePlayerCommandNavigationProfile } from '../core/orders/PlayerCommand';
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
  getSimulationLayerState,
  getUnitCommandToolState,
  setHoveredSimulationCover,
  setSelectedSimulationCover,
  setSimulationLayerMode,
  setTurnToolActive,
  toggleRealReliefOverlay,
  type SimulationLayerMode,
} from '../core/ui/RuntimeUiState';
import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';
import { bindTacticalStatePlanPanel, renderTacticalStatePlanPanelMarkup } from './AiStatePlanPanel';
import { exitLab } from '../shared/AppShellMenu';

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
  ['info', 'Инфо'], ['danger', 'Опасность'], ['stealth', 'Скрытность'], ['memory', 'Обзор и память'],
];

export function installTacticalWorkspace(state: SimulationState, aiBridge: AiGameBridgeHandle, onChanged: () => void): () => void {
  let mode: TacticalWorkspaceMode = state.editor.enabled ? 'editor' : 'simulation';
  let tab: SimulationTab = 'info';
  let collapsed = false;
  let lastSidebarKey = '';
  let lastWorkspaceUpdateKey = '';
  const stableDecisions = new Map<string, StableDecision>();

  const shell = document.createElement('div');
  shell.className = 'tactical-workspace-shell';
  shell.innerHTML = `
    <header class="tactical-workspace-bar">
      <div class="workspace-brand"><strong>Тактическая карта</strong><span>одиночный боец · симуляция и редактор</span></div>
      <div class="workspace-mode-switch">
        <button data-mode="simulation">Симуляция</button><button data-mode="editor">Редактирование</button>
      </div>
      <div class="workspace-top-actions">
        <button class="editor-place-button primary" data-action="editor-place" title="Включить постановку для открытой вкладки редактора">Поставить</button>
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
        <label class="unit-route-profile"><span>Маршрут</span><select data-action="unit-navigation-profile" aria-label="Профиль движения выбранного бойца"></select></label>
        <label class="unit-attention-profile"><span>Профиль внимания</span><select data-action="unit-attention-profile" aria-label="Профиль внимания выбранного бойца"></select></label>
        <label class="unit-attention-mode"><span>Внимание</span><select data-action="unit-attention-mode" aria-label="Режим внимания выбранного бойца"><option value="automatic">Автоматически</option><option value="march">Марш</option><option value="observe">Наблюдение</option><option value="search">Поиск</option><option value="engage">Стрельба</option></select></label>
        <button type="button" data-action="turn-unit" aria-pressed="false">Повернуть</button>
        <button type="button" data-action="route-cost-quick-toggle" aria-pressed="false">Карта стоимости: выкл</button>
        <details class="unit-route-details">
          <summary data-role="route-summary">Маршрут: —</summary>
          <div class="unit-route-details-panel">
            <span data-role="route-details-command">Приказ: —</span>
            <span data-role="route-details-plan">План: —</span>
            <span data-role="route-details-route">Маршрут: —</span>
            <span data-role="route-details-profile">Профиль: —</span>
            <span data-role="route-details-cost">Цена: —</span>
            <span data-role="route-details-reason">Причина: —</span>
          </div>
        </details>
      </div>
      <div class="unit-bar-command-group posture-group">
        <button data-posture="standing">Стоять</button><button data-posture="crouched">Пригнуться</button><button data-posture="prone">Лечь</button>
      </div>
      <div class="unit-bar-command-group simulation-controls">
        <button class="primary" data-action="pause">Пауза</button><button data-action="step">Один шаг</button>
        <button data-action="evaluate">Диагностика ИИ (без изменений)</button><button class="primary" data-action="execute">Рассчитать и выполнить</button>
        <button class="primary" data-action="fire-contact">Огонь по контакту</button><button data-action="clear-order">Очистить приказ</button><button data-action="reset-unit">Сбросить бойца</button>
      </div>
      <div class="unit-bar-speed-group">${AI_TEST_TIME_SCALES.map((scale) => `<button data-speed="${scale}">×${scale}</button>`).join('')}</div>
    </section>
    <div class="cover-map-tooltip" data-role="cover-tooltip" hidden></div>`;
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
  const tooltip = q<HTMLElement>('[data-role="cover-tooltip"]');
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
  relief.addEventListener('click', () => {
    const active = toggleRealReliefOverlay(state);
    relief.textContent = `Реальный рельеф: ${active ? 'вкл' : 'выкл'}`;
    relief.classList.toggle('active', active);
    onChanged();
  });
  display.append(relief);
  moveWorkspaceFileTools(fileTools);

  const refreshNavigationProfiles = () => {
    const registry = getNavigationProfileRegistry();
    const previous = navigationProfile.value;
    navigationProfile.innerHTML = registry.listProfiles()
      .map((profile) => `<option value="${esc(profile.id)}">${esc(profile.nameRu)}</option>`)
      .join('');
    const unit = getSelectedUnit(state);
    const requested = unit?.playerNavigationProfileId ?? previous ?? 'normal';
    navigationProfile.value = registry.hasProfile(requested) ? requested : 'normal';
  };
  refreshNavigationProfiles();
  const refreshAttentionProfiles = () => {
    const registry = getAttentionProfileRegistry();
    attentionProfileSelect.innerHTML = '<option value="individual">Индивидуальный</option>' + registry.listProfiles()
      .map((profile) => `<option value="${esc(profile.id)}">${esc(profile.nameRu)}</option>`).join('');
    const unit = getSelectedUnit(state);
    const requested = unit?.playerAttentionProfileId ?? 'individual';
    attentionProfileSelect.value = registry.hasProfile(requested) ? requested : 'individual';
  };
  refreshAttentionProfiles();
  const unsubscribeAttentionProfiles = subscribeAttentionProfileRegistry(() => { refreshAttentionProfiles(); updateBottom(); onChanged(); });
  const unsubscribeNavigationProfiles = subscribeNavigationProfileRegistry(() => {
    refreshNavigationProfiles();
    updateBottom();
    onChanged();
  });

  attentionProfileSelect.addEventListener('change', () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const profileId = attentionProfileSelect.value;
    if (profileId === 'individual') unit.playerAttentionProfileId = null;
    else {
      const registry = getAttentionProfileRegistry();
      if (registry.hasProfile(profileId)) applyAttentionProfileToUnit(unit, registry.getProfile(profileId));
    }
    updateBottom();
    onChanged();
  });

  attentionModeSelect.addEventListener('change', () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const requested = attentionModeSelect.value;
    if (requested === 'automatic') {
      clearAttentionOverride(unit);
    } else if (requested === 'search') {
      setSearchSector(
        unit,
        unit.facingRadians,
        degreesToRadians(unit.attentionSettings.profiles.search.defaultSearchArcDegrees),
        'player',
      );
    } else {
      setAttentionMode(unit, requested as AttentionMode, 'player');
    }
    updateBottom();
    onChanged();
  });

  turnUnitButton.addEventListener('click', () => {
    if (!getSelectedUnit(state)) return;
    const next = !getUnitCommandToolState(state).turnToolActive;
    setTurnToolActive(state, next);
    window.dispatchEvent(new CustomEvent('real-wargame:unit-command-tool-changed'));
    updateBottom();
    onChanged();
  });

  navigationProfile.addEventListener('change', () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    const registry = getNavigationProfileRegistry();
    const profileId = registry.hasProfile(navigationProfile.value) ? navigationProfile.value : 'normal';
    unit.playerNavigationProfileId = profileId;
    if (isPlayerCommandOutstanding(unit.playerCommand)) {
      unit.playerCommand = updatePlayerCommandNavigationProfile(unit.playerCommand!, profileId);
    }
    updateBottom();
    onChanged();
  });

  q<HTMLButtonElement>('[data-action="ai-editor"]').onclick = () => window.open('/ai-node-editor.html', '_blank');
  q<HTMLButtonElement>('[data-action="new-game"]').onclick = () => window.location.reload();
  q<HTMLButtonElement>('[data-action="exit"]').onclick = exitLab;
  q<HTMLButtonElement>('[data-action="collapse"]').onclick = () => { collapsed = !collapsed; syncLayout(); onChanged(); };
  editorPlace.onclick = () => {
    const placementTool = findCurrentEditorPlacementTool();
    placementTool?.click();
    updateEditorPlaceButton();
  };
  for (const modeButton of shell.querySelectorAll<HTMLButtonElement>('[data-mode]')) modeButton.onclick = () => setMode(modeButton.dataset.mode as TacticalWorkspaceMode);
  for (const tabButton of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) tabButton.onclick = () => {
    tab = tabButton.dataset.tab as SimulationTab;
    setSimulationLayerMode(state, tab as SimulationLayerMode);
    lastSidebarKey = '';
    update(true);
    onChanged();
  };
  for (const postureButton of shell.querySelectorAll<HTMLButtonElement>('[data-posture]')) postureButton.onclick = () => {
    const unit = getSelectedUnit(state);
    if (!unit) return;
    setManualPosture(unit, postureButton.dataset.posture as UnitPosture, postureButton.textContent ?? 'поза');
    update(false); onChanged();
  };
  for (const speedButton of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) speedButton.onclick = () => {
    setAiTestTimeScale(state, Number(speedButton.dataset.speed)); updateBottom();
  };
  q<HTMLButtonElement>('[data-action="pause"]').onclick = () => { setAiTestPaused(state, !getAiTestPaused(state)); updateBottom(); onChanged(); };
  q<HTMLButtonElement>('[data-action="step"]').onclick = () => { tickSimulation(state, 0.1); update(false); onChanged(); };
  q<HTMLButtonElement>('[data-action="evaluate"]').onclick = () => { aiBridge.evaluateNow(); update(false); onChanged(); };
  q<HTMLButtonElement>('[data-action="execute"]').onclick = () => { tickSimulation(state, 0.1); update(false); onChanged(); };
  fireContactButton.onclick = () => {
    const unit = getSelectedUnit(state);
    const contact = unit ? findBestDirectFireContact(state, unit) : null;
    if (!unit || !contact || !requestFireAction(state, unit, contact.id)) {
      if (unit) {
        unit.behaviorRuntime.reason = contact ? unit.behaviorRuntime.reason : 'Нет личного контакта для стрельбы.';
        unit.behaviorRuntime.lastEvent = contact ? unit.behaviorRuntime.lastEvent : 'combat_fire_request_missing_contact';
      }
    }
    update(false);
    onChanged();
  };
  q<HTMLButtonElement>('[data-action="clear-order"]').onclick = () => { const unit = getSelectedUnit(state); if (unit) unit.order = null; update(false); onChanged(); };
  q<HTMLButtonElement>('[data-action="reset-unit"]').onclick = () => {
    const reset = resetSelectedUnitForTest(state); const unit = getSelectedUnit(state); if (!reset && unit) applyInitialStateToRuntime(unit);
    stableDecisions.delete(unit?.id ?? '');
    update(false); onChanged();
  };

  function setMode(next: TacticalWorkspaceMode): void {
    mode = next;
    const editor = next === 'editor';
    state.editor.enabled = editor;
    state.editor.panelOpen = editor;
    state.editor.tool = 'select';
    state.editor.drag = null;
    if (editor) {
      setAiTestPaused(state, true);
      setSimulationLayerMode(state, 'info');
      setSelectedSimulationCover(state, null);
      setHoveredSimulationCover(state, null);
      tooltip.hidden = true;
      state.editor.lastMessage = 'Редактор открыт. Симуляция поставлена на паузу.';
    } else {
      setSimulationLayerMode(state, tab);
      state.editor.lastMessage = 'Симуляция открыта и оставлена на паузе до команды пользователя.';
    }
    lastSidebarKey = '';
    syncLayout(); update(true); onChanged();
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
    const nextKey = buildWorkspaceUpdateKey(state, mode, tab, collapsed);
    if (!force && nextKey === lastWorkspaceUpdateKey) return;
    lastWorkspaceUpdateKey = nextKey;
    measurePerformancePhase('ui.tactical-workspace.update', () => {
      if (force) lastSidebarKey = '';
      updateBottom();
      renderSidebar();
      updateEditorPlaceButton();
      for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.classList.toggle('active', item.dataset.tab === tab);
    });
  }

  function updateBottom(): void {
    const unit = getSelectedUnit(state);
    statePlanPanel.update(unit);
    const combat = unit ? getCombatRuntime(unit) : null;
    const weapon = unit ? getWeaponRuntime(unit) : null;
    const fireAction = unit ? getFireAction(unit) : null;
    q('[data-role="unit-name"]').textContent = unit?.labels.ru ?? 'Боец не выбран';
    q('[data-role="unit-meta"]').textContent = unit
      ? `${unit.id} · ${unit.side === 'red' ? 'Противник' : 'Свои'} · ${postureLabel(unit.behaviorRuntime.posture)} · ${profileLabel(unit.behaviorProfile)} · ${combatCapabilityLabel(combat!.capability)}`
      : 'Левый клик по солдату — выбрать';
    const values: Record<string, string> = unit ? {
      health: pct(unit.soldier.condition.health), morale: pct(unit.soldier.condition.morale), fatigue: pct(unit.soldier.condition.fatigue),
      stress: pct(unit.behaviorRuntime.stress), suppression: pct(unit.behaviorRuntime.suppression), ammo: `${weapon!.roundsLoaded}+${weapon!.roundsReserve}`,
    } : { health:'—', morale:'—', fatigue:'—', stress:'—', suppression:'—', ammo:'—' };
    for (const item of shell.querySelectorAll<HTMLElement>('[data-stat]')) item.textContent = values[item.dataset.stat ?? ''] ?? '—';
    q('[data-role="action"]').textContent = `Действие: ${unit ? actionLabel(unit.behaviorRuntime.currentAction) : '—'}${fireAction ? ` · стрельба: ${firePhaseLabel(fireAction.phase)}` : ''}`;
    q('[data-role="order"]').textContent = `Приказ: ${unit ? orderLabel(state, unit) : '—'}`;
    navigationProfile.disabled = !unit;
    attentionProfileSelect.disabled = !unit;
    attentionModeSelect.disabled = !unit;
    turnUnitButton.disabled = !unit;
    const bestFireContact = unit ? findBestDirectFireContact(state, unit) : null;
    fireContactButton.disabled = !unit || !bestFireContact?.visibleNow || Boolean(getFireAction(unit));
    fireContactButton.title = bestFireContact
      ? `Личный контакт: ${bestFireContact.labelRu} · уверенность ${Math.round(bestFireContact.confidence)}%`
      : 'Сначала боец должен сам обнаружить противника.';
    const commandTool = getUnitCommandToolState(state);
    turnUnitButton.classList.toggle('active', commandTool.turnToolActive);
    turnUnitButton.setAttribute('aria-pressed', String(commandTool.turnToolActive));
    turnUnitButton.textContent = commandTool.turnToolActive ? 'Куда?' : 'Повернуть';
    if (unit) {
      const attentionRegistry = getAttentionProfileRegistry();
      const attentionProfileId = unit.playerAttentionProfileId ?? 'individual';
      attentionProfileSelect.value = attentionRegistry.hasProfile(attentionProfileId) ? attentionProfileId : 'individual';
      attentionModeSelect.value = unit.attentionRuntime.modeSource === 'automatic'
        ? 'automatic'
        : unit.attentionRuntime.mode;
      const registry = getNavigationProfileRegistry();
      const requested = unit.playerNavigationProfileId ?? 'normal';
      const normalized = registry.hasProfile(requested) ? requested : 'normal';
      if (unit.playerNavigationProfileId !== normalized) unit.playerNavigationProfileId = normalized;
      if (navigationProfile.value !== normalized) navigationProfile.value = normalized;
    }
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-posture]')) { item.disabled = !unit; item.classList.toggle('active', item.dataset.posture === unit?.behaviorRuntime.posture); }
    const pause = q<HTMLButtonElement>('[data-action="pause"]');
    pause.textContent = getAiTestPaused(state) ? 'Продолжить' : 'Пауза';
    pause.classList.toggle('active', getAiTestPaused(state));
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) item.classList.toggle('active', Number(item.dataset.speed) === getAiTestTimeScale(state));
  }

  function renderSidebar(): void {
    if (mode !== 'simulation') return;
    const unit = getSelectedUnit(state);
    const key = sidebarKey(state, tab);
    if (key !== lastSidebarKey) {
      const scrollTop = sidebarBody.scrollTop;
      lastSidebarKey = key;
      sidebarTitle.textContent = ({ info:'Информация о бойце', danger:'Опасность и укрытия', stealth:'Скрытность', memory:'Обзор и память' })[tab];
      if (!unit) {
        sidebarBody.innerHTML = empty('Выберите бойца на карте. Левая кнопка выбирает, правая отдаёт приказ движения.');
      } else if (tab === 'info') {
        sidebarBody.innerHTML = infoPanel();
      } else if (tab === 'danger') {
        renderDanger(sidebarBody, state, unit, onChanged, () => { lastSidebarKey=''; renderSidebar(); });
      } else if (tab === 'stealth') {
        renderStealth(sidebarBody, state, unit, onChanged);
      } else {
        sidebarBody.innerHTML = memoryPanel(state, unit);
      }
      sidebarBody.scrollTop = scrollTop;
    }
    if (unit && tab === 'info') updateInfoPanelLive(sidebarBody, state, unit, stableDecisions);
  }

  function updateEditorPlaceButton(): void {
    const placementTool = mode === 'editor' ? findCurrentEditorPlacementTool() : null;
    editorPlace.disabled = !placementTool;
    editorPlace.textContent = placementTool ? shortPlacementLabel(placementTool.textContent ?? 'Поставить') : 'Поставить';
    editorPlace.classList.toggle('active', Boolean(placementTool?.classList.contains('active')));
  }

  const attachTooltip = (): (() => void) => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return () => {};
    const handlePointerMove = (event: PointerEvent): void => {
      if (mode !== 'simulation' || tab === 'info') { tooltip.hidden = true; setHoveredSimulationCover(state, null); return; }
      const cover = hoverSimulationCoverAtPosition(state, state.mouseGridPosition);
      if (!cover) { tooltip.hidden = true; return; }
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 18)}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 150, event.clientY + 18)}px`;
      tooltip.innerHTML = `<strong>${esc(cover.labelRu)}</strong><span>Расстояние: ${Math.round(cover.distanceMeters)} м</span><span>Качество: ${Math.round(cover.quality)}/100</span><span>${esc(cover.sourceRu)}</span>`;
    };
    const hideTooltip = (): void => { tooltip.hidden = true; setHoveredSimulationCover(state, null); };
    const handlePointerDown = (): void => { tooltip.hidden = true; window.setTimeout(() => update(false), 0); };
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', hideTooltip);
    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', hideTooltip);
      canvas.removeEventListener('pointerdown', handlePointerDown);
    };
  };

  setSimulationLayerMode(state, tab);
  syncLayout(); update(true);
  const detachTooltip = attachTooltip();
  const updateInterval = window.setInterval(() => {
    if (mode !== 'simulation' || document.hidden) return;
    update(false);
  }, 300);
  return () => {
    window.clearInterval(updateInterval);
    unsubscribeAttentionProfiles();
    unsubscribeNavigationProfiles();
    detachTooltip();
    shell.remove();
  };
}

function buildWorkspaceUpdateKey(
  state: SimulationState,
  mode: TacticalWorkspaceMode,
  tab: SimulationTab,
  collapsed: boolean,
): string {
  const unit = getSelectedUnit(state);
  const revisions = getMapRevisionSnapshot(state.map);
  const layer = getSimulationLayerState(state);
  const commandTool = getUnitCommandToolState(state);
  const weapon = unit ? getWeaponRuntime(unit) : null;
  const fireAction = unit ? getFireAction(unit) : null;
  const contact = unit ? findBestDirectFireContact(state, unit) : null;
  const order = unit?.order;
  const command = unit?.playerCommand;
  const runtimeSession = unit?.behaviorRuntime.aiRuntimeSession;
  return [
    mode,
    tab,
    collapsed ? 1 : 0,
    state.selectedUnitId ?? 'none',
    state.editor.enabled ? 1 : 0,
    state.editor.tool,
    state.editor.selectedObjectId ?? 'none',
    state.editor.selectedZoneId ?? 'none',
    state.editor.lastMessage ?? '',
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    state.pressureZones.length,
    layer.mode,
    layer.selectedCoverId ?? 'none',
    layer.hoveredCoverId ?? 'none',
    commandTool.turnToolActive ? 1 : 0,
    commandTool.routeFacingDraft
      ? `${commandTool.routeFacingDraft.target.x.toFixed(2)}:${commandTool.routeFacingDraft.target.y.toFixed(2)}:${commandTool.routeFacingDraft.finalFacingRadians?.toFixed(4) ?? 'none'}`
      : 'none',
    getAiTestPaused(state) ? 1 : 0,
    getAiTestTimeScale(state),
    unit?.id ?? 'none',
    unit ? `${unit.position.x.toFixed(2)}:${unit.position.y.toFixed(2)}` : 'none',
    unit?.behaviorRuntime.currentAction ?? '',
    unit?.behaviorRuntime.state ?? '',
    unit?.behaviorRuntime.posture ?? '',
    unit?.behaviorRuntime.lastEvent ?? '',
    unit?.behaviorRuntime.reason ?? '',
    unit ? Math.round(unit.behaviorRuntime.danger) : 0,
    unit ? Math.round(unit.behaviorRuntime.stress) : 0,
    unit ? Math.round(unit.behaviorRuntime.suppression) : 0,
    unit ? Math.round(unit.soldier.condition.health) : 0,
    unit ? Math.round(unit.soldier.condition.morale) : 0,
    unit ? Math.round(unit.soldier.condition.fatigue) : 0,
    weapon?.roundsLoaded ?? 0,
    weapon?.roundsReserve ?? 0,
    fireAction?.phase ?? 'none',
    order?.target.x.toFixed(2) ?? 'none',
    order?.target.y.toFixed(2) ?? 'none',
    order?.waypointIndex ?? -1,
    order?.routeStatus ?? 'none',
    order?.routeDangerDiagnostic?.revision ?? 0,
    order?.routeDangerDiagnostic?.value ?? 'unavailable',
    command?.revision ?? 0,
    command?.status ?? 'none',
    unit?.tacticalKnowledge.revision ?? 0,
    unit?.attentionRuntime.mode ?? 'none',
    unit?.attentionRuntime.modeSource ?? 'none',
    unit?.attentionRuntime.focusDirectionRadians.toFixed(4) ?? 'none',
    runtimeSession?.status ?? 'none',
    runtimeSession?.executionState?.activeNodeId ?? 'none',
    unit?.behaviorRuntime.aiGraphReason ?? '',
    unit?.playerNavigationProfileId ?? 'none',
    unit?.playerAttentionProfileId ?? 'individual',
    contact?.id ?? 'none',
    contact?.visibleNow ? 1 : 0,
    contact ? Math.round(contact.confidence) : 0,
  ].join('|');
}

function combatCapabilityLabel(value: ReturnType<typeof getCombatRuntime>['capability']): string {
  if (value === 'wounded') return 'ранен';
  if (value === 'severely_wounded') return 'тяжело ранен';
  if (value === 'incapacitated') return 'выведен из строя';
  if (value === 'dead') return 'погиб';
  return 'боеспособен';
}

function firePhaseLabel(value: NonNullable<ReturnType<typeof getFireAction>>['phase']): string {
  if (value === 'acquire_target') return 'выбор цели';
  if (value === 'turning') return 'поворот';
  if (value === 'readying_weapon') return 'подготовка оружия';
  if (value === 'aiming') return 'наведение';
  if (value === 'final_safety_check') return 'проверка линии огня';
  if (value === 'firing') return 'выстрел';
  if (value === 'recovering') return 'восстановление';
  if (value === 'cancelled') return 'отменено';
  return 'не удалось';
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
  const r = unit.behaviorRuntime;
  const c = unit.soldier.condition;
  const t = unit.soldier.traits;
  const decision = stableDecision(unit, decisions);
  const smoothHeight = sampleSmoothHeightLevel(state.map, unit.position.x, unit.position.y);
  const values: Record<string, string> = {
    position: `${unit.position.x.toFixed(1)}, ${unit.position.y.toFixed(1)}`,
    height: cell ? elevation(smoothHeight) : 'вне карты',
    terrain: cell ? terrain(cell) : 'вне карты',
    posture: postureLabel(r.posture),
    action: actionLabel(r.currentAction),
    order: orderLabel(state, unit),
    state: r.state,
    weaponReady: r.weaponReady ? 'готово' : 'не готово',
    confusion: pct(c.confusion),
    lastEvent: r.lastEvent ?? 'нет',
    resilience: pct(t.resilience), caution: pct(t.caution), decisiveness: pct(t.decisiveness), discipline: pct(t.discipline),
    initiative: pct(t.initiative), tactics: pct(t.tactics), weaponSkill: pct(t.weaponSkill),
    attention: pct(c.attention), view: pct(c.view), intuition: pct(c.intuition), speed: pct(c.speed), stealth: pct(c.stealth),
    viewRange: `${Math.round(unit.attentionSettings.vision.maximumVisualRangeMeters)} м`,
    aiDecision: decision.decision,
    aiReason: decision.reason,
    postureReason: decision.postureReason,
    stateReason: decision.stateReason,
  };
  for (const [key, value] of Object.entries(values)) setLiveText(target, key, value);
  const metrics: Record<string, number> = {
    health: c.health, morale: c.morale, fatigue: c.fatigue, stress: r.stress, suppression: r.suppression, ammo: Math.min(100, r.ammo),
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

function renderDanger(target: HTMLElement, state: SimulationState, unit: UnitModel, onChanged: () => void, rerender: () => void): void {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const currentProtection = Math.max(
    threats.strongest?.expectedProtection ?? 0,
    threats.strongestKnown?.expectedProtection ?? 0,
  );
  const threatConfidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence))
    : 0;
  const selected = getSelectedSimulationCover(state);
  target.innerHTML = `${heading('Слой опасности','Красное — известная опасность. Полная карта строится фоновым worker; панель читает только текущую позицию бойца.')}${legend([['legend-danger-high','крайне опасно'],['legend-danger-medium','опасно'],['legend-danger-low','умеренная опасность']])}${grid([['Текущая опасность',pct(threats.danger)],['Подавление',pct(threats.suppression)],['Защита позиции',pct(currentProtection)],['Оценка активного маршрута',readPublishedRouteDanger(unit.order)===null?'нет маршрута':pct(readPublishedRouteDanger(unit.order)!)],['Уверенность в угрозах',pct(threatConfidence)]])}<section class="workspace-panel-section"><h3>Известные укрытия</h3><div data-role="cover-list"></div></section>`;
  if (selected) {
    const object = state.map.objects.find((item) => item.id === selected.id);
    const props = object ? resolveObjectCoverProperties(object) : null;
    const threat = unit.tacticalKnowledge.threats[0];
    const card = document.createElement('section');
    card.className = 'selected-cover-card';
    card.innerHTML = `<h3>${esc(selected.labelRu)}</h3>${grid([['Расстояние',`${Math.round(selected.distanceMeters)} м`],['Ожидаемая защита',pct(props?.coverProtection??selected.quality)],['Надёжность',pct(props?.coverReliability??selected.quality)],['Маскировка',pct(props?.concealment??0)],['Сторона защиты',threat?direction(Math.atan2(threat.y-selected.y,threat.x-selected.x)*180/Math.PI):'нет известной угрозы'],['Угроза',threat?.labelRu??'неизвестна']])}`;
    const move = button('Приказать двигаться сюда','primary full-width');
    move.onclick = () => { issueMoveOrderToSelectedUnit(state,{x:selected.x,y:selected.y}); onChanged(); };
    card.append(move);
    target.prepend(card);
  }
  const list = target.querySelector<HTMLElement>('[data-role="cover-list"]')!;
  const covers = getSimulationCovers(state).slice(0,12);
  if (!covers.length) list.innerHTML = empty('Известных укрытий пока нет.');
  for (const cover of covers) {
    const item = button(`${cover.labelRu} · ${Math.round(cover.distanceMeters)} м · ${Math.round(cover.quality)}/100`,'cover-list-card');
    item.classList.toggle('selected',selected?.id===cover.id);
    item.onclick = () => { setSelectedSimulationCover(state,cover.id); rerender(); onChanged(); };
    list.append(item);
  }
}

function renderStealth(target: HTMLElement, state: SimulationState, unit: UnitModel, _onChanged: () => void): void {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
  const concealment = resolveLocalConcealment(cell);
  const confidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence))
    : 0;
  target.innerHTML = `${heading('Слой скрытности','Полная карта скрытности рисуется фоновым worker. Автоматический поиск безопасных и скрытых позиций удалён как легаси.')}${legend([['legend-stealth-best','очень трудно заметить'],['legend-stealth-good','хорошая скрытность'],['legend-stealth-medium','заметен'],['legend-stealth-bad','хорошо заметен']])}${grid([['Скрытность клетки',pct(concealment)],['Открытость',pct(100-concealment)],['Поза',postureLabel(unit.behaviorRuntime.posture)],['Тип клетки',cell ? terrain(cell) : 'вне карты'],['Уверенность',pct(confidence)]])}`;
}

function memoryPanel(state: SimulationState, unit: UnitModel): string {
  const report=buildUnitKnowledgeReport(state,unit);
  const threats=unit.tacticalKnowledge.threats.map((x)=>`<div class="memory-card"><strong>${esc(x.labelRu)}</strong><span>${x.visibleNow?'видит сейчас':`обновлено ${Math.max(0,state.simulationTimeSeconds-x.lastUpdatedSeconds).toFixed(1)} с назад`}</span><b>уверенность ${Math.round(x.confidence)}%</b><em>неточность ±${x.uncertaintyCells.toFixed(1)} клетки · ${sourceLabel(x.source)}</em></div>`).join('')||empty('Солдат пока не знает ни об одной угрозе.');
  const covers=[...report.nearbyCovers,...report.planCovers].slice(0,16).map((x)=>`<div class="memory-card"><strong>${esc(x.labelRu)}</strong><span>${Math.round(x.distanceMeters)} м</span><b>${Math.round(x.quality)}/100</b><em>${esc(x.sourceRu)}</em></div>`).join('')||empty('Известных предметов и укрытий пока нет.');
  return `${heading('Обзор и память','Текущая видимость показывается тепловой картой, а старые знания остаются субъективными метками бойца.')}${grid([['Известная область',`${Math.round(report.knownAreaMeters)} м`],['Угроз в памяти',String(unit.tacticalKnowledge.threats.length)],['Известных укрытий',String(report.nearbyCovers.length+report.planCovers.length)],['Версия знаний',String(unit.tacticalKnowledge.revision)]])}<section class="workspace-panel-section"><h3>Опасности и противник</h3>${threats}</section><section class="workspace-panel-section"><h3>Известные предметы и укрытия</h3>${covers}</section>`;
}

function sidebarKey(state: SimulationState, tab: SimulationTab): string {
  const unit = getSelectedUnit(state);
  if (!unit) return `${tab}|none`;
  if (tab === 'info') return `${tab}|${unit.id}`;
  const layer = getSimulationLayerState(state);
  const position = `${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`;
  const order = unit.order ? `${Math.floor(unit.order.target.x)}:${Math.floor(unit.order.target.y)}` : 'none';
  const common = [tab, unit.id, position, order, unit.behaviorRuntime.posture, unit.tacticalKnowledge.revision, state.map.objects.length, state.pressureZones.length];
  if (tab === 'danger') common.push(layer.selectedCoverId ?? '');
  if (tab === 'memory') common.push(Math.floor(state.simulationTimeSeconds).toString());
  return common.join('|');
}

function findCurrentEditorPlacementTool(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.game-editor-body [data-editor-tool].primary');
}

function shortPlacementLabel(label: string): string {
  if (label.includes('предмет')) return 'Поставить предмет';
  if (label.includes('бойца')) return 'Поставить бойца';
  if (label.includes('угрозу')) return 'Поставить угрозу';
  if (label.includes('высоту')) return 'Рисовать высоту';
  if (label.includes('лес')) return 'Рисовать лес';
  return 'Поставить';
}

function moveWorkspaceFileTools(target: HTMLElement): void {
  const actions = document.querySelectorAll<HTMLElement>('[data-workspace-file-action]');
  for (const action of actions) target.append(action);
  const fileInput = document.querySelector<HTMLElement>('[data-workspace-file-input]');
  if (fileInput) target.append(fileInput);
  const slot = document.querySelector<HTMLElement>('.editor-scene-tools-slot');
  if (slot) {
    slot.replaceChildren();
    slot.hidden = true;
  }
  if (!target.children.length) target.innerHTML = empty('Служебные команды не найдены.');
}

function setLiveText(target: HTMLElement, key: string, value: string): void {
  const element = target.querySelector<HTMLElement>(`[data-live="${key}"]`);
  if (element && element.textContent !== value) element.textContent = value;
}

function setLiveMetric(target: HTMLElement, key: string, value: number): void {
  const row = target.querySelector<HTMLElement>(`[data-metric="${key}"]`);
  if (!row) return;
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  const bar = row.querySelector<HTMLElement>('i');
  const label = row.querySelector<HTMLElement>('b');
  if (bar && bar.style.width !== `${normalized}%`) bar.style.width = `${normalized}%`;
  if (label && label.textContent !== String(normalized)) label.textContent = String(normalized);
}

function heading(title:string,text:string):string{return `<div class="workspace-panel-heading"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;}
function grid(rows:Array<[string,string]>):string{return `<div class="workspace-info-grid">${rows.map(([a,b])=>`<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>`;}
function liveGrid(rows:Array<[string,string]>):string{return `<div class="workspace-info-grid">${rows.map(([label,key])=>`<div><span>${esc(label)}</span><b data-live="${key}">—</b></div>`).join('')}</div>`;}
function liveMetrics(rows:Array<[string,string]>):string{return `<section class="workspace-metrics">${rows.map(([label,key])=>`<div class="workspace-metric-row" data-metric="${key}"><span>${esc(label)}</span><div><i style="width:0%"></i></div><b>0</b></div>`).join('')}</section>`;}
function liveDetails(title:string,rows:Array<[string,string]>,open=false):string{return `<details class="workspace-details" ${open?'open':''}><summary>${esc(title)}</summary>${liveGrid(rows)}</details>`;}
function legend(rows:Array<[string,string]>):string{return `<div class="workspace-legend">${rows.map(([a,b])=>`<span><i class="${a}"></i>${esc(b)}</span>`).join('')}</div>`;}
function empty(text:string):string{return `<div class="workspace-empty-state">${esc(text)}</div>`;}
function button(text:string,className=''):HTMLButtonElement{const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;return b;}
function moveExistingButton(selector:string,target:HTMLElement):void{const x=document.querySelector<HTMLElement>(selector);if(x)target.append(x);}
function setManualPosture(unit:UnitModel,posture:UnitPosture,label:string):void{unit.behaviorRuntime.previousPosture=unit.behaviorRuntime.posture;unit.behaviorRuntime.posture=posture;unit.behaviorRuntime.postureChangedBecause=`ручной выбор: ${label}`;unit.behaviorRuntime.reason=`положение задано вручную: ${label}`;}
function orderLabel(state:SimulationState,unit:UnitModel):string{if(!unit.order)return 'нет приказа';const d=Math.hypot(unit.position.x-unit.order.target.x,unit.position.y-unit.order.target.y)*state.map.metersPerCell;return `двигаться ${Math.round(d)} м к ${unit.order.target.x.toFixed(1)}, ${unit.order.target.y.toFixed(1)}`;}
function postureLabel(x:UnitPosture):string{return x==='crouched'?'пригнулся':x==='prone'?'лежит':'стоит';}
function profileLabel(x:string):string{return ({green:'новобранец',regular:'обычный',veteran:'ветеран',cautious:'осторожный',reckless:'безрассудный'} as Record<string,string>)[x]??x;}
function actionLabel(x:string):string{return ({waiting:'ожидает',observing:'наблюдает',moving:'движется',move_to:'идёт к позиции',retreat:'отходит',fire:'ведёт огонь',suppress:'подавляет',reload:'перезаряжается',wait:'ожидает'} as Record<string,string>)[x]??x;}
function terrain(cell:MapCell):string{const profile=getActiveEnvironmentProfile();const surface=getSurfaceMaterial(profile,cell.surfaceMaterialId);const vegetation=getVegetationMaterial(profile,cell.vegetationMaterialId);return vegetation.id==='none'?surface.nameRu.toLowerCase():`${surface.nameRu.toLowerCase()} + ${vegetation.nameRu.toLowerCase()}`;}
function resolveLocalConcealment(cell:MapCell|undefined):number{if(!cell)return 0;const profile=getActiveEnvironmentProfile();return getVegetationMaterial(profile,cell.vegetationMaterialId).visibility.localConcealment;}
function elevation(x:number):string{const rounded=Math.round(x*10)/10;const normalized=Math.abs(rounded)<0.05?0:rounded;const level=Math.max(-2,Math.min(4,Math.round(normalized)));return `${normalized>0?'+':''}${normalized.toFixed(1)} · ${({[-2]:'глубокая низина',[-1]:'низина',0:'ровно',1:'подъём',2:'холм',3:'высота',4:'гребень'} as Record<number,string>)[level]??'уровень'}`;}
function pct(x:number):string{return `${Math.max(0,Math.min(100,Math.round(x)))} / 100`;}
function direction(x:number):string{const a=((x%360)+360)%360;return ['восток','юго-восток','юг','юго-запад','запад','северо-запад','север','северо-восток'][Math.round(a/45)%8];}
function sourceLabel(x:string):string{return ({seen:'увидел сам',reported:'получил доклад',heard:'услышал',fire_pressure:'почувствовал воздействие огня'} as Record<string,string>)[x]??x;}
function esc(x:string):string{return x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
