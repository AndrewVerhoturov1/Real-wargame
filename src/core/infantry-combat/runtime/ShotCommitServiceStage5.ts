/**
 * Stage 5 compatibility entry point.
 *
 * Every single shot now uses the Stage 8 atomic per-ordinal implementation.
 * This preserves the accepted Stage 5 API while avoiding a second commit
 * implementation that cannot represent projectile suppression snapshots.
 */
export * from './ShotCommitServiceStage8';
