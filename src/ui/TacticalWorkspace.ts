import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import { getSelectedSimulationCover, getSimulationCovers, hoverSimulationCoverAtPosition } from '../core/knowledge/SimulationCoverSelection';
import { buildUnitKnowledgeReport } from '../core/knowledge/UnitKnowledge';
import { getCell, resolveObjectCoverProperties } from '../core/map/MapModel';
import { getSelectedUnit, issueMoveOrderToSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
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
  setHoveredSimulationCover,
  setSelectedSimulationCover,
  setSimulationLayerMode,
  toggleRealReliefOverlay,
  type SimulationLayerMode,
} from '../core/ui/RuntimeUiState';
import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';
import { exitLab } from '../shared/AppShellMenu';

export type TacticalWorkspaceMode = 'simulation' | 'editor';
type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory';

const TABS: Array<[SimulationTab, string]> = [
  ['info', 'Инфо'], ['danger', 'Опасность'], ['stealth', 'Скрытность'], ['memory', 'Память'],
];

export function installTacticalWorkspace(state: SimulationState, aiBridge: AiGameBridgeHandle, onChanged: () => void): void {
  let mode: TacticalWorkspaceMode = state.editor.enabled ? 'editor' : 'simulation';
  let tab: SimulationTab = 'info';
  let collapsed = false;
  let lastSidebarKey = '';

  const shell = document.createElement('div');
  shell.className = 'tactical-workspace-shell';
  shell.innerHTML = `
    <header class="tactical-workspace-bar">
      <div class="workspace-brand"><strong>Тактическая карта</strong><span>одиночный боец · симуляция и редактор</span></div>
      <div class="workspace-mode-switch">
        <button data-mode="simulation">Симуляция</button><button data-mode="editor">Редактирование</button>
      </div>
      <div class="workspace-top-actions">
        <button data-action="ai-editor">Редактор ИИ</button><button data-action="new-game">Новая игра</button>
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
      <div class="unit-bar-identity"><strong data-role="unit-name">Боец не выбран</strong><span data-role="unit-meta">Левый клик по солдату — выбрать</span></div>
      <div class="unit-bar-stats">${['health:Здоровье','morale:Дух','fatigue:Усталость','stress:Стресс','suppression:Подавление','ammo:Патроны'].map((item) => { const [id,label]=item.split(':'); return `<div class="unit-bar-stat"><span>${label}</span><b data-stat="${id}">—</b></div>`; }).join('')}</div>
      <div class="unit-bar-current"><span data-role="action">Действие: —</span><span data-role="order">Приказ: —</span></div>
      <div class="unit-bar-command-group posture-group">
        <button data-posture="standing">Стоять</button><button data-posture="crouched">Пригнуться</button><button data-posture="prone">Лечь</button>
      </div>
      <div class="unit-bar-command-group simulation-controls">
        <button class="primary" data-action="pause">Пауза</button><button data-action="step">Один шаг</button>
        <button data-action="evaluate">Один расчёт ИИ</button><button class="primary" data-action="execute">Рассчитать и выполнить</button>
        <button data-action="clear-order">Очистить приказ</button><button data-action="reset-unit">Сбросить бойца</button>
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

  q<HTMLButtonElement>('[data-action="ai-editor"]').onclick = () => window.open('/ai-node-editor.html', '_blank');
  q<HTMLButtonElement>('[data-action="new-game"]').onclick = () => window.location.reload();
  q<HTMLButtonElement>('[data-action="exit"]').onclick = exitLab;
  q<HTMLButtonElement>('[data-action="collapse"]').onclick = () => { collapsed = !collapsed; syncLayout(); onChanged(); };
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
    update(true); onChanged();
  };
  for (const speedButton of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) speedButton.onclick = () => {
    setAiTestTimeScale(state, Number(speedButton.dataset.speed)); updateBottom();
  };
  q<HTMLButtonElement>('[data-action="pause"]').onclick = () => { setAiTestPaused(state, !getAiTestPaused(state)); updateBottom(); onChanged(); };
  q<HTMLButtonElement>('[data-action="step"]').onclick = () => { tickSimulation(state, 0.1); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="evaluate"]').onclick = () => { aiBridge.evaluateNow(); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="execute"]').onclick = () => { aiBridge.tickNow(); update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="clear-order"]').onclick = () => { const unit = getSelectedUnit(state); if (unit) unit.order = null; update(true); onChanged(); };
  q<HTMLButtonElement>('[data-action="reset-unit"]').onclick = () => {
    const reset = resetSelectedUnitForTest(state); const unit = getSelectedUnit(state); if (!reset && unit) applyInitialStateToRuntime(unit);
    update(true); onChanged();
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
    sidebar.hidden = mode !== 'simulation'; bottom.hidden = mode !== 'simulation';
    q<HTMLButtonElement>('[data-action="collapse"]').textContent = collapsed ? '›' : '‹';
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-mode]')) item.classList.toggle('active', item.dataset.mode === mode);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function update(force = false): void {
    if (force) lastSidebarKey = '';
    updateBottom(); renderSidebar();
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-tab]')) item.classList.toggle('active', item.dataset.tab === tab);
  }

  function updateBottom(): void {
    const unit = getSelectedUnit(state);
    q('[data-role="unit-name"]').textContent = unit?.labels.ru ?? 'Боец не выбран';
    q('[data-role="unit-meta"]').textContent = unit ? `${unit.id} · ${postureLabel(unit.behaviorRuntime.posture)} · ${profileLabel(unit.behaviorProfile)}` : 'Левый клик по солдату — выбрать';
    const values: Record<string, string> = unit ? {
      health: pct(unit.soldier.condition.health), morale: pct(unit.soldier.condition.morale), fatigue: pct(unit.soldier.condition.fatigue),
      stress: pct(unit.behaviorRuntime.stress), suppression: pct(unit.behaviorRuntime.suppression), ammo: String(Math.round(unit.behaviorRuntime.ammo)),
    } : { health:'—', morale:'—', fatigue:'—', stress:'—', suppression:'—', ammo:'—' };
    for (const item of shell.querySelectorAll<HTMLElement>('[data-stat]')) item.textContent = values[item.dataset.stat ?? ''] ?? '—';
    q('[data-role="action"]').textContent = `Действие: ${unit ? actionLabel(unit.behaviorRuntime.currentAction) : '—'}`;
    q('[data-role="order"]').textContent = `Приказ: ${unit ? orderLabel(state, unit) : '—'}`;
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-posture]')) { item.disabled = !unit; item.classList.toggle('active', item.dataset.posture === unit?.behaviorRuntime.posture); }
    const pause = q<HTMLButtonElement>('[data-action="pause"]'); pause.textContent = getAiTestPaused(state) ? 'Продолжить' : 'Пауза'; pause.classList.toggle('active', getAiTestPaused(state));
    for (const item of shell.querySelectorAll<HTMLButtonElement>('[data-speed]')) item.classList.toggle('active', Number(item.dataset.speed) === getAiTestTimeScale(state));
  }

  function renderSidebar(): void {
    if (mode !== 'simulation') return;
    const key = sidebarKey(state, tab);
    if (key === lastSidebarKey) return;
    lastSidebarKey = key;
    sidebarTitle.textContent = ({ info:'Информация о бойце', danger:'Опасность и укрытия', stealth:'Скрытность', memory:'Память бойца' })[tab];
    const unit = getSelectedUnit(state);
    if (!unit) { sidebarBody.innerHTML = empty('Выберите бойца на карте. Левая кнопка выбирает, правая отдаёт приказ движения.'); return; }
    if (tab === 'info') sidebarBody.innerHTML = infoPanel(state, unit);
    if (tab === 'danger') renderDanger(sidebarBody, state, unit, onChanged, () => { lastSidebarKey=''; renderSidebar(); });
    if (tab === 'stealth') renderStealth(sidebarBody, state, unit, onChanged);
    if (tab === 'memory') sidebarBody.innerHTML = memoryPanel(state, unit);
  }

  const attachTooltip = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return;
    canvas.addEventListener('pointermove', (event) => {
      if (mode !== 'simulation' || tab === 'info') { tooltip.hidden = true; setHoveredSimulationCover(state, null); return; }
      const cover = hoverSimulationCoverAtPosition(state, state.mouseGridPosition);
      if (!cover) { tooltip.hidden = true; return; }
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 18)}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 150, event.clientY + 18)}px`;
      tooltip.innerHTML = `<strong>${esc(cover.labelRu)}</strong><span>Расстояние: ${Math.round(cover.distanceMeters)} м</span><span>Качество: ${Math.round(cover.quality)}/100</span><span>${esc(cover.sourceRu)}</span>`;
      lastSidebarKey = '';
    });
    canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; setHoveredSimulationCover(state, null); });
    canvas.addEventListener('pointerdown', () => { tooltip.hidden = true; window.setTimeout(() => update(true), 0); });
  };

  setSimulationLayerMode(state, tab);
  syncLayout(); update(true); attachTooltip();
  window.setInterval(() => update(false), 300);
}

