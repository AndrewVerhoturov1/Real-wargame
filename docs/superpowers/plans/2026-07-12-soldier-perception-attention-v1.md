# Soldier Perception and Attention v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic selected-soldier perception system where physical LOS, target signal, smooth hybrid attention zones, accumulated contact evidence and subjective memory are separate, editable and explainable.

**Architecture:** Pure modules under `src/core/perception/` own attention, stimuli, signal evaluation, contact accumulation and scheduled updates. Existing LOS gains compatible transmission diagnostics; existing threat memory and Blackboard consume subjective contacts instead of treating editor visibility flags as automatic discovery. PixiJS and DOM only display or edit the core state.

**Tech Stack:** TypeScript 5.5, Vite 5 SSR smoke runners, PixiJS 7.4, existing selected-soldier AI Runtime, current map revisions and spatial index.

## Global Constraints

- Work on `real-wargame-preview` unless the user explicitly requests an isolated task branch.
- Never modify `main`, open a PR to `main`, merge, or enable auto-merge.
- Canonical code, file names, serialized keys, tests and commit messages are English.
- Every human-facing label and explanation has a complete Russian version; Russian remains the default UI.
- The user must not edit TypeScript, JSON or technical keys for normal configuration.
- Core perception modules must not import PixiJS, DOM, localStorage or editor modules.
- Subjective soldier knowledge must not reveal objective pressure-zone source data before a contact or report exists.
- `SimulationTick.ts` remains the only coordinate integrator.
- Perception is not calculated every animation frame.
- v1 processes only the selected soldier; do not claim whole-army perception.
- Keep existing `computeLineOfSight()` callers source-compatible.
- Use deterministic evidence accumulation; do not add repeated random spotting rolls.
- Reuse current map revisions, LOS sampling and spatial index; do not create a second geometry system.
- Attention profiles are persistent settings. AI nodes select modes but do not contain profile coefficients.
- Existing scene JSON remains backward-compatible through normalization defaults.
- Every task follows RED → minimal implementation → focused checks → build → commit.
- For visible changes, prepare Playwright coverage and expected PNG files, but do not run browser visual QA before explicit approval.
- At the visual gate ask exactly: `Визуальная проверка подготовлена. Запустить её сейчас?`

---

## Locked file structure

### New pure modules

```text
src/core/perception/AttentionModel.ts
src/core/perception/AttentionController.ts
src/core/perception/PerceptionStimulus.ts
src/core/perception/VisualSignal.ts
src/core/perception/PerceptionContact.ts
src/core/perception/PerceptionSystem.ts
src/core/perception/PerceptionSound.ts
src/core/perception/PerceptionDiagnostics.ts
```

### New UI/rendering modules

```text
src/ui/AttentionProfileControls.ts
src/rendering/PixiAttentionOverlayRenderer.ts
```

### Existing integration points

```text
src/core/behavior/BehaviorModel.ts
src/core/units/UnitModel.ts
src/core/simulation/SimulationTick.ts
src/core/visibility/LineOfSight.ts
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/UnitKnowledge.ts
src/core/pressure/ThreatEvaluation.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiGraph.ts
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiConceptOperations.ts
src/core/ai/AiConceptValues.ts
src/core/editor/GameEditorDrafts.ts
src/core/ui/RuntimeUiState.ts
src/ui/GameEditorWorkbench.ts
src/ui/TacticalWorkspace.ts
src/rendering/PixiApp.ts
src/ui/SceneExport.ts
```

---

### Task 1: Attention and contact data contracts

