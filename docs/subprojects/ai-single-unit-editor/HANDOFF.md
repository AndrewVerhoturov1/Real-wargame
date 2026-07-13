# HANDOFF — Graph v2 typed contracts and subgraphs

Updated: 2026-07-13
Repository: `AndrewVerhoturov1/Real-wargame`
Base branch: `real-wargame-preview`
Transfer branch: `transfer/ai-graph-v2-preview-2026-07-13`
Prepared base SHA: `db80f36edaf018c6a45dfeb7cc0f7caaed00bdb5`

## Transfer boundary

- The clean transfer tree is based directly on the current preview SHA above.
- `main` must not be modified.
- Merge into `real-wargame-preview` only after the transfer PR has green CI and an exact-SHA system-Chrome run with inspected PNGs.
- If preview moves before merge, rebuild the transfer branch on the new preview head and repeat focused core/build/visual checks.

## Implemented

- one contract registry for runtime and editor metadata;
- 36 registered node types;
- typed parameters, ranges, enums and ports;
- deterministic Graph v1 → Graph v2 migration with `legacyMetadata` preservation;
- strict error/warning/info validation;
- five isolated memory scopes;
- `WaitForEvent`, `Timeout` and bounded `Retry`;
- four static subgraphs with explicit input/output bindings;
- active subgraph snapshot/restore without repeated `start`;
- visible Russian subgraph selector, cancellation policy and real ports inside the human node panel;
- incompatible-link prevention with a Russian reason;
- clickable validation issues and subgraph breadcrumbs;
- active subgraph path and memory scopes in runtime debug;
- local engine and CLI compatibility with Graph v1/v2;
- automatic `shot_nearby → take_cover → restore → move_and_observe` scenario.

## Visual fixes found before transfer

1. The visible selector originally changed only the textarea while the old inspector selector overwrote it. Saving now prioritizes `#stateful-subgraph-id`, and `move_and_observe` remains in the graph and local storage.
2. The breadcrumb originally repeated the selected subgraph name. It now shows one clean path: `Главный граф → Двигаться и наблюдать`.

## Verification completed locally

- full Graph v2/runtime/events/navigation/attention/perception/editor/docs regression passed;
- production build passed;
- system Chromium executed the exact production editor bundle;
- inspected PNGs:
  - `graph-v2-subgraph-russian-panel.png`;
  - `graph-v2-migration-and-errors.png`;
  - `graph-v2-subgraph-breadcrumb.png`.

## Remaining transfer gate

- publish `transfer/ai-graph-v2-preview-2026-07-13`;
- open a PR to `real-wargame-preview`;
- run the manual exact-SHA screenshot workflow, which now includes `tests/ai-graph-v2-editor.spec.ts`;
- download and inspect the new screenshot and Playwright-log artifacts;
- merge only after those checks are green.

## Manual verification after transfer

See `GRAPH_V2_TYPED_CONTRACTS_AND_SUBGRAPHS.md`, section «Что проверить вручную после переноса».
