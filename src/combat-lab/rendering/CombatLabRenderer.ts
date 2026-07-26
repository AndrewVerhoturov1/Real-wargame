import type { Ticker } from 'pixi.js';
import { getMovementProfileRegistry } from '../../ai-node-editor/MovementProfileBrowserStorage';
import { installEnvironmentMovementMaterialProvider } from '../../core/movement/MovementMaterialAdapter';
import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  clearTacticalPositionSearchService,
  installTacticalPositionSearchService,
  TacticalPositionSearchService,
} from '../../core/tactical/TacticalPositionSearchService';
import { initializeAiTestLabRuntime } from '../../core/testing/AiTestLabRuntime';
import type { CombatLabDiagnosticLayerId } from '../../core/testing/combat-lab';
import { installAdaptiveGridLod } from '../../rendering/AdaptiveGridLodInstaller';
import { installAttentionOverlayRenderer } from '../../rendering/AttentionOverlayInstaller';
import { installCombatEffectsRenderer } from '../../rendering/CombatEffectsInstaller';
import { PixiTacticalBoardApp } from '../../rendering/PixiApp';
import { createPixiTacticalBoardAdapter, type PixiTacticalBoardAdapter } from '../../rendering/PixiTacticalBoardAdapter';
import { AwarenessWorldRuntime } from '../../runtime/AwarenessWorldRuntime';
import { installAwarenessLayerFieldController } from '../../runtime/AwarenessLayerFieldController';
import { getEnvironmentProfileRegistry } from '../../ui/EnvironmentProfileStorage';
import { CombatLabDiagnosticOverlayRenderer } from './CombatLabDiagnosticOverlayRenderer';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

interface PausableSimulationState extends SimulationState {
  paused?: boolean;
}

type EditorLayerKey = keyof SimulationState['editor']['layers'];

const EDITOR_LAYER_LABELS: Partial<Record<EditorLayerKey, string>> = {
  units: 'Бойцы',
  objects: 'Объекты карты',
  pressureZones: 'Зоны давления',
};

