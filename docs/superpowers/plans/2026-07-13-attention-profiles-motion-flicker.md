# Attention profiles, movement facing, and threat stability

## Goal

Repair four user-visible regressions in the current preview:

1. keep the machine-gun threat geometry and its label stable while visual confirmation changes;
2. rotate the soldier along every active route segment and preserve explicit final facing;
3. add reusable named attention profiles with the same CRUD/import/export spirit as movement profiles;
4. rebuild the selected-soldier bottom bar as a compact contained responsive layout.

## Root causes

- tactical-knowledge revision includes volatile visibility and the Pixi knowledge renderer destroys the entire container on each revision;
- the view-memory panel rebuilds from perception contacts only, so it has no stable tactical-memory fallback;
- SimulationTick changes position without changing facing until the optional final-facing step;
- attention settings exist only as per-unit raw settings, without a registry or persistent selected profile id;
- the route-control subgrid requires more minimum width than its parent column can provide.

## Verification gates

- focused behavioral smokes for display stability, movement facing, profile registry, and compact-layout contracts;
- existing perception, route, navigation, workspace, scene, editor, and production-build regression;
- system-Chrome scenarios at 1440×900 and a narrower viewport;
- manual inspection of threat continuity, moving orientation, profile editor, and the lower panel.
