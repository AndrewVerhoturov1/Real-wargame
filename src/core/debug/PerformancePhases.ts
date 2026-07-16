const PERFORMANCE_PHASE_PREFIX = 'real-wargame.phase.';
const MIN_RECORDED_PHASE_DURATION_MS = 8;

/**
 * Records only potentially relevant synchronous phases. The threshold keeps normal
 * per-frame instrumentation from becoming a source of allocation pressure itself.
 */
export function measurePerformancePhase<T>(name: string, callback: () => T): T {
  const startedAt = performance.now();
  try {
    return callback();
  } finally {
    const duration = performance.now() - startedAt;
    if (duration >= MIN_RECORDED_PHASE_DURATION_MS) {
      performance.measure(`${PERFORMANCE_PHASE_PREFIX}${name}`, {
        start: startedAt,
        duration,
      });
    }
  }
}