**Files:**
- Create: `src/core/perception/AttentionModel.ts`
- Create: `src/core/perception/PerceptionContact.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`
- Modify: `src/core/units/UnitModel.ts`
- Create: `scripts/perception_attention_model_smoke.ts`
- Create: `scripts/perception_attention_model_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export type AttentionMode = 'march' | 'observe' | 'search' | 'engage';
export type AttentionZone = 'focus' | 'direct' | 'peripheral';
export type AttentionModeSource = 'automatic' | 'ai' | 'player';

export interface AttentionModeProfile {
  focusAngleDegrees: number;
  directAngleDegrees: number;
  focusWeight: number;
  directWeight: number;
  peripheralWeight: number;
  scanSpeedDegreesPerSecond: number;
  focusCheckIntervalSeconds: number;
  directCheckIntervalSeconds: number;
  peripheralCheckIntervalSeconds: number;
  rearCheckIntervalSeconds: number;
  defaultSearchArcDegrees: number;
}

export interface UnitAttentionSettings {
  defaultMode: AttentionMode;
  profiles: Record<AttentionMode, AttentionModeProfile>;
}

export interface UnitAttentionSettingsInput {
  defaultMode?: AttentionMode;
  profiles?: Partial<Record<AttentionMode, Partial<AttentionModeProfile>>>;
}

export interface AttentionRuntimeState {
  mode: AttentionMode;
  modeSource: AttentionModeSource;
  focusDirectionRadians: number;
  focusTargetId: string | null;
  searchCenterRadians: number;
  searchArcRadians: number;
  scanDirection: -1 | 1;
  scanProgress01: number;
  nextFocusCheckSeconds: number;
  nextDirectCheckSeconds: number;
  nextPeripheralCheckSeconds: number;
  nextRearCheckSeconds: number;
}
```

Contact contract:

```ts
export type PerceptionContactStage = 'cue' | 'suspicion' | 'contact' | 'identified' | 'confirmed';
export type PerceptionContactSource = 'visual' | 'sound' | 'reported' | 'fire_pressure';

export interface PerceptionContactMemory {
  id: string;
  stimulusId: string;
  labelRu: string;
  stage: PerceptionContactStage;
  source: PerceptionContactSource;
  evidence: number;
  confidence: number;
  uncertaintyCells: number;
  lastKnownPosition: GridPosition;
  visibleNow: boolean;
  observedNow: boolean;
  lastObservedSeconds: number;
  lastUpdatedSeconds: number;
  evidencePerSecond: number;
  explanationRu: string[];
}

export interface UnitPerceptionKnowledge {
  contacts: PerceptionContactMemory[];
  revision: number;
  lastUpdatedSeconds: number;
}
```

- [ ] Write `perception_attention_model_smoke.ts` asserting four modes exist, march peripheral weight is higher than engage, invalid values clamp, runtime starts from configured mode, and old unit data without `attention` receives defaults.
- [ ] Add standard Vite SSR wrapper and `perception-attention:smoke` command.
- [ ] Run `npm run perception-attention:smoke`; expected RED because modules do not exist.
- [ ] Implement defaults:

```ts
march:  focus 50°, direct 150°, peripheral 0.24, scan 55°/s, checks 0.20/0.34/0.75 s
observe: focus 60°, direct 170°, peripheral 0.16, scan 38°/s, checks 0.20/0.34/0.90 s
search:  focus 30°, direct 80°,  peripheral 0.08, scan 26°/s, checks 0.16/0.30/1.10 s
engage:  focus 20°, direct 50°,  peripheral 0.04, scan 0°/s,  checks 0.12/0.34/1.20 s
```

- [ ] Add `attention?: UnitAttentionSettingsInput` to `UnitData`; add `attentionSettings`, `attentionRuntime`, `perceptionKnowledge` to `UnitModel`.
- [ ] Initialize through normalizers; no shared nested profile objects.
- [ ] Run:

```bash
npm run perception-attention:smoke
npm run runtime:smoke
npm run workspace:smoke
npm run game-editor:smoke
npm run build
```

- [ ] Commit: `feat(perception): add attention and contact contracts`.

---

### Task 2: Smooth hybrid A+B weighting and deterministic scan control

**Files:**
- Modify: `src/core/perception/AttentionModel.ts`
- Create: `src/core/perception/AttentionController.ts`
- Create: `scripts/attention_controller_smoke.ts`
- Create: `scripts/attention_controller_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export interface AttentionSample {
  zone: AttentionZone;
  weight: number;
  normalizedAngle01: number;
}

export function sampleAttentionWeight(
  profile: AttentionModeProfile,
  angleDifferenceDegrees: number,
): AttentionSample;

export function resolveAutomaticAttentionMode(unit: UnitModel): AttentionMode;
export function setAttentionMode(unit: UnitModel, mode: AttentionMode, source: AttentionModeSource): void;
export function setSearchSector(unit: UnitModel, centerRadians: number, arcRadians: number, source: AttentionModeSource): void;
export function clearAttentionOverride(unit: UnitModel): void;
export function updateAttentionController(unit: UnitModel, deltaSeconds: number): void;
```

