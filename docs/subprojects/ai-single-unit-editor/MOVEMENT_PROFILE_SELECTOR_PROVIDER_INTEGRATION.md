# Movement profile selector provider integration

## Current boundary

The generic AI node contract UI does not parse movement-profile JSON and does not access browser storage.

It consumes only the UI-facing interface:

```ts
export interface MovementProfileSelectorProvider {
  listProfiles(): readonly {
    id: string;
    nameRu: string;
    revision?: number;
  }[];
}
```

`node-contract-ui.ts` calls the provider and serializes only the selected string profile ID into the graph. Until the registry/editor result is integrated, the provider falls back to the six canonical built-in profiles:

```text
normal_walk
stealth_move
crouched_move
run
sprint
crawl
```

## Required adapter from PR #133

The real integration provider must be implemented in the AI node editor/browser boundary and must use the accepted `MovementProfileBrowserStorage` plus the movement-profile selector/registry contract from PR #133.

That adapter is responsible for:

1. listing built-in and user-created profiles;
2. returning the Russian display name;
3. returning the profile definition revision when available;
4. preserving an unavailable serialized ID so the editor can display it honestly;
5. refreshing selector options after the registry changes.

The provider must not copy profile definitions into graph nodes. It must not expose `localStorage`, browser APIs or `MovementProfileBrowserStorage` to `src/core` or generic `node-contract-ui.ts`.

## Runtime boundary

The same registry snapshot can be adapted separately into `MovementProfileRegistryEntry[]` and supplied to `reconcileMovementProfileRuntime()`. The selector provider is UI-only; it does not resolve source priority, fallback, hard safety or effective `MoveOrder` state.
