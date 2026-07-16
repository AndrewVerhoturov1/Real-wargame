# Movement Profiles Editor v1

## Scope

This isolated result adds the visual Russian section `Профили движения` to the AI editor. It defines how a soldier physically moves. It does not replace:

- navigation profiles, which decide **where** to route;
- attention profiles, which decide **how** to observe;
- the physical movement runtime owned by the parallel runtime worker;
- order and node semantics owned by the parallel AI/order worker.

## Source-of-truth boundary

```text
MovementProfile id
        ↓
preferred gait + stance/fallback policy + grouped modifiers
        ↓
future physical movement runtime
        ↓
actual per-unit runtime state
```

The profile is persistent configuration. The selected gait and the current soldier state are separate. Injury, suppression or stamina may force a temporary fallback without rewriting the profile.

## Architecture boundary

Pure movement configuration remains under:

```text
src/core/movement/
  MovementProfileTypes.ts
  MovementProfileDefaults.ts
  MovementProfileNormalization.ts
  MovementProfileImportValidation.ts
  MovementProfileRegistry.ts
  MovementProfiles.ts
```

These files do not use DOM, `window`, browser `Storage`, storage events, visual panel state or PixiJS.

Browser persistence belongs to:

```text
src/ai-node-editor/MovementProfileBrowserStorage.ts
```

It owns `localStorage`, browser storage events and page-session listeners. Storage key:

```text
real-wargame.movement-profiles.v1
```

Format version:

```text
1
```

## Built-in profiles

Stable order:

1. `normal_walk` — Обычный шаг;
2. `stealth_move` — Скрытное движение;
3. `crouched_move` — Движение пригнувшись;
4. `run` — Бег;
5. `sprint` — Спринт;
6. `crawl` — Ползком.

Built-ins can be edited and reset, but cannot be deleted. Custom profiles can be created, copied, renamed and deleted. The visual workflow generates custom IDs automatically.

## MovementGait contract

Movement profiles use the same canonical gait values as the physical runtime:

```text
crawl
crouch_walk
walk
run
sprint
```

The built-in `crouched_move` profile uses `preferredGait: crouch_walk`. The Russian editor label remains `Пригнувшись`.

Older branch-local saved data may contain the former value `crouch`. Strict import accepts that one legacy value before normalization and migrates it to `crouch_walk`. This compatibility value is accepted only at the import boundary; it is not part of `MovementGait`, editor options, registry state or serialization. Registry state and new JSON exports contain canonical values only; they never serialize `preferredGait: crouch`.

Unknown gait values remain transactional import errors and do not replace the current registry.

## Registry lookup contract

The registry does not silently replace an unknown ID:

```text
findProfile(id)    → exact profile or null
requireProfile(id) → exact profile or error
resolveProfile(id) → resolved profile + explicit fallbackReason
```

Editor selectors use exact lookup and retain a deleted or unavailable ID as a visible error. Runtime code that deliberately needs a default may use `resolveProfile` and must retain its fallback reason in diagnostics.

## Editable groups

- identity, preferred gait, stance policy, fallback profile, category and order;
- speed and transitions;
- stamina;
- movement visibility;
- noise;
- attention modifiers while moving;
- weapon actions and readiness;
- injury, suppression and fallback restrictions.

Every numeric setting has a slider, an exact number field, a unit, a Russian explanation, a default value, a bounded range, an extreme-value warning and a field reset action.

## Transactional import and export

The registry exports deterministic formatted JSON.

Import is a two-phase operation:

```text
parse complete file
→ validate every profile and cross-profile reference
→ collect every issue with a JSON path and Russian explanation
→ build a complete normalized candidate
→ replace browser/in-memory registry only when the candidate is valid
```

Malformed custom profiles are never silently omitted. Invalid JSON, duplicate normalized IDs, invalid field types, unknown enum values, invalid built-in claims, broken fallback references and unsupported future format versions reject the whole import. The previous registry remains unchanged.

Missing fields in an otherwise valid older partial file still receive safe defaults during migration.

## Unsaved draft protection

A dirty movement-profile draft is protected when the user:

- selects another movement profile;
- opens another editor section;
- starts a destructive or replacing action such as reset, create, copy, rename, delete or import;
- closes or reloads the browser page.

The editor presents the explicit choices:

```text
Сохранить
Отменить изменения
Остаться
```

An external browser-storage update received while a draft is dirty is held as a pending registry until the user saves or discards the current draft.

## Reusable selector

`MovementProfileSelector.ts` provides a Russian dropdown that lists profile names rather than requiring technical IDs. A deleted or unavailable profile remains an explicit error state and is not silently replaced.

## Shared editor section registration and PR #130

`AiEditorSectionRegistry.ts` is the single owner of custom AI-editor section registration, ordering and section transitions. A section supplies:

```text
id
labelRu
order
render(panel)
beforeLeave()
onDeactivate()
dispose()
```

`MovementProfileEditorIntegration.ts` only registers `movementProfiles`; it does not query the editor shell, insert buttons or rename neighbouring controls itself. The shared registry centrally owns the `Профили маршрута` label and places `Профили движения` between route and attention profiles.

PR #130 should register terrain/material sections through the same mechanism. Preserve these semantic sections:

```text
Граф поведения
Профили маршрута
Профили движения
Профили внимания
Данные бойца
Профили местности
Направленный рельеф
```

## Reconciliation with physical runtime worker

The canonical `MovementGait` names are aligned. Remaining integration points are:

- actual speed units;
- stamina scale and hysteresis thresholds;
- wound/suppression capability inputs;
- fallback resolution and loop prevention;
- noise event cadence and terrain-material multiplier hook;
- weapon readiness/cancellation ownership;
- serialization ownership for per-unit active profile and actual runtime state.

Do not add a second coordinate integrator. `SimulationTick` remains the only coordinate integrator.

## Reconciliation with order/node worker

Nodes and orders should store a movement profile ID and render the reusable Russian selector. They must not copy profile values into node properties. Missing custom IDs must remain visible as an error until the author selects a replacement.

## Verification

Focused command:

```text
npm run movement-profiles:smoke
```

The focused smoke enforces:

- canonical runtime-compatible `MovementGait` values;
- `crouched_move → crouch_walk` serialization;
- legacy `crouch → crouch_walk` import migration;
- absence of legacy `crouch` in new exports;
- rejection of unknown gait values;
- Russian `Пригнувшись` editor label;
- pure-core browser independence;
- absence of the former core storage adapter;
- strict aggregate import errors and transactional replacement;
- exact `find/require/resolve` lookup semantics;
- draft guard actions;
- section registration without feature-local DOM insertion.

Prepared browser scenario, not run without approval:

```text
tests/movement-profiles-editor.spec.ts
```

Expected PNG files:

```text
test-results/movement-profiles/01-built-ins.png
test-results/movement-profiles/02-custom-saved.png
test-results/movement-profiles/03-tab-state.png
```
