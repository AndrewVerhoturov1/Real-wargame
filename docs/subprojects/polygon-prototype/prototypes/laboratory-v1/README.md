# Polygon Laboratory v1 — exact reconstruction payload

The accepted Laboratory v1 standalone Polygon HTML is stored as a deterministic delta from the already accepted Global Editors v1 HTML. This keeps the exact accepted artifact reconstructible without committing a 2 MB standalone HTML blob through the remote GitHub connector.

## Identity

Base Global Editors v1:

- logical version: `Global Editors v1`;
- size: `1 987 792` bytes;
- SHA-256: `78c89b784c441a87c8680134bf4aef31e0a96c6e0b2344cd1ad875f09d372e9b`.

Accepted Laboratory v1:

- user-approved iteration: `Laboratory v4`;
- historical source filename: `rebuilt-global-editors-v1-final(1)-laboratory-v4.html`;
- logical version name: `Laboratory v1`;
- recommended reconstructed output name: `polygon-laboratory-v1.html`;
- size: `2 090 476` bytes;
- SHA-256: `29e1d493fd3c4ef7633ad3850bf71ec94e3403d6a5ccb2a0658ca958d0765c02`.

The filename is not the version discriminator. The accepted artifact identity is the byte size and SHA-256 above.

Delta payload:

- format: git patch → XZ → Base64;
- compressed patch SHA-256: `1601fcf7dee3bd52daeb60fc7bfc7026d0e178419d15c5b13322b5dfe4cc881d`;
- chunks: `parts/global-editors-v1-to-laboratory-v1.patch.xz.b64.part-01` … `part-08`.

## Rebuild

```bash
python docs/subprojects/polygon-prototype/prototypes/laboratory-v1/rebuild_laboratory_v1.py \
  /path/to/accepted/polygon-global-editors-v1.html \
  /tmp/polygon-laboratory-v1.html
```

The script refuses to continue if the base Global Editors v1 SHA, compressed delta SHA, or rebuilt Laboratory v1 SHA differs from the accepted values.

## UX/runtime boundary

Laboratory v1 is an accepted standalone Polygon UX/reference prototype for temporary experiment overrides. It does not make standalone values authoritative gameplay state and does not replace production registries or simulation runtime.

Key contract:

- Laboratory changes are temporary experimental overrides, distinct from global/default values;
- targets can be units, groups/categories, sides, map areas, or the whole experiment where the selected parameter supports that scope;
- the map is the primary spatial selection surface; unit selection and polygon areas are interactive;
- areas live in map/world coordinates and stay attached during pan/zoom;
- the header and right inspector are not modified by Laboratory;
- parameter discovery reuses the real Polygon parameter schemas/registries already present in the accepted prototype rather than inventing a parallel parameter catalog;
- `Apply globally` is meaningful only when a parameter has an authoritative persistent owner; runtime-only state is not promoted to a fake global default.