- [ ] Write smoke cases proving: center > focus edge > direct > rear; weights differ smoothly around nominal boundaries; movement resolves to march; fire/suppress resolves to engage; search sweep changes focus direction; player override survives automatic resolution until cleared.
- [ ] Add wrapper and `attention-controller:smoke`; verify RED.
- [ ] Implement cubic `smoothstep()` blending around focus/direct boundaries. Human-readable zone uses nominal boundaries while numerical weight blends over 3–12°.
- [ ] Implement automatic rules:

```ts
if (currentAction === 'fire' || currentAction === 'suppress') return 'engage';
if (unit.order) return 'march';
return unit.attentionSettings.defaultMode;
```

- [ ] Implement deterministic scan:
  - march follows facing and performs scheduled rear checks;
  - observe sweeps around facing;
  - search sweeps inside explicit center/arc;
  - engage retains the focused target direction;
  - all updates are frame-rate independent and normalize radians.
- [ ] Run:

```bash
npm run attention-controller:smoke
npm run perception-attention:smoke
npm run runtime:smoke
npm run build
```

- [ ] Commit: `feat(perception): add smooth attention weights and scan control`.

---

### Task 3: Partial visual transmission in existing LOS

**Files:**
- Modify: `src/core/visibility/LineOfSight.ts`
- Modify: `scripts/visibility_probe_cache_smoke.ts`
- Create: `scripts/observation_transmission_smoke.ts`
- Create: `scripts/observation_transmission_smoke.mjs`
- Modify: `package.json`

**Extends the existing result without breaking callers:**

```ts
visualTransmission: number;
partialObscuration: boolean;
accumulatedForestMeters: number;
obscurationReasonRu: string;
```

- [ ] Write smoke cases for open ground (`1`), short sparse forest (`0.05..0.99`, not blocked), long dense forest (`<=0.04`, blocked), and opaque structure (`0`, blocked).
- [ ] Add wrapper and `observation-transmission:smoke`; verify RED.
- [ ] Replace abrupt forest distance limits with accumulated transmission:

```ts
const MIN_VISUAL_TRANSMISSION = 0.04;
const SPARSE_FOREST_LOSS_PER_METER = 0.035;
const DENSE_FOREST_LOSS_PER_METER = 0.075;
visualTransmission *= Math.exp(-lossPerMeter * stepMeters);
```

- [ ] Open ground does not restore information already lost through foliage.
- [ ] Terrain/object/map-edge blockers return transmission `0`; existing `blocked` and Russian reason remain correct.
- [ ] Extend visibility cache smoke to assert transmission survives shared cached results and invalidation.
- [ ] Run:

```bash
npm run observation-transmission:smoke
npm run visibility-probe:smoke
npm run smooth-terrain:smoke
npm run spatial-index:smoke
npm run workspace:smoke
npm run build
```

- [ ] Commit: `feat(visibility): expose partial visual transmission`.

---

### Task 4: Generic stimuli and named visual-signal factors

**Files:**
- Create: `src/core/perception/PerceptionStimulus.ts`
- Create: `src/core/perception/VisualSignal.ts`
- Create: `scripts/visual_signal_smoke.ts`
- Create: `scripts/visual_signal_smoke.mjs`
- Modify: `package.json`

**Stimulus contract:**

```ts
export type PerceptionStimulusKind = 'threat_source' | 'unit';
export type PerceptionStimulusMovement = 'stationary' | 'walking' | 'running';
export type PerceptionStimulusAction = 'observe' | 'move' | 'fire' | 'suppress' | 'reload';

export interface PerceptionStimulus {
  id: string;
  label: string;
  labelRu: string;
  kind: PerceptionStimulusKind;
  position: GridPosition;
  posture: UnitPosture;
  movement: PerceptionStimulusMovement;
  action: PerceptionStimulusAction;
  baseSize: number;
  concealment: number;
  lateralMotion: number;
  visibleSource: boolean;
  knownSource: boolean;
}
```

**Signal result:**

