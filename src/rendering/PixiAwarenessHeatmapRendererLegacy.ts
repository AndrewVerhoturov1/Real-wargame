/**
 * Deprecated compatibility export.
 *
 * Tactical field preparation and tactical-position search are now owned by the
 * simulation-scoped TacticalPositionSearchService. The active renderer is a
 * pure snapshot consumer; this file remains only so older imports keep building
 * until the broad renderer module rename is handled separately.
 */
export * from './PixiAwarenessHeatmapRenderer';
