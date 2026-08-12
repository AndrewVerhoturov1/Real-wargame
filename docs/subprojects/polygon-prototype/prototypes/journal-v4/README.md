# Polygon Journal v4 — exact reconstruction payload

The accepted Journal standalone HTML is stored as a deterministic delta from the already accepted Polygon Metrics v18 HTML. This keeps the exact accepted artifact reconstructible without committing one large HTML blob through the remote GitHub connector.

## Identity

Base Metrics v18:

- file: `polygon-metrics-constructor-v18-report-streamlined.html`
- size: `1 626 086` bytes
- SHA-256: `1f4aa27611fbdf5433e0b0ae630d8953d1c19091ce1e0592536d1737ffca91f8`

Accepted Journal v4:

- file: `polygon-journal-v4.html`
- size: `1 728 802` bytes
- SHA-256: `eda3190c747d61b554c99072828c1f56038a48f81eff5778deceed75d9a71ca4`

Delta payload:

- format: git patch → XZ → Base64 text payload
- compressed patch SHA-256: `50c53bd2611315d1f28afc482571f4a63a06001802081c0f6894d8de9b27ae5c`
- payload: `parts/metrics-v18-to-journal-v4.patch.xz.b64`

## Rebuild

```bash
python docs/subprojects/polygon-prototype/prototypes/journal-v4/rebuild_journal_v4.py \
  /path/to/polygon-metrics-constructor-v18-report-streamlined.html \
  /tmp/polygon-journal-v4.html
```

The script refuses to continue if the base Metrics v18 SHA, compressed delta SHA, or rebuilt Journal v4 SHA differs from the accepted values.

## Runtime boundary

Journal v4 is an accepted standalone UX/reference prototype. It demonstrates structured journal events, filtering, a global timeline, historical map inspection and time-aware unit inspector behavior. Demo history/snapshots are used where the production runtime does not yet expose a general replay/history provider. The UI is read-only and is not a simulation source of truth.