```ts
export interface VisualSignalFactor {
  key: 'posture' | 'movement' | 'action' | 'size' | 'concealment' | 'distance'
    | 'lateral_motion' | 'attention' | 'observer' | 'transmission' | 'condition';
  multiplier: number;
  labelRu: string;
  explanationRu: string;
}

export interface VisualSignalResult {
  evidencePerSecond: number;
  factors: VisualSignalFactor[];
  explanationRu: string[];
}
```

- [ ] Write smoke ordering: firing front target > stationary front target > prone concealed side target; factor list must explain action and concealment.
- [ ] Add wrapper and `visual-signal:smoke`; verify RED.
- [ ] Build pressure-zone stimuli. `sourceVisible` means a visual stimulus may exist, not that it is known. Source-cell concealment: open `0`, sparse forest `35`, dense forest `65`.
- [ ] Use initial multipliers:

```text
posture: standing 1.00, crouched 0.72, prone 0.42
movement: stationary 0.72, walking 1.08, running 1.45
action: observe 0.90, move 1.05, fire 2.50, suppress 3.00, reload 0.95
lateral motion: 1.00..1.25
concealment: max(0.08, 1 - concealment/100)
distance: 1 / (1 + (distance/nominalRange)^2)
```

- [ ] Observer factor reuses existing `view`, `attention`, fatigue, confusion and suppression. Clamp evidence to `0..300`; keep every named factor for diagnostics.
- [ ] Run:

```bash
npm run visual-signal:smoke
npm run perception-attention:smoke
npm run observation-transmission:smoke
npm run build
```

- [ ] Commit: `feat(perception): evaluate named visual signal factors`.

---

### Task 5: Contact evidence, stages, decay and uncertainty

**Files:**
- Modify: `src/core/perception/PerceptionContact.ts`
- Create: `scripts/perception_contact_smoke.ts`
- Create: `scripts/perception_contact_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export const CONTACT_STAGE_THRESHOLDS = {
  cue: 25,
  suspicion: 50,
  contact: 80,
  identified: 120,
  confirmed: 150,
} as const;

export function getContactStageForEvidence(evidence: number): PerceptionContactStage;
export function advanceVisualContact(previous: PerceptionContactMemory | null, input: VisualContactInput): PerceptionContactMemory;
export function advanceReportedContact(previous: PerceptionContactMemory | null, input: ReportedContactInput): PerceptionContactMemory;
export function decayUnobservedContact(contact: PerceptionContactMemory, input: ContactDecayInput): PerceptionContactMemory | null;
export function upsertPerceptionContact(knowledge: UnitPerceptionKnowledge, contact: PerceptionContactMemory): void;
```

- [ ] Write deterministic progression test: 30 evidence creates cue; a later 60/s visual update reaches contact; loss lowers evidence/confidence and grows uncertainty; upsert increments revision without duplicating id.
- [ ] Add wrapper and `perception-contact:smoke`; verify RED.
- [ ] Rules:
  - evidence increases by `evidencePerSecond * deltaSeconds`, max `200`;
  - `observedNow` from `contact` stage;
  - `visibleNow` from `identified` stage;
  - confidence `clamp(evidence / 1.5, 0, 100)`;
  - uncertainty begins at `max(0.25, 6 - evidence / 35)` cells;
  - positive visual update cannot lower stage.
- [ ] Loss rules:

```text
evidence -1.15/s
confidence -0.55/s
uncertainty +0.12 m/s
remove only when evidence <4 and confidence <4
```

- [ ] Run:

```bash
npm run perception-contact:smoke
npm run visual-signal:smoke
npm run build
```

- [ ] Commit: `feat(perception): accumulate and decay subjective contacts`.

---

### Task 6: Scheduled selected-soldier PerceptionSystem