export class CombatLabRenderer {
  private readonly board: PixiTacticalBoardApp;
  private readonly adapter: PixiTacticalBoardAdapter;
  private readonly overlay: CombatLabDiagnosticOverlayRenderer;
  private readonly boardRoot: HTMLElement;
  private readonly layerControls: HTMLElement;
  private readonly gridToggle: HTMLButtonElement;
  private readonly visionToggle: HTMLButtonElement;
  private readonly heightToggle: HTMLButtonElement;
  private readonly removeLabTicker: () => void;
  private destroyCombatEffects: (() => void) | null = null;
  private destroyAttentionOverlay: (() => void) | null = null;
  private destroyAdaptiveGrid: (() => void) | null = null;
  private destroyAwarenessField: (() => void) | null = null;
  private tacticalPositionSearchService: TacticalPositionSearchService | null = null;
  private awarenessWorldRuntime: AwarenessWorldRuntime | null = null;
  private boundState: SimulationState;
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly session: CombatLabVisualSession,
    private readonly onFrame: () => void,
    board: PixiTacticalBoardApp,
    adapter: PixiTacticalBoardAdapter,
    overlay: CombatLabDiagnosticOverlayRenderer,
    boardRoot: HTMLElement,
    layerControls: HTMLElement,
    gridToggle: HTMLButtonElement,
    visionToggle: HTMLButtonElement,
    heightToggle: HTMLButtonElement,
  ) {
    this.board = board;
    this.adapter = adapter;
    this.overlay = overlay;
    this.boardRoot = boardRoot;
    this.layerControls = layerControls;
    this.gridToggle = gridToggle;
    this.visionToggle = visionToggle;
    this.heightToggle = heightToggle;
    this.boundState = session.state;
    this.prepareState(this.boundState);
    this.removeLabTicker = this.adapter.addTickerListener(this.tick);
    this.installStateBoundServices();
    this.rebuildLayerControls();
  }

  static async create(
    root: HTMLElement,
    session: CombatLabVisualSession,
    onFrame: () => void,
  ): Promise<CombatLabRenderer> {
    root.replaceChildren();
    const boardRoot = element('div', 'combat-lab-game-board');
    const toolbar = element('div', 'combat-lab-game-toolbar');
    const languageToggle = button('Русский');
    const gridToggle = button('Сетка: выкл');
    const visionToggle = button('Обзор: выкл');
    const heightToggle = button('Цифры высоты: выкл');
    const layerControls = element('div', 'combat-lab-standard-layer-controls');
    const debugPanel = element('pre', 'combat-lab-game-debug');
    debugPanel.hidden = true;
    toolbar.append(
      element('strong', '', 'Игровые слои'),
      gridToggle,
      visionToggle,
      heightToggle,
      layerControls,
    );
    root.append(boardRoot, toolbar, debugPanel);

    const state = session.state as PausableSimulationState;
    state.paused = true;
    state.movementProfiles = getMovementProfileRegistry();
    state.map.environmentProfileId = getEnvironmentProfileRegistry().activeProfileId;
    installEnvironmentMovementMaterialProvider(state);
    initializeAiTestLabRuntime(state);

    const board = await PixiTacticalBoardApp.create(
      boardRoot,
      debugPanel,
      languageToggle,
      gridToggle,
      visionToggle,
      heightToggle,
      state,
    );
    const adapter = createPixiTacticalBoardAdapter(board);
    const overlay = new CombatLabDiagnosticOverlayRenderer(adapter.getWorldContainer(), session);
    const renderer = new CombatLabRenderer(
      root,
      session,
      onFrame,
      board,
      adapter,
      overlay,
      boardRoot,
      layerControls,
      gridToggle,
      visionToggle,
      heightToggle,
    );
    board.start();
    languageToggle.click();
    board.forceRender();
    return renderer;
  }

  setLayerEnabled(layerId: CombatLabDiagnosticLayerId, enabled: boolean): void {
    this.ensureStateBound();
    this.overlay.setLayerEnabled(layerId, enabled);
  }

  isLayerEnabled(layerId: CombatLabDiagnosticLayerId): boolean {
    return this.overlay.isLayerEnabled(layerId);
  }

  clearHistory(): void {
    this.overlay.clearHistory();
  }

  forceRender(): void {
    if (this.destroyed) return;
    this.ensureStateBound();
    this.overlay.forceRender();
    this.board.forceRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeLabTicker();
    this.destroyStateBoundServices();
    this.overlay.destroy();
    this.board.destroy();
    this.root.replaceChildren();
  }

  private readonly tick = (ticker: Ticker): void => {
    if (this.destroyed) return;
    this.ensureStateBound();
    const changed = this.session.advance(ticker.elapsedMS / 1000);
    if (changed) this.overlay.captureFrame();
    this.overlay.forceRender();
    this.onFrame();
  };

  private ensureStateBound(): void {
    if (this.boundState === this.session.state) return;
    this.destroyStateBoundServices();
    this.boundState = this.session.state;
    this.prepareState(this.boundState);
    this.adapter.bindSimulationState(this.session.state);
    this.overlay.bindSession(this.session);
    this.installStateBoundServices();
    this.rebuildLayerControls();
  }

  private prepareState(state: SimulationState): void {
    const pausable = state as PausableSimulationState;
    pausable.paused = true;
    state.movementProfiles = getMovementProfileRegistry();
    state.map.environmentProfileId = getEnvironmentProfileRegistry().activeProfileId;
    installEnvironmentMovementMaterialProvider(state);
    initializeAiTestLabRuntime(state);
  }

  private installStateBoundServices(): void {
    const state = this.boundState;
    const awarenessWorldRuntime = new AwarenessWorldRuntime();
    this.awarenessWorldRuntime = awarenessWorldRuntime;
    this.tacticalPositionSearchService = new TacticalPositionSearchService(state, awarenessWorldRuntime);
    installTacticalPositionSearchService(state, this.tacticalPositionSearchService);
    this.destroyAwarenessField = installAwarenessLayerFieldController(state, {
      requestWorldField: (unit) => awarenessWorldRuntime.requestWorldField(state, unit),
    });
    this.destroyCombatEffects = installCombatEffectsRenderer(this.board, state);
    this.destroyAttentionOverlay = installAttentionOverlayRenderer(this.board, state);
    this.destroyAdaptiveGrid = installAdaptiveGridLod(this.board, state, this.gridToggle);
  }

  private destroyStateBoundServices(): void {
    this.destroyAdaptiveGrid?.();
    this.destroyAdaptiveGrid = null;
    this.destroyCombatEffects?.();
    this.destroyCombatEffects = null;
    this.destroyAttentionOverlay?.();
    this.destroyAttentionOverlay = null;
    this.destroyAwarenessField?.();
    this.destroyAwarenessField = null;
    clearTacticalPositionSearchService(this.boundState);
    this.tacticalPositionSearchService?.destroy();
    this.tacticalPositionSearchService = null;
    this.awarenessWorldRuntime?.destroy();
    this.awarenessWorldRuntime = null;
  }

  private rebuildLayerControls(): void {
    this.layerControls.replaceChildren();
    const state = this.session.state;
    for (const key of Object.keys(state.editor.layers) as EditorLayerKey[]) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(state.editor.layers[key]);
      input.addEventListener('change', () => {
        this.session.state.editor.layers[key] = input.checked;
        this.board.forceRender();
      });
      const label = element('label', 'combat-lab-standard-layer');
      label.append(input, document.createTextNode(EDITOR_LAYER_LABELS[key] ?? String(key)));
      this.layerControls.append(label);
    }
    this.visionToggle.title = 'Производственные конусы обзора выбранных бойцов.';
    this.heightToggle.title = 'Высоты и подписи из игрового HTML-overlay.';
    this.boardRoot.dataset.renderer = 'production-tactical-board';
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  return node;
}
