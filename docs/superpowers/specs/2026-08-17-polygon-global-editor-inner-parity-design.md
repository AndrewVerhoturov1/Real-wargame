# Polygon global editor inner-parity design

Date: 2026-08-17
Branch: `feature/20260817-polygon-editor-inner-parity`
Base: `feature/20260817-polygon-six-x-integration @ ebf61178cfc777d63896eb9f56eaeb54e3ed1c32`
Accepted source reference: `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`

## Goal

Make every editor inside the Polygon `Редакторы` surface use the accepted HTML prototype composition and visual language, not only the outer catalogue shell, while retaining the real product editor owners, storage, validation, commands, and write paths.

The old product editor DOM remains the live functional source. The Polygon layer may reorganize and restyle those existing DOM nodes, but must not duplicate their model, fake missing data, create a second registry, or replace product write paths.

## Prototype navigation contract

The shared editor window exposes exactly this visible navigation and order:

```text
Поведение
- Профили маршрута
- Тактические позиции

Боец
- Архетипы бойцов
- Профили внимания
- Профили восприятия
- Профили движения

Бой
- Вооружение
- Ранения и подавление

Мир
- Типы поверхностей
- Профили местности
- Направленный рельеф
```

`Граф поведения` and `Данные бойца` remain valid product editors, but they are not visible entries in this shared Polygon window because the accepted prototype does not place them there. Their existing route/context access remains untouched.

`Типы поверхностей` has no corresponding current `GameEditorRegistry` owner. It therefore remains visible in the correct prototype position as a disabled/unavailable item. The Polygon must not invent surface-type data or a write path.

## Product owner mapping

```text
Профили маршрута        -> routeProfiles / mountNavigationProfileEditor
Тактические позиции     -> tacticalPositions / mountTacticalPositionProfileEditor
Архетипы бойцов         -> soldierArchetypes / mountSoldierArchetypeEditor
Профили внимания        -> attentionProfiles / mountAttentionProfileEditor
Профили восприятия      -> perceptionProfiles / mountPerceptionProfileEditor
Профили движения        -> movementProfiles / mountMovementProfileEditor
Вооружение               -> weapons / mountCombatCatalogEditor
Ранения и подавление    -> conditionProfiles / mountConditionProfileEditor
Типы поверхностей       -> unavailable placeholder only
Профили местности       -> environmentProfiles / mountEnvironmentProfileEditor
Направленный рельеф     -> directionalTerrain / mountDirectionalTerrainProfileEditor
```

## Presentation architecture

### Outer navigation

`CombatLabGameEditorCatalogue` remains the owner of selection and lifecycle. A Polygon-only visible navigation projection filters the registry to the prototype list, preserves prototype group order, and inserts the disabled `Типы поверхностей` placeholder.

The projection must not modify the global `GameEditorRegistry` and must not hide `behaviorGraph` or `soldierData` from other product surfaces.

### Inner editor adapter

Introduce one focused presentation adapter for mounted live editors. It receives the selected `GameEditorDefinition.id` and the real mount host after the authoritative editor mounts.

The adapter:

- marks the host with a stable editor-specific parity class/data attribute;
- observes owner re-renders and reapplies presentation safely;
- never clones live input/control nodes;
- moves or wraps existing nodes only when necessary;
- keeps existing listeners on the original nodes;
- injects only presentation-only tabs, summaries, breadcrumbs, badges, headings, and disabled placeholders;
- destroys its observer and presentation-only state when the editor unmounts.

### Shared profile editors

Editors already using `navigation-profile-layout` (`routeProfiles`, `attentionProfiles`, `movementProfiles`, `environmentProfiles`, `directionalTerrain`) share the same prototype geometry:

```text
outer editor navigation | profile/material list | editor main
214 px                  | 238 px                | remaining width
```

They receive a common light presentation: compact list header, built-in/custom list treatment when derivable from real DOM, prototype header hierarchy, prototype tabs/sections, compact fields, and bottom save/action treatment where the live owner exposes those controls.

`routeProfiles` keeps its existing route-specific adapter and extends it rather than replacing live route fields.

### Gameplay tuning editors

