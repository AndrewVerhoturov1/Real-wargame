import assert from 'node:assert/strict';
import { CombatLabGameEditorOverlay } from '../src/combat-lab/game-editors/CombatLabGameEditorOverlay';
import { listCombatLabGameEditorGroups } from '../src/combat-lab/game-editors/CombatLabGameEditorCatalogue';
import {
  readCombatLabGameEditorOpenRequest,
  requestCombatLabGameEditorOpen,
  resolveCombatLabSelectedUnitProfileLinks,
} from '../src/combat-lab/game-editors/CombatLabGameEditorLinks';
import type { UnitModel } from '../src/core/units/UnitModel';
import { GameEditorRegistry } from '../src/game-editors/GameEditorRegistry';
import { getSafeGameEditorReturnTarget } from '../src/game-editors/GameEditorReturnTarget';
import type {
  GameEditorDefinition,
  GameEditorMountContext,
  GameEditorOpenRequest,
} from '../src/game-editors/GameEditorTypes';
import type {
  AppModalOptions,
  AppOverlayCoordinator,
  AppOverlayHandle,
  DismissLayerOptions,
} from '../src/shared/app-overlay/AppOverlayCoordinator';

class FakeElement {
  className = '';
  type = '';
  textContent = '';
  readonly dataset: Record<string, string> = {};
  readonly children: unknown[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  append(...nodes: unknown[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: unknown[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }

  setAttribute(_name: string, _value: string): void {}

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener as (event: Event) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as (event: Event) => void);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

class FakeOverlayCoordinator implements AppOverlayCoordinator {
  private current: {
    readonly options: AppModalOptions;
    open: boolean;
  } | null = null;
  openModalCount = 0;
  maximumOpenModalCount = 0;

  openModal(options: AppModalOptions): AppOverlayHandle {
    assert.equal(this.current?.open ?? false, false, 'Only one modal may be open.');
    const host = new FakeElement();
    options.render(host as unknown as HTMLElement);
    const current = { options, open: true };
    this.current = current;
    this.openModalCount += 1;
    this.maximumOpenModalCount = Math.max(this.maximumOpenModalCount, this.isModalOpen() ? 1 : 0);
    return {
      priority: options.priority,
      close: () => {
        void this.requestTopClose();
      },
      destroy: () => {
        this.destroyCurrent(current);
      },
    };
  }

  registerDismissLayer(_options: DismissLayerOptions): () => void {
    return () => {};
  }

  setEscapeFallback(_handler: (() => void) | null): void {}

  hasOpenLayer(): boolean {
    return this.isModalOpen();
  }

  destroy(): void {
    if (this.current) this.destroyCurrent(this.current);
  }

  isModalOpen(): boolean {
    return this.current?.open ?? false;
  }

  async requestTopClose(): Promise<boolean> {
    const current = this.current;
    if (!current?.open) return false;
    if (current.options.beforeClose && !(await current.options.beforeClose())) return false;
    this.destroyCurrent(current);
    return true;
  }

  private destroyCurrent(current: { readonly options: AppModalOptions; open: boolean }): void {
    if (!current.open) return;
    current.open = false;
    if (this.current === current) this.current = null;
    current.options.onClosed?.();
  }
}

installFakeDom();

assert.equal(
  getSafeGameEditorReturnTarget('/combat-lab.html?tab=settings#catalogue'),
  '/combat-lab.html?tab=settings#catalogue',
);
for (const unsafe of [
  'https://example.com/',
  '//example.com/combat-lab.html',
  '/\\evil',
  'javascript:alert(1)',
  '/admin.html',
]) {
  assert.equal(getSafeGameEditorReturnTarget(unsafe), null, `unsafe return target must be rejected: ${unsafe}`);
}

const definitions: GameEditorDefinition[] = [
  embedded('futureWorldEditor', 'world', 40),
  embedded('soldierEditor', 'soldier', 10),
  route('behaviorGraph', 'behavior', 10),
  embedded('combatEditor', 'combat', 10),
];
const registry = new GameEditorRegistry(definitions);
const groups = listCombatLabGameEditorGroups(registry);
assert.deepEqual(groups.map((group) => group.group), ['behavior', 'soldier', 'combat', 'world']);
assert.deepEqual(
  groups.flatMap((group) => group.items.map((item) => item.definition.id)),
  ['behaviorGraph', 'soldierEditor', 'combatEditor', 'futureWorldEditor'],
  'catalogue must discover every definition from the shared registry without a copied id list',
);
assert.equal(groups[0]!.items[0]!.activation, 'route');
assert.equal(groups[1]!.items[0]!.activation, 'embedded');

const unit = {
  id: 'blue-1',
  soldier: {
    sourceProfileLinks: [
      { editorId: 'routeProfiles', profileId: 'careful', labelRu: 'Повтор профиля маршрута' },
      { editorId: 'soldierArchetypes', profileId: 'regular', labelRu: 'Архетип бойца' },
      { editorId: 'perceptionProfiles', profileId: 'standard', labelRu: 'Профиль восприятия' },
      { editorId: 'conditionProfiles', profileId: 'standard', labelRu: 'Ранения и подавление' },
    ],
  },
  playerAttentionProfileId: 'focused-observe',
  activeNavigationProfileId: 'careful',
  movementRuntime: {
    effectiveProfileId: 'normal_walk',
    requestedProfileId: 'normal_walk',
  },
} as unknown as UnitModel;
assert.deepEqual(resolveCombatLabSelectedUnitProfileLinks(unit), [
  {
    editorId: 'routeProfiles',
    profileId: 'careful',
    labelRu: 'Профиль маршрута',
  },
  {
    editorId: 'movementProfiles',
    profileId: 'normal_walk',
    labelRu: 'Профиль движения',
  },
  {
    editorId: 'attentionProfiles',
    profileId: 'focused-observe',
    labelRu: 'Профиль внимания',
  },
  {
    editorId: 'soldierArchetypes',
    profileId: 'regular',
    labelRu: 'Архетип бойца',
  },
  {
    editorId: 'perceptionProfiles',
    profileId: 'standard',
    labelRu: 'Профиль восприятия',
  },
  {
    editorId: 'conditionProfiles',
    profileId: 'standard',
    labelRu: 'Ранения и подавление',
  },
]);
assert.deepEqual(resolveCombatLabSelectedUnitProfileLinks({
  id: 'empty',
  soldier: { sourceProfileLinks: [] },
  movementRuntime: {
    effectiveProfileId: '',
    requestedProfileId: '',
  },
} as UnitModel), [
  {
    editorId: 'routeProfiles',
    profileId: null,
    labelRu: 'Профиль маршрута',
  },
  {
    editorId: 'movementProfiles',
    profileId: null,
    labelRu: 'Профиль движения',
  },
]);

const eventRoot = new FakeElement();
let receivedRequest: GameEditorOpenRequest | null = null;
eventRoot.addEventListener('combat-lab:open-game-editor', (event) => {
  receivedRequest = readCombatLabGameEditorOpenRequest(event)?.request ?? null;
});
requestCombatLabGameEditorOpen(
  eventRoot as unknown as HTMLElement,
  { editorId: 'routeProfiles', profileId: 'careful', selectedUnitId: 'blue-1' },
  eventRoot as unknown as HTMLElement,
);
assert.deepEqual(receivedRequest, {
  editorId: 'routeProfiles',
  profileId: 'careful',
  selectedUnitId: 'blue-1',
});

let closeAllowed = false;
let mountCount = 0;
let beforeCloseCount = 0;
let destroyCount = 0;
let secondDestroyCount = 0;
let routeMountCount = 0;
let routedRequest: GameEditorOpenRequest | null = null;
let navigatedTo: string | null = null;
const lifecycleRegistry = new GameEditorRegistry([
  {
    id: 'firstEmbedded',
    labelRu: 'Первый встроенный редактор',
    group: 'soldier',
    order: 10,
    activationFor: () => 'embedded',
    mount: (context) => {
      assert.equal(context.surface, 'combat-lab');
      assert.equal(context.request.profileId, 'profile-a');
      mountCount += 1;
      return {
        beforeClose: () => {
          beforeCloseCount += 1;
          return closeAllowed;
        },
        destroy: () => {
          destroyCount += 1;
        },
      };
    },
  },
  {
    id: 'secondEmbedded',
    labelRu: 'Второй встроенный редактор',
    group: 'combat',
    order: 10,
    activationFor: () => 'embedded',
    mount: () => ({
      destroy: () => {
        secondDestroyCount += 1;
      },
    }),
  },
  {
    id: 'behaviorGraph',
    labelRu: 'Граф поведения',
    group: 'behavior',
    order: 10,
    activationFor: () => 'route',
    mount: () => {
      routeMountCount += 1;
      return { destroy(): void {} };
    },
    route: (request) => {
      routedRequest = request;
      return `/ai-node-editor.html?returnTo=${encodeURIComponent(request.returnTo ?? '')}`;
    },
  },
]);
const coordinator = new FakeOverlayCoordinator();
const trigger = new FakeElement();
const originalConsoleError = console.error;
const consoleErrors: unknown[][] = [];
console.error = (...values: unknown[]) => {
  consoleErrors.push(values);
};
try {
  const overlay = new CombatLabGameEditorOverlay({
    registry: lifecycleRegistry,
    overlayCoordinator: coordinator,
    navigate: (url) => {
      navigatedTo = url;
    },
  });

  const firstOpen = await overlay.open(
    { editorId: 'firstEmbedded', profileId: 'profile-a' },
    trigger as unknown as HTMLElement,
  );
  assert.equal(firstOpen.kind, 'mounted');
  assert.equal(mountCount, 1);
  assert.equal(coordinator.openModalCount, 1);
  assert.equal(coordinator.isModalOpen(), true);

  assert.equal(await coordinator.requestTopClose(), false, 'beforeClose=false must keep the modal open.');
  assert.equal(beforeCloseCount, 1);
  assert.equal(destroyCount, 0);
  assert.equal(coordinator.isModalOpen(), true);

  closeAllowed = true;
  assert.equal(await coordinator.requestTopClose(), true);
  assert.equal(destroyCount, 1, 'Accepted close must destroy the installation exactly once.');
  assert.equal(coordinator.isModalOpen(), false);

  const reopened = await overlay.open(
    { editorId: 'firstEmbedded', profileId: 'profile-a' },
    trigger as unknown as HTMLElement,
  );
  assert.equal(reopened.kind, 'mounted');
  assert.equal(mountCount, 2, 'Reopening must create a fresh installation.');
  assert.equal(coordinator.openModalCount, 2);

  const switched = await overlay.open({ editorId: 'secondEmbedded' }, trigger as unknown as HTMLElement);
  assert.equal(switched.kind, 'mounted');
  assert.equal(destroyCount, 2, 'Switching items must destroy the old installation once.');
  assert.equal(secondDestroyCount, 0);

  const routed = await overlay.open(
    { editorId: 'behaviorGraph', returnTo: 'https://example.com/unsafe' },
    trigger as unknown as HTMLElement,
  );
  assert.equal(routed.kind, 'route');
  assert.equal(secondDestroyCount, 1);
  assert.equal(routeMountCount, 0, 'A route definition must never mount an editor panel.');
  assert.equal(routedRequest?.returnTo, '/combat-lab.html?tab=settings');
  assert.equal(navigatedTo, '/ai-node-editor.html?returnTo=%2Fcombat-lab.html%3Ftab%3Dsettings');
  assert.equal(coordinator.isModalOpen(), false);

  overlay.destroy();
  assert.equal(destroyCount, 2);
  assert.equal(secondDestroyCount, 1);
  assert.equal(coordinator.maximumOpenModalCount, 1, 'Repeated use must never accumulate modal layers.');
} finally {
  console.error = originalConsoleError;
}
assert.deepEqual(consoleErrors, [], 'Focused overlay interaction must not emit console errors.');

console.log('Combat Lab game-editor behavior smoke passed.');

function embedded(
  id: string,
  group: GameEditorDefinition['group'],
  order: number,
): GameEditorDefinition {
  return {
    id,
    labelRu: id,
    group,
    order,
    activationFor: () => 'embedded',
    mount: () => ({ destroy(): void {} }),
  };
}

function route(
  id: string,
  group: GameEditorDefinition['group'],
  order: number,
): GameEditorDefinition {
  return {
    id,
    labelRu: id,
    group,
    order,
    activationFor: () => 'route',
    route: () => '/ai-node-editor.html',
  };
}


function installFakeDom(): void {
  class FakeEvent {
    constructor(readonly type: string) {}
  }
  class FakeCustomEvent<T> extends FakeEvent {
    readonly detail: T;
    readonly bubbles: boolean;
    constructor(type: string, init: { readonly detail: T; readonly bubbles?: boolean }) {
      super(type);
      this.detail = init.detail;
      this.bubbles = init.bubbles ?? false;
    }
  }
  Object.assign(globalThis, {
    Event: FakeEvent,
    CustomEvent: FakeCustomEvent,
    HTMLElement: FakeElement,
    document: {
      createElement: () => new FakeElement(),
    },
  });
}
