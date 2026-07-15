import { Container, Graphics } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import { resolveMapGridLod, type MapGridLodState } from './MapGridLod';

interface BoardInternals {
  worldContainer: Container;
  mapRenderer: {
    container: Container;
    staticContainer: Container;
  };
  camera: {
    zoom: number;
  };
}

export interface MapGridLodDiagnostics extends MapGridLodState {
  sourceGridVisible: boolean;
  majorOverlayVisible: boolean;
}

type GridDebugWindow = Window & {
  __realWargameGridDebug?: MapGridLodDiagnostics;
};

export function installAdaptiveGridLod(
  board: object,
  state: SimulationState,
  gridToggle: HTMLButtonElement,
): () => void {
  const internals = board as BoardInternals;
  const majorGrid = new Graphics();
  majorGrid.eventMode = 'none';
  internals.mapRenderer.container.addChildAt(majorGrid, Math.min(1, internals.mapRenderer.container.children.length));

  let animationFrameId = 0;
  let lastMapKey = '';
  let lastLodKey = '';

  const update = (): void => {
    const mapKey = [
      state.map.width,
      state.map.height,
      state.map.cellSize,
      state.map.metersPerCell,
    ].join(':');
    if (mapKey !== lastMapKey) {
      lastMapKey = mapKey;
      drawMajorGrid(majorGrid, state);
    }

    const showGrid = gridToggle.getAttribute('aria-pressed') !== 'false';
    const lod = resolveMapGridLod({
      showGrid,
      metersPerCell: state.map.metersPerCell,
      cellSize: state.map.cellSize,
      zoom: internals.camera.zoom,
      editorEnabled: state.editor.enabled,
    });
    const sourceGrid = findSourceGrid(internals.mapRenderer.staticContainer, showGrid);
    const lodKey = [
      lod.majorVisible ? '1' : '0',
      lod.minorVisible ? '1' : '0',
      lod.minorAlpha.toFixed(3),
      lod.majorSpacingCells,
      sourceGrid ? 'source' : 'none',
    ].join(':');

    if (lodKey !== lastLodKey) {
      lastLodKey = lodKey;
      const useSourceGrid = lod.majorSpacingCells === 1 || lod.minorVisible;
      if (sourceGrid) {
        sourceGrid.visible = showGrid && useSourceGrid;
        sourceGrid.alpha = lod.majorSpacingCells === 1 ? 1 : lod.minorAlpha;
      }
      // Keep the strong 10 m grid while the 2 m grid fades in. Once fine cells are fully
      // readable, the original source grid already contains its own stronger 10 m lines.
      majorGrid.visible = lod.majorVisible
        && lod.majorSpacingCells > 1
        && lod.minorAlpha < 0.95;
    }

    (window as GridDebugWindow).__realWargameGridDebug = {
      ...lod,
      sourceGridVisible: sourceGrid?.visible ?? false,
      majorOverlayVisible: majorGrid.visible,
    };
    animationFrameId = window.requestAnimationFrame(update);
  };

  update();

  return () => {
    window.cancelAnimationFrame(animationFrameId);
    majorGrid.destroy();
    delete (window as GridDebugWindow).__realWargameGridDebug;
  };
}

function drawMajorGrid(graphics: Graphics, state: SimulationState): void {
  graphics.clear();
  const { map } = state;
  const spacingCells = Math.max(1, Math.round(10 / Math.max(0.001, map.metersPerCell)));
  const mapWidth = map.width * map.cellSize;
  const mapHeight = map.height * map.cellSize;

  for (let x = 0; x <= map.width; x += spacingCells) {
    const px = x * map.cellSize;
    graphics.moveTo(px, 0).lineTo(px, mapHeight).stroke({ width: 2, color: 0xf6edcf, alpha: 0.22 });
  }
  for (let y = 0; y <= map.height; y += spacingCells) {
    const py = y * map.cellSize;
    graphics.moveTo(0, py).lineTo(mapWidth, py).stroke({ width: 2, color: 0xf6edcf, alpha: 0.22 });
  }
}

function findSourceGrid(staticContainer: Container, showGrid: boolean): Graphics | null {
  if (!showGrid || staticContainer.children.length < 2) return null;
  const candidate = staticContainer.children[staticContainer.children.length - 2];
  return candidate instanceof Graphics ? candidate : null;
}
