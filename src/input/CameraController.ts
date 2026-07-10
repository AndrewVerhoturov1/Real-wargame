import type { Container } from 'pixi.js';
import type { WorldPosition } from '../core/geometry';

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.8;
const ZOOM_SENSITIVITY = 0.00042;
const MAX_WHEEL_DELTA_PER_FRAME = 360;
const WHEEL_LINE_PIXELS = 16;
const KEYBOARD_PAN_SPEED_PX_PER_SECOND = 720;
const MAX_UPDATE_SECONDS = 0.05;

interface ClientPosition {
  clientX: number;
  clientY: number;
}

interface CameraDiagnostics {
  x: number;
  y: number;
  zoom: number;
  wheelEventCount: number;
  wheelApplyCount: number;
  keyboardPanFrameCount: number;
}

type CameraDebugWindow = Window & {
  __realWargameCameraDebug?: CameraDiagnostics;
};

export class CameraController {
  private isPanning = false;
  private isSpaceHeld = false;
  private lastPointerPosition: WorldPosition | null = null;
  private pendingPointerPosition: WorldPosition | null = null;
  private pointerPanFrameId: number | null = null;
  private pendingWheelDelta = 0;
  private pendingWheelAnchor: ClientPosition | null = null;
  private wheelFrameId: number | null = null;
  private readonly pressedPanKeys = new Set<string>();
  private readonly diagnostics: CameraDiagnostics = {
    x: 0,
    y: 0,
    zoom: 1,
    wheelEventCount: 0,
    wheelApplyCount: 0,
    keyboardPanFrameCount: 0,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldContainer: Container,
  ) {}

  attach(): void {
    this.worldContainer.position.set(
      Math.round(this.worldContainer.x),
      Math.round(this.worldContainer.y),
    );
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.publishDiagnostics();
  }

  destroy(): void {
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.cancelScheduledInput();
    delete (window as CameraDebugWindow).__realWargameCameraDebug;
  }