**Files:**
- Create: `src/core/perception/PerceptionDiagnostics.ts`
- Create: `src/core/perception/PerceptionSystem.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Create: `scripts/perception_system_smoke.ts`
- Create: `scripts/perception_system_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export function tickSelectedSoldierPerception(state: SimulationState, deltaSeconds: number): void;
export function getBestPerceptionContact(unit: UnitModel): PerceptionContactMemory | null;
export function getPerceptionDiagnostics(state: SimulationState): PerceptionDiagnostics;
```

- [ ] Write four states: front and side sources on march; same side source during engage; no selected soldier; opaque wall. Advance `state.simulationTimeSeconds` in direct tests.
- [ ] Expected behavior: front evidence > side evidence; march side evidence > 0; engage side evidence < 45% of march; no selection does no work; wall creates no visual contact.
- [ ] Add wrapper and `perception-system:smoke`; verify RED.
- [ ] Algorithm:

```text
selected soldier?
→ update attention controller
→ build stimuli
→ calculate bearing and attention zone without LOS
→ skip zone if its scheduled interval is not due
→ for due candidates calculate LOS and signal
→ accumulate positive contacts
→ decay contacts not positively updated
→ sort contacts by stage, confidence and recency
```

- [ ] Broad-phase radius is `viewRangeCells * 1.75`; this limits candidates but does not reveal them.
- [ ] Focus/direct/peripheral timestamps are independent. `intuition` may improve peripheral weight by at most 25%. Suppression narrows focus/direct angles by at most 35%.
- [ ] Diagnostics count ticks, candidates, LOS calculations, schedule skips, contact updates and best contact id. Optional `window` publication is guarded and write-only.
- [ ] Restructure simulation order:

```ts
for (const unit of state.units) {
  updateMetrics(unit, state, scaledDeltaSeconds);
  updateStateLabels(unit);
}

tickSelectedSoldierPerception(state, scaledDeltaSeconds);

for (const unit of state.units) {
  syncSoldierThreatMemory(state, unit, scaledDeltaSeconds);
  moveUnit(unit, state, scaledDeltaSeconds);
}

resolveUnitCollisions(state);
```

- [ ] Run:

```bash
npm run perception-system:smoke
npm run perception-contact:smoke
npm run observation-transmission:smoke
npm run runtime:smoke
npm run workspace:smoke
npm run build
```

- [ ] Commit: `feat(perception): run scheduled selected-soldier perception`.

---

### Task 7: Subjective threat memory and Blackboard bridge

**Files:**
- Modify: `src/core/knowledge/SoldierThreatMemory.ts`
- Modify: `src/core/pressure/ThreatEvaluation.ts`
- Modify: `src/core/ai/AiBlackboard.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/knowledge/UnitKnowledge.ts`
- Create: `scripts/perception_knowledge_bridge_smoke.ts`
- Create: `scripts/perception_knowledge_bridge_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export function syncSoldierThreatMemoryFromPerception(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
): void;
```

Blackboard keys:

```text
attention_mode
attention_focus_direction
best_contact_stage
best_contact_confidence
best_contact_uncertainty
contact_visible_now
suspected_enemy_position
```

- [ ] Write a no-omniscience smoke: source is physically present and marked `sourceVisible`, but behind engage attention. Before sufficient evidence Blackboard reports no contact and null position. Search eventually creates a subjective contact and memory.
- [ ] Add wrapper and `perception-knowledge:smoke`; verify RED.
- [ ] Remove the current direct `distance + LOS = 100 confidence` discovery from `SoldierThreatMemory`.
- [ ] Mapping:

```text
cue/suspicion → confidence max 49, not visible
contact       → confidence max 69, not visible
identified/confirmed → contact confidence, visible only when contact.visibleNow
```

- [ ] `sourceKnown` creates `reported` memory without current visibility. Physical pressure may create broad `fire_pressure` memory with at least 15 m uncertainty.
- [ ] Split `ThreatEvaluationReport` into objective physical pressure and subjective known target:

```ts
physicalStrongest: ThreatContribution | null;
knownTargetPosition: GridPosition | null;
```

Danger/suppression remain objective; `enemyVisible`, `enemyKnown`, and AI target positions come from perception knowledge.
- [ ] Populate Blackboard from `getBestPerceptionContact()`. Never source `current_target` directly from objective zone center.
- [ ] Change `UnitKnowledge` danger list to iterate personal tactical memories; resolve matching zone geometry only after the memory id is known.
- [ ] Run:

```bash
npm run perception-knowledge:smoke
npm run perception-system:smoke
npm run dictionary:smoke
npm run runtime:smoke
npm run workspace:smoke
npm run lab:smoke
npm run validate:ai-graph
npm run build
```

- [ ] Commit: `feat(perception): bridge subjective contacts into knowledge and AI`.

---

### Task 8: Sound events and broad sound-derived cues

**Files:**
- Create: `src/core/perception/PerceptionSound.ts`
- Modify: `src/core/perception/PerceptionSystem.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Create: `scripts/perception_sound_smoke.ts`
- Create: `scripts/perception_sound_smoke.mjs`
- Modify: `package.json`

