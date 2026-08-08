# Soldier Top-Down Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy an isolated interactive strict-top-down 2D Soviet infantry appearance prototype with readable poses, procedural movement and independent body/attention/weapon directions.

**Architecture:** A pure Canvas 2D renderer consumes immutable `SoldierRenderState` snapshots. A separate page owns UI state, animation timing and diagnostic controls. Production gameplay and simulation remain untouched.

**Tech Stack:** Vite 5, TypeScript 5, browser Canvas 2D, existing repository build/deployment tooling.

## Global Constraints

- Work only on `feature/20260808-soldier-topdown-appearance-codex`.
- Do not change, merge into or deploy `main` or `real-wargame-preview`.
- Strict 2D top-down only; no isometry, 3D or rendered sprite art.
- Required weapons: Mosin, PPSh-41, DP-27.
- Required sizes: 64, 48, 32, 24 px.
- Renderer displays passed state and never becomes gameplay truth.
- Browser visual QA is explicitly authorized by the user.
- Final exact feature HEAD must be manually deployed and verified.

---

### Task 1: Procedural soldier renderer

**Files:**
- Create: `src/soldier-topdown/SoldierRenderer.ts`

**Interfaces:**
- Produces: `SoldierPoseId`, `SoldierWeaponId`, `SoldierRenderState`, `SoldierRenderOptions`, `drawSoldierTopDown(ctx, state, options)` and pose/weapon metadata arrays.

- [ ] Define all 12 required pose IDs and 3 weapon IDs.
- [ ] Define explicit body skeleton resolver returning head, shoulder, hip, knee and foot anchors per pose and animation phase.
- [ ] Use separate solvers for stand/ready/walk/run/crouch/crouchMove/crouchRun/prone/proneAim/crawl/standAim/crouchAim.
- [ ] Keep body, attention and weapon angles independent.
- [ ] Draw legs first, torso/pack, arms attached to weapon grip points, head/helmet and weapon silhouette.
- [ ] Add Mosin long-thin geometry, PPSh short-heavy geometry with drum and DP-27 long-heavy geometry with exaggerated pan magazine.
- [ ] Add optional bounded diagnostic body/attention/weapon lines and attention sector.

### Task 2: Interactive demonstration page

**Files:**
- Create: `soldier-topdown-prototype.html`
- Create: `src/soldier-topdown/SoldierPrototypePage.ts`
- Create: `src/soldier-topdown/soldier-topdown-prototype.css`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: renderer exports from Task 1.
- Produces: `/soldier-topdown-prototype.html` multi-page Vite entry.

- [ ] Add Gallery and Interactive Range tabs.
- [ ] Gallery renders all 12 poses, eight-direction comparison, weapon comparison and 64/48/32/24 size matrix.
- [ ] Interactive range exposes pose, weapon, body direction, attention direction, weapon direction, size, diagnostics and pause controls.
- [ ] Add scene presets: eight directions, weapon lineup, low movement, prone/crawl and split directions.
- [ ] Use one bounded requestAnimationFrame loop; do not create DOM or Canvas objects per frame.
- [ ] Add build identity text from `__REAL_WARGAME_BUILD_IDENTITY__` for deployed SHA verification.
- [ ] Add the HTML file to Vite Rollup inputs without altering existing production entries.

### Task 3: Focused contract smoke

**Files:**
- Create: `scripts/soldier_topdown_prototype_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces npm script: `soldier-topdown-prototype:smoke`.

- [ ] Assert prototype HTML, renderer and page controller exist.
- [ ] Assert all 12 pose IDs and three weapon IDs appear in renderer source.
- [ ] Assert Vite input includes `soldier-topdown-prototype.html`.
- [ ] Assert page source exposes body, attention and weapon direction controls plus the four required sizes.

### Task 4: Repository and build verification

- [ ] Review exact feature diff and confirm no protected branch operations.
- [ ] Run `npx tsc --noEmit` through the available repository verification route.
- [ ] Run `npm run soldier-topdown-prototype:smoke` through the available repository verification route.
- [ ] Run `npm run build` through the available repository verification route.
- [ ] Record any inherited base failures separately from feature regressions.

### Task 5: Visual QA

- [ ] Load the real prototype in a controlled browser.
- [ ] Inspect every main pose at large scale and around 32 px.
- [ ] Check 0/45/90/135/180/225/270/315-degree orientations.
- [ ] Capture multiple animation phases for walk, run, crouch move, crouch run and crawl.
- [ ] Inspect prone, prone aim, crawl and DP-27 especially closely.
- [ ] If anatomy or weapon attachment is doubtful, revise renderer on the same feature branch and repeat focused checks.

### Task 6: Manual exact-SHA Vercel Preview

- [ ] Read and follow `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`.
- [ ] Resolve exact final feature HEAD.
- [ ] Publish only that SHA through an authenticated manual route to permanent project `repo`.
- [ ] Confirm deployment status `READY`, `/`, `/ai-node-editor.html`, `/deployment-source.json` and `/soldier-topdown-prototype.html`.
- [ ] Run deployed-Preview browser QA using the direct browser route or `vercel-deployment-playwright-e2e` fallback.
- [ ] Confirm observed build identity matches deployed feature SHA.
