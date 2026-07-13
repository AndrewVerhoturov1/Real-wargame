# Design: stable threat display and reusable attention profiles

## Threat rendering

Stable threat geometry and volatile current-confirmation markers use separate keys and persistent Pixi objects. The geometry key excludes `visibleNow`; the marker key includes it. The UI contact list is a union of live perception contacts and tactical threat memory, deduplicated by threat id.

## Movement facing

Before each movement step, the unit faces the current waypoint. When a waypoint changes, the facing changes to the next segment. At completion, an explicit final-facing value overrides the last route heading.

## Attention profile registry

A versioned browser-persisted registry stores built-in and custom named profiles. Every profile contains the full `UnitAttentionSettings` block. Units keep both concrete settings and an optional selected profile id, preserving old scene compatibility and allowing an “Individual” state after manual edits.

## Bottom bar

The lower card uses minmax(0, …), contained two-row groups, abbreviated buttons, ellipsis, and responsive breakpoints. No child may extend outside the card at 1440×900 or the narrower visual-test viewport.
