# HANDOFF — Graph v2 typed contracts and subgraphs

Updated: 2026-07-13
Repository: `AndrewVerhoturov1/Real-wargame`
Base branch: `real-wargame-preview`
Temporary branch: `transfer/ai-graph-v2-preview-ready-2026-07-13`
Draft PR: `#89`

## Transfer boundary

- Work remains isolated on the temporary branch.
- The user requested preparation for transfer. Keep the clean transfer PR unmerged until the final exact-SHA visual QA is green; then it is ready for the user’s merge command.
- Do not modify `main`.
- Before transfer, compare the branch with current preview and repeat required core/build checks if preview moved.

## Implemented

- one contract registry for runtime and editor metadata;
- 36 registered node types;
- typed parameters, ranges, enums and ports;
- Graph v1 → Graph v2 deterministic migration;
- unknown legacy data preserved in `legacyMetadata`;
- strict error/warning/info validation;
- five isolated memory scopes;
- `WaitForEvent`, `Timeout` and bounded `Retry`;
- four static subgraphs with explicit bindings;
- active subgraph snapshot/restore without repeated `start`;
- Russian contract controls and visible subgraph selector inside the human node panel;
- incompatible-link prevention with a Russian reason;
- Graph v1 migration action, clickable error panel and subgraph breadcrumbs;
- active subgraph path and memory scopes in runtime debug;
- local engine and CLI compatibility with Graph v1/v2;
- automatic `shot_nearby → take_cover → restore → move_and_observe` scenario.

## Key files

```text
src/core/ai/contracts/
src/core/ai/runtime/AiSubgraphRuntime.ts
src/core/ai/runtime/actions/WaitForEventAction.ts
src/data/ai/subgraphs/
src/ai-node-editor/node-contract-ui.ts
src/ai-node-editor/subgraph-ui.ts
src/ai-node-editor/main.ts
src/ai-node-editor/stateful-node-ui.ts
src/ai-node-editor/runtime-debug-overlay.ts
scripts/ai_graph_v2_*_smoke.*
scripts/ai_runtime_modifiers_smoke.*
scripts/ai_subgraph_runtime_smoke.*
scripts/ai_node_contract_ui_smoke.*
docs/subprojects/ai-single-unit-editor/GRAPH_V2_TYPED_CONTRACTS_AND_SUBGRAPHS.md
```

## Transfer readiness

- The complete local regression list and production build have passed on the isolated branch.
- clean transfer PR contains a dedicated system-Chrome scenario for Graph v2 migration, the visible Russian subgraph panel, validation errors and breadcrumb navigation.
- Exact workflow run ids, artifact digests and inspected PNG names are reported in the final implementation report.
- After that evidence is green, the only remaining action is a separate explicit user command to transfer the branch into `real-wargame-preview`.
- Keep the clean transfer PR unmerged until exact-SHA Chromium QA and PNG inspection are complete.

## Manual verification after future transfer

See `GRAPH_V2_TYPED_CONTRACTS_AND_SUBGRAPHS.md`, section «Что проверить вручную после переноса».
