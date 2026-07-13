import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes applied to ${path}`);
  await writeFile(path, next, 'utf8');
}
function replace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  return source.replace(before, after);
}
function before(source, marker, addition, label) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}`);
  return source.replace(marker, `${addition}${marker}`);
}

await edit('src/core/simulation/SimulationTick.ts', (source) => {
  source = replace(source,
`import { updateAttentionController } from '../perception/AttentionController';`,
`import { updateAttentionController } from '../perception/AttentionController';
import { normalizeRadians } from '../perception/AttentionModel';`, 'movement facing import');
  source = replace(source,
`  const stepDistance = unit.speedCellsPerSecond * postureMultiplier * conditionMultiplier * deltaSeconds;
  unit.position = moveToPoint(unit.position, movementTarget, stepDistance);`,
`  const stepDistance = unit.speedCellsPerSecond * postureMultiplier * conditionMultiplier * deltaSeconds;
  updateFacingAlongRoute(unit, movementTarget);
  unit.position = moveToPoint(unit.position, movementTarget, stepDistance);`, 'movement facing call');
  source = before(source, `function applyFinalFacing`,
`function updateFacingAlongRoute(unit: UnitModel, movementTarget: GridPosition): void {
  const dx = movementTarget.x - unit.position.x;
  const dy = movementTarget.y - unit.position.y;
  if (Math.hypot(dx, dy) < 0.0001) return;
  const heading = normalizeRadians(Math.atan2(dy, dx));
  const difference = Math.abs(Math.atan2(Math.sin(heading - unit.facingRadians), Math.cos(heading - unit.facingRadians)));
  if (difference < 0.0001) return;
  unit.facingRadians = heading;
  updateAttentionController(unit, 0);
  unit.behaviorRuntime.lastEvent = 'move_facing_updated';
}

`, 'movement facing helper');
  return source;
});

await edit('src/core/units/UnitModel.ts', (source) => {
  source = replace(source,
`  attention?: UnitAttentionSettingsInput;
  initialState?:`,
`  attention?: UnitAttentionSettingsInput;
  attentionProfileId?: string;
  initialState?:`, 'unit data attention profile');
  source = replace(source,
`  attentionRuntime: AttentionRuntimeState;
  initialState:`,
`  attentionRuntime: AttentionRuntimeState;
  playerAttentionProfileId?: string | null;
  initialState:`, 'unit model attention profile');
  source = replace(source,
`      attentionRuntime: createAttentionRuntime(attentionSettings, facingRadians),
      initialState,`,
`      attentionRuntime: createAttentionRuntime(attentionSettings, facingRadians),
      playerAttentionProfileId: unit.attentionProfileId ?? null,
      initialState,`, 'unit normalize attention profile');
  return source;
});

await edit('src/ui/SceneExport.ts', (source) => replace(source,
`    attention: {
      defaultMode: unit.attentionSettings.defaultMode,`,
`    attentionProfileId: unit.playerAttentionProfileId ?? undefined,
    attention: {
      defaultMode: unit.attentionSettings.defaultMode,`, 'scene attention profile export'));

await edit('src/ui/AttentionProfileControls.ts', (source) => replace(source,
`          selected.attentionSettings = cloneAttentionSettings(draft.attention);
          selected.attentionRuntime`,
`          selected.attentionSettings = cloneAttentionSettings(draft.attention);
          selected.playerAttentionProfileId = null;
          selected.attentionRuntime`, 'manual attention becomes individual'));