**Produces:**

```ts
export type PerceptionSoundKind = 'rifle_shot' | 'automatic_fire' | 'explosion' | 'movement';

export interface PerceptionSoundEvent {
  id: string;
  kind: PerceptionSoundKind;
  sourceId: string | null;
  position: GridPosition;
  loudness: number;
  createdSeconds: number;
  durationSeconds: number;
}

export function emitPerceptionSound(state: SimulationState, event: PerceptionSoundEvent): void;
export function getActivePerceptionSounds(state: SimulationState): readonly PerceptionSoundEvent[];
export function prunePerceptionSounds(state: SimulationState): void;
```

- [ ] Write smoke: rifle shot behind listener creates sound contact, never exact position, uncertainty at least 8 m, never visible, event expires.
- [ ] Store ephemeral events in `WeakMap<SimulationState, PerceptionSoundEvent[]>`; do not serialize them.
- [ ] Ignore own sounds (`sourceId === observer.id`). Sound-only evidence is capped at `suspicion`.
- [ ] Base ranges: rifle 350 m, automatic 500 m, explosion 900 m, movement 45 m. Distance attenuates smoothly.
- [ ] Estimated position is deterministic from observer id/event id and bearing; no changing random roll. Suppression worsens localization.
- [ ] Merge visual and sound contacts when they share `sourceId`.
- [ ] Emit rifle/automatic sound from `AiGameBridge` fire/suppress effects.
- [ ] Run:

```bash
npm run perception-sound:smoke
npm run perception-system:smoke
npm run perception-knowledge:smoke
npm run runtime:smoke
npm run build
```

- [ ] Commit: `feat(perception): add broad sound-derived contacts`.

---

### Task 9: Editable attention profiles and serialization

**Files:**
- Create: `src/ui/AttentionProfileControls.ts`
- Modify: `src/core/editor/GameEditorDrafts.ts`
- Modify: `src/core/units/UnitModel.ts`
- Modify: `src/ui/GameEditorWorkbench.ts`
- Modify: `src/ui/SceneExport.ts`
- Modify: `scripts/game_editor_smoke.mjs`
- Create: `scripts/attention_profile_editor_smoke.ts`
- Create: `scripts/attention_profile_editor_smoke.mjs`
- Modify: `package.json`
- Modify: `src/tactical-workspace-stage8.css`

**Produces:**

```ts
export interface AttentionProfileControlsOptions {
  settings: UnitAttentionSettings;
  onChanged(): void;
}

export function renderAttentionProfileControls(
  options: AttentionProfileControlsOptions,
): HTMLElement;
```

- [ ] Write draft/export round-trip smoke. Export the existing private `buildExportedScene(state)` function for headless test coverage without changing download behavior.
- [ ] Add `attention: UnitAttentionSettings` to unit draft; deep-copy on profile reset, placement, copy from selected and apply to selected.
- [ ] Serialize canonical `attention` key. Old scenes without it normalize to defaults.
- [ ] Build Russian controls for four modes:
  - focus angle;
  - direct angle;
  - peripheral strength shown as 0–100;
  - scan speed;
  - three check intervals;
  - rear-check interval;
  - default search arc;
  - reset current mode / reset all modes.
- [ ] Mount under **Обзор и внимание** in unit editor.
- [ ] Rename old direction label to **Начальное направление корпуса и оружия**.
- [ ] Keep `viewAngleRadians` synchronized with observe direct angle for backward compatibility. Keep view range as nominal recognition range.
- [ ] Extend editor smoke with Russian labels and four modes.
- [ ] Run:

```bash
npm run attention-profile-editor:smoke
npm run game-editor:smoke
npm run workspace:smoke
npm run map-resolution:smoke
npm run build
```

- [ ] Commit: `feat(editor): add editable attention mode profiles`.

---

### Task 10: Attention runtime tab and selected-soldier overlay

