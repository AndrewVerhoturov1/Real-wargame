import { getCurrentPerformancePhaseContext, type PerformancePhaseContext } from './PerformancePhases';

const MAX_CACHE_EVENTS = 2048;

export type PerformanceCacheAction = 'hit' | 'miss' | 'evict' | 'clear';
export type PerformanceCacheReason =
  | 'exact-key-reuse'
  | 'cold'
  | 'map-revision'
  | 'observer-movement'
  | 'threat-geometry'
  | 'scalar-rescore'
  | 'posture-or-height'
  | 'capacity'
  | 'explicit-clear'
  | 'unknown';

export interface PerformanceCacheEvent {
  readonly sequence: number;
  readonly atMs: number;
  readonly cache: string;
  readonly action: PerformanceCacheAction;
  readonly reason: PerformanceCacheReason;
  readonly key: string;
  readonly ownerId: string | null;
  readonly estimatedBytes: number;
  readonly cacheSizeBefore: number;
  readonly cacheSizeAfter: number;
  readonly reuseCountBeforeEviction: number | null;
  readonly context: PerformancePhaseContext | null;
}

export interface PerformanceCacheSummary {
  readonly cache: string;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly clears: number;
  readonly estimatedEvictedBytes: number;
  readonly unusedEvictionCount: number;
  readonly reuseBeforeEviction: {
    readonly min: number;
    readonly avg: number;
    readonly p50: number;
    readonly p95: number;
    readonly max: number;
  };
  readonly reasons: Readonly<Record<string, number>>;
}

export interface PerformanceCacheDiagnostics {
  readonly eventCount: number;
  readonly eventsTruncated: boolean;
  readonly events: readonly PerformanceCacheEvent[];
  readonly summaries: readonly PerformanceCacheSummary[];
}

const events: PerformanceCacheEvent[] = [];
let sequence = 0;
let totalEventCount = 0;

export function recordPerformanceCacheEvent(
  event: Omit<PerformanceCacheEvent, 'sequence' | 'atMs' | 'context'> & {
    readonly context?: PerformancePhaseContext | null;
  },
): void {
  sequence += 1;
  totalEventCount += 1;
  events.push({
    ...event,
    sequence,
    atMs: roundTwo(nowMs()),
    context: event.context === undefined
      ? getCurrentPerformancePhaseContext()
      : event.context
        ? { ...event.context }
        : null,
  });
  if (events.length > MAX_CACHE_EVENTS) events.splice(0, events.length - MAX_CACHE_EVENTS);
}

export function getPerformanceCacheDiagnostics(): PerformanceCacheDiagnostics {
  const cloned = events.map(cloneEvent);
  const cacheNames = [...new Set(cloned.map((event) => event.cache))].sort();
  return {
    eventCount: totalEventCount,
    eventsTruncated: totalEventCount > cloned.length,
    events: cloned,
    summaries: cacheNames.map((cache) => summarize(cache, cloned.filter((event) => event.cache === cache))),
  };
}

export function resetPerformanceCacheDiagnosticsForTests(): void {
  events.length = 0;
  sequence = 0;
  totalEventCount = 0;
}

function summarize(cache: string, cacheEvents: readonly PerformanceCacheEvent[]): PerformanceCacheSummary {
  const evictions = cacheEvents.filter((event) => event.action === 'evict');
  const reuseValues = evictions
    .map((event) => event.reuseCountBeforeEviction)
    .filter((value): value is number => value !== null);
  const sortedReuse = [...reuseValues].sort((left, right) => left - right);
  const reasons: Record<string, number> = {};
  for (const event of cacheEvents) reasons[event.reason] = (reasons[event.reason] ?? 0) + 1;
  return {
    cache,
    hits: cacheEvents.filter((event) => event.action === 'hit').length,
    misses: cacheEvents.filter((event) => event.action === 'miss').length,
    evictions: evictions.length,
    clears: cacheEvents.filter((event) => event.action === 'clear').length,
    estimatedEvictedBytes: evictions.reduce((sum, event) => sum + event.estimatedBytes, 0),
    unusedEvictionCount: evictions.filter((event) => event.reuseCountBeforeEviction === 0).length,
    reuseBeforeEviction: {
      min: sortedReuse[0] ?? 0,
      avg: roundTwo(sortedReuse.reduce((sum, value) => sum + value, 0) / Math.max(1, sortedReuse.length)),
      p50: percentile(sortedReuse, 0.50),
      p95: percentile(sortedReuse, 0.95),
      max: sortedReuse[sortedReuse.length - 1] ?? 0,
    },
    reasons,
  };
}

function cloneEvent(event: PerformanceCacheEvent): PerformanceCacheEvent {
  return { ...event, context: event.context ? { ...event.context } : null };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? 0;
}

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
