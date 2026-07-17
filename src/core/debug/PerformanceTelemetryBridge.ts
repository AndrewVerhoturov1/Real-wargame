import { clearPerformanceCheckpoint, loadPerformanceCheckpoint } from './PerformanceCheckpointStore';
import type {
  OperationSampleInputV6,
  PerformanceCaptureStatusV6,
  QueueTransitionInputV6,
} from './PerformanceCaptureV6';
import type { PerformanceCauseV6, PerformanceEventPriority, PerformanceReportV6 } from './PerformanceReportV6';

export interface ActivePerformanceTelemetryV6 {
  addMarker(label: string): void;
  getStatus(): PerformanceCaptureStatusV6;
  recordEvent(type: string, data?: Readonly<Record<string, unknown>>, priority?: PerformanceEventPriority, cause?: PerformanceCauseV6, operationId?: string): void;
  recordQueueTransition(input: QueueTransitionInputV6): void;
  recordWork(subsystem: string, counters: Readonly<Record<string, number>>): void;
  recordOperation(input: OperationSampleInputV6): void;
}

let activeTelemetry: ActivePerformanceTelemetryV6 | null = null;

export function registerActivePerformanceTelemetry(telemetry: ActivePerformanceTelemetryV6): () => void {
  activeTelemetry = telemetry;
  return () => {
    if (activeTelemetry === telemetry) activeTelemetry = null;
  };
}

export function addPerformanceUserMarker(label: string): boolean {
  if (!activeTelemetry) return false;
  activeTelemetry.addMarker(label);
  return true;
}

export function recordPerformanceEvent(
  type: string,
  data: Readonly<Record<string, unknown>> = {},
  priority: PerformanceEventPriority = 'normal',
  cause?: PerformanceCauseV6,
  operationId?: string,
): boolean {
  if (!activeTelemetry) return false;
  activeTelemetry.recordEvent(type, data, priority, cause, operationId);
  return true;
}

export function recordPerformanceQueueTransition(input: QueueTransitionInputV6): boolean {
  if (!activeTelemetry) return false;
  activeTelemetry.recordQueueTransition(input);
  return true;
}

export function recordPerformanceWork(subsystem: string, counters: Readonly<Record<string, number>>): boolean {
  if (!activeTelemetry) return false;
  activeTelemetry.recordWork(subsystem, counters);
  return true;
}

export function recordPerformanceOperation(input: OperationSampleInputV6): boolean {
  if (!activeTelemetry) return false;
  activeTelemetry.recordOperation(input);
  return true;
}

export function getActivePerformanceStatus(): PerformanceCaptureStatusV6 | null {
  return activeTelemetry?.getStatus() ?? null;
}

export async function loadRecoveredPerformanceReport(): Promise<PerformanceReportV6 | null> {
  return (await loadPerformanceCheckpoint())?.report ?? null;
}

export async function hasRecoveredPerformanceReport(): Promise<boolean> {
  return (await loadPerformanceCheckpoint()) !== null;
}

export async function clearRecoveredPerformanceReport(): Promise<void> {
  await clearPerformanceCheckpoint();
}
