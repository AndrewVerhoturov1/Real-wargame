# Soldier Top-Down Appearance Prototype — Design

## Goal

Create an isolated interactive Vite page for evaluating readable Soviet WWII infantry figures in strict top-down 2D. The prototype is a visual decision tool, not an integration into production gameplay.

## Visual language

- Flat procedural figures built from rounded geometric primitives.
- Human readability comes from silhouette and joint placement, not detailed uniforms.
- Muted Soviet khaki, darker trousers/boots/outline, simple helmet with a subtle front cue.
- Head, shoulders, limbs and weapons are intentionally enlarged for 24–48 px gameplay readability.
- Mosin, PPSh-41 and DP-27 differ by length, mass and magazine silhouette; DP-27 uses an exaggerated pan magazine.
- Optional soft contact shadow only; no perspective, 3D or pseudo-3D volume.

## Pose model

The renderer consumes a `SoldierRenderState` snapshot containing pose, animation phase, weapon type, body direction, attention direction, weapon direction, size and diagnostic flags. The renderer never owns simulation truth.

Required poses:

1. idle standing
2. ready standing
3. walking
4. running
5. crouched idle
6. crouched movement
7. crouched run
8. prone
9. prone aiming
10. crawling
11. standing aim
12. crouched aim

Each pose resolves to an explicit top-down skeleton: shoulders, hips, head anchor, elbows, knees and feet. Moving poses use bounded periodic phase functions. Prone/crawl are separate elongated body configurations rather than scaled standing poses.

## Direction model

Body, attention and weapon directions are independent absolute angles. Body geometry rotates with body direction. Head offset/front cue rotates toward attention. Weapon is laid out on its own axis; hands attach to weapon grip points and arms connect those grips to body shoulders.

## Weapons

- Mosin: long narrow stock/barrel.
- PPSh-41: shorter, wider receiver, prominent drum magazine.
- DP-27: long heavy receiver/barrel, large top-view pan magazine and optional bipod cue.

The weapon geometry is intentionally oversized enough to survive at 24–32 px.

## Prototype page

`/soldier-topdown-prototype.html`

Two modes:

### Gallery

- All required poses visible together.
- Static diagnostic labels only outside the soldier silhouette.
- Direction strip covering 0/45/90/135/180/225/270/315 degrees.
- Weapon comparison strip.
- Size matrix for 64/48/32/24 px.

### Interactive range

- One primary controlled soldier plus contextual PPSh and DP comparison soldiers.
- Controls for pose, weapon, body direction, attention direction, weapon direction and size.
- Pause/resume procedural animation.
- Optional body/attention/weapon diagnostic guides and attention sector.
- Preset scenes for eight directions, weapon comparison, low movement, prone/crawl and split body/attention/weapon directions.

## Animation

One `requestAnimationFrame` loop updates only time/phase and redraws canvases that need animation. Geometry objects are not added to the DOM per frame. Walk, run, crouch move, crouch run and crawl use different phase solvers.

Human-mechanics constraints:

- legs alternate in opposition;
- knees remain between hips and feet;
- arms remain attached to shoulders and weapon grips;
- head movement is bounded and tied to torso lean rather than free floating;
- crawl alternates elbows/knees and uses a distinct elongated body shape;
- silhouette center remains stable across phase transitions.

## Performance review

- hot path: polygon canvas redraw and optional animated gallery preview
- worst-case complexity: O(number of visible soldiers) per animation frame; no map scans
- main-thread work: small fixed-count Canvas 2D path drawing
- full-map work: none
- shared prepared result: static pose/weapon definitions and palette constants
- invalidation identity: local UI state only; no simulation revisions
- worker/queue budget: none required
- cache memory bound: constant; no growing cache
- teardown: cancel animation frame and remove event listeners on page unload
- measurement plan: functional smoke + visual browser checks at 24/32/48/64 px and multiple animation phases

## Verification

- TypeScript: `npx tsc --noEmit`
- focused contract check for the prototype page and required pose/weapon declarations
- production build: `npm run build`
- real-browser visual QA of local/Preview page for all key poses, sizes, directions and multiple phases
- final Vercel Preview must prove exact feature commit identity and report `READY`

## Scope boundaries

Do not integrate into production unit rendering, simulation, AI, map/editor systems, `main`, or `real-wargame-preview`. No PR is required for this task.