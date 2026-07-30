export type CombatLabSelectedEntityV1 =
  | { readonly kind: 'none' }
  | { readonly kind: 'participant'; readonly roleId: string; readonly unitId: string }
  | { readonly kind: 'marker'; readonly markerId: string }
  | { readonly kind: 'scene' };

export type CombatLabSelectionListenerV1 = (selection: CombatLabSelectedEntityV1) => void;

export function combatLabSelectionsEqual(
  left: CombatLabSelectedEntityV1,
  right: CombatLabSelectedEntityV1,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'participant':
      return right.kind === 'participant' && left.roleId === right.roleId && left.unitId === right.unitId;
    case 'marker':
      return right.kind === 'marker' && left.markerId === right.markerId;
    case 'none':
    case 'scene':
      return true;
  }
}
