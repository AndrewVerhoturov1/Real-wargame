import type { Container } from 'pixi.js';
import type { WorldPosition } from '../core/geometry';

const MIN_SCALE = 0.55;
const MAX_SCALE = 2.8;
const ZOOM_STEP = 1.12;

export class CameraController {
  private isPanning = false;
  private isSpaceHeld = false;
  private lastPointerPosition: WorldPosition | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldContainer: Container,
  ) {}

  attach(): void {
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  destroy(): void {
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  screenToWorld(event: MouseEvent | PointerEvent): WorldPosition {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    return {
      x: (screenX - this.worldContainer.x) / this.worldContainer.scale.x,
      y: (screenY - this.worldContainer.y) / this.worldContainer.scale.y,
    };
  }

  isPanGesture(event: PointerEvent): boolean {
    return event.button === 1 || (event.button === 0 && this.isSpaceHeld);
  }

  get zoom(): number {
    return this.worldContainer.scale.x;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const beforeZoomWorldPosition = this.screenToWorld(event);
    const nextScale = clamp(
      this.worldContainer.scale.x * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      MIN_SCALE,
      MAX_SCALE,
    );

    this.worldContainer.scale.set(nextScale);

    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    this.worldContainer.position.set(
      screenX - beforeZoomWorldPosition.x * nextScale,
      screenY - beforeZoomWorldPosition.y * nextScale,
    );
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isPanGesture(event)) {
      return;
    }

    event.preventDefault();
    this.isPanning = true;
    this.lastPointerPosition = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isPanning || !this.lastPointerPosition) {
      return;
    }

    const dx = event.clientX - this.lastPointerPosition.x;
    const dy = event.clientY - this.lastPointerPosition.y;

    this.worldContainer.position.set(
      this.worldContainer.x + dx,
      this.worldContainer.y + dy,
    );

    this.lastPointerPosition = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly handlePointerUp = (): void => {
    this.isPanning = false;
    this.lastPointerPosition = null;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.isSpaceHeld = true;
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.isSpaceHeld = false;
      event.preventDefault();
    }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
