# Polygon Preview Checkpoint Transfer Design

Date: 2026-08-17

## Goal

Preserve the current Polygon implementation in `real-wargame-preview` as a technical checkpoint before the user changes implementation approach.

This transfer must not be interpreted as visual acceptance of the current UI.

## Source and target

- Repository: `AndrewVerhoturov1/Real-wargame`
- Product snapshot before documentation: `feature/20260817-polygon-editor-inner-parity @ 0792cae6ba353c781847d3e2f7f588cdf7047329`
- Target before transfer: `real-wargame-preview @ 8292bf25bf241712901090fcb565dded939e7a08`
- The source lineage is ahead of preview and has no divergence at the checked comparison point.

Documentation commits created for this checkpoint are intentionally included in the eventual transfer.

## Meaning of the transfer

The transfer preserves working engineering results from the six-X integration and subsequent editor parity attempt: live map, real units, live selection/unit contract, right-panel owners, product editor integration, context routing, and the current presentation layers.

It does **not** establish that the current map/editor/right-panel presentation is accepted, final, pixel-perfect, or the preferred architecture for the next iteration.

## Documentation contract

Before transfer:

1. create a dedicated checkpoint document;
2. update integration status so the approach reset overrides older acceptance language where necessary;
3. update orchestrator handoff so the next worker does not continue the old pixel-parity strategy automatically;
4. preserve historical implementation-wave documents unchanged.

After transfer, the current preview state is the technical baseline for the new approach.

## Transfer method

Use the repository's normal GitHub branch/PR transfer path rather than rewriting history.

The source lineage should be transferred to `real-wargame-preview` only after documentation is committed and the user has reviewed this written checkpoint specification.

`main` is not part of this operation.

## Verification

Before calling the transfer complete:

- confirm the exact current source head;
- confirm `real-wargame-preview` has not unexpectedly diverged;
- use an existing mergeable PR or a clean transfer PR;
- merge only to `real-wargame-preview`;
- read back the resulting preview HEAD;
- report the exact resulting SHA and PR/merge identity.

No new visual polish, screenshots, deployment, or product-code changes are part of this transfer operation.