await edit('src/ui/AttentionRuntimePanel.ts', (source) => {
  source = replace(source,
`import { getBestPerceptionContact } from '../core/perception/PerceptionSystem';`,
`import { buildThreatDisplayEntries } from '../core/knowledge/ThreatDisplayModel';
import { getBestPerceptionContact } from '../core/perception/PerceptionSystem';`, 'panel threat display import');
  source = replace(source,
`    const contacts = unit.perceptionKnowledge.contacts.length
      ? unit.perceptionKnowledge.contacts.map((contact) => \`
        <button type="button" class="attention-contact-card \${contact.id === overlay.selectedContactId ? 'selected' : ''}" data-contact-id="\${escapeHtml(contact.id)}">
          <strong>\${escapeHtml(contact.labelRu)}</strong>
          <span>\${STAGE_LABELS[contact.stage]} · уверенность \${Math.round(contact.confidence)}%</span>
          <em>неточность ±\${Math.round(contact.uncertaintyCells * state.map.metersPerCell)} м · \${sourceLabel(contact.source)}</em>
        </button>\`).join('')
      : '<p class="attention-empty">Контактов пока нет.</p>';`,
`    const displayEntries = buildThreatDisplayEntries(unit);
    const contacts = displayEntries.length
      ? displayEntries.map((contact) => \`
        <button type="button" class="attention-contact-card \${contact.id === overlay.selectedContactId ? 'selected' : ''} \${contact.current ? 'current' : 'memory'}" data-contact-id="\${escapeHtml(contact.id)}">
          <strong>\${escapeHtml(contact.labelRu)}</strong>
          <span>\${STAGE_LABELS[contact.stage]} · уверенность \${Math.round(contact.confidence)}%</span>
          <em>неточность ±\${Math.round(contact.uncertaintyCells * state.map.metersPerCell)} м · \${sourceLabel(contact.source)}</em>
        </button>\`).join('')
      : '<p class="attention-empty">Контактов пока нет.</p>';`, 'stable panel contacts');
  source = replace(source,
`function sourceLabel(source: 'visual' | 'sound' | 'reported' | 'fire_pressure'): string {
  if (source === 'sound') return 'по звуку';`,
`function sourceLabel(source: string): string {
  if (source === 'sound' || source === 'heard') return 'по звуку';
  if (source === 'seen') return 'зрительно';`, 'panel source labels');
  return source;
});

