export {};

const EDITOR_CONTROL_SELECTOR = [
  '.human-node-panel',
  '.inspector-panel',
  '.developer-json-details',
  '.ai-debug-panel-dock',
  '.app-shell-menu',
  'select',
  'input',
  'textarea',
].join(', ');

const originalAddEventListener = document.addEventListener.bind(document);
const originalRemoveEventListener = document.removeEventListener.bind(document);

document.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
): void => {
  if (listener === null) {
    return;
  }

  if (type !== 'click') {
    originalAddEventListener(type, listener, options);
    return;
  }

  const optionsWithoutOnce = removeOnceOption(options);
  const guardedListener: EventListener = (event) => {
    if (shouldIgnoreDocumentClick(event)) {
      return;
    }

    if (hasOnceOption(options)) {
      originalRemoveEventListener(type, guardedListener, optionsWithoutOnce);
    }

    if (typeof listener === 'function') {
      listener.call(document, event);
      return;
    }

    listener.handleEvent(event);
  };

  originalAddEventListener(type, guardedListener, optionsWithoutOnce);
}) as typeof document.addEventListener;

function shouldIgnoreDocumentClick(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest('.node-context-menu')) {
    return false;
  }

  return Boolean(target.closest(EDITOR_CONTROL_SELECTOR));
}

function hasOnceOption(options: boolean | AddEventListenerOptions | undefined): boolean {
  return typeof options === 'object' && options !== null && options.once === true;
}

function removeOnceOption(options: boolean | AddEventListenerOptions | undefined): boolean | AddEventListenerOptions | undefined {
  if (typeof options !== 'object' || options === null || options.once !== true) {
    return options;
  }

  return { ...options, once: false };
}