  update(deltaSeconds: number): boolean {
    const horizontal = directionForKeys(this.pressedPanKeys, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']);
    const vertical = directionForKeys(this.pressedPanKeys, ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']);

    if (horizontal === 0 && vertical === 0) {
      return false;
    }

    const length = Math.hypot(horizontal, vertical) || 1;
    const distance = KEYBOARD_PAN_SPEED_PX_PER_SECOND * Math.min(Math.max(deltaSeconds, 0), MAX_UPDATE_SECONDS);

    // Camera movement is inverse to the world transform: moving the camera right shifts the world left.
    this.panWorldBy(-horizontal / length * distance, -vertical / length * distance);
    this.diagnostics.keyboardPanFrameCount += 1;
    this.publishDiagnostics();
    return true;
  }

  screenToWorld(event: ClientPosition): WorldPosition {
    const rect = this.canvas.getBoundingClientRect();
    return this.screenPointToWorld(event.clientX, event.clientY, rect);
  }

  isPanGesture(event: PointerEvent): boolean {
    return event.button === 1 || (event.button === 0 && this.isSpaceHeld);
  }

  get zoom(): number {
    return this.worldContainer.scale.x;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.diagnostics.wheelEventCount += 1;
    this.pendingWheelDelta += normalizeWheelDelta(event, this.canvas.clientHeight);
    this.pendingWheelAnchor = { clientX: event.clientX, clientY: event.clientY };

    if (this.wheelFrameId === null) {
      this.wheelFrameId = window.requestAnimationFrame(this.flushWheel);
    }

    this.publishDiagnostics();
  };

  private readonly flushWheel = (): void => {
    this.wheelFrameId = null;
    const anchor = this.pendingWheelAnchor;
    const accumulatedDelta = clamp(
      this.pendingWheelDelta,
      -MAX_WHEEL_DELTA_PER_FRAME,
      MAX_WHEEL_DELTA_PER_FRAME,
    );
    this.pendingWheelDelta = 0;
    this.pendingWheelAnchor = null;

    if (!anchor || accumulatedDelta === 0) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const beforeZoomWorldPosition = this.screenPointToWorld(anchor.clientX, anchor.clientY, rect);
    const currentScale = this.worldContainer.scale.x;
    const zoomFactor = Math.exp(-accumulatedDelta * ZOOM_SENSITIVITY);
    const nextScale = clamp(currentScale * zoomFactor, MIN_SCALE, MAX_SCALE);
    const screenX = anchor.clientX - rect.left;
    const screenY = anchor.clientY - rect.top;
    const nextX = Math.round(screenX - beforeZoomWorldPosition.x * nextScale);
    const nextY = Math.round(screenY - beforeZoomWorldPosition.y * nextScale);

    this.worldContainer.scale.set(nextScale);
    this.worldContainer.position.set(nextX, nextY);
    this.diagnostics.wheelApplyCount += 1;
    this.publishDiagnostics();
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
    this.pendingPointerPosition = null;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isPanning || !this.lastPointerPosition) {
      return;
    }

    this.pendingPointerPosition = {
      x: event.clientX,
      y: event.clientY,
    };

    if (this.pointerPanFrameId === null) {
      this.pointerPanFrameId = window.requestAnimationFrame(this.flushPointerPan);
    }
  };

  private readonly flushPointerPan = (): void => {
    this.pointerPanFrameId = null;
    if (!this.isPanning || !this.lastPointerPosition || !this.pendingPointerPosition) {
      return;
    }

    const nextPointer = this.pendingPointerPosition;
    const dx = nextPointer.x - this.lastPointerPosition.x;
    const dy = nextPointer.y - this.lastPointerPosition.y;
    this.pendingPointerPosition = null;
    this.lastPointerPosition = nextPointer;
    this.panWorldBy(dx, dy);
    this.publishDiagnostics();
  };

  private readonly handlePointerUp = (): void => {
    this.flushPendingPointerPanImmediately();
    this.isPanning = false;
    this.lastPointerPosition = null;
    this.pendingPointerPosition = null;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      if (!isTextInput(event.target)) {
        this.isSpaceHeld = true;
        event.preventDefault();
      }
      return;
    }

    if (!isCameraPanCode(event.code) || isTextInput(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    this.pressedPanKeys.add(event.code);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.isSpaceHeld = false;
      if (!isTextInput(event.target)) event.preventDefault();
      return;
    }

    if (!isCameraPanCode(event.code)) {
      return;
    }

    this.pressedPanKeys.delete(event.code);
    if (!isTextInput(event.target)) event.preventDefault();
  };

  private readonly handleWindowBlur = (): void => {
    this.isSpaceHeld = false;
    this.pressedPanKeys.clear();
    this.isPanning = false;
    this.lastPointerPosition = null;
    this.pendingPointerPosition = null;
  };

  private screenPointToWorld(clientX: number, clientY: number, rect: DOMRect): WorldPosition {
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - this.worldContainer.x) / this.worldContainer.scale.x,
      y: (screenY - this.worldContainer.y) / this.worldContainer.scale.y,
    };
  }

  private panWorldBy(dx: number, dy: number): void {
    this.worldContainer.position.set(
      Math.round(this.worldContainer.x + dx),
      Math.round(this.worldContainer.y + dy),
    );
  }

  private flushPendingPointerPanImmediately(): void {
    if (this.pointerPanFrameId !== null) {
      window.cancelAnimationFrame(this.pointerPanFrameId);
      this.pointerPanFrameId = null;
    }
    this.flushPointerPan();
  }

  private cancelScheduledInput(): void {
    if (this.pointerPanFrameId !== null) {
      window.cancelAnimationFrame(this.pointerPanFrameId);
      this.pointerPanFrameId = null;
    }
    if (this.wheelFrameId !== null) {
      window.cancelAnimationFrame(this.wheelFrameId);
      this.wheelFrameId = null;
    }
  }

  private publishDiagnostics(): void {
    this.diagnostics.x = -this.worldContainer.x;
    this.diagnostics.y = -this.worldContainer.y;
    this.diagnostics.zoom = this.worldContainer.scale.x;
    (window as CameraDebugWindow).__realWargameCameraDebug = { ...this.diagnostics };
  }
}

function directionForKeys(
  pressed: ReadonlySet<string>,
  negativeCodes: readonly string[],
  positiveCodes: readonly string[],
): number {
  const negative = negativeCodes.some((code) => pressed.has(code)) ? -1 : 0;
  const positive = positiveCodes.some((code) => pressed.has(code)) ? 1 : 0;
  return negative + positive;
}

function isCameraPanCode(code: string): boolean {
  return code === 'ArrowLeft'
    || code === 'ArrowRight'
    || code === 'ArrowUp'
    || code === 'ArrowDown'
    || code === 'KeyW'
    || code === 'KeyA'
    || code === 'KeyS'
    || code === 'KeyD';
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function normalizeWheelDelta(event: WheelEvent, pageHeight: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_PIXELS;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * Math.max(pageHeight, 1);
  }
  return event.deltaY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
