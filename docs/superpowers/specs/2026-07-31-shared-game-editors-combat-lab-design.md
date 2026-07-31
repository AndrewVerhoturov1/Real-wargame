# Shared Game Editors and Combat Lab Design

**Status:** approved by the user on 2026-07-31.

**Target branch:** `feature/20260731-combat-lab-user-acceptance-fixes`

**Original accepted base:** `6220ba65de584239612600ae2ec025363137e09f`

## 1. Goal

Create one coherent developer-facing tuning environment for Real-Wargame:

- replace the permanent cross-mode navigation strip with a compact common game menu;
- make the menu available in the game, AI editor and Combat Lab;
- open and close the menu with one button and `Escape`;
- preserve one authoritative implementation of every game editor;
- make the same editors available from the AI editor and Combat Lab without copying values or UI logic;
- add missing editors for perception, soldier archetypes and wound/suppression tuning;
- preserve the existing simulation, profile registries, workspace composition roots and batch runtime;
- complete performance, layout and browser verification after integration.

## 2. Existing foundation

The repository already contains:

- `src/shared/AppShellMenu.ts` with the three mode links and exit behavior;
- `src/ai-node-editor/AiEditorSectionRegistry.ts` with partial section registration;
- full or partial editors for the behavior graph, tactical positions, route profiles, environment profiles, movement profiles, weapons, attention profiles, soldier blackboard data and directional terrain;
- `CombatLabWorkspaceTabs`, workspace hosts and registered workspace services;
- Combat Lab quick parameters that intentionally override one experiment rather than redefine global profiles;
- canonical profile registries for several domains;
- a mandatory performance contract that forbids UI-owned gameplay computation and recurring hidden work.

The implementation must evolve these foundations. It must not create a second application shell, editor registry, Combat Lab draft, visual controller, batch pipeline or simulation loop.

## 3. Accepted product decisions

### 3.1 Common game menu

The permanent top navigation strip is replaced by one compact `Меню` button.

Activating the button opens a modal layer above the current mode. The layer contains:

- `Игра`;
- `Редактор ИИ`;
- `Испытательный полигон`;
- `Выход`;
- a current-mode marker;
- only mode-specific secondary actions that remain genuinely necessary.

The modal uses a dark translucent backdrop, restores focus after closing, blocks interaction with the background and remains usable at reduced viewport widths.

### 3.2 Escape priority

`Escape` follows one shared priority order:

1. close the highest-priority open dialog or editor overlay;
2. close the game menu when it is open;
3. open the game menu when no dismissible layer is open.

No mode may install an independent unconditional `Escape` handler that competes with this order.

### 3.3 One editor implementation

Each tuning editor is a mountable definition registered in one shared game-editor registry. A definition owns:

- stable editor ID;
- Russian label;
- logical group;
- order;
- supported surfaces;
- mount or route activation;
- unsaved-change check;
- deterministic teardown.

The AI editor and Combat Lab consume the same definitions. They may present them differently, but they may not copy panel code, validation, persistence or profile values.

### 3.4 Graph behavior

The behavior graph remains a full-screen workspace. In the AI editor it is the primary embedded workspace. In Combat Lab it is represented by an entry that navigates to the existing graph route and preserves a return target to Combat Lab.

A second graph canvas or graph storage is forbidden.

### 3.5 Combat Lab presentation

Combat Lab receives a new workspace tab named `Настройка игры`.

The tab displays a compact grouped catalogue rather than hundreds of controls in the narrow dock. Selecting an embedded editor opens a large modal workbench over the map through the common overlay coordinator.

Groups:

- `Поведение`;
- `Боец`;
- `Бой`;
- `Мир`.

The selected-unit parameter view may link to the source global profile. Existing quick parameters remain experiment-local overrides and are not merged into global profile storage.

## 4. Shared editor contract

The shared platform must expose an explicit contract equivalent to the following shape:

```ts
export type GameEditorSurface = 'ai-editor' | 'combat-lab';
export type GameEditorGroup = 'behavior' | 'soldier' | 'combat' | 'world';
export type GameEditorActivation = 'embedded' | 'route' | 'hidden';

export interface GameEditorOpenRequest {
  readonly editorId: string;
  readonly profileId?: string;
  readonly selectedUnitId?: string;
  readonly returnTo?: string;
}

export interface GameEditorMountContext {
  readonly host: HTMLElement;
  readonly surface: GameEditorSurface;
  readonly request: GameEditorOpenRequest;
  readonly requestClose: () => void;
}

export interface GameEditorInstallation {
  beforeClose?(): boolean | Promise<boolean>;
  destroy(): void;
}

export interface GameEditorDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly group: GameEditorGroup;
  readonly order: number;
  activationFor(surface: GameEditorSurface): GameEditorActivation;
  mount?(context: GameEditorMountContext): GameEditorInstallation;
  route?(request: GameEditorOpenRequest): string;
}
```

Exact names may be refined only when the resulting contract remains explicit, typed and covered by contract tests. Definitions must not discover a host by querying global page structure.

