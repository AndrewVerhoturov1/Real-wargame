# Tactical Position Interaction Design

## Goal

Make field-driven tactical-position markers on the danger layer selectable and commandable, use the approved B2 marker language, and automatically apply the recommended posture after the selected soldier reaches the position.

## Marker language: B2

Every candidate uses the same outer diamond. The internal glyph carries posture only:

- standing: vertical stroke;
- crouched: shallow angle;
- prone: horizontal stroke.

The best candidate remains green and other candidates remain yellow. Selection is shown by a larger white diamond. A single reused text label is shown for the hovered candidate, or the selected candidate when nothing is hovered. No Text or Graphics object is allocated per candidate.

## Interaction

The renderer publishes its bounded visible candidate list to simulation-owned transient UI state. Hover hit-testing uses the existing mouse grid position and at most 12 candidates.

- Left click on a marker selects it without deselecting the soldier.
- Right click on a marker selects it and issues a routed movement command to the exact candidate position.
- Pointer interception runs only on the danger layer, only over a canvas, and only when a marker is hit. Other board input remains unchanged.

## Arrival posture

The player command stores an optional recommended arrival posture. The normal route planner and re-planner continue to own movement. After the linked player command becomes completed and the unit no longer has an active order, a post-tick reconciliation applies the posture once and marks it applied on the command. Blocked, cancelled, and ordinary movement commands do not change posture.

## Performance constraints

- Keep `DISPLAY_MAX_CANDIDATES = 12`.
- Keep all marker geometry in one Pixi `Graphics` object.
- Keep one reusable Pixi `Text` object for the marker label.
- Hit-testing is linear over the already bounded visible list; it must not query the map, worker, pathfinder, or tactical search.
- No synchronous full-map fallback.
- No wall-clock value may affect candidate selection or command behavior.

## Validation

The tactical-position smoke must cover transient selection/hit-testing, command arrival-posture normalization, one-time posture application, and source contracts for B2 rendering and bounded pointer interaction. The Vercel preview build is the verification runner; GitHub Actions remain disabled unless explicitly requested.