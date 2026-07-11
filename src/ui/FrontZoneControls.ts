import {
  getFrontZoneState,
  getTerritoryAtPosition,
  setFrontZoneBoundaries,
  toggleFrontZoneVisibility,
  type TerritoryKind,
} from '../core/front/FrontZoneState';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

interface CameraDiagnostics {
  x: number;
  y: number;
  zoom: number;
}

interface FrontZoneDiagnostics {
  visible: boolean;
  friendlyBoundaryX: number;
  enemyBoundaryX: number;
  selectedUnitTerritory: TerritoryKind | null;
  selectedUnitSafety: number | null;
}

type FrontZoneWindow = Window & {
  __realWargameCameraDebug?: CameraDiagnostics;
  __realWargameFrontZones?: FrontZoneDiagnostics;
};

type RuntimeWithAiMemory = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, unknown>;
};

const AI_SYNC_INTERVAL_MS = 100;

export function installFrontZoneControls(state: SimulationState, onChanged: () => void): () => void {
  const host = document.querySelector<HTMLElement>('#app');
  const displayMenu = document.querySelector<HTMLElement>('[data-role="display"]');
  const editorSceneSlot = document.querySelector<HTMLElement>('.editor-scene-tools-slot');

  if (!host || !displayMenu || !editorSceneSlot) {
    throw new Error('Front zone controls require the tactical map, display menu and scene editor slot.');
  }

  host.classList.add('front-zone-host');

  const overlay = createOverlay();
  host.appendChild(overlay.root);

  const visibilityButton = document.createElement('button');
  visibilityButton.type = 'button';
  visibilityButton.dataset.frontZoneVisibility = 'true';
  visibilityButton.addEventListener('click', () => {
    toggleFrontZoneVisibility(state);
    syncVisibilityButton();
    updateOverlay(true);
    onChanged();
  });
  displayMenu.appendChild(visibilityButton);

  let animationFrameId = 0;
  let lastGeometryKey = '';

  const updateOverlay = (force = false): void => {
    const front = getFrontZoneState(state);
    overlay.root.hidden = !front.visible;
    if (!front.visible) {
      publishDiagnostics(state);
      return;
    }

    // Camera diagnostics expose the inverse camera offset, while CSS needs the actual
    // world-container transform used by PixiJS. Negate x/y to keep boundaries on cell edges.
    const camera = (window as FrontZoneWindow).__realWargameCameraDebug ?? { x: -72, y: -72, zoom: 1 };
    const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
    const cellPixels = state.map.cellSize * zoom;
    const mapLeft = -camera.x;
    const mapTop = -camera.y;
    const mapHeight = state.map.height * cellPixels;
    const friendlyWidth = front.friendlyBoundaryX * cellPixels;
    const neutralWidth = (front.enemyBoundaryX - front.friendlyBoundaryX) * cellPixels;
    const enemyWidth = (state.map.width - front.enemyBoundaryX) * cellPixels;
    const neutralLeft = mapLeft + friendlyWidth;
    const enemyLeft = neutralLeft + neutralWidth;
    const geometryKey = [
      mapLeft.toFixed(2), mapTop.toFixed(2), zoom.toFixed(4),
      front.friendlyBoundaryX, front.enemyBoundaryX, state.map.width, state.map.height,
    ].join(':');

    if (force || geometryKey !== lastGeometryKey) {
      lastGeometryKey = geometryKey;
      positionRect(overlay.friendly, mapLeft, mapTop, friendlyWidth, mapHeight);
      positionRect(overlay.neutral, neutralLeft, mapTop, neutralWidth, mapHeight);
      positionRect(overlay.enemy, enemyLeft, mapTop, enemyWidth, mapHeight);
      positionLine(overlay.friendlyLine, neutralLeft, mapTop, mapHeight);
      positionLine(overlay.enemyLine, enemyLeft, mapTop, mapHeight);
    }

    publishDiagnostics(state);
  };

  const editorPanel = createEditorPanel(state, onChanged, () => updateOverlay(true));
  editorSceneSlot.appendChild(editorPanel.root);

  const animate = (): void => {
    updateOverlay(false);
    animationFrameId = window.requestAnimationFrame(animate);
  };

  const syncAiTimer = window.setInterval(() => {
    syncTerritoryToAiMemory(state);
    editorPanel.updateStatus();
    publishDiagnostics(state);
  }, AI_SYNC_INTERVAL_MS);

  syncVisibilityButton();
  editorPanel.syncInputs();
  syncTerritoryToAiMemory(state);
  updateOverlay(true);
  animationFrameId = window.requestAnimationFrame(animate);

  return () => {
    window.cancelAnimationFrame(animationFrameId);
    window.clearInterval(syncAiTimer);
    overlay.root.remove();
    visibilityButton.remove();
    editorPanel.root.remove();
    host.classList.remove('front-zone-host');
    delete (window as FrontZoneWindow).__realWargameFrontZones;
  };

  function syncVisibilityButton(): void {
    const visible = getFrontZoneState(state).visible;
    visibilityButton.textContent = `Линия фронта: ${visible ? 'вкл' : 'выкл'}`;
    visibilityButton.setAttribute('aria-pressed', String(visible));
    visibilityButton.classList.toggle('active', visible);
    visibilityButton.classList.toggle('hud-toggle-off', !visible);
  }
}

