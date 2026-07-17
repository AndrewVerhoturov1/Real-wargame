import {
  PERFORMANCE_REPORT_SCHEMA_VERSION,
  PERFORMANCE_REPORT_VERSION,
  validatePerformanceReportV6,
  type PerformanceReportV6,
} from './PerformanceReportV6';
import { PerformanceCaptureV6, type PerformanceCheckpointPayloadV6 } from './PerformanceCaptureV6';

const DATABASE_NAME = 'real-wargame-performance-v6';
const DATABASE_VERSION = 1;
const STORE_NAME = 'captures';
const LATEST_KEY = 'latest-incomplete';

interface StoredCheckpointV6 extends PerformanceCheckpointPayloadV6 {
  readonly key: typeof LATEST_KEY;
}

export interface RecoveredPerformanceCheckpointV6 {
  readonly payload: PerformanceCheckpointPayloadV6;
  readonly report: PerformanceReportV6;
}

export function isPerformanceCheckpointStorageSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function savePerformanceCheckpoint(payload: PerformanceCheckpointPayloadV6): Promise<void> {
  if (!isPerformanceCheckpointStorageSupported()) return;
  const validation = validatePerformanceReportV6(payload.report);
  if (!validation.ok) throw new Error(`Cannot checkpoint invalid performance-report-v6: ${validation.errors.join('; ')}`);
  const database = await openDatabase();
  try {
    await runRequest<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Performance checkpoint transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Performance checkpoint transaction aborted.'));
      transaction.objectStore(STORE_NAME).put({ ...payload, key: LATEST_KEY } satisfies StoredCheckpointV6);
    });
  } finally {
    database.close();
  }
}

export async function loadPerformanceCheckpoint(nowEpochMs = Date.now()): Promise<RecoveredPerformanceCheckpointV6 | null> {
  if (!isPerformanceCheckpointStorageSupported()) return null;
  const database = await openDatabase();
  try {
    const stored = await runRequest<StoredCheckpointV6 | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(LATEST_KEY);
      request.onsuccess = () => resolve(request.result as StoredCheckpointV6 | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read performance checkpoint.'));
    });
    if (!stored) return null;
    if (stored.version !== PERFORMANCE_REPORT_VERSION || stored.schemaVersion !== PERFORMANCE_REPORT_SCHEMA_VERSION) return null;
    const validation = validatePerformanceReportV6(stored.report);
    if (!validation.ok) return null;
    return {
      payload: stored,
      report: PerformanceCaptureV6.recoverCheckpoint(stored, nowEpochMs),
    };
  } finally {
    database.close();
  }
}

export async function clearPerformanceCheckpoint(): Promise<void> {
  if (!isPerformanceCheckpointStorageSupported()) return;
  const database = await openDatabase();
  try {
    await runRequest<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear performance checkpoint.'));
      transaction.objectStore(STORE_NAME).delete(LATEST_KEY);
    });
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open performance checkpoint database.'));
    request.onblocked = () => reject(new Error('Performance checkpoint database upgrade is blocked.'));
  });
}

function runRequest<T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  return new Promise<T>(executor);
}
