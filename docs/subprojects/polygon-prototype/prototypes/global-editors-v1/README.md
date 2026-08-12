# Polygon Global Editors v1 — exact reconstruction payload

The accepted Global Editors v1 standalone Polygon HTML is stored as a deterministic delta from the already accepted Journal v4 HTML. This keeps the exact accepted artifact reconstructible without committing one large HTML blob through the remote GitHub connector.

## Identity

Base Journal v4:

- file: `polygon-journal-v4.html`
- size: `1 728 802` bytes
- SHA-256: `eda3190c747d61b554c99072828c1f56038a48f81eff5778deceed75d9a71ca4`

Accepted Global Editors v1:

- file: `polygon-journal-v4.html`
- size: `1 987 792` bytes
- SHA-256: `78c89b784c441a87c8680134bf4aef31e0a96c6e0b2344cd1ad875f09d372e9b`

Delta payload:

- format: git patch → XZ → Base64 → 7 text chunks
- compressed patch SHA-256: `253d57a6c3b61e693f04c6191e9da9b622429a64102816ca174ce9abea30974e`
- chunks: `parts/journal-v4-to-global-editors-v1.patch.xz.b64.part-01`, `part-02a`, `part-02b`, `part-03a`, `part-03b`, `part-04a`, `part-04b`

## Rebuild

```bash
python docs/subprojects/polygon-prototype/prototypes/global-editors-v1/rebuild_global_editors_v1.py \
  /path/to/accepted/polygon-journal-v4.html \
  /tmp/polygon-global-editors-v1.html
```

The script refuses to continue if the base Journal v4 SHA, compressed delta SHA, or rebuilt Global Editors v1 SHA differs from the accepted values.

## UX/runtime boundary

Global Editors v1 is an accepted standalone Polygon UX/reference prototype. It moves the shared project editors into the Polygon header workbench without making the standalone HTML a simulation source of truth.

The accepted common editor set is:

- Behavior: Route Profiles, Tactical Positions;
- Soldier: Soldier Archetypes, Attention Profiles, Perception Profiles, Movement Profiles;
- Combat: Weapons, Wounds & Suppression;
- World: Surface Types, Environment Profiles, Directional Terrain.

`Behavior Graph` and `Soldier Data` are intentionally excluded from this common Polygon menu.

In Polygon authoring mode all gameplay tuning controls are intentionally editable, including built-in profiles and published combat-catalog entries. Stable technical IDs and revision/status metadata remain identity fields. Labels such as “not connected yet” or “future mechanic” remain truthful and do not imply that a standalone edit is already wired into production runtime.