await edit('src/rendering/PixiOverlayRenderer.ts', (source) => {
  source = replace(source,
`import { buildUnitKnowledgeReport, type KnowledgeCover } from '../core/knowledge/UnitKnowledge';`,
`import { buildThreatGeometryKey, buildThreatMarkerKey } from '../core/knowledge/ThreatDisplayModel';
import { buildUnitKnowledgeReport, type KnowledgeCover } from '../core/knowledge/UnitKnowledge';`, 'renderer display model import');
  source = replace(source,
`  fullMapFingerprintScanCount: number;
}`,
`  fullMapFingerprintScanCount: number;
  threatGeometryRebuildCount: number;
  threatMarkerUpdateCount: number;
  threatGeometryObjectCount: number;
}`, 'renderer diagnostics interface');
  source = replace(source,
`  private readonly knowledgeContainer = new Container();
  private readonly probeContainer`,
`  private readonly knowledgeContainer = new Container();
  private readonly threatGeometryContainer = new Container();
  private readonly threatMarkerGraphics = new Graphics();
  private readonly probeContainer`, 'renderer threat fields');
  source = replace(source,
`  private lastKnowledgeKey = '';
  private lastProbeKey`,
`  private lastKnowledgeKey = '';
  private lastThreatGeometryKey = '';
  private lastThreatMarkerKey = '';
  private lastProbeKey`, 'renderer threat keys');
  source = replace(source,
`    fullMapFingerprintScanCount: 0,
  };`,
`    fullMapFingerprintScanCount: 0,
    threatGeometryRebuildCount: 0,
    threatMarkerUpdateCount: 0,
    threatGeometryObjectCount: 0,
  };`, 'renderer diagnostics defaults');
  source = replace(source,
`      this.knowledgeContainer,
      this.probeContainer,`,
`      this.knowledgeContainer,
      this.threatGeometryContainer,
      this.probeContainer,`, 'renderer threat container setup');
  source = replace(source,
`    this.commandDraftGraphics.eventMode = 'none';`,
`    this.commandDraftGraphics.eventMode = 'none';
    this.threatMarkerGraphics.eventMode = 'none';`, 'renderer marker event');
  source = replace(source,
`      this.knowledgeContainer,
      this.probeContainer,
      this.interactionContainer,`,
`      this.knowledgeContainer,
      this.threatGeometryContainer,
      this.threatMarkerGraphics,
      this.probeContainer,
      this.interactionContainer,`, 'renderer top level threat layers');
  source = replace(source,
`    this.renderKnowledgeLayerIfNeeded(state);
    this.renderProbeLayerIfNeeded(state);`,
`    this.renderKnowledgeLayerIfNeeded(state);
    this.renderThreatLayersIfNeeded(state);
    this.renderProbeLayerIfNeeded(state);`, 'renderer threat render call');
  source = replace(source,
`      drawKnowledgeOverlay(this.knowledgeContainer, state);
      drawThreatMemoryOverlay(this.knowledgeContainer, state);
      drawCoverKnowledgeOverlay`,
`      drawKnowledgeOverlay(this.knowledgeContainer, state);
      drawCoverKnowledgeOverlay`, 'remove threats from volatile knowledge container');
  source = before(source, `  private renderProbeLayerIfNeeded`,
`  private renderThreatLayersIfNeeded(state: SimulationState): void {
    const unit = getSelectedUnit(state);
    const visible = isThreatLayerVisible(state) && Boolean(unit);
    const threats = visible && unit ? unit.tacticalKnowledge.threats : [];
    const geometryKey = visible ? buildThreatGeometryKey(threats, state.map.cellSize) : 'threats:hidden';
    if (geometryKey !== this.lastThreatGeometryKey) {
      this.lastThreatGeometryKey = geometryKey;
      destroyContainerChildren(this.threatGeometryContainer);
      if (visible) drawThreatMemoryGeometry(this.threatGeometryContainer, state);
      this.diagnostics.threatGeometryRebuildCount += 1;
      this.diagnostics.threatGeometryObjectCount = this.threatGeometryContainer.children.length;
    }
    const markerKey = visible ? buildThreatMarkerKey(threats, state.map.cellSize) : 'markers:hidden';
    if (markerKey !== this.lastThreatMarkerKey) {
      this.lastThreatMarkerKey = markerKey;
      this.threatMarkerGraphics.clear();
      if (visible) drawCurrentThreatMarkers(this.threatMarkerGraphics, threats, state.map.cellSize);
      this.diagnostics.threatMarkerUpdateCount += 1;
    }
    this.publishDiagnostics();
  }

`, 'renderer threat methods');
  source = before(source, `function destroyContainerChildren`,
`function isThreatLayerVisible(state: SimulationState): boolean {
  if (state.editor.enabled) return false;
  const mode = getSimulationLayerState(state).mode;
  return mode === 'danger' || mode === 'memory';
}

`, 'renderer threat visibility');
  source = replace(source,
`export function drawThreatMemoryOverlay(container: Container, state: SimulationState): void {
  const layer = getSimulationLayerState(state);
  const unit = getSelectedUnit(state);
  if (state.editor.enabled || !unit || (layer.mode !== 'danger' && layer.mode !== 'memory')) return;

  const graphics = new Graphics();
  const cellSize = state.map.cellSize;
  for (const threat of unit.tacticalKnowledge.threats) drawRememberedThreat(graphics, threat, cellSize, layer.mode === 'memory');
  container.addChild(graphics);
}`,
`export function drawThreatMemoryOverlay(container: Container, state: SimulationState): void {
  drawThreatMemoryGeometry(container, state);
  const unit = getSelectedUnit(state);
  if (!unit || !isThreatLayerVisible(state)) return;
  const markers = new Graphics();
  drawCurrentThreatMarkers(markers, unit.tacticalKnowledge.threats, state.map.cellSize);
  container.addChild(markers);
}

function drawThreatMemoryGeometry(container: Container, state: SimulationState): void {
  const layer = getSimulationLayerState(state);
  const unit = getSelectedUnit(state);
  if (!unit || !isThreatLayerVisible(state)) return;
  const graphics = new Graphics();
  const cellSize = state.map.cellSize;
  for (const threat of unit.tacticalKnowledge.threats) drawRememberedThreat(graphics, threat, cellSize, layer.mode === 'memory');
  container.addChild(graphics);
}

function drawCurrentThreatMarkers(graphics: Graphics, threats: KnownThreatMemory[], cellSize: number): void {
  for (const threat of threats) {
    if (!threat.visibleNow) continue;
    graphics.lineStyle(2, CURRENT_CONTACT_MARKER_COLOR, 1);
    graphics.beginFill(CURRENT_CONTACT_MARKER_COLOR, 0.82);
    graphics.drawCircle(threat.x * cellSize, threat.y * cellSize, 4);
    graphics.endFill();
  }
}`, 'renderer separated threat functions');
  source = replace(source,
`  graphics.lineStyle(threat.visibleNow ? 3 : 2, dangerColor, confidenceAlpha);`,
`  graphics.lineStyle(2, dangerColor, confidenceAlpha);`, 'stable threat line width');
  source = replace(source,
`  if (threat.visibleNow) {
    graphics.beginFill(CURRENT_CONTACT_MARKER_COLOR, 0.95);
    graphics.drawCircle(sourceX, sourceY, 3);
    graphics.endFill();
  }
}`,
`}`, 'remove marker from static geometry');
  return source;
});