function infoPanel(state: SimulationState, unit: UnitModel): string {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
  const r = unit.behaviorRuntime, c = unit.soldier.condition, t = unit.soldier.traits;
  return `${heading('Инфо','Оверлей на карту не накладывается.')}${grid([
    ['Положение',`${unit.position.x.toFixed(1)}, ${unit.position.y.toFixed(1)}`], ['Высота',cell ? elevation(cell.height) : 'вне карты'],
    ['Местность',cell ? terrain(cell.terrain,cell.forest) : 'вне карты'], ['Поза',postureLabel(r.posture)], ['Действие',actionLabel(r.currentAction)], ['Приказ',orderLabel(state,unit)],
  ])}${metrics([['Здоровье',c.health],['Боевой дух',c.morale],['Усталость',c.fatigue],['Стресс',r.stress],['Подавление',r.suppression],['Патроны',Math.min(100,r.ammo)]])}
  ${details('Текущее состояние',[['Состояние',r.state],['Готовность оружия',r.weaponReady?'готово':'не готово'],['Замешательство',pct(c.confusion)],['Последнее событие',r.lastEvent??'нет']],true)}
  ${details('Навыки',[['Стойкость',pct(t.resilience)],['Осторожность',pct(t.caution)],['Решительность',pct(t.decisiveness)],['Дисциплина',pct(t.discipline)],['Инициатива',pct(t.initiative)],['Тактика',pct(t.tactics)],['Владение оружием',pct(t.weaponSkill)]])}
  ${details('Чувства и физические данные',[['Внимание',pct(c.attention)],['Зрение',pct(c.view)],['Интуиция',pct(c.intuition)],['Физическая подготовка',pct(c.speed)],['Личная скрытность',pct(c.stealth)],['Дальность обзора',`${Math.round(unit.viewRangeCells*state.map.metersPerCell)} м`]])}
  ${details('Последнее решение ИИ',[['Решение',r.aiGraphReason||r.reason||'ещё не рассчитывалось'],['Причина',r.reason||'нет'],['Почему поза',r.postureChangedBecause||'нет'],['Почему состояние',r.stateChangedBecause||'нет']],true)}`;
}

