import { AwarenessWorldRuntime } from './AwarenessWorldRuntime';

let sharedRuntime: AwarenessWorldRuntime | null = null;

export function getSharedAwarenessWorldRuntime(): AwarenessWorldRuntime {
  if (!sharedRuntime) sharedRuntime = new AwarenessWorldRuntime();
  return sharedRuntime;
}

export function destroySharedAwarenessWorldRuntime(): void {
  sharedRuntime?.destroy();
  sharedRuntime = null;
}