await edit('src/ui/TacticalWorkspace.ts', (source) => {
  source = replace(source,
`import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../core/perception/AttentionController';`,
`import { clearAttentionOverride, setAttentionMode, setSearchSector } from '../core/perception/AttentionController';
import { applyAttentionProfileToUnit } from '../core/perception/AttentionProfiles';
import { getAttentionProfileRegistry, subscribeAttentionProfileRegistry } from '../core/perception/AttentionProfileStorage';`, 'workspace attention profile imports');
  source = replace(source,
`        <label class="unit-route-profile"><span>Профиль маршрута</span><select data-action="unit-navigation-profile" aria-label="Профиль движения выбранного бойца"></select></label>
        <label class="unit-attention-mode">`,
`        <label class="unit-route-profile"><span>Маршрут</span><select data-action="unit-navigation-profile" aria-label="Профиль движения выбранного бойца"></select></label>
        <label class="unit-attention-profile"><span>Профиль внимания</span><select data-action="unit-attention-profile" aria-label="Профиль внимания выбранного бойца"></select></label>
        <label class="unit-attention-mode">`, 'workspace attention profile markup');
  source = replace(source,
`  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');
  const attentionModeSelect`,
`  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');
  const attentionProfileSelect = q<HTMLSelectElement>('[data-action="unit-attention-profile"]');
  const attentionModeSelect`, 'workspace attention profile query');
  source = replace(source,
`  refreshNavigationProfiles();
  subscribeNavigationProfileRegistry`,
`  refreshNavigationProfiles();
  const refreshAttentionProfiles = () => {
    const registry = getAttentionProfileRegistry();
    attentionProfileSelect.innerHTML = '<option value="individual">Индивидуальный</option>' + registry.listProfiles()
      .map((profile) => \`<option value="\${esc(profile.id)}">\${esc(profile.nameRu)}</option>\`).join('');
    const unit = getSelectedUnit(state);
    const requested = unit?.playerAttentionProfileId ?? 'individual';
    attentionProfileSelect.value = registry.hasProfile(requested) ? requested : 'individual';
  };
  refreshAttentionProfiles();
  subscribeAttentionProfileRegistry(() => { refreshAttentionProfiles(); updateBottom(); onChanged(); });
  subscribeNavigationProfileRegistry`, 'workspace attention registry refresh');
  source = before(source, `  attentionModeSelect.addEventListener`,
`  attentionProfileSelect.addEventListener('change', () => {
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

`, 'workspace attention profile handler');
  source = replace(source,
`    attentionModeSelect.disabled = !unit;
    turnUnitButton.disabled`,
`    attentionProfileSelect.disabled = !unit;
    attentionModeSelect.disabled = !unit;
    turnUnitButton.disabled`, 'workspace profile disabled');
  source = replace(source,
`    if (unit) {
      attentionModeSelect.value`,
`    if (unit) {
      const attentionRegistry = getAttentionProfileRegistry();
      const attentionProfileId = unit.playerAttentionProfileId ?? 'individual';
      attentionProfileSelect.value = attentionRegistry.hasProfile(attentionProfileId) ? attentionProfileId : 'individual';
      attentionModeSelect.value`, 'workspace profile value');
  source = replace(source, `turnUnitButton.textContent = commandTool.turnToolActive ? 'Укажите направление' : 'Повернуть';`, `turnUnitButton.textContent = commandTool.turnToolActive ? 'Куда?' : 'Повернуть';`, 'short turn label');
  return source;
});

