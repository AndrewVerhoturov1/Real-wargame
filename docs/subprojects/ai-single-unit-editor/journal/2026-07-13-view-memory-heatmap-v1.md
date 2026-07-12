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
- layer renamed to `Обзор и память`;
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

## Pending before handoff

- expanded full preview-core regression;
- real system-Chrome Playwright run;
- manual inspection of key screenshots;
- final exact commit/run identifiers in canonical metadata.

## Honest v1 limits

- the field is calculated only for the selected soldier;
- field construction is synchronous but cached, quantized and throttled;
- exceptionally large future maps may require a background incremental builder;
- full enemy combat units, commander contact sharing, optics, detailed night and weather are outside this version;
- no change has been made to `real-wargame-preview` or `main`.
