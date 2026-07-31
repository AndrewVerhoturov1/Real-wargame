import type {
  CombatLabMapToolContributorV1,
  CombatLabMapToolModeListenerV1,
  CombatLabMapToolModeV1,
  CombatLabMapToolPointerV1,
  CombatLabMapToolTransactionV1,
  CombatLabPersistentMapToolModeV1,
  CombatLabTemporaryMapToolModeV1,
} from './CombatLabMapToolTypes';

export interface CombatLabMapToolStatusHostV1 {
  textContent: string | null;
  readonly dataset?: Record<string, string> | DOMStringMap;
}

export interface CombatLabMapToolEventTargetV1 {
  addEventListener(type: 'keydown', listener: EventListener, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: 'keydown', listener: EventListener, options?: boolean | EventListenerOptions): void;
}

export interface CombatLabMapToolCoordinatorOptionsV1 {
  readonly initialPersistentMode?: CombatLabPersistentMapToolModeV1;
  readonly eventTarget?: CombatLabMapToolEventTargetV1;
  readonly statusHost?: CombatLabMapToolStatusHostV1;
  readonly getStatusOverride?: () => string | null;
}

export class CombatLabMapToolCoordinator {
  private readonly contributors = new Map<CombatLabTemporaryMapToolModeV1, CombatLabMapToolContributorV1<unknown>>();
  private readonly listeners = new Set<CombatLabMapToolModeListenerV1>();
  private readonly eventTarget: CombatLabMapToolEventTargetV1 | null;
  private persistentMode: CombatLabPersistentMapToolModeV1;
  private transaction: CombatLabMapToolTransactionV1 | null = null;
  private lastPublishedMode: CombatLabMapToolModeV1;
  private destroyed = false;

  private constructor(private readonly options: CombatLabMapToolCoordinatorOptionsV1) {
    this.persistentMode = options.initialPersistentMode ?? 'select';
    this.lastPublishedMode = this.persistentMode;
    this.eventTarget = options.eventTarget ?? defaultEventTarget();
    this.eventTarget?.addEventListener('keydown', this.handleKeyDown, true);
    this.refreshStatus();
  }

  static create(options: CombatLabMapToolCoordinatorOptionsV1 = {}): CombatLabMapToolCoordinator {
    return new CombatLabMapToolCoordinator(options);
  }

  getMode(): CombatLabMapToolModeV1 {
    return this.transaction?.mode ?? this.persistentMode;
  }

  getPersistentMode(): CombatLabPersistentMapToolModeV1 {
    return this.persistentMode;
  }

  setPersistentMode(mode: CombatLabPersistentMapToolModeV1): void {
    if (this.destroyed) return;
    if (this.transaction) this.cancel();
    if (this.persistentMode === mode) {
      this.refreshStatus();
      return;
    }
    this.persistentMode = mode;
    this.publishMode();
  }

  registerContributor<TRequest>(contributor: CombatLabMapToolContributorV1<TRequest>): () => void {
    if (this.destroyed) throw new Error('Координатор инструментов карты уже уничтожен.');
    if (this.contributors.has(contributor.mode)) {
      throw new Error(`Инструмент карты «${contributor.mode}» уже зарегистрирован.`);
    }
    const stored = contributor as CombatLabMapToolContributorV1<unknown>;
    this.contributors.set(contributor.mode, stored);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (this.transaction?.mode === contributor.mode) this.cancel();
      if (this.contributors.get(contributor.mode) === stored) this.contributors.delete(contributor.mode);
    };
  }

  begin<TRequest>(mode: CombatLabTemporaryMapToolModeV1, request: TRequest): CombatLabMapToolTransactionV1 {
    if (this.destroyed) throw new Error('Координатор инструментов карты уже уничтожен.');
    const contributor = this.contributors.get(mode);
    if (!contributor) throw new Error(`Инструмент карты «${mode}» не зарегистрирован.`);
    if (this.transaction) this.cancel();
    const transaction = contributor.createTransaction(request);
    if (transaction.mode !== mode) {
      const mismatchError = new Error(`Инструмент «${mode}» создал транзакцию другого режима «${transaction.mode}».`);
      let cleanupError: unknown;
      try {
        transaction.cancel();
      } catch (error) {
        cleanupError = error;
      }
      if (cleanupError !== undefined) {
        throw new AggregateError([mismatchError, cleanupError], mismatchError.message);
      }
      throw mismatchError;
    }
    this.transaction = transaction;
    this.publishMode();
    return transaction;
  }

  preview(pointer: CombatLabMapToolPointerV1): void {
    if (this.destroyed) return;
    this.transaction?.preview(pointer);
  }

  confirm(): void {
    if (this.destroyed || !this.transaction) return;
    const transaction = this.transaction;
    this.transaction = null;
    try {
      transaction.confirm();
    } finally {
      this.publishMode();
    }
  }

  cancel(): void {
    if (this.destroyed || !this.transaction) return;
    const transaction = this.transaction;
    this.transaction = null;
    try {
      transaction.cancel();
    } finally {
      this.publishMode();
    }
  }

  subscribe(listener: CombatLabMapToolModeListenerV1): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  getStatusText(): string {
    return this.options.getStatusOverride?.() ?? statusForMode(this.getMode());
  }

  refreshStatus(): void {
    const host = this.options.statusHost;
    if (!host) return;
    const mode = this.getMode();
    host.textContent = this.getStatusText();
    if (host.dataset) host.dataset.combatLabMapToolMode = mode;
  }

  destroy(): void {
    if (this.destroyed) return;
    const transaction = this.transaction;
    this.transaction = null;
    try {
      transaction?.cancel();
    } finally {
      this.destroyed = true;
      this.eventTarget?.removeEventListener('keydown', this.handleKeyDown, true);
      this.listeners.clear();
      this.contributors.clear();
      if (this.options.statusHost) {
        this.options.statusHost.textContent = '';
        if (this.options.statusHost.dataset) delete this.options.statusHost.dataset.combatLabMapToolMode;
      }
    }
  }

  private readonly handleKeyDown: EventListener = (event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (!this.transaction || (keyboardEvent.key !== 'Escape' && keyboardEvent.key !== 'Enter')) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopImmediatePropagation();
    if (keyboardEvent.key === 'Enter') this.confirm();
    else this.cancel();
  };

  private publishMode(): void {
    const mode = this.getMode();
    this.refreshStatus();
    if (mode === this.lastPublishedMode) return;
    this.lastPublishedMode = mode;
    for (const listener of [...this.listeners]) listener(mode);
  }
}

function defaultEventTarget(): CombatLabMapToolEventTargetV1 | null {
  return typeof window === 'undefined' ? null : window;
}

function statusForMode(mode: CombatLabMapToolModeV1): string {
  switch (mode) {
    case 'select':
      return 'Режим карты: выбор.';
    case 'manual_control':
      return 'Режим карты: ручное управление.';
    case 'program_authoring':
      return 'Режим карты: редактор программы.';
    case 'place_participant':
      return 'Укажите позицию бойца · ЛКМ — выбрать · Enter — подтвердить · Esc — отменить.';
    case 'rotate_participant':
      return 'Задайте направление бойца · перетаскивание — предпросмотр · Enter — подтвердить · Esc — отменить.';
    case 'move_marker':
      return 'Переместите метку · перетаскивание — предпросмотр · Enter — подтвердить · Esc — отменить.';
    case 'resize_circle_marker':
      return 'Измените радиус области · перетаскивание — предпросмотр · Enter — подтвердить · Esc — отменить.';
  }
}