function renderDanger(target: HTMLElement, state: SimulationState, unit: UnitModel, onChanged: () => void, rerender: () => void): void {
  const report = buildSoldierAwarenessReport(state, unit), current = report.currentPosition, selected = getSelectedSimulationCover(state);
  target.innerHTML = `${heading('Слой опасности','Красное — известная опасность. Метки показывают известные укрытия и безопасные позиции.')}${legend([['legend-danger-high','крайне опасно'],['legend-danger-medium','опасно'],['legend-danger-low','умеренная опасность'],['legend-safe','безопасная позиция']])}${grid([['Текущая опасность',pct(current.danger)],['Подавление',pct(current.suppression)],['Защита позиции',pct(current.expectedProtection)],['Опасность маршрута',pct(report.routeDanger)],['Уверенность в угрозах',pct(report.threatConfidence)]])}<section class="workspace-panel-section"><h3>Известные укрытия</h3><div data-role="cover-list"></div></section>`;
  if (selected) {
    const object = state.map.objects.find((item) => item.id === selected.id), props = object ? resolveObjectCoverProperties(object) : null;
    const cell = report.cells.find((item) => item.x === Math.floor(selected.x) && item.y === Math.floor(selected.y));
    const threat = unit.tacticalKnowledge.threats[0];
    const card = document.createElement('section'); card.className='selected-cover-card';
    card.innerHTML = `<h3>${esc(selected.labelRu)}</h3>${grid([['Расстояние',`${Math.round(selected.distanceMeters)} м`],['Ожидаемая защита',pct(cell?.expectedProtection??props?.coverProtection??selected.quality)],['Надёжность',pct(cell?.coverReliability??props?.coverReliability??selected.quality)],['Маскировка',pct(cell?.concealment??props?.concealment??0)],['Сторона защиты',threat?direction(Math.atan2(threat.y-selected.y,threat.x-selected.x)*180/Math.PI):'нет известной угрозы'],['Угроза',threat?.labelRu??'неизвестна']])}`;
    const move=button('Приказать двигаться сюда','primary full-width'); move.onclick=()=>{ issueMoveOrderToSelectedUnit(state,{x:selected.x,y:selected.y}); onChanged(); }; card.append(move); target.prepend(card);
  }
  const list = target.querySelector<HTMLElement>('[data-role="cover-list"]')!;
  const covers=getSimulationCovers(state).slice(0,12); if(!covers.length) list.innerHTML=empty('Известных укрытий пока нет.');
  for(const cover of covers){ const item=button(`${cover.labelRu} · ${Math.round(cover.distanceMeters)} м · ${Math.round(cover.quality)}/100`,'cover-list-card'); item.classList.toggle('selected',selected?.id===cover.id); item.onclick=()=>{setSelectedSimulationCover(state,cover.id);rerender();onChanged();}; list.append(item); }
}

