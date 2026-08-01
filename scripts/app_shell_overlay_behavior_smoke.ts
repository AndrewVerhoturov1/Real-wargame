import assert from 'node:assert/strict';
import { createAppModalLayer } from '../src/shared/app-overlay/AppModalLayer';
import { getAppOverlayCoordinator } from '../src/shared/app-overlay/AppOverlayCoordinator';

type Listener = (event: FakeEvent) => void;

class FakeEvent {
  defaultPrevented = false;
  immediatePropagationStopped = false;
  propagationStopped = false;
  target: unknown = null;
  constructor(
    readonly key = '',
    readonly shiftKey = false,
    readonly repeat = false,
    readonly isComposing = false,
  ) {}
  preventDefault(): void { this.defaultPrevented = true; }
  stopImmediatePropagation(): void { this.immediatePropagationStopped = true; }
  stopPropagation(): void { this.propagationStopped = true; }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = typeof listener === 'function'
      ? listener as unknown as Listener
      : listener.handleEvent.bind(listener) as unknown as Listener;
    let bucket = this.listeners.get(type);
    if (!bucket) this.listeners.set(type, bucket = new Set());
    bucket.add(callback);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    if (typeof listener === 'function') bucket.delete(listener as unknown as Listener);
    else {
      for (const callback of bucket) {
        if (callback === listener.handleEvent) bucket.delete(callback);
      }
    }
  }
  dispatch(type: string, event: FakeEvent): void {
    event.target ??= this;
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
  }
  listenerCount(type: string): number { return this.listeners.get(type)?.size ?? 0; }
}

class FakeNode extends FakeEventTarget {
  parentNode: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  constructor(readonly ownerDocument: FakeDocument) { super(); }
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this as unknown as FakeElement;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of [...this.children]) child.remove();
    this.append(...nodes);
  }
  remove(): void {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.children.indexOf(this as unknown as FakeElement);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentNode = null;
  }
  contains(node: FakeNode): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  get isConnected(): boolean {
    let current: FakeNode | null = this;
    while (current?.parentNode) current = current.parentNode;
    return current === this.ownerDocument.body;
  }
}

class FakeElement extends FakeNode {
  className = '';
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  hidden = false;
  inert = false;
  disabled = false;
  tabIndex = -1;
  innerHTML = '';
  constructor(ownerDocument: FakeDocument, readonly tagName: string) {
    super(ownerDocument);
    if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) this.tabIndex = 0;
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  focus(): void { this.ownerDocument.activeElement = this; }
  querySelectorAll<T extends Element>(_selector: string): T[] {
    const found: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      for (const child of node.children) {
        if (isFocusable(child)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found as unknown as T[];
  }
}

class FakeDocument extends FakeEventTarget {
  readonly body: FakeElement;
  activeElement: FakeElement | null = null;
  constructor() {
    super();
    this.body = new FakeElement(this, 'BODY');
  }
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName.toUpperCase());
  }
}

