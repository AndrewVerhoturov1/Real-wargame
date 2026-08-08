# Soldier Top-Down Rig Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current ad-hoc soldier renderer with the exact rig-and-primitives architecture from the supplied stylized 2D infantry prototype while preserving the existing Real Wargame public API.

**Architecture:** Copy the supplied `core/poses/prims/weapons/render` modules into `src/soldier-topdown/rig/` with no semantic simplification. Keep `SoldierRenderer.ts` as a small compatibility adapter that maps existing Real Wargame pose/weapon IDs and render options into the transferred rig API.

**Tech Stack:** TypeScript, Canvas 2D, Vite, Node smoke tests, Playwright/Chromium visual QA, Vercel preview.

## Global Constraints

- Preserve Real Wargame pose IDs: `idle`, `ready`, `walk`, `run`, `crouch`, `crouchMove`, `crouchRun`, `prone`, `proneAim`, `crawl`, `standAim`, `crouchAim`.
- Preserve weapon IDs: `mosin`, `ppsh41`, `dp27`.
- Preserve independent body, attention, and weapon directions.
- Preserve 24/32/48/64 px acceptance sizes.
- The rig must contain hip/chest/neck/head, shoulders/elbows/hands, hips/knees/feet, weapon anchor and weapon angle.
- Use the supplied prototype's simple geometric assembly rather than approximating its appearance with the old renderer.
- Deploy and visually verify the exact product SHA.

---

### Task 1: Transfer rig core and drawing primitives

**Files:**
- Create: `src/soldier-topdown/rig/core.ts`
- Create: `src/soldier-topdown/rig/prims.ts`

**Interfaces:**
- Produces: `createRig()`, `Rig`, `SoldierVisualState`, palette/diagnostic constants, and flat drawing primitives.

- [ ] Copy the supplied rig/core implementation.
- [ ] Copy the supplied primitive implementation.
- [ ] Run TypeScript compile/build and correct only integration-level import/type issues.

### Task 2: Transfer weapons and pose resolver

**Files:**
- Create: `src/soldier-topdown/rig/weapons.ts`
- Create: `src/soldier-topdown/rig/poses.ts`

**Interfaces:**
- Consumes: `Rig`, math helpers, primitive functions.
- Produces: `WEAPONS`, `buildRig()`.

- [ ] Copy Mosin, PPSh-41, and DP-27 visual definitions.
- [ ] Copy all supplied rig pose/animation resolvers.
- [ ] Verify the support hand remains attached through weapon-direction offsets.

### Task 3: Transfer renderer and add compatibility adapter

**Files:**
- Create: `src/soldier-topdown/rig/render.ts`
- Replace: `src/soldier-topdown/SoldierRenderer.ts`

**Interfaces:**
- Adapter continues to export `SOLDIER_POSES`, `SOLDIER_WEAPONS`, labels, `SoldierRenderState`, `SoldierRenderOptions`, and `drawSoldierTopDown()`.

- [ ] Copy supplied rig renderer.
- [ ] Add pose ID mapping from Real Wargame IDs to rig IDs.
- [ ] Add weapon ID mapping `ppsh41 -> ppsh`.
- [ ] Map diagnostics and preserve opacity.
- [ ] Expose `showSkeleton` as an optional joint diagnostic without breaking existing callers.

### Task 4: Strengthen smoke contract

**Files:**
- Modify: `scripts/soldier_topdown_prototype_smoke.mjs`

- [ ] Require all five transferred rig modules.
- [ ] Assert expected rig joint tokens exist.
- [ ] Assert compatibility mappings exist.
- [ ] Run smoke and ensure PASS.

### Task 5: Build and visual acceptance

**Files:**
- No product file changes unless a demonstrated rendering defect is found.

- [ ] Run project preview verification/build.
- [ ] Deploy exact SHA to Vercel preview following repository deployment rules.
- [ ] Run real Chromium QA against the deployed URL.
- [ ] Capture all poses, all three weapons, 24/32/48/64, eight directions, movement phases, prone/crawl phases, and skeleton diagnostics.
- [ ] Inspect screenshots visually and fix only concrete defects.
- [ ] Re-run build/deploy/QA if product SHA changes.