**Files:**
- Create: `src/rendering/PixiAttentionOverlayRenderer.ts`
- Modify: `src/core/ui/RuntimeUiState.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `scripts/tactical_workspace_smoke.mjs`
- Modify: `docs/architecture/MODULE_MAP.md`
- Modify: `src/tactical-workspace-stage8.css`
- Create: `tests/perception-attention-overlay.spec.ts`

**Runtime state:**

```ts
export interface AttentionOverlayRuntimeState {
  active: boolean;
  showVisibilityFan: boolean;
  selectedContactId: string | null;
}
```

- [ ] First extend workspace smoke with:

```js
"type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory' | 'attention'",
"['attention', 'Внимание']",
'Режим внимания',
'Лучший контакт',
'Почему замечает',
```

Expected RED.
- [ ] Add `attention` simulation tab and runtime getters/setters. Default overlay inactive.
- [ ] Implement renderer with long-lived graphics for peripheral ring, direct sector, focus sector, scan line and contacts. Do not add this responsibility to `PixiOverlayRenderer.ts`.
- [ ] Marker contract:

```text
cue — hollow circle
suspicion — uncertainty ring
contact — diamond
identified — solid diamond
confirmed — diamond with center dot
```

- [ ] Cache key includes selected id, position, focus direction bucket, mode, profile values, perception revision, cell size and overlay flags.
- [ ] Publish diagnostics: rebuild count, marker count, ray calculation count and last key.
- [ ] Sidebar shows current mode, direction, zone strengths, scan progress, best stage, confidence, uncertainty, evidence/s and Russian factor explanation.
- [ ] Add View menu toggle **Обзор и внимание: вкл/выкл** and optional visibility fan toggle.
- [ ] Prepare, but do not run, `tests/perception-attention-overlay.spec.ts` for three PNGs:

```text
perception-attention-march.png
perception-attention-engage.png
perception-attention-search.png
```

The browser test must also prove cursor-only movement does not rebuild the overlay.
- [ ] Run non-browser checks:

```bash
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run perception-system:smoke
npm run build
```

- [ ] Commit: `feat(ui): show selected-soldier attention and contacts`.

---

### Task 11: AI nodes select modes, not coefficients

**Files:**
- Modify: `src/core/ai/AiNodeTypes.ts`
- Modify: `src/core/ai/AiGraph.ts`
- Modify: `src/core/ai/AiGraphRunner.ts`
- Modify: `src/core/ai/AiGraphValidation.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/ai/AiConceptOperations.ts`
- Modify: `src/core/ai/AiConceptValues.ts`
- Modify: `src/ai-node-editor/main.ts`
- Modify: `scripts/ai_graph_runtime_smoke.ts`
- Modify: `scripts/ai_node_editor_smoke.mjs`
- Modify: `scripts/ai_dictionary_smoke.mjs`

**New nodes:**

```ts
SetAttentionMode
SetSearchSector
ClearAttentionOverride
```

**Effects:**

```ts
{ type: 'set_attention_mode'; mode; reason; reasonRu? }
{ type: 'set_search_sector'; centerDegrees; arcDegrees; reason; reasonRu? }
{ type: 'clear_attention_override'; reason; reasonRu? }
```

- [ ] Add failing runtime fixtures asserting exact effects for search mode, 90°/120° search sector and clear override.
- [ ] Validate mode enum, center normalized to 0–359, arc 1–360, required reason.
- [ ] Runner remains pure and emits effects only.
- [ ] Bridge applies effects through `setAttentionMode`, `setSearchSector`, `clearAttentionOverride`.
- [ ] Node editor labels:

```text
Set Attention Mode / Выбрать режим внимания
Set Search Sector / Задать сектор поиска
Clear Attention Override / Вернуть автоматическое внимание
```

Russian mode values: Марш, Наблюдение, Поиск цели, Стрельба.
- [ ] Dictionary explains that coefficients live in scene editor and nodes reveal no enemies.
- [ ] Ensure persistent controls are not recreated by runtime trace refresh.
- [ ] Run:

```bash
npm run runtime:smoke
npm run editor:smoke
npm run dictionary:smoke
npm run validate:ai-graph
npm run perception-knowledge:smoke
npm run build
```

- [ ] Commit: `feat(ai): let graphs select attention modes and sectors`.

---

### Task 12: Performance, documentation and delivery gate

**Files:**
- Create: `scripts/perception_performance_smoke.ts`
- Create: `scripts/perception_performance_smoke.mjs`
- Modify: `package.json`
- Modify: `tests/camera-grid-performance.spec.ts`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Create: `docs/subprojects/ai-single-unit-editor/PERCEPTION_ATTENTION_V1.md`
- Modify: `docs/architecture/OVERVIEW.md`
- Modify: `docs/architecture/MODULE_MAP.md`
- Modify: `docs/manual-test/PREVIEW_SCREENSHOTS.md`
- Regenerate through: `npm run docs:sync`

- [ ] Build a headless state with 120 visible source candidates and run 600 calls at 60 Hz while advancing simulation time.
- [ ] Assert:

```ts
diagnostics.tickCount === 600
diagnostics.losCalculationCount < diagnostics.candidateCount * 0.45
diagnostics.skippedNotDueCount > 0
```

Do not assert wall-clock timing on shared CI hardware.
- [ ] Add `perception-performance:smoke` wrapper and command.
- [ ] Prepare browser performance assertions:
  - camera/pointer movement does not run perception;
  - cursor-only movement does not rebuild attention overlay;
  - no full-map fingerprint scan is introduced;
  - selected movement invalidates only appropriate cache buckets.
- [ ] Write `PERCEPTION_ATTENTION_V1.md` covering modes, zones, thresholds, factors, sound limitations, subjective knowledge, editor, Blackboard, nodes, scheduling, checks and selected-soldier limit.
- [ ] Update `subproject.json`; generate status/index files only with `npm run docs:sync`.
- [ ] Run complete non-browser verification:

```bash
npm run perception-attention:smoke
npm run attention-controller:smoke
npm run observation-transmission:smoke
npm run visual-signal:smoke
npm run perception-contact:smoke
npm run perception-system:smoke
npm run perception-knowledge:smoke
npm run perception-sound:smoke
npm run attention-profile-editor:smoke
npm run perception-performance:smoke
npm run visibility-probe:smoke
npm run awareness-field:smoke
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run dictionary:smoke
npm run runtime:smoke
npm run validate:ai-graph
npm run build
npm run docs:check
```

- [ ] Confirm report truthfully states:

```text
selected soldier only
pressure-zone sources are current visual stimuli
sound contacts are approximate
no enemy faction/unit combat model was added
no commander reporting was added
browser visual QA has not run unless approved
main was not touched
```

- [ ] Commit: `docs(perception): verify and document attention v1`.
- [ ] After all non-browser checks pass and PNG scenarios are prepared, ask exactly: `Визуальная проверка подготовлена. Запустить её сейчас?`
- [ ] Only after approval run the repository local-preview workflow, verify fresh PNGs, exact SHA, console cleanliness, visual difference between march/engage/search, and stable overlay diagnostics.

---

## Review gates

### Gate A — Core mathematics

Tasks 1–5. Attention, LOS transmission, visual signal and contact progression are testable without UI.

### Gate B — Live subjective perception

Tasks 6–8. Selected soldier gains/loses visual and sound contacts; Blackboard no longer receives automatic visual knowledge.

### Gate C — Human authoring and explanation

Tasks 9–10. User edits profiles and understands current perception through the Attention tab and overlay.

### Gate D — AI and release evidence

Tasks 11–12. Graphs choose modes, all checks pass, docs are current and visual QA is prepared for approval.

## Acceptance criteria

1. A physically visible target is not known instantly.
2. UI has clear focus/direct/peripheral zones while simulation weights are smooth.
3. March peripheral evidence is stronger than engage peripheral evidence.
4. Search focus sweeps deterministically through its sector.
5. Firing is much easier to detect than stationary concealment.
6. Forest reduces signal progressively before becoming effectively opaque.
7. Opaque terrain and objects prevent visual evidence.
8. Lost contacts decay and become less precise.
9. Sound creates an approximate cue, not exact coordinates.
10. Pressure can affect a soldier without revealing its source.
11. Blackboard reads subjective contacts.
12. Profile coefficients are edited outside AI nodes.
13. Only selected soldier is processed in v1.
14. Camera and pointer events do not trigger perception calculations.
15. Existing AI, map, pathfinding and scene-loading checks remain green.
16. Russian is complete and default.
17. `main` remains untouched.
