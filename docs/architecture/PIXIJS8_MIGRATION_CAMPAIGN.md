# PixiJS 8 Migration Campaign and Operational Handoff

## Status summary

The production rendering code on `real-wargame-preview` has been migrated from PixiJS `7.4.3` to PixiJS `8.19.0` and the accepted specialist changes have been integrated.

Two statuses must remain separate:

1. **Code migration status:** the PixiJS 8 implementation and its non-browser contracts were integrated and passed the recorded acceptance sequence in PR #119.
2. **User-PC launch status:** the canonical Windows launcher is still blocked on the user's machine by an `npm EPERM unlink` failure involving Rollup's native Windows module. PRs #120–#123 attempted to make dependency refresh more resilient, but the reported blocker remains open.

Do not describe the launcher as fixed, do not claim that the game starts on the user's PC, and do not treat the incomplete browser attempt as successful visual QA.

## Campaign chronology

| PR | Role | Result |
|---|---|---|
| [#115](https://github.com/AndrewVerhoturov1/Real-wargame/pull/115) | PixiJS 8 foundation | Updated `pixi.js` from `7.4.3` to `8.19.0`, introduced asynchronous `Application.init()`, migrated active rendering APIs, and established the accepted foundation commit `65e6860c1f6b996b570fb7bbc24f3d2deb025ef4`. |
| [#116](https://github.com/AndrewVerhoturov1/Real-wargame/pull/116) | Baseline contracts and Application lifecycle | Replaced fixed-file legacy checks with a recursive TypeScript-AST production scan and added per-Application-binding validation for awaited initialization, WebGL preference, `canvas` use, and deprecated `view` rejection. The accepted commits were later integrated by #119. |
| [#117](https://github.com/AndrewVerhoturov1/Real-wargame/pull/117) | Vector and Text semantics | Restored persistent stroke intent after the mechanical v8 conversion, batched compatible subpaths, preserved Text outline joins, and added focused source contracts. The accepted commit was later integrated by #119. |
| [#118](https://github.com/AndrewVerhoturov1/Real-wargame/pull/118) | Raster lifecycle and teardown | Hardened async bootstrap failure cleanup, ticker/Worker/texture ownership, mutable raster sources, nearest sampling, recreation keys, and idempotent destruction. The accepted commit was later integrated by #119. |
| [#119](https://github.com/AndrewVerhoturov1/Real-wargame/pull/119) | Preview integration | Composed the accepted #116–#118 results on top of #115, resolved the shared smoke-contract edits without weakening checks, ran the recorded non-browser acceptance sequence, and merged the migration into `real-wargame-preview` as `699f745fb76a8858a8d1114d2bf843761ccc82a7`. |
| [#120](https://github.com/AndrewVerhoturov1/Real-wargame/pull/120) | Launcher dependency refresh | Made launchers detect a missing or inconsistent install and run `npm ci` before startup. This did not close the later native-module lock failure. |
| [#121](https://github.com/AndrewVerhoturov1/Real-wargame/pull/121) | Stale dev-server cleanup | Added process-tree cleanup for stale project dev servers before dependency refresh. The user's later Rollup lock still reproduced. |
| [#122](https://github.com/AndrewVerhoturov1/Real-wargame/pull/122) | Project process cleanup | Added targeted termination of project-owned `node.exe` and `esbuild.exe` processes before `npm ci`. The user's later Rollup native module remained locked. |
| [#123](https://github.com/AndrewVerhoturov1/Real-wargame/pull/123) | Locked-module fallback | Kept deterministic `npm ci` as the first path and added `npm install` fallback when removal of a native module is blocked. The user still reports the same `EPERM unlink` class of failure, so this is an attempted mitigation, not a verified repair. |

The specialist PRs #116–#118 remain historical review surfaces. Their accepted commits are already represented in the integrated preview result from #119; their open PR state must not be interpreted as missing production integration.

## Current PixiJS 8 architecture

### Application startup

The tactical board uses the PixiJS 8 asynchronous startup contract:

```ts
const app = new Application();
await app.init({
  preference: 'webgl',
  // renderer options
});
```

Required invariants:

- construct with `new Application()` and await the matching `app.init(...)`;
- include WebGL in the production renderer preference;
- attach and use `app.canvas`, not the deprecated v7-era `app.view` alias;
- clean up a partially initialized Application when `init()` rejects;
- do not start the simulation ticker until initialization and object construction have completed.

### Graphics and Text

Active rendering code uses the PixiJS 8 Graphics and Text surfaces:

- define paths/shapes first, then finalize with `fill()` and/or `stroke()`;
- preserve persistent stroke intent explicitly when multiple independent subpaths share a style;
- use v8 Text option objects and v8 stroke style objects;
- preserve required outline join semantics, including round joins where the previous visual contract depended on them;
- do not reintroduce v7 calls such as `beginFill`, `endFill`, legacy `lineStyle` overloads, or active v7 compatibility aliases.

Historical documents may still describe PixiJS 7 behavior as historical context. They must not be rewritten to imply that those APIs remain current production guidance.

### Mutable raster textures

Dynamic awareness, visibility, route-cost, relief, and related raster layers follow explicit source ownership:

- create a texture from an owned mutable `TextureSource`;
- mutate the owned byte buffer or source resource;
- call `source.update()` after mutation so PixiJS uploads the new pixels;
- retain nearest-neighbor sampling where cell boundaries must remain crisp;
- destroy owned sprite, texture, and texture source exactly once;
- reset keys and references needed for deterministic recreation after teardown.

### Runtime ownership and teardown

Lifecycle ownership is explicit and teardown is idempotent:

- the tactical board owns its ticker callback and removes it during destruction;
- asynchronous bootstrap failure cleans up any partially created Pixi Application;
- renderers that create Workers, timers, textures, texture sources, sprites, diagnostics, or cached resources destroy only what they own;
- repeated `destroy()` calls are harmless;
- the Application is stopped and destroyed only after child renderers and input/overlay owners have released their resources.

### Core boundary

`src/core/**` remains renderer-independent:

```text
src/core must not import pixi.js, @pixi/*, DOM rendering helpers, or renderer-owned state
```

Pixi renderers display simulation state. They do not become the source of truth for simulation, AI, navigation, tactical knowledge, or map data.

## Contracts and verification surfaces

### Recursive AST baseline

`npm run workspace:smoke` includes the PixiJS 8 production baseline in `scripts/tactical_workspace_smoke_pixijs8_baseline.mjs`.

The contract recursively scans active `src/**` TypeScript production code with the TypeScript AST rather than relying on a fixed renderer-file list or raw text matching. Its responsibilities include:

- reject active legacy Graphics, cache, texture, renderer, and split-package APIs;
- reject PixiJS imports inside `src/core/**`;
- require the declared PixiJS 8 dependency baseline;
- track supported direct identifier bindings created by `new Application()`;
- require each tracked Application binding to have its own awaited `init()`;
- require each matching initialization to include WebGL preference;
- reject `.view` and `['view']` on tracked Application receivers while allowing unrelated domain properties named `view`;
- require the accepted mutable texture-source update pattern.

The Application analysis is intentionally a deterministic supported-pattern contract, not arbitrary interprocedural control-flow analysis.

### Vector and Text contract

`npm run workspace:smoke` also runs `scripts/tactical_workspace_smoke_vector_semantics.mjs`. It protects the accepted v8 fill/stroke sequencing, persistent vector outlines, batching assumptions, and Text outline join semantics.

### Raster lifecycle contract

`npm run navigation-overlay:smoke` includes `scripts/pixijs8_raster_lifecycle_contract_smoke.mjs`. It protects the accepted mutable source update, nearest sampling, Worker/timer ownership, recreation, and idempotent teardown patterns for the relevant raster renderers.

### Key non-browser commands

The migration acceptance record used the relevant subset of these commands:

```bash
npm ci
npm run build
npm run workspace:smoke
npm run editor:smoke
npm run game-editor:smoke
npm run map-grid-lod:smoke
npm run navigation-overlay:smoke
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
npm run combat-foundation:smoke
npm run combat-tactical-integration:smoke
npm run danger-layer-performance:smoke
npm run danger-layer-movement-performance:smoke
npm run visual-qa-policy:smoke
npm run docs:sync
npm run docs:smoke
git diff --check
```

A historical PR description records what was run for that PR. It does not prove that the same command was run on a later commit or on the user's Windows machine.

## Visual QA status

Current honest status:

```text
non_browser_migration_checks: passed in the recorded migration integration
visual_qa_approval: approved by the user
local_vite_server: started in the execution environment used for the browser attempt
cloud_browser_to_local_127_0_0_1: blocked by environment isolation
fresh_pngs_from_integrated_pixijs8_result: not produced and inspected
visual_qa_run: not run
```

The browser attempt did not complete because the browser environment could not reach the locally running Vite server at `127.0.0.1`. This is an infrastructure isolation result, not a rendering pass or failure.

Visual QA may be called complete only after the real application runs in a real browser, fresh PNGs are captured from the tested commit, the artifact/test SHA matches, and the key PNGs are opened and inspected. Until then, do not claim that vector rendering, raster updates, camera/input behavior, editor handles, or combat effects are visually verified under PixiJS 8.

## Open Windows operational blocker

After PRs #120–#123, the user still reports the launcher failing while dependency refresh tries to remove Rollup's native Windows binary.

Observed symptom:

```text
npm error code EPERM
npm error syscall unlink
npm error path ...\Real-wargame-preview\node_modules\@rollup\rollup-win32-x64-msvc\rollup.win32-x64-msvc.node
npm error errno -4048
```

Interpretation boundaries:

- the failure is an operational dependency-lock or filesystem-access blocker on the user's Windows machine;
- it is not evidence that the PixiJS 8 TypeScript migration is incorrect;
- successful repository builds or smokes in another environment do not prove that this local lock is resolved;
- merged launcher mitigations do not prove success until the canonical launcher completes on the affected machine;
- no documentation should say “launcher fixed”, “local launch passed”, or “game starts on the user's PC” while this symptom remains.

Possible owners of the lock include a remaining project process, shell/IDE integration, antivirus or security scanning, indexing, backup software, or another filesystem handle. This list is diagnostic context only; the locking process has not yet been identified from evidence.

## Handoff and blocker-closure evidence

### Completed

- PixiJS dependency baseline is `8.19.x`.
- The accepted #115 foundation and #116–#118 specialist results are integrated in preview through #119.
- Active production code uses the accepted Application, Graphics/Text, mutable raster, ownership, and core-boundary contracts.
- The recorded migration integration passed its non-browser acceptance sequence.
- Visual QA requirements and planned evidence are defined.

### Still required on a real Windows machine

1. Synchronize the local preview folder to the exact `real-wargame-preview` commit being tested.
2. Run the canonical `Run-Real-Wargame-Lab.bat` launcher normally.
3. Confirm whether dependency reconciliation completes without the Rollup `EPERM unlink` error.
4. Confirm that Vite reports a ready local URL and that the launcher opens the real application route.
5. Exercise the real tactical board and the relevant editor/lab surfaces in a real browser.
6. Capture and inspect fresh PNG evidence from the same tested commit.

### Minimum signs of a successful local launch

All of the following are required:

- the launcher exits dependency refresh without an unhandled npm error;
- no `EPERM unlink` line is present for the Rollup native module;
- Vite reports that the server is ready and provides the expected local URL;
- the browser opens the real Real-Wargame application rather than an error page or directory listing;
- the tactical canvas is visible and interactive;
- no fatal bootstrap error is shown in the HUD or browser console;
- the tested local folder is confirmed to contain the intended preview commit.

### Evidence needed to close the Windows blocker

Provide the smallest complete evidence set:

- exact tested commit SHA;
- complete launcher output from startup through success or failure, not only the final line;
- the full npm error block when failure persists, including `code`, `syscall`, affected path suffix, and errno;
- whether the `npm ci` path and the `npm install` fallback each started, succeeded, or failed;
- a screenshot of the final launcher window;
- on success, a screenshot of the real browser showing the tactical board and visible local URL;
- on visual-QA closure, fresh named PNGs plus the matching tested SHA and a note confirming that the key frames were opened and inspected.

Until that evidence exists, the correct final status remains:

```text
pixijs8_code_migration: integrated
windows_launcher_blocker: open
user_pc_launch_verified: no
visual_qa_run: not run
```
