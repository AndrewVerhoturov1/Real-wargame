const PREFIX = 'real-wargame.phase.';
const FAST_SAMPLE_INTERVAL = 60;
const RETAIN_DURATION_MS = 4;
const MAX_RETAINED_MEASURES = 2000;
let sequence = 0;
const retainedMeasureNames: string[] = [];
const invocationCountByPhase = new Map<string, number>();

export function measurePerformancePhase<T>(name: string, operation: () => T): T {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return operation();
  const measurement = beginMeasurement(name);
  try { return operation(); }
  finally { endMeasurement(measurement); }
}

export async function measurePerformancePhaseAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return operation();
  const measurement = beginMeasurement(name);
  try { return await operation(); }
  finally { endMeasurement(measurement); }
}

interface PendingMeasurement {
  readonly id: number;
  readonly base: string;
  readonly phaseInvocation: number;
  readonly start: string;
  readonly end: string;
  readonly measure: string;
}

function beginMeasurement(name: string): PendingMeasurement {
  const id = ++sequence;
  const safeName = name.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const base = `${PREFIX}${safeName}`;
  const phaseInvocation = (invocationCountByPhase.get(base) ?? 0) + 1;
  invocationCountByPhase.set(base, phaseInvocation);
  const pending = {
    id,
    base,
    phaseInvocation,
    start: `${base}.start.${id}`,
    end: `${base}.end.${id}`,
    measure: `${base}.m.${id}`,
  };
  performance.mark(pending.start);
  return pending;
}

function endMeasurement(pending: PendingMeasurement): void {
  performance.mark(pending.end);
  const entry = performance.measure(pending.measure, pending.start, pending.end);
  performance.clearMarks(pending.start);
  performance.clearMarks(pending.end);

  const retain = entry.duration >= RETAIN_DURATION_MS
    || pending.phaseInvocation === 1
    || pending.phaseInvocation % FAST_SAMPLE_INTERVAL === 0;
  if (!retain) {
    performance.clearMeasures(pending.measure);
    return;
  }

  retainedMeasureNames.push(pending.measure);
  while (retainedMeasureNames.length > MAX_RETAINED_MEASURES) {
    const oldest = retainedMeasureNames.shift();
    if (oldest) performance.clearMeasures(oldest);
  }
}
