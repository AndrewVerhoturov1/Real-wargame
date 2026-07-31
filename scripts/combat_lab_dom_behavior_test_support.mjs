export class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key ?? '';
    this.button = init.button ?? 0;
    this.pointerId = init.pointerId ?? 1;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.detail = init.detail;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.immediatePropagationStopped = false;
    this.target = null;
    this.currentTarget = null;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() {
    this.immediatePropagationStopped = true;
    this.propagationStopped = true;
  }
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent?.(event);
      if (event.immediatePropagationStopped) break;
    }
    return !event.defaultPrevented;
  }
}

export class FakeElement extends FakeEventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this._textContent = '';
    this.value = '';
    this.type = '';
    this.name = '';
    this.disabled = false;
    this.readOnly = false;
    this.hidden = false;
    this.open = false;
    this.checked = false;
    this.min = '';
    this.max = '';
    this.step = '';
    this.ownerDocument = null;
    this.classList = {
      add: (...names) => { for (const name of names) this.#setClass(name, true); },
      remove: (...names) => { for (const name of names) this.#setClass(name, false); },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.className.split(/\s+/).includes(name);
        this.#setClass(name, enabled);
        return enabled;
      },
    };
  }
  #setClass(name, enabled) {
    const names = new Set(this.className.split(/\s+/).filter(Boolean));
    if (enabled) names.add(name); else names.delete(name);
    this.className = [...names].join(' ');
  }
  set textContent(value) {
    this._textContent = value == null ? '' : String(value);
    this.children = [];
  }
  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent ?? '').join('');
  }
  append(...children) {
    for (const child of children.flat()) {
      if (child == null) continue;
      if (typeof child === 'string') {
        const text = new FakeElement('#text');
        text._textContent = child;
        text.ownerDocument = this.ownerDocument;
        text.parentNode = this;
        this.children.push(text);
        continue;
      }
      child.parentNode = this;
      child.ownerDocument ??= this.ownerDocument;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  prepend(...children) {
    for (const child of [...children].reverse()) {
      child.parentNode = this;
      child.ownerDocument ??= this.ownerDocument;
      this.children.unshift(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._textContent = '';
    this.append(...children);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'name') this.name = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  click() { this.dispatchEvent(new FakeEvent('click')); }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  querySelector(selector) { return querySelectorAllFrom(this, selector)[0] ?? null; }
  querySelectorAll(selector) { return querySelectorAllFrom(this, selector); }
  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSimpleSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }
}

export class FakeDetailsElement extends FakeElement {
  constructor() { super('details'); }
}
export class FakeInputElement extends FakeElement {
  constructor() { super('input'); }
}
export class FakeSelectElement extends FakeElement {
  constructor() { super('select'); }
  append(...children) {
    super.append(...children);
    if (!this.value) {
      const first = this.children.find((child) => child.tagName === 'OPTION');
      if (first) this.value = first.value;
    }
  }
}
export class FakeButtonElement extends FakeElement {
  constructor() { super('button'); this.type = 'button'; }
}
export class FakeCanvasElement extends FakeElement {
  constructor() { super('canvas'); }
}
export class FakeOptionElement extends FakeElement {
  constructor(label = '', value = '') {
    super('option');
    this.textContent = label;
    this.value = String(value);
  }
}

export function installCombatLabBehaviorDom() {
  const windowTarget = new FakeEventTarget();
  windowTarget.requestAnimationFrame = (callback) => { callback(0); return 1; };
  windowTarget.cancelAnimationFrame = () => undefined;
  windowTarget.confirm = () => true;
  const document = {
    activeElement: null,
    body: null,
    createElement(tagName) {
      const tag = String(tagName).toLowerCase();
      const element = tag === 'details' ? new FakeDetailsElement()
        : tag === 'input' ? new FakeInputElement()
        : tag === 'select' ? new FakeSelectElement()
        : tag === 'button' ? new FakeButtonElement()
        : tag === 'canvas' ? new FakeCanvasElement()
        : tag === 'option' ? new FakeOptionElement()
        : new FakeElement(tag);
      element.ownerDocument = document;
      return element;
    },
    querySelector(selector) { return document.body?.querySelector(selector) ?? null; },
    querySelectorAll(selector) { return document.body?.querySelectorAll(selector) ?? []; },
  };
  document.body = document.createElement('body');
  globalThis.window = windowTarget;
  globalThis.document = document;
  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLDetailsElement = FakeDetailsElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLSelectElement = FakeSelectElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLCanvasElement = FakeCanvasElement;
  globalThis.Option = FakeOptionElement;
  globalThis.Event = FakeEvent;
  globalThis.CustomEvent = class extends FakeEvent {
    constructor(type, init = {}) { super(type, init); }
  };
  globalThis.KeyboardEvent = FakeEvent;
  globalThis.PointerEvent = FakeEvent;
  globalThis.CSS = { escape: (value) => String(value).replaceAll('"', '\\"') };
  return { document, window: windowTarget };
}

export function walkElements(root) {
  const result = [];
  const visit = (node) => {
    result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return result;
}

export function findElement(root, predicate, message = 'Element not found') {
  const match = walkElements(root).find(predicate);
  if (!match) throw new Error(message);
  return match;
}

export function findElements(root, predicate) {
  return walkElements(root).filter(predicate);
}

export function findControlByLabel(root, label) {
  const field = findElement(root, (element) => element.tagName === 'LABEL'
    && element.children.some((child) => child.tagName === 'SPAN' && child.textContent === label), `Control «${label}» not found`);
  return field.children.find((child) => ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(child.tagName)) ?? null;
}

export function findButton(root, label) {
  return findElement(root, (element) => element.tagName === 'BUTTON' && element.textContent === label, `Button «${label}» not found`);
}

export function findDetailsBySummary(root, summaryText) {
  return findElement(root, (element) => element.tagName === 'DETAILS'
    && element.children.some((child) => child.tagName === 'SUMMARY' && child.textContent === summaryText), `Details «${summaryText}» not found`);
}

function querySelectorAllFrom(root, selector) {
  const selectors = selector.split(',').map((value) => value.trim()).filter(Boolean);
  return walkElements(root).filter((element) => selectors.some((candidate) => matchesSimpleSelector(element, candidate)));
}

function matchesSimpleSelector(element, selector) {
  const notDisabled = selector.includes(':not([disabled])');
  const notHidden = selector.includes(':not([hidden])');
  const base = selector.replaceAll(':not([disabled])', '').replaceAll(':not([hidden])', '').trim();
  if (notDisabled && element.disabled) return false;
  if (notHidden && element.hidden) return false;
  if (base.startsWith('.')) return element.classList.contains(base.slice(1));
  if (base.startsWith('#')) return element.getAttribute('id') === base.slice(1);
  const attributeMatch = base.match(/^([a-zA-Z0-9_-]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attributeMatch) {
    const [, tagName, attribute, expected] = attributeMatch;
    if (tagName && element.tagName !== tagName.toUpperCase()) return false;
    const actual = attribute.startsWith('data-')
      ? element.dataset[toCamel(attribute.slice(5))]
      : element.getAttribute(attribute) ?? element[attribute];
    return expected === undefined ? actual !== undefined && actual !== null : String(actual) === expected;
  }
  return element.tagName === base.toUpperCase();
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