function renderStealth(target: HTMLElement, state: SimulationState, unit: UnitModel, onChanged: () => void): void {
  const report=buildSoldierAwarenessReport(state,unit), current=report.currentPosition;
  const best=report.cells.map((cell)=>({cell,d:Math.hypot(unit.position.x-cell.x-.5,unit.position.y-cell.y-.5)})).filter((x)=>x.d<=12&&x.cell.concealment>=20).sort((a,b)=>(b.cell.concealment-b.d*1.4)-(a.cell.concealment-a.d*1.4)).slice(0,8);
  target.innerHTML=`${heading('Слой скрытности','Показывает, где бойца труднее заметить. Маскировка не равна физической защите.')}${legend([['legend-stealth-best','очень трудно заметить'],['legend-stealth-good','хорошая скрытность'],['legend-stealth-medium','заметен'],['legend-stealth-bad','хорошо заметен']])}${grid([['Скрытность клетки',pct(current.concealment)],['Открытость',pct(100-current.concealment)],['Поза',postureLabel(unit.behaviorRuntime.posture)],['Источник оценки',current.sourceRu],['Уверенность',pct(current.confidence)]])}<section class="workspace-panel-section"><h3>Лучшие скрытые позиции</h3><div data-role="stealth-list"></div></section>`;
  const list=target.querySelector<HTMLElement>('[data-role="stealth-list"]')!; if(!best.length)list.innerHTML=empty('Рядом нет заметно более скрытых позиций.');
  for(const item of best){const row=document.createElement('div');row.className='stealth-position-card';row.innerHTML=`<strong>Клетка ${item.cell.x+1}:${item.cell.y+1}</strong><span>${Math.round(item.d*state.map.metersPerCell)} м</span><b>${item.cell.concealment}/100</b><em>${esc(item.cell.sourceRu)}</em>`;const move=button('Идти','compact');move.onclick=()=>{issueMoveOrderToSelectedUnit(state,{x:item.cell.x+.5,y:item.cell.y+.5});onChanged();};row.append(move);list.append(row);}
}

function memoryPanel(state: SimulationState, unit: UnitModel): string {
  const report=buildUnitKnowledgeReport(state,unit);
  const threats=unit.tacticalKnowledge.threats.map((x)=>`<div class="memory-card"><strong>${esc(x.labelRu)}</strong><span>${x.visibleNow?'видит сейчас':`обновлено ${Math.max(0,state.simulationTimeSeconds-x.lastUpdatedSeconds).toFixed(1)} с назад`}</span><b>уверенность ${Math.round(x.confidence)}%</b><em>неточность ±${x.uncertaintyCells.toFixed(1)} клетки · ${sourceLabel(x.source)}</em></div>`).join('')||empty('Солдат пока не знает ни об одной угрозе.');
  const covers=[...report.nearbyCovers,...report.planCovers].slice(0,16).map((x)=>`<div class="memory-card"><strong>${esc(x.labelRu)}</strong><span>${Math.round(x.distanceMeters)} м</span><b>${Math.round(x.quality)}/100</b><em>${esc(x.sourceRu)}</em></div>`).join('')||empty('Известных предметов и укрытий пока нет.');
  return `${heading('Память бойца','Субъективная картина мира выбранного солдата, а не объективная карта.')}${grid([['Известная область',`${Math.round(report.knownAreaMeters)} м`],['Угроз в памяти',String(unit.tacticalKnowledge.threats.length)],['Известных укрытий',String(report.nearbyCovers.length+report.planCovers.length)],['Версия знаний',String(unit.tacticalKnowledge.revision)]])}<section class="workspace-panel-section"><h3>Опасности и противник</h3>${threats}</section><section class="workspace-panel-section"><h3>Известные предметы и укрытия</h3>${covers}</section>`;
}

