# Soldier Top-Down Rig Transfer Design

## Goal

Replace the current ad-hoc top-down soldier geometry with the exact rig-and-primitives architecture from the user-supplied `stylized-2d-infantry-prototype` while preserving the existing Real Wargame prototype API, pose set, diagnostics, and weapon names.

## Source of truth

The supplied prototype's `src/soldier/` implementation is the visual source of truth:

- `core.ts`: pooled 2D rig with hip/chest/neck/head; shoulders/elbows/hands; hips/knees/feet; weapon anchor and weapon angle.
- `poses.ts`: pose resolver and animation cycles operating on that rig.
- `prims.ts`: flat geometric drawing primitives.
- `weapons.ts`: Soviet Mosin, PPSh-41, and DP-27 silhouettes.
- `render.ts`: rig -> primitive assembly and diagnostics.

These modules are transferred as the rendering core rather than reimplemented approximately.

## Compatibility layer

`src/soldier-topdown/SoldierRenderer.ts` remains the public API used by the existing prototype page. It maps Real Wargame identifiers to the transferred rig identifiers:

- `crouch` -> `crouch_idle`
- `crouchMove` -> `crouch_walk`
- `crouchRun` -> `crouch_run`
- `proneAim` -> `prone_aim`
- `standAim` -> `aim_stand`
- `crouchAim` -> `aim_crouch`
- `ppsh41` -> `ppsh`

Body, attention, and weapon directions remain independent. Sizes 24/32/48/64 remain supported.

## Rendering behavior

The transferred renderer builds the body from the same simple primitives as the supplied prototype: capsules for limbs, rounded blobs for torso, ovals/discs for boots/head/hands, and separate weapon geometry attached to rigged hands. The Soviet muted palette and recognisable weapon silhouettes are retained.

## Diagnostics

Existing Real Wargame diagnostics remain available. A joint/skeleton diagnostic option is exposed so the transferred rig can be visually inspected directly during acceptance.

## Acceptance

1. Smoke test confirms all rig modules exist and the expected joints are present in `createRig()`.
2. TypeScript/Vite build passes.
3. Existing 12 Real Wargame pose IDs render through the adapter.
4. Mosin, PPSh-41, and DP-27 render distinctly.
5. Real browser screenshots cover all poses, 24/32/48/64 px, eight directions, movement phases, prone/crawl phases, and skeleton/joint diagnostics.
6. The exact tested SHA is deployed to Vercel preview.
