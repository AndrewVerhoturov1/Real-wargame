import type { Container } from 'pixi.js';
import type { WorldPosition } from '../core/geometry';

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.8;
const ZOOM_STEP = 1.08;
const ZOOM_SMOOTHING = 0.28;
const ZOOM_EPSILON = 0.001;

export class CameraController {
  private isPanning = false;
  private isSpaceHeld = false;
  private lastPointerPosition: WorldPosition | null = null;
  private targetScale = 1;
  private targetPosition: WorldPosition = { x: 0, y: 0 };
  private zoomAnimationFrame: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldContainer: Container,
  ) {}

  attach(): void {
    this.targetScale = this.worldContainer.scale.x;
    this.targetPosition = {
      x: Math.round(this.worldContainer.x),
      y: Math.round(this.worldContainer.y),
    };
    this.worldContainer.position.set(this.targetPosition.x, this.targetPosition.y);
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

    if (this.zoomAnimationFrame !== null) {
      window.cancelAnimationFrame(this.zoomAnimationFrame);
      this.zoomAnimationFrame = null;
    }
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
      this.targetScale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      MIN_SCALE,
      MAX_SCALE,
    );
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    this.targetScale = nextScale;
    this.targetPosition = {
      x: Math.round(screenX - beforeZoomWorldPosition.x * nextScale),
      y: Math.round(screenY - beforeZoomWorldPosition.y * nextScale),
    };
    this.startSmoothZoom();
  };

  private startSmoothZoom(): void {
    if (this.zoomAnimationFrame !== null) {
      return;
    }

    this.zoomAnimationFrame = window.requestAnimationFrame(this.animateZoom);
  }

  private readonly animateZoom = (): void => {
    const currentScale = this.worldContainer.scale.x;
    const nextScale = lerp(currentScale, this.targetScale, ZOOM_SMOOTHING);
    const nextX = lerp(this.worldContainer.x, this.targetPosition.x, ZOOM_SMOOTHING);
    const nextY = lerp(this.worldContainer.y, this.targetPosition.y, ZOOM_SMOOTHING);
    const scaleDone = Math.abs(nextScale - this.targetScale) < ZOOM_EPSILON;
    const xDone = Math.abs(nextX - this.targetPosition.x) < ZOOM_EPSILON;
    const yDone = Math.abs(nextY - this.targetPosition.y) < ZOOM_EPSILON;

    this.worldContainer.scale.set(scaleDone ? this.targetScale : nextScale);
    this.worldContainer.position.set(
      xDone ? this.targetPosition.x : Math.round(nextX),
      yDone ? this.targetPosition.y : Math.round(nextY),
    );

    if (scaleDone && xDone && yDone) {
      this.zoomAnimationFrame = null;
      return;
    }

    this.zoomAnimationFrame = window.requestAnimationFrame(this.animateZoom);
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
    const nextX = Math.round(this.worldContainer.x + dx);
    const nextY = Math.round(this.worldContainer.y + dy);

    this.worldContainer.position.set(nextX, nextY);
    this.targetPosition = { x: nextX, y: nextY };

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

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