function sidebarKey(state: SimulationState, tab: SimulationTab): string { const u=getSelectedUnit(state),l=getSimulationLayerState(state); return [tab,u?.id??'',u?.position.x.toFixed(2)??'',u?.position.y.toFixed(2)??'',u?.behaviorRuntime.posture??'',Math.round(u?.behaviorRuntime.stress??0),Math.round(u?.behaviorRuntime.suppression??0),u?.behaviorRuntime.currentAction??'',u?.behaviorRuntime.reason??'',u?.tacticalKnowledge.revision??0,l.selectedCoverId??'',l.hoveredCoverId??'',state.map.objects.length,state.pressureZones.length].join('|'); }
function heading(title:string,text:string):string{return `<div class="workspace-panel-heading"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;}
function grid(rows:Array<[string,string]>):string{return `<div class="workspace-info-grid">${rows.map(([a,b])=>`<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>`;}
function metrics(rows:Array<[string,number]>):string{return `<section class="workspace-metrics">${rows.map(([a,b])=>{const v=Math.max(0,Math.min(100,Math.round(b)));return `<div class="workspace-metric-row"><span>${esc(a)}</span><div><i style="width:${v}%"></i></div><b>${v}</b></div>`;}).join('')}</section>`;}
function details(title:string,rows:Array<[string,string]>,open=false):string{return `<details class="workspace-details" ${open?'open':''}><summary>${esc(title)}</summary>${grid(rows)}</details>`;}
function legend(rows:Array<[string,string]>):string{return `<div class="workspace-legend">${rows.map(([a,b])=>`<span><i class="${a}"></i>${esc(b)}</span>`).join('')}</div>`;}
function empty(text:string):string{return `<div class="workspace-empty-state">${esc(text)}</div>`;}
function button(text:string,className=''):HTMLButtonElement{const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;return b;}
function moveExistingButton(selector:string,target:HTMLElement):void{const x=document.querySelector<HTMLElement>(selector);if(x)target.append(x);}
function setManualPosture(unit:UnitModel,posture:UnitPosture,label:string):void{unit.behaviorRuntime.previousPosture=unit.behaviorRuntime.posture;unit.behaviorRuntime.posture=posture;unit.behaviorRuntime.postureChangedBecause=`ручной выбор: ${label}`;unit.behaviorRuntime.reason=`положение задано вручную: ${label}`;}
function orderLabel(state:SimulationState,unit:UnitModel):string{if(!unit.order)return 'нет приказа';const d=Math.hypot(unit.position.x-unit.order.target.x,unit.position.y-unit.order.target.y)*state.map.metersPerCell;return `двигаться ${Math.round(d)} м к ${unit.order.target.x.toFixed(1)}, ${unit.order.target.y.toFixed(1)}`;}
function postureLabel(x:UnitPosture):string{return x==='crouched'?'пригнулся':x==='prone'?'лежит':'стоит';}
function profileLabel(x:string):string{return ({green:'новобранец',regular:'обычный',veteran:'ветеран',cautious:'осторожный',reckless:'безрассудный'} as Record<string,string>)[x]??x;}
function actionLabel(x:string):string{return ({waiting:'ожидает',observing:'наблюдает',moving:'движется',move_to:'идёт к позиции',retreat:'отходит',fire:'ведёт огонь',suppress:'подавляет',reload:'перезаряжается',wait:'ожидает'} as Record<string,string>)[x]??x;}
function terrain(x:string,forest:number):string{if(forest===2)return 'густой лес';if(forest===1)return 'редкий лес';return ({field:'открытое поле',forest:'лесная почва',road:'дорога',swamp:'болото',rough:'пересечённая местность',water:'вода'} as Record<string,string>)[x]??x;}
function elevation(x:number):string{return `${x>0?'+':''}${x} · ${({[-2]:'глубокая низина',[-1]:'низина',0:'ровно',1:'подъём',2:'холм',3:'высота',4:'гребень'} as Record<number,string>)[x]??'уровень'}`;}
function pct(x:number):string{return `${Math.max(0,Math.min(100,Math.round(x)))} / 100`;}
function direction(x:number):string{const a=((x%360)+360)%360;return ['восток','юго-восток','юг','юго-запад','запад','северо-запад','север','северо-восток'][Math.round(a/45)%8];}
function sourceLabel(x:string):string{return ({seen:'увидел сам',reported:'получил доклад',heard:'услышал',fire_pressure:'почувствовал воздействие огня'} as Record<string,string>)[x]??x;}
function esc(x:string):string{return x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
