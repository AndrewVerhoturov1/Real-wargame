# Journal — View and Memory Heatmap v1

**Date:** 2026-07-13  
**Implementation branch:** `feat/view-memory-heatmap-temp`  
**Preview transfer:** not performed

## Delivered in the temporary branch

- physical attention sweep removed from march, observe and search;
- march direction follows the soldier without hidden circular scanning;
- observe uses stable wide probabilistic coverage;
- search uses a fixed selected sector;
- meter-based maximum view range and smooth distance falloff;
- cell visibility quality separated from target salience;
- cached static terrain/object/forest visibility grid;
- selected-soldier cell heatmap stored in `Uint8Array`;
- terrain horizon, object height and forest transmission shadows;
- strict field cache key and moving rebuild throttle;
- small deterministic contact variance, preserved across save/load and independent from FPS;
- old knowledge remains contact markers with confidence decay and uncertainty growth;
- the existing memory tab is now the single `Обзор и память` tab; no duplicate attention tab is added;
- PixiJS heatmap rendered as one nearest-neighbor raster sprite;
- scene export v8 stores vision settings;
- Russian editor controls for distance, falloff and variance;
- behavior, performance, editor and production-build smoke coverage.

## Optimization contract

- hidden layer performs zero field builds;
- no selected soldier performs zero field builds;
- cursor and camera movement are absent from the calculation key;
- unchanged observer/map state reuses the exact cached field;
- quality storage costs one byte per cell;
- movement rebuilds are limited to roughly five per second;
- heatmap construction does not call exact target LOS;
- one field revision causes at most one texture upload;
- no PixiJS display object is created per cell.

## Automated evidence so far

Specialized validation run `29208222819` succeeded on the synchronized implementation tree:

```text
npm run view-memory-heatmap:smoke
npm run view-memory-heatmap-performance:smoke
npm run perception:smoke
npm run perception-variance:smoke
npm run perception-performance:smoke
npm run attention-ai-nodes:smoke
npm run workspace:smoke
npm run game-editor:smoke
npm run build
npm run docs:check
```

The performance smoke includes an explicit CI budget of at most `120 ms` for the first field build on a `180×120` test map, plus idle cache and movement-throttle assertions.

## Regression findings and corrections

Expanded regression run `29208268840` passed the new heatmap, perception, runtime and runtime-session checks, then stopped at `runtime-snapshot:smoke`. Root-cause inspection showed that runtime restore itself was not broken: the smoke test still pinned the old scene-export v7 identifier after the intentional move to v8.

The runtime snapshot and runtime scene contracts now expect `scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid` and additionally verify that `maximumVisualRangeMeters` and `distanceFalloffStartMeters` survive the scene export/import path. No runtime implementation was weakened or bypassed.

A later full regression reached `lab:smoke` and exposed both its remaining v7 text contract and a UI integration risk: Tactical Workspace still owned a separate memory tab while the new panel initially appended another tab. The final design reuses the existing `memory` tab, renames it to `Обзор и память`, keeps the old subjective memory map layer, and opens the current-view heatmap and contact controls in that same tab.

A dedicated workspace diagnostic then identified that an earlier one-line Playwright edit had accidentally replaced `tests/preview-screenshots.spec.ts` with a partial copy. The unchanged node-editor and newly placed fighter scenarios were restored from current preview, while the intended `Обзор и память` title assertion was retained.

## Final verification

Full expanded validation run `29208942691` succeeded after all compatibility corrections. It covered the new heatmap, performance and variance tests plus runtime sessions/snapshots/scenes, events, movement, routes, navigation profiles, map revisions and caches, workspace, game editor, dictionary, lab, production build and generated documentation.

Exact system-Chrome run `29209032782` succeeded on SHA `923fdde44d15d447b01178ce1430e2c68f11a215`. Playwright result: `20/20 passed` in `10.6 minutes`; 29 PNG files were produced.

Manually inspected:

- `view-memory-heatmap-march.png`;
- `view-memory-heatmap-engage.png`;
- `view-memory-heatmap-search.png`;
- `view-memory-profile-editor.png`;
- `view-memory-node-controls.png`;
- `06-simulation-memory-layer.png`;
- `10-node-editor-unchanged.png`;
- `11-editor-spawned-fighter-playable.png`.

The inspected result has a readable cell heatmap, no moving focus ray, one unified `Обзор и память` tab, readable editor controls, preserved node editor layout and a playable newly placed fighter. Automated browser assertions also proved that cursor and camera movement do not rebuild the field or upload a new texture.

Artifact digests:

```text
screenshots ZIP: sha256:8c95e130d0e78bedd65a6a3d3bcc8106d830fd0d10f29dfba8757f5ff3f93310
Playwright ZIP:  sha256:aea297c9140b5985451653293a4a66985a467882aef80f3763dd8f29b80b41a5
raw log:        sha256:a42647a2d7c8f384e260aecfd321c28865710d104448ccb26b961f3be2117782
```

No transfer to `real-wargame-preview` or `main` was performed.

## Honest v1 limits

- the field is calculated only for the selected soldier;
- field construction is synchronous but cached, quantized and throttled;
- exceptionally large future maps may require a background incremental builder;
- full enemy combat units, commander contact sharing, optics, detailed night and weather are outside this version;
- no change has been made to `real-wargame-preview` or `main`.

## Final synchronized verification

Current preview navigation changes were merged into the temporary branch as `d9f0c1ca7bc649de46eba473fd6784ab1c93237b`. Full expanded validation run `29209735946` succeeded on that synchronized tree.

The final system-Chrome run `29209822972` then succeeded on exact SHA `c0e790553f6d048f8bf8391260c833ae258b78cd`: `20/20 passed` in `10.5 minutes`, with 29 PNG files. The same key views were reopened manually and remained readable after synchronization.

Final artifact digests:

```text
screenshots ZIP: sha256:604f405f7de1ec8b2c1d57dc563ef65fd5d5bcc94b478d13ef676fd7ce91df46
Playwright ZIP:  sha256:1b7231d65ad8edf9340d46c26e908b4df78d957907b5bc8c21758540b09ba8b5
raw log:        sha256:97ef4cd304a446fd414a1a3dcbcb6b99bd340bf7cb0b15805ecc02fef769b777
```

After this run, `real-wargame-preview` advanced by one documentation-only commit adding `ideas/GOOD_POSITIONS_AND_AMBUSH_SITES.md`. No game, UI, runtime or test code changed, so the exact-SHA browser result remains valid for the implementation. That document should be pulled before a future transfer.

No transfer to `real-wargame-preview` or `main` was performed.
