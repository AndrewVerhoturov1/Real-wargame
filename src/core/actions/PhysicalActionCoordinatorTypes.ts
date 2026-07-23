export const PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION = 1 as const;

export const PHYSICAL_ACTION_CHANNELS = [
  'locomotion',
  'posture',
  'weapon',
] as const;

export type PhysicalActionChannel =
  typeof PHYSICAL_ACTION_CHANNELS[number];

export type PhysicalActionOwnerSource =
  | 'player'
  | 'player_command'
  | 'movement'
  | 'tactical_position'
  | 'test'
  | 'system'
  | 'graph_v2'
  | 'future_ai';

export interface PhysicalActionOwner {
  readonly source: PhysicalActionOwnerSource;
  readonly id: string;
}

export interface PhysicalActionHandleV1 {
  readonly actionId: string;
  readonly sequence: number;
  readonly revision: number;
  readonly ownerToken: string;
}

export interface PhysicalActionLeaseV1 {
  readonly schemaVersion: typeof PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION;
  readonly handle: PhysicalActionHandleV1;
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly channels: PhysicalActionChannel[];
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export type PhysicalActionTerminalStatus =
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface PhysicalActionTerminalResultV1 {
  readonly handle: PhysicalActionHandleV1;
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly channels: PhysicalActionChannel[];
  readonly status: PhysicalActionTerminalStatus;
  readonly resultCode: string;
  readonly resultRu: string;
  readonly endedSeconds: number;
}

export interface PhysicalActionCoordinatorStateV1 {
  readonly schemaVersion: typeof PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION;
  revision: number;
  nextSequence: number;
  activeLeases: PhysicalActionLeaseV1[];
  lastResult: PhysicalActionTerminalResultV1 | null;
  lastDiagnosticCode: string | null;
  lastDiagnosticRu: string | null;
}

export interface PhysicalActionCoordinatorUnitLike {
  readonly id: string;
  readonly behaviorRuntime: {
    physicalActionCoordinator: PhysicalActionCoordinatorStateV1;
  };
}

export interface RequestPhysicalActionChannelsInput {
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly channels: readonly PhysicalActionChannel[];
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PhysicalActionConflictV1 {
  readonly channel: PhysicalActionChannel;
  readonly actionId: string;
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
}

export type PhysicalActionRequestStatus =
  | 'started'
  | 'already_running'
  | 'blocked'
  | 'invalid_request';

export interface PhysicalActionRequestResultV1 {
  readonly accepted: boolean;
  readonly status: PhysicalActionRequestStatus;
  readonly handle: PhysicalActionHandleV1 | null;
  readonly lease: PhysicalActionLeaseV1 | null;
  readonly conflicts: PhysicalActionConflictV1[];
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface FinishPhysicalActionInput {
  readonly endedSeconds: number;
  readonly resultCode: string;
  readonly resultRu: string;
}

export type PhysicalActionFinishStatus =
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'already_finished'
  | 'stale_handle'
  | 'not_found'
  | 'invalid_request';

export interface PhysicalActionFinishResultV1 {
  readonly accepted: boolean;
  readonly status: PhysicalActionFinishStatus;
  readonly result: PhysicalActionTerminalResultV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PhysicalActionLeaseDiagnosticV1 {
  readonly actionId: string;
  readonly actionType: string;
  readonly sequence: number;
  readonly revision: number;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly channels: PhysicalActionChannel[];
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PhysicalActionCoordinatorDiagnosticsV1 {
  readonly schemaVersion: typeof PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION;
  readonly revision: number;
  readonly nextSequence: number;
  readonly activeLeases: PhysicalActionLeaseDiagnosticV1[];
  readonly channels: Record<PhysicalActionChannel, PhysicalActionLeaseDiagnosticV1 | null>;
  readonly lastResult: PhysicalActionTerminalResultV1 | null;
  readonly lastDiagnosticCode: string | null;
  readonly lastDiagnosticRu: string | null;
}
