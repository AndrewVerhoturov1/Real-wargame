import type { EntityContextMenuRoutes } from './EntityContextMenu';

let registeredRoutes: EntityContextMenuRoutes | null = null;

/**
 * Registers presentation navigation owned by the active product surface.
 * Gameplay truth remains in the existing selection, right-panel and editor owners.
 */
export function registerEntityContextMenuRoutes(routes: EntityContextMenuRoutes): () => void {
  if (registeredRoutes && registeredRoutes !== routes) {
    throw new Error('Entity context menu routes are already registered.');
  }
  registeredRoutes = routes;
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    if (registeredRoutes === routes) registeredRoutes = null;
  };
}

export function getRegisteredEntityContextMenuRoutes(): EntityContextMenuRoutes {
  return registeredRoutes ?? Object.freeze({});
}
