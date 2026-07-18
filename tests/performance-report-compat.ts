interface CompatibilityBuildView {
  branch?: string;
  commitSha?: string;
  buildId?: string;
  generatedAt?: string;
  performanceContractVersion?: string;
}

/**
 * Presents a v6 report through the small legacy surface still consumed by
 * historical browser-performance specifications. The downloaded JSON remains
 * canonically v6 (`summary / report / trace`); this adapter exists only in tests.
 */
export function normalizePerformanceReport<T>(value: unknown): T {
  const root = asRecord(value);
  if (root.version !== 'performance-report-v6') return value as T;

  const summary = asRecord(root.summary);
  const identity = asRecord(summary.identity);
  const report = asRecord(root.report);
  const legacy = asRecord(report.legacyDiagnostics);
  const compatibility = asRecord(legacy.compatibility);
  const trace = asRecord(root.trace);
  const legacySamples = asArray(compatibility.v5Samples);
  const build: CompatibilityBuildView = {
    branch: asString(identity.branch),
    commitSha: asString(identity.commitSha),
    buildId: asString(identity.buildId),
    generatedAt: asString(identity.generatedAt),
    performanceContractVersion: asString(root.version),
  };

  return {
    ...root,
    build,
    browser: asRecord(identity.browser),
    scene: asRecord(compatibility.v5Scene),
    computation: asRecord(legacy.computation),
    longTasks: asArray(legacy.browserLongTasks),
    longAnimationFrames: asArray(legacy.longAnimationFrames),
    performancePhaseMeasures: asArray(legacy.performancePhaseMeasures),
    samples: legacySamples.length > 0 ? legacySamples : asArray(trace.frames),
  } as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
