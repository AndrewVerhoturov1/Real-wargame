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

`src/core/movement/MovementProfiles.ts` is pure core code. It does not import DOM, PixiJS or `localStorage`. `MovementProfileStorage.ts` is the browser adapter and uses:

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

## Import and export

The registry exports deterministic formatted JSON. Import normalizes missing fields and previous partial data to safe defaults. Invalid JSON or an invalid registry envelope is rejected before replacing the current in-memory/browser registry.

## Reusable selector

`MovementProfileSelector.ts` provides a Russian dropdown that lists profile names rather than requiring technical IDs. A deleted or unavailable profile remains an explicit error state and is not silently replaced.

## Integration strategy and PR #130

The result deliberately avoids replacing `NavigationProfileEditor.ts`, `main.ts` or `TacticalWorkspace.ts`. `MovementProfileEditorIntegration.ts` attaches after the current editor shell exists, renames the old misleading `Профили движения` route tab to `Профили маршрута`, and inserts the new physical movement tab.

PR #130 changes the same editor navigation for terrain materials. The integrator should preserve all tabs and choose one canonical tab-registration mechanism. Do not copy either navigation file wholesale. Retain these semantic sections:

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

Compare and unify:

- `MovementGait` names and actual speed units;
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
