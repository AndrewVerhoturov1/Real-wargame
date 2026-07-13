# Attention profiles, movement facing, and threat stability — 2026-07-13

## Delivered

- machine-gun and directional-fire geometry is held in a persistent PixiJS container;
- volatile current confirmation is drawn by a separate marker layer;
- the stable geometry key excludes `visibleNow`, so seeing and losing sight of the source does not destroy and recreate the whole threat graphic;
- the «Обзор и память» list is the union of live perception contacts and tactical threat memory, deduplicated by threat id, so the «Пулемёт» label does not disappear during the live-to-memory transition;
- a moving unit faces the active route waypoint before every movement step, while the explicitly requested final facing still wins after arrival;
- named attention profiles are available in the selected-unit card and in a dedicated editor tab;
- built-in profiles: Balanced, Cautious, Observer, Searcher, Combat;
- custom profiles support create, copy, rename, delete, reset, import, export, and browser persistence;
- manual raw attention edits switch the unit to an Individual profile state;
- the bottom selected-unit card uses contained responsive layouts at desktop and narrow desktop widths.

## Compatibility

Scene export keeps the optional selected attention-profile id and also exports the concrete attention settings. Old scenes without profile ids continue to load as individual settings. Route lifecycle events remain authoritative; turning during movement does not overwrite route completion or blocked events.

## Performance

The threat geometry layer is rebuilt only when stable geometry or bucketed confidence changes. Current confirmation updates only a small Graphics marker. The bottom-panel changes are CSS layout changes and do not add per-frame simulation work.

## Verification

Code SHA: `02a43f233d1618b7b8b2331869d34e9b12bbec9e`.

- run `29216834976`: all focused behavioral smokes, workspace, routed movement, perception, runtime scene, node editor, documentation and production build passed;
- the same run completed the full system-Chrome regression covering the new scenarios plus existing turn, final-facing and compact-route controls;
- manually inspected PNGs:
  - `attention-fix-stable-machine-gun-and-label.png`;
  - `attention-fix-moving-unit-faces-route.png`;
  - `attention-fix-profile-editor.png`;
  - `attention-fix-compact-unit-bar-1440.png`;
  - `attention-fix-compact-unit-bar-1180.png`;
  - existing visibility and route-control regression screenshots.

## Honest limits

- attention profiles are global browser profiles, not yet shared through an in-game commander chain;
- movement rotation is immediate toward the active segment rather than animated with a finite body-turn rate;
- the machine-gun source remains a pressure-zone/threat representation, not a full projectile weapon simulation.
