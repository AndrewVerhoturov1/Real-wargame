# Minimal Target Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal target-type visibility model where a sniper-sized source and a tank-sized source have different visual signatures, while existing terrain, objects and vegetation continue to obstruct the signal.

**Architecture:** Keep `VisualSignal` as the only place that combines size, posture, movement, action, concealment, distance, attention and LOS transmission. Add a small target-profile registry, store an optional target type on pressure-zone sources, pass the profile height into `computeLineOfSight`, and preserve the type in scene export. No new overlay or editor panel is added in this minimal version.

**Tech Stack:** TypeScript 5, Vite 5, existing smoke-test scripts, PixiJS 7 application architecture.

## Global Constraints

- Work only on `feat/minimal-target-visibility-temp`; do not transfer to `real-wargame-preview`.
- Keep Russian as the default human-facing language and English for code identifiers.
- Do not create a second visibility system; reuse `PerceptionSystem`, `VisualSignal` and `LineOfSight`.
- Do not recompute visibility because of camera or cursor movement.
- Keep old scenes compatible by defaulting missing target type to `soldier`.

---

### Task 1: Lock the behavior with a smoke test

**Files:**
- Modify: `scripts/perception_system_smoke.ts`

- [ ] Add assertions that a tank profile produces a larger `baseSize` and target height than a sniper profile.
- [ ] Add assertions that the same low obstacle blocks a prone-height target but not a tank-height target.
- [ ] Run `npm run perception:smoke` and confirm the new assertions fail before production code is added.

### Task 2: Add target profiles and persistence

**Files:**
- Create: `src/core/perception/PerceptionTargetProfile.ts`
- Modify: `src/core/pressure/PressureZone.ts`
- Modify: `src/ui/SceneExport.ts`

- [ ] Define `PerceptionTargetType` and stable profiles for `sniper`, `soldier`, `support_weapon`, `light_vehicle`, `armored_vehicle`, and `tank`.
- [ ] Store optional `sourceTargetType` on pressure-zone data and normalized runtime zones.
- [ ] Default old scenes to `soldier`.
- [ ] Export `sourceTargetType` so save/load round-trips preserve the setting.

### Task 3: Feed type and height into perception

**Files:**
- Modify: `src/core/perception/PerceptionStimulus.ts`
- Modify: `src/core/visibility/LineOfSight.ts`
- Modify: `src/core/perception/PerceptionSystem.ts`

- [ ] Resolve target profile when building a visible pressure-zone stimulus.
- [ ] Use target profile size as the existing `baseSize` factor.
- [ ] Add `targetHeightMeters` to the stimulus.
- [ ] Accept target height as an optional fourth `computeLineOfSight` argument, retaining the old 1.4 m default for unrelated callers.
- [ ] Pass stimulus height from `PerceptionSystem` into LOS.

### Task 4: Verify and report

- [ ] Run `npm run perception:smoke`.
- [ ] Run `npm run perception-variance:smoke`.
- [ ] Run `npm run visibility-probe:smoke`.
- [ ] Run `npm run build`.
- [ ] Compare the temporary branch against `real-wargame-preview` and report exact changed files and unverified items.
