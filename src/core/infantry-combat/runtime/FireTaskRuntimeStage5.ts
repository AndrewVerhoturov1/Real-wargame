/**
 * Stage 5 compatibility entry point.
 *
 * The production FireTask contract was superseded by the backwards-compatible
 * Stage 8 implementation. Keeping one implementation prevents the old
 * single-shot path from drifting away from FireTask V2 migration, cadence and
 * save/load semantics.
 */
export * from './FireTaskRuntimeStage8';