## 5. Existing editors to migrate

The shared registry must include these existing capabilities:

1. `behaviorGraph` — graph behavior;
2. `tacticalPositions` — tactical position profiles;
3. `routeProfiles` — navigation route profiles;
4. `environmentProfiles` — existing environment material profiles;
5. `movementProfiles` — physical movement profiles;
6. `weapons` — combat catalog and loadouts;
7. `attentionProfiles` — attention profiles;
8. `soldierData` — graph blackboard/soldier data;
9. `directionalTerrain` — directional terrain profiles.

The environment material editor already exists in the repository. It must be restored to the visible shared catalogue where necessary, not reimplemented.

Legacy modules that currently query `.navigation-profile-tabs`, `#ai-node-editor-root` or other page globals at import time must be converted into explicit mountable installations.

## 6. New editors

### 6.1 Perception profiles

The editor exposes authoritative existing perception parameters, including only values currently consumed by the simulation. Expected groups include:

- visual distance and near peripheral awareness;
- current-view attention influence;
- confidence gain and loss;
- contact memory and approximate-position uncertainty;
- movement/static target modifiers;
- hearing thresholds and event-distance modifiers where already implemented.

Scattered runtime constants may be migrated into one versioned core profile only when all existing consumers are migrated in the same change. The editor must never become the gameplay source of truth.

### 6.2 Soldier archetypes

The editor creates reusable soldier archetypes that reference, rather than duplicate, other profile IDs.

An archetype may contain existing authoritative base attributes such as:

- marksmanship or weapon handling already represented in unit data;
- reaction/observation skill already consumed by runtime;
- physical preparation and suppression tolerance already represented in state;
- default route, movement, attention, perception, weapon/loadout and condition profile IDs.

The implementation must not invent an unused attribute merely because it is desirable in the future. Unsupported future fields remain absent.

### 6.3 Wound and suppression profiles

The editor exposes existing Stage 6–9 wound, incapacitation and suppression parameters. It may migrate scattered constants into a canonical versioned profile when all existing runtime consumers are switched atomically.

It must not introduce new morale, medical-treatment, bleeding or recovery mechanics beyond what the current runtime implements.

## 7. Persistence and runtime data flow

Core profile types, normalization and immutable runtime snapshots remain DOM-free.

Browser persistence belongs to UI/storage adapters. Core runtime must not import `window`, `document`, `localStorage` or editor modules.

Required flow:

```text
editor panel
→ validate and normalize
→ browser storage adapter
→ versioned registry revision
→ immutable core runtime snapshot
→ existing simulation consumer
```

A saved profile change may trigger the existing narrow revision-driven update. It must not trigger a page-wide poll, full-map rebuild or hidden editor render loop.

## 8. Lifecycle and performance

Every mounted editor installation must have symmetric teardown:

- remove listeners;
- unsubscribe from registries;
- clear timers;
- cancel pending work;
- release DOM ownership;
- make repeated `destroy()` safe.

Hidden or closed editors must perform no recurring DOM updates or profile polling.

The implementation must preserve the repository performance contract:

- no full-map work from UI callbacks;
- no simulation work owned by a selected tab;
- no duplicate calculation of canonical gameplay quantities;
- no per-frame rebuilding of hidden panels;
- no unbounded observer or mutation-observer loops;
- exact revision identity for runtime profile snapshots;
- no change to simulation semantics merely to improve UI responsiveness.

## 9. Accessibility and layout

Required interaction behavior:

- modal semantics and accessible names;
- keyboard focus trap in the common menu and Combat Lab editor overlay;
- focus restoration after close;
- `Escape` priority contract;
- visible focus state;
- no interaction with covered background controls;
- independent internal scrolling for long forms;
- always reachable save/cancel actions;
- no horizontal page scroll at 1440×900, 1366×768, 1100×760 or 1920×1080;
- reasonable behavior below the primary width without silently hiding actions.

## 10. Tests and acceptance

Required regression coverage includes:

- one common menu root on every mode;
- menu toggle and `Escape` priority;
- focus restoration and background inertness;
- one shared editor registry and no duplicate section IDs;
- explicit host mounting without page-global host discovery;
- every existing editor registered once;
- environment editor visible in the shared catalogue;
- new profile serialization, normalization, revision and fallback behavior;
- no DOM imports from core profile modules;
- Combat Lab `Настройка игры` tab and grouped catalogue;
- editor overlay open, close, unsaved-change refusal and teardown;
- graph route return target;
- selected-unit links open the correct source profile;
- quick parameters remain experiment-local;
- Combat Lab scenario, visual runtime and batch tests remain green;
- full `verify:preview` and production build;
- post-integration browser and performance evidence.

## 11. Non-goals

This implementation does not:

- add a new simulation loop;
- redesign Graph v2 behavior semantics;
- replace existing profile registries without necessity;
- add future morale, medicine, weather or command systems;
- merge quick parameters into global tuning profiles;
- add a second Combat Lab workspace root;
- deploy to production;
- touch `main` or `real-wargame-preview` without explicit later approval.