`soldierArchetypes`, `perceptionProfiles`, and `conditionProfiles` use the real `GameplayTuningProfileEditor` DOM. The adapter maps its list and form panels into the same prototype geometry and adds editor-specific presentation:

- `Архетипы бойцов`: header + profile status + prototype section/tabs using real archetype reference and numeric fields;
- `Профили восприятия`: header + active-state treatment + grouped real perception fields;
- `Ранения и подавление`: header + grouped real condition fields.

The save bar remains the real owner save/cancel controls.

### Tactical positions

The real tactical-position list/form/actions are retained. The adapter restyles/reorganizes them into the prototype profile column and main editor, using real `data-tactical-*` controls. No tactical settings are synthesized.

### Weapons

The real combat catalogue remains authoritative. Its existing ammo/weapon/loadout subtabs, entry list, validation, draft/publish actions, and fields are retained. The Polygon presentation maps them to the prototype light header, compact subtabs, list column, and main editor. No catalogue entries are copied into Polygon state.

### Environment profiles

The existing profile selector, vegetation/surface material groups, material list, revision badges, and material controls remain live. Presentation follows the prototype light profile/material editor. This does not satisfy the separate `Типы поверхностей` entry; that entry stays disabled because a dedicated product owner is absent.

### Directional terrain

The live navigation profile list and six directional-terrain controls remain authoritative. Presentation follows the prototype profile/list + main editor format and uses the existing save/cancel controls.

## Missing capability behavior

A missing product capability is represented as a visible disabled prototype entry or a clearly unavailable empty body. The UI must not invent data, editable values, persistence, or commands.

This rule applies specifically to `Типы поверхностей` in this pass.

## Visual contract

At 1600×900, the shared `Редакторы` window must read as one coherent prototype interface. Every individual editor must use:

- the same outer modal/surface geometry;
- the same group navigation width and hierarchy;
- a consistent 238 px list/profile column when the editor has a list;
- light neutral backgrounds, thin borders, compact 7–10 px utility typography, and 17–18 px editor titles;
- prototype-style tabs/section headers/field cards rather than legacy dark cards;
- real live values in all enabled controls;
- disabled/unavailable UI instead of fake values where capability is absent.

The old dark product editor appearance must not visibly dominate any accepted editor state.

## Functional invariants

- Selection still resolves the real `GameEditorDefinition`.
- Embedded editor lifecycle still uses `definition.mount()` / `GameEditorInstallation.destroy()`.
- `beforeClose()` remains honored for dirty drafts.
- Existing editor save/import/export/reset/activate/publish logic is untouched.
- No second editor store, product registry, runtime, or polling loop is added.
- Owner re-renders are handled through one scoped `MutationObserver` per mounted editor and are disconnected on teardown.

## Verification

### Programmatic

Add focused contract assertions for:

- exact prototype visible editor IDs/order on the Polygon shared surface;
- `behaviorGraph` and `soldierData` excluded only from that visible projection;
- disabled `Типы поверхностей` placeholder;
- parity adapter invoked for every supported embedded editor;
- real `GameEditorRegistry` and existing mounts remain owners;
- no fake surface-type editor/data owner is introduced.

Run the Polygon Six-X Integration Contract, TypeScript, and production build on the exact feature SHA.

### Visual

Use `.agents/skills/real-wargame-screenshots/SKILL.md`. Against the exact deployed feature SHA, capture and manually inspect at 1600×900:

1. `Профили маршрута`;
2. `Тактические позиции`;
3. `Архетипы бойцов`;
4. `Профили внимания`;
5. `Профили восприятия`;
6. `Профили движения`;
7. `Вооружение`;
8. `Ранения и подавление`;
9. disabled `Типы поверхностей` state/navigation;
10. `Профили местности`;
11. `Направленный рельеф`.

Fresh screenshots must belong to the exact observed product SHA. Key PNGs must be opened and compared with the accepted prototype, not merely generated by CI.

## Safety boundaries

- Work only on `feature/20260817-polygon-editor-inner-parity` for this correction.
- Do not overwrite concurrent work on `feature/20260817-polygon-six-x-integration`.
- Do not merge to `real-wargame-preview` or `main` without a separate explicit user command.
- Do not invent product capabilities or fake editor data.
