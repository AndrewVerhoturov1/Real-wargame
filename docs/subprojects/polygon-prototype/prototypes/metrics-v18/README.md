# Polygon Metrics v18 — exact reconstruction payload

The accepted standalone HTML is larger than the safe single-blob payload of the remote GitHub connector used for this transfer. To preserve it exactly, the repository stores a deterministic delta from the already accepted Polygon v44 HTML.

## Identity

Base v44:

- file: `polygon-map-editor-unified-v44-infantry-integrated-v2(1).html`
- SHA-256: `0db5984d9d1f76149c31135b4a16f7e657f957c5512039853b9607353979b1d6`

Accepted Metrics v18:

- file: `polygon-metrics-constructor-v18-report-streamlined.html`
- size: `1 626 086` bytes
- SHA-256: `1f4aa27611fbdf5433e0b0ae630d8953d1c19091ce1e0592536d1737ffca91f8`

Delta payload:

- format: git patch → XZ → Base64 → 12 text chunks
- compressed patch SHA-256: `56f71c833a6feedbe82f40710d147b7838f1ca64d198274c913728f69be8baca`
- chunks: `parts/v44-to-metrics-v18.patch.xz.b64.part-01` … `part-12`

## Rebuild

```bash
python docs/subprojects/polygon-prototype/prototypes/metrics-v18/rebuild_metrics_v18.py \
  /path/to/polygon-map-editor-unified-v44-infantry-integrated-v2\(1\).html \
  /tmp/polygon-metrics-constructor-v18-report-streamlined.html
```

The script refuses to continue if the base, compressed delta, or rebuilt HTML SHA-256 differs from the accepted values.