function isFocusable(element: FakeElement): boolean {
  if (element.hidden || element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
  return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
    || element.tabIndex !== -1;
}

(globalThis as unknown as { Node: typeof Node }).Node = FakeNode as unknown as typeof Node;
(globalThis as unknown as { Element: typeof Element }).Element = FakeElement as unknown as typeof Element;
(globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement = FakeElement as unknown as typeof HTMLElement;

const coordinatorDocument = new FakeDocument();
const coordinator = getAppOverlayCoordinator(coordinatorDocument as unknown as Document);
assert.equal(getAppOverlayCoordinator(coordinatorDocument as unknown as Document), coordinator, 'one document must reuse one coordinator');
assert.equal(coordinatorDocument.listenerCount('keydown'), 1, 'coordinator must install exactly one document keydown listener');

let fallbackCount = 0;
let lowOpen = true;
let highOpen = true;
let lowCloseCount = 0;
let highCloseCount = 0;
coordinator.setEscapeFallback(() => { fallbackCount += 1; });
coordinator.registerDismissLayer({
  priority: 10,
  isOpen: () => lowOpen,
  requestClose: () => { lowCloseCount += 1; lowOpen = false; return true; },
});
coordinator.registerDismissLayer({
  priority: 20,
  isOpen: () => highOpen,
  requestClose: async () => { highCloseCount += 1; highOpen = false; return true; },
});

const firstEscape = new FakeEvent('Escape');
coordinatorDocument.dispatch('keydown', firstEscape);
await Promise.resolve();
assert.equal(highCloseCount, 1, 'first Escape must close the highest-priority layer');
assert.equal(lowCloseCount, 0);
assert.equal(fallbackCount, 0, 'closing a layer must not open the menu in the same event');
assert.equal(firstEscape.defaultPrevented, true);

coordinatorDocument.dispatch('keydown', new FakeEvent('Escape'));
await Promise.resolve();
assert.equal(lowCloseCount, 1, 'second Escape must close the next layer');
assert.equal(fallbackCount, 0);

coordinatorDocument.dispatch('keydown', new FakeEvent('Escape'));
assert.equal(fallbackCount, 1, 'Escape with no open layers must invoke the menu fallback');

const preHandledEscape = new FakeEvent('Escape');
preHandledEscape.preventDefault();
coordinatorDocument.dispatch('keydown', preHandledEscape);
assert.equal(fallbackCount, 1, 'already handled Escape must remain untouched');

coordinator.destroy();
coordinator.destroy();
assert.equal(coordinatorDocument.listenerCount('keydown'), 0, 'destroy must remove the document listener');
coordinatorDocument.dispatch('keydown', new FakeEvent('Escape'));
assert.equal(fallbackCount, 1);

const modalDocument = new FakeDocument();
const background = modalDocument.createElement('main');
const trigger = modalDocument.createElement('button');
background.append(trigger);
modalDocument.body.append(background);
trigger.focus();

let allowClose = false;
let closeNotifications = 0;
let firstButton: FakeElement | null = null;
let lastButton: FakeElement | null = null;
const modal = createAppModalLayer(modalDocument as unknown as Document, {
  ariaLabel: 'Проверка общего модального слоя',
  priority: 50,
  trigger: trigger as unknown as HTMLElement,
  beforeClose: () => allowClose,
  onClosed: () => { closeNotifications += 1; },
  render: (host) => {
    firstButton = modalDocument.createElement('button');
    lastButton = modalDocument.createElement('button');
    (host as unknown as FakeElement).append(firstButton, lastButton);
  },
});
await Promise.resolve();

assert.equal(background.inert, true, 'opening a modal must make background inert');
assert.equal(modalDocument.activeElement, firstButton, 'opening a modal must move focus inside');
const modalRoot = modalDocument.body.children.at(-1)!;
const dialog = modalRoot.children[0];
assert.equal(dialog.getAttribute('role'), 'dialog');
assert.equal(dialog.getAttribute('aria-modal'), 'true');

lastButton!.focus();
const tabForward = new FakeEvent('Tab');
modalRoot.dispatch('keydown', tabForward);
assert.equal(tabForward.defaultPrevented, true);
assert.equal(modalDocument.activeElement, firstButton, 'Tab from the last control must wrap to the first');

firstButton!.focus();
const tabBackward = new FakeEvent('Tab', true);
modalRoot.dispatch('keydown', tabBackward);
assert.equal(tabBackward.defaultPrevented, true);
assert.equal(modalDocument.activeElement, lastButton, 'Shift+Tab from the first control must wrap to the last');

assert.equal(await modal.requestClose(), false, 'beforeClose=false must keep the modal open');
assert.equal(background.inert, true);
assert.equal(closeNotifications, 0);

allowClose = true;
assert.equal(await modal.requestClose(), true);
assert.equal(background.inert, false, 'closing must restore the prior inert value');
assert.equal(modalDocument.activeElement, trigger, 'closing must restore trigger focus');
assert.equal(closeNotifications, 1);
modal.destroy();
assert.equal(closeNotifications, 1, 'destroy after close must be idempotent');

console.log('App shell overlay behavior smoke passed.');
