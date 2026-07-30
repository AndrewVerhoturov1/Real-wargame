export type CombatLabMapToolModeV1 =
  | 'select'
  | 'manual_control'
  | 'program_authoring'
  | 'place_participant'
  | 'rotate_participant'
  | 'move_marker'
  | 'resize_circle_marker';

export type CombatLabPersistentMapToolModeV1 = Extract<
  CombatLabMapToolModeV1,
  'select' | 'manual_control' | 'program_authoring'
>;

export type CombatLabTemporaryMapToolModeV1 = Exclude<
  CombatLabMapToolModeV1,
  CombatLabPersistentMapToolModeV1
>;

export interface CombatLabMapToolPointerV1 {
  readonly xMetres: number;
  readonly yMetres: number;
}

export interface CombatLabMapToolTransactionV1 {
  readonly mode: CombatLabMapToolModeV1;
  preview(pointer: CombatLabMapToolPointerV1): void;
  confirm(): void;
  cancel(): void;
}

export interface CombatLabMapToolContributorV1<TRequest = unknown> {
  readonly mode: CombatLabTemporaryMapToolModeV1;
  createTransaction(request: TRequest): CombatLabMapToolTransactionV1;
}

export type CombatLabMapToolModeListenerV1 = (mode: CombatLabMapToolModeV1) => void;
