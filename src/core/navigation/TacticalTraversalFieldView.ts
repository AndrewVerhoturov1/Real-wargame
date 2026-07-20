import type { UnitPosture } from '../behavior/BehaviorModel';

export interface TacticalTraversalFieldView {
  readonly width: number;
  readonly height: number;
  readonly metersPerCell: number;
  readonly passable: Uint8Array;
  readonly movementCost: Float32Array;
  readonly danger: Uint8Array;
  readonly suppression: Uint8Array;
  readonly concealment: Uint8Array;
  readonly safety: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly uncertainty: Uint8Array;
  readonly reverseSlopeQuality: Uint8Array;
  readonly forwardSlopeRisk: Uint8Array;
  readonly staticProtectionByPosture: Readonly<Record<UnitPosture, Uint8Array>>;
  readonly protectedThreatIndex: Int16Array;
  readonly threatIds: readonly string[];
}

export function traversalFieldCellIndex(
  field: TacticalTraversalFieldView,
  position: { x: number; y: number },
): number {
  const x = Math.max(0, Math.min(field.width - 1, Math.floor(position.x)));
  const y = Math.max(0, Math.min(field.height - 1, Math.floor(position.y)));
  return y * field.width + x;
}