function createOverlay(): {
  root: HTMLDivElement;
  friendly: HTMLDivElement;
  neutral: HTMLDivElement;
  enemy: HTMLDivElement;
  friendlyLine: HTMLDivElement;
  enemyLine: HTMLDivElement;
} {
  const root = document.createElement('div');
  root.className = 'front-zone-overlay';
  root.dataset.frontZoneOverlay = 'true';
  root.setAttribute('aria-hidden', 'true');

  const friendly = createBand('friendly', 'Своя территория');
  const neutral = createBand('neutral', 'Серая зона');
  const enemy = createBand('enemy', 'Вражеская территория');
  const friendlyLine = createBoundaryLine('friendly');
  const enemyLine = createBoundaryLine('enemy');

  root.append(friendly, neutral, enemy, friendlyLine, enemyLine);
  return { root, friendly, neutral, enemy, friendlyLine, enemyLine };
}

function createBand(kind: TerritoryKind, label: string): HTMLDivElement {
  const band = document.createElement('div');
  band.className = `front-zone-band front-zone-band-${kind}`;
  band.dataset.frontZoneBand = kind;
  const caption = document.createElement('span');
  caption.textContent = label;
  band.appendChild(caption);
  return band;
}

function createBoundaryLine(kind: 'friendly' | 'enemy'): HTMLDivElement {
  const line = document.createElement('div');
  line.className = `front-zone-boundary front-zone-boundary-${kind}`;
  line.dataset.frontZoneLine = kind;
  return line;
}

function createEditorPanel(
  state: SimulationState,
  onChanged: () => void,
  onBoundaryChanged: () => void,
): {
  root: HTMLElement;
  syncInputs(): void;
  updateStatus(): void;
} {
  const root = document.createElement('section');
  root.className = 'front-zone-editor-panel';
  root.innerHTML = `
    <div class="front-zone-editor-heading">
      <strong>Линия фронта</strong>
      <span>Две вертикальные границы делят карту на свою территорию, серую зону и территорию врага.</span>
    </div>
  `;

  const friendly = createRangeControl('Граница своей территории', 'friendly', state.map.width);
  const enemy = createRangeControl('Граница территории врага', 'enemy', state.map.width);
  const status = document.createElement('div');
  status.className = 'front-zone-editor-status';
  status.dataset.frontZoneSelectedStatus = 'true';
  root.append(friendly.wrapper, enemy.wrapper, status);

  friendly.input.addEventListener('input', () => {
    const current = getFrontZoneState(state);
    setFrontZoneBoundaries(state, Number(friendly.input.value), current.enemyBoundaryX);
    syncInputs();
    syncTerritoryToAiMemory(state);
    updateStatus();
    onBoundaryChanged();
  });
  enemy.input.addEventListener('input', () => {
    const current = getFrontZoneState(state);
    setFrontZoneBoundaries(state, current.friendlyBoundaryX, Number(enemy.input.value));
    syncInputs();
    syncTerritoryToAiMemory(state);
    updateStatus();
    onBoundaryChanged();
  });
  friendly.input.addEventListener('change', onChanged);
  enemy.input.addEventListener('change', onChanged);

  function syncInputs(): void {
    const front = getFrontZoneState(state);
    friendly.input.value = String(front.friendlyBoundaryX);
    enemy.input.value = String(front.enemyBoundaryX);
    friendly.output.textContent = `${front.friendlyBoundaryX} клетка`;
    enemy.output.textContent = `${front.enemyBoundaryX} клетка`;
  }

  function updateStatus(): void {
    const unit = getSelectedUnit(state);
    if (!unit) {
      status.textContent = 'Боец не выбран. Территориальные параметры будут переданы ИИ после выбора или постановки бойца.';
      return;
    }
    const territory = getTerritoryAtPosition(state, unit.position);
    status.textContent = `${unit.labels.ru}: ${territory.labelRu} · базовая безопасность ${territory.safety}/100`;
  }

  syncInputs();
  updateStatus();
  return { root, syncInputs, updateStatus };
}

function createRangeControl(
  labelText: string,
  boundary: 'friendly' | 'enemy',
  mapWidth: number,
): { wrapper: HTMLLabelElement; input: HTMLInputElement; output: HTMLOutputElement } {
  const wrapper = document.createElement('label');
  wrapper.className = 'front-zone-range';
  const header = document.createElement('span');
  header.className = 'front-zone-range-label';
  header.textContent = labelText;
  const output = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1';
  input.max = String(Math.max(2, mapWidth - 1));
  input.step = '1';
  input.dataset.frontZoneBoundary = boundary;
  wrapper.append(header, output, input);
  return { wrapper, input, output };
}

function syncTerritoryToAiMemory(state: SimulationState): void {
  for (const unit of state.units) {
    const territory = getTerritoryAtPosition(state, unit.position);
    const runtime = unit.behaviorRuntime as RuntimeWithAiMemory;
    const memory = runtime.aiGraphMemory ?? (runtime.aiGraphMemory = {});
    memory.territorySafety = territory.safety;
    memory.territoryKind = territory.kind;
    memory.territoryFriendly = territory.kind === 'friendly';
    memory.territoryNeutral = territory.kind === 'neutral';
    memory.territoryEnemy = territory.kind === 'enemy';
  }
}

function publishDiagnostics(state: SimulationState): void {
  const front = getFrontZoneState(state);
  const unit = getSelectedUnit(state);
  const territory = unit ? getTerritoryAtPosition(state, unit.position) : null;
  (window as FrontZoneWindow).__realWargameFrontZones = {
    visible: front.visible,
    friendlyBoundaryX: front.friendlyBoundaryX,
    enemyBoundaryX: front.enemyBoundaryX,
    selectedUnitTerritory: territory?.kind ?? null,
    selectedUnitSafety: territory?.safety ?? null,
  };
}

function positionRect(
  element: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  element.style.width = `${Math.max(0, width)}px`;
  element.style.height = `${Math.max(0, height)}px`;
}

function positionLine(element: HTMLElement, left: number, top: number, height: number): void {
  element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  element.style.height = `${Math.max(0, height)}px`;
}