await edit('src/ai-node-editor/NavigationProfileEditor.ts', (source) => {
  source = replace(source,
`import {
  NavigationProfileRegistry,`,
`import { renderAttentionProfiles } from './AttentionProfileEditorPanel';
import {
  NavigationProfileRegistry,`, 'editor attention panel import');
  source = replace(source,
`type EditorTab = 'graph' | 'blackboard' | 'profiles';`,
`type EditorTab = 'graph' | 'blackboard' | 'profiles' | 'attentionProfiles';`, 'editor tab type');
  source = replace(source,
`    <button type="button" data-navigation-tab="profiles">Профили движения</button>
    <button type="button" data-navigation-tab="blackboard">`,
`    <button type="button" data-navigation-tab="profiles">Профили движения</button>
    <button type="button" data-navigation-tab="attentionProfiles">Профили внимания</button>
    <button type="button" data-navigation-tab="blackboard">`, 'editor attention tab button');
  source = replace(source,
`  if (tab === 'profiles') renderProfiles();
  else if (tab === 'blackboard')`,
`  if (tab === 'profiles') renderProfiles();
  else if (tab === 'attentionProfiles') renderAttentionProfiles(panel);
  else if (tab === 'blackboard')`, 'editor attention tab render');
  return source;
});

await edit('src/tactical-workspace-compact-route.css', () => `:root {
  --workspace-bottom: 108px;
}

.simulation-unit-bar {
  box-sizing: border-box;
  min-height: 94px;
  max-height: 108px;
  grid-template-columns: minmax(130px, 0.55fr) minmax(390px, 1.7fr) minmax(360px, 1.35fr);
  grid-template-areas:
    "identity stats route"
    "posture controls speed";
  gap: 4px 8px;
  padding: 5px 7px;
  overflow: hidden;
}

.simulation-unit-bar > * { min-width: 0; max-width: 100%; box-sizing: border-box; }
.unit-bar-identity { align-self: stretch; align-content: center; min-width: 0; overflow: hidden; }
.unit-bar-identity strong, .unit-bar-identity span, .unit-bar-current span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.simulation-unit-bar .unit-bar-current { min-width: 0 !important; display: grid; gap: 1px; margin-top: 2px; color: var(--workspace-muted); font-size: 8px; line-height: 1.1; }
.unit-bar-stats { align-self: center; min-width: 0; }
.unit-bar-stat { min-width: 0; padding: 2px 4px; overflow: hidden; }
.unit-bar-stat span, .unit-bar-stat b { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

.unit-bar-route-controls {
  grid-area: route;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, .78fr);
  grid-template-areas:
    "routeprofile attentionprofile attentionmode"
    "turn cost details";
  gap: 2px 4px;
  align-items: end;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.unit-route-profile { grid-area: routeprofile; }
.unit-attention-profile { grid-area: attentionprofile; }
.unit-attention-mode { grid-area: attentionmode; }
.unit-route-profile, .unit-attention-profile, .unit-attention-mode { display: grid; gap: 1px; min-width: 0; color: var(--workspace-muted); font-size: 7px; overflow: hidden; }
.unit-route-profile span, .unit-attention-profile span, .unit-attention-mode span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.unit-route-profile select, .unit-attention-profile select, .unit-attention-mode select {
  box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; height: 21px; padding: 1px 4px;
  border: 1px solid rgba(255, 240, 161, 0.24); border-radius: 6px; color: var(--workspace-text);
  background: rgba(255, 242, 168, 0.06); font-size: 8px; font-weight: 700; overflow: hidden; text-overflow: ellipsis;
}
.unit-bar-route-controls [data-action="turn-unit"] { grid-area: turn; }
.unit-bar-route-controls [data-action="route-cost-quick-toggle"] { grid-area: cost; }
.unit-bar-route-controls [data-action="turn-unit"], .unit-bar-route-controls [data-action="route-cost-quick-toggle"] {
  box-sizing: border-box; min-width: 0; width: 100%; min-height: 21px; height: 21px; padding: 1px 4px;
  border-radius: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 8px; font-weight: 800;
}
.unit-bar-route-controls [data-action="turn-unit"].active, .unit-bar-route-controls [data-action="route-cost-quick-toggle"].active { color: #141910; border-color: var(--workspace-accent); background: var(--workspace-accent); }
.unit-route-details { grid-area: details; position: relative; min-width: 0; max-width: 100%; overflow: hidden; }
.unit-route-details > summary { box-sizing: border-box; min-height: 21px; height: 21px; display: block; padding: 3px 18px 3px 5px; border: 1px solid rgba(255,240,161,.16); border-radius: 6px; color: var(--workspace-text); background: rgba(255,242,168,.045); cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 8px; font-weight: 700; }
.unit-route-details-panel { position: fixed; z-index: 125; right: 18px; bottom: calc(var(--workspace-bottom) + 8px); width: min(520px, calc(100vw - 36px)); display: grid; gap: 4px; padding: 8px 9px; border: 1px solid rgba(255,240,161,.28); border-radius: 10px; color: var(--workspace-text); background: rgba(10,14,9,.98); box-shadow: 0 14px 32px rgba(0,0,0,.52); }
.unit-route-details:not([open]) .unit-route-details-panel { display: none; }
.unit-route-details-panel span { display: block; overflow-wrap: anywhere; color: var(--workspace-muted); font-size: 10px; line-height: 1.25; }

.unit-bar-command-group, .unit-bar-speed-group { min-width: 0; flex-wrap: nowrap; overflow: hidden; }
.simulation-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; }
.unit-bar-command-group button, .unit-bar-speed-group button, .compact { box-sizing: border-box; min-width: 0; min-height: 22px; height: 22px; padding: 2px 4px; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unit-bar-speed-group { justify-content: flex-end; }

@media (max-width: 1180px) {
  :root { --workspace-bottom: 150px; }
  .simulation-unit-bar {
    min-height: 136px; max-height: 150px;
    grid-template-columns: minmax(130px, .65fr) minmax(0, 1.7fr);
    grid-template-areas: "identity stats" "route route" "posture controls" "speed speed";
    overflow: hidden;
  }
  .unit-bar-route-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .unit-bar-speed-group { justify-content: flex-start; }
}

@media (max-width: 860px) {
  :root { --workspace-bottom: 184px; }
  .simulation-unit-bar { left: 6px; right: 6px; min-height: 170px; max-height: 184px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "identity" "stats" "route" "posture" "controls" "speed"; overflow: hidden; }
  .unit-bar-stats { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
`);

await edit('src/ai-node-editor/navigation-profile-editor.css', (source) => `${source}

.navigation-profile-mode-select { display: grid; grid-template-columns: minmax(160px, .45fr) minmax(180px, .55fr); gap: 12px; align-items: center; margin: 0 0 14px; padding: 12px; border: 1px solid var(--navigation-profile-line); border-radius: 12px; background: rgba(255,255,255,.025); }
.navigation-profile-mode-select span { color: var(--navigation-profile-muted); font-weight: 700; }
.navigation-profile-mode-select select { min-width: 0; }
.attention-profile-editor-layout .navigation-profile-field-control input[type="range"] { min-width: 0; }
`);

console.log('Attention profile, motion, threat stability, and compact layout implementation applied.');
