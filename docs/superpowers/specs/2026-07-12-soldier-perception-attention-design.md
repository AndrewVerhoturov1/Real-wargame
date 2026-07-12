# Soldier Perception and Attention — Hybrid A+B Design

**Status:** approved for implementation planning  
**Date:** 2026-07-12  
**Repository:** `AndrewVerhoturov1/Real-wargame`  
**Working branch:** `real-wargame-preview`

## 1. Goal

Build a deterministic, explainable and editable perception system for one selected soldier. The system must distinguish:

1. physical line of sight;
2. target visual signal;
3. the soldier's current field of attention;
4. accumulated evidence and recognition;
5. subjective memory after contact is lost.

The player must be able to understand and edit the system without changing TypeScript, JSON or technical keys.

## 2. Approved approach

Use a hybrid of:

- **A — three human-readable zones:** focus, direct attention and peripheral attention;
- **B — smooth internal weighting:** attention does not jump abruptly at the visual boundary between zones.

The UI shows clear zones. The simulation uses a smooth angular weight curve.

## 3. Core formula

```text
evidence per second =
visual signal of target
× attention weight for this direction
× observer capability
× observation-path transmission
× current condition modifiers
```

A target is not revealed simply because it is within a geometric cone. It becomes a contact only after enough evidence accumulates.

## 4. Scope of the first implementation

The first implementation remains inside the current selected-soldier vertical slice.

It includes:

- focus, direct and peripheral attention;
- modes `march`, `observe`, `search`, `engage`;
- deterministic scan movement;
- smooth angular weighting;
- posture, movement, firing, concealment and distance modifiers;
- partial visual attenuation through forest;
- contact stages and confidence;
- memory decay and growing positional uncertainty;
- a minimal sound-cue path for firing;
- editable attention profiles in the scene editor;
- selected-soldier overlay and Russian diagnostics;
- Blackboard exposure and AI nodes that select a mode.

It does not include:

- whole-army perception updates;
- binoculars, optics or vehicle sensors;
- night vision and detailed weather;
- commander-to-subordinate contact reports;
- probabilistic random spotting rolls;
- automatic target engagement logic;
- formation-level observation sectors;
- per-eye animation or full anatomical eye simulation.

## 5. Attention zones

### Focus

The narrow direction the soldier is actively examining.

- highest evidence gain;
- fastest identification;
- used for searching, aiming and retaining a current target.

### Direct attention

The broader forward field.

- useful visual signal is detected;
- identification is slower;
- a promising cue may pull focus toward it.

### Peripheral attention

The remainder around the soldier.

- best at noticing movement, flashes and nearby events;
- poor at identification;
- mode-dependent strength;
- 360 degrees on march does not mean 360-degree detailed vision.

## 6. Modes

| Mode | Purpose | Focus | Direct field | Peripheral behavior |
|---|---|---:|---:|---|
| `march` | movement and route awareness | medium | broad | 360°, useful for motion and sound |
| `observe` | calm general observation | broad | broad | weak continuous awareness |
| `search` | deliberate scan of a sector | narrow | medium | very weak outside the search sector |
| `engage` | aiming and firing at one target | very narrow | narrow | minimal, but strong events can interrupt |

Mode profiles are persistent editable settings, not separate AI graphs. AI nodes only choose the mode and, for search, the center and arc of the sector.

## 7. Contact stages

```text
cue → suspicion → contact → identified → confirmed
```

Recommended initial evidence thresholds:

| Stage | Evidence |
|---|---:|
| cue | 25 |
| suspicion | 50 |
| contact | 80 |
| identified | 120 |
| confirmed | 150 |

Thresholds are constants in the first version and must be isolated in one configuration object for later tuning.

Meanings:

- `cue`: a weak movement, flash or sound was noticed;
- `suspicion`: approximate direction and broad uncertain area;
- `contact`: likely person or threat source;
- `identified`: recognized hostile source or target type;
- `confirmed`: accurate enough for confident direct engagement.

## 8. Subjective knowledge

Perception contacts belong to one soldier. Objective pressure zones may physically suppress or endanger the soldier without revealing their source.

The existing `sourceVisible` editor flag means the source can produce a visual stimulus. It must not mean automatic discovery.

The existing `sourceKnown` flag means scenario knowledge or a report can create a remembered contact. It must not grant current visual confirmation.

## 9. Geometry and concealment

Opaque blockers remain binary:

- terrain higher than the line;
- buildings and sufficiently high objects;
- map boundary.

Forest and future smoke use a transmission value from `0` to `1`.

Existing callers continue to receive the compatible `blocked` result. Perception additionally consumes `visualTransmission` and `partialObscuration`.

Cover protection and concealment stay separate.

## 10. Target signal

Visual signal is built from named factors:

- posture;
- movement;
- action;
- target size;
- concealment;
- distance;
- lateral motion;
- muzzle flash or firing signature.

