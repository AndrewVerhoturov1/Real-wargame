# Journal — Soldier Perception and Attention v1

**Date:** 2026-07-12  
**Implementation branch:** `feat/perception-attention-v1-current-temp`  
**Preview base:** `ca3f2e71327f184ce2aaccbd3749ebd6da93944c`  
**Transfer to preview:** PR #70 merged as `5deb899673c7b6e57b9089ecf890699f6d617a9a`

## Delivered

- hybrid A+B attention with clear focus/direct/peripheral zones and smooth internal weights;
- march, observation, search and engagement modes;
- deterministic focus sweep and explicit search sectors;
- progressive visual transmission through forest while terrain and opaque objects remain blockers;
- named target-signal factors with Russian explanations;
- evidence accumulation through cue, suspicion, contact, identified and confirmed stages;
- memory decay, confidence loss and growing positional uncertainty;
- approximate sound-derived contacts without exact coordinates;
- objective physical suppression separated from subjective knowledge of the source;
- Blackboard values and three AI nodes for attention control;
- editable attention profiles in the game editor;
- selected-soldier runtime panel and cached PixiJS attention overlay;
- scene export/import support with backward-compatible defaults;
- headless behavior, performance and node smoke tests;
- real Chrome visual verification.

## Current-preview compatibility

The verified perception patch was reapplied to a clean branch created from the then-current `real-wargame-preview`. After integration, the temporary branch was `behind_by: 0` and retained the current compact route controls and navigation-profile changes.

## Core verification

Run `29200745354` succeeded on `feat/perception-attention-v1-current-temp`:

```text
npm run build
npm run perception:smoke
npm run perception-performance:smoke
npm run attention-ai-nodes:smoke
npm run runtime:smoke
npm run workspace:smoke
npm run game-editor:smoke
npm run visibility-probe:smoke
npm run dictionary:smoke
npm run lab:smoke
npm run docs:check
```

The performance smoke used 120 candidate sources and 600 simulation ticks. It checks that scheduled attention avoids running LOS for every candidate on every frame and that no selected soldier means no perception LOS work.

## Visual verification

Manual system-Chrome Playwright run `29200793922` succeeded on exact SHA:

```text
09209675b692e4d5b83666a272104ee4f452ebf2
```

Result: `3/3 passed`.

Inspected PNG files:

- `perception-attention-march.png`;
- `perception-attention-engage.png`;
- `perception-attention-search.png`;
- `perception-attention-profile-editor.png`;
- `perception-attention-node-controls.png`.

The verification also asserted that cursor-only movement while paused does not increment the attention-overlay rebuild counter and that the real browser console has no unexpected page, HTTP or console errors.

Artifact digests:

```text
screenshots: sha256:fa341383109f2028c80dbf96de116447189b5ff05b17113d008c3b476dd35b7e
log:         sha256:005becff57996330a2948ecd1d129d1c35e71799aaaa7f5215c5a5da2099e981
```

## Visual corrections made during QA

The browser loop caught and fixed issues that ordinary smoke tests did not reveal:

- hidden pause control in the automated scenario was replaced by the normal `P` shortcut;
- the profile editor was changed from overlapping two-column fields to a readable single-column layout;
- floating interval text such as `0.350000000...` was replaced with stable decimal formatting;
- friendly attention-node controls were moved outside the hidden technical JSON card;
- browser error tracking now ignores only the known missing favicon while preserving all other HTTP and console failures.

## Transfer to preview

PR #70 merged the verified implementation into `real-wargame-preview` as `5deb899673c7b6e57b9089ecf890699f6d617a9a`. The branch was `behind_by: 0` before merge, so the current compact route controls, navigation profiles and editor changes were preserved.

Fresh PR checks on `a560b9b92593ce2c2b280d364431bba7d3c4aec4` passed Preview Core, Navigation Profiles Core, Compact Route Controls Core, Command Plan Route Core, Preview Policy and Agent Docs Integrity before the merge. `main` was not changed.

## Honest v1 limits

- perception is calculated only for the selected soldier;
- pressure-zone sources are the main current visual stimuli;
- sound gives broad estimated contacts only;
- no commander contact-sharing chain exists yet;
- no complete enemy-unit combat side, optics, detailed night or weather model was added;
- no change was made to `main`;
- implementation is now canonical in `real-wargame-preview`; `main` was not changed.