Every diagnostic result retains the factors used, so the UI can explain why the soldier did or did not notice the source.

## 11. Observer capability

Existing soldier fields are reused:

- `view`: distance and small-detail recognition;
- `attention`: scan quality and angular weighting;
- `intuition`: peripheral and sound-cue interpretation;
- `fatigue`: slower scan and evidence gain;
- `confusion`: weaker classification;
- `stress` and `suppression`: narrower effective attention and slower switching;
- `tactics`: future priority for likely observation points.

No duplicate "spotting skill" is introduced in v1.

## 12. Direction ownership

Keep three concepts separate:

- `facingRadians`: current weapon/body direction used by rendering and movement;
- `focusDirectionRadians`: current attention direction;
- search-sector center and arc.

The first version may keep body and weapon coupled, but attention must already be independent.

## 13. Scheduling and performance

Perception is simulation work, not renderer work.

- no perception calculation every animation frame;
- focus checks approximately 5 Hz;
- direct checks approximately 3 Hz;
- peripheral checks approximately 1–2 Hz;
- immediate event injection for firing sounds;
- only the selected soldier is processed in v1;
- expensive LOS work occurs only for due candidates;
- results are cached by observer pose, candidate position, map revisions and attention direction bucket;
- overlay rebuilds are event-driven and expose diagnostics.

## 14. Architecture

```text
Pressure zones / future enemy units / sound events
                    ↓
           PerceptionStimulus adapters
                    ↓
        AttentionController + AttentionModel
                    ↓
       observation path + visual/sound signal
                    ↓
             PerceptionSystem tick
                    ↓
       per-soldier PerceptionKnowledge contacts
                    ↓
 SoldierThreatMemory / Blackboard / awareness grid
                    ↓
    TacticalWorkspace + Pixi attention overlay
```

Core modules do not import PixiJS, DOM, localStorage or editor controls.

## 15. Data ownership

### Permanent/configurable unit data

- attention profile set;
- initial/default attention mode.

### Live runtime state

- current attention mode;
- focus direction;
- search sweep state;
- current focus contact;
- scheduled next checks.

### Subjective knowledge

- contact evidence;
- stage;
- confidence;
- uncertainty;
- last known position;
- visible/observed now;
- visual or sound source.

### Renderer state

Only UI activation, hover and selected-contact state. It is not the source of perception truth.

## 16. Editor requirements

The selected-unit editor provides a collapsible **Обзор и внимание** section.

For each mode it edits:

- focus angle;
- direct angle;
- peripheral strength;
- scan speed;
- focus/direct/peripheral check intervals;
- rear-check interval where applicable.

Search additionally edits its default sector arc.

Values are copied by the existing unit draft workflow:

- profile fills defaults;
- user can edit;
- place unit;
- copy from selected;
- apply to selected.

Russian labels are complete and default.

## 17. Runtime UI requirements

Add an **Внимание** simulation tab.

It shows:

- current mode;
- focus direction;
- focus/direct/peripheral weights;
- search progress;
- best contact stage;
- confidence and uncertainty;
- current evidence gain;
- a factor-by-factor Russian explanation.

The map overlay for the selected soldier shows:

- bright focus sector;
- softer direct sector;
- faint peripheral ring;
- current search direction;
- contact markers by stage;
- optional cached visibility fan;
- no permanent overlay for every unit.

## 18. AI integration

Add Blackboard values:

- `attention_mode`;
- `attention_focus_direction`;
- `best_contact_stage`;
- `best_contact_confidence`;
- `best_contact_uncertainty`;
- `contact_visible_now`;
- `suspected_enemy_position`.

Add immediate authoring nodes:

- `SetAttentionMode`;
- `SetSearchSector`;
- `ClearAttentionOverride`.

These nodes select or clear the mode. They do not contain profile coefficients.

## 19. Verification principles

Every vertical slice uses TDD and preserves existing smoke checks.

Required scenario families:

1. front target gains evidence faster than a side target;
2. march peripheral awareness beats engage peripheral awareness;
3. prone concealed stationary source is slower than standing moving source;
4. opaque terrain or object prevents visual evidence;
5. forest reduces rather than instantly toggles signal until transmission is exhausted;
6. search sweep eventually places focus on a target;
7. engage holds focus on the current contact;
8. lost contact decays and uncertainty grows;
9. firing creates a broad sound cue before visual identification;
10. no selected soldier means no expensive perception update;
11. pointer/camera movement does not rebuild perception fields;
12. AI graph reads subjective contact values only.

## 20. Delivery policy

Implementation work goes to `real-wargame-preview` unless the user explicitly requests isolation.

`main` is not changed.

For visible changes, prepare Playwright coverage and the expected PNG list, then ask exactly once:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

Do not run browser visual QA before approval.
