import type { SimulationState } from '../../simulation/SimulationState';
import { tickAmmoTransferActions } from './AmmoTransferAction';
import { tickReloadWeaponActions } from './ReloadWeaponAction';
import {
  reconcileWeaponDeploymentAnchors,
  tickWeaponDeploymentActions,
  type TickWeaponActionInput,
} from './WeaponDeploymentActions';

export function tickWeaponActions(state: SimulationState, input: TickWeaponActionInput): void {
  reconcileWeaponDeploymentAnchors(state, input.intervalStartSeconds);
  tickWeaponDeploymentActions(state, input);
  tickReloadWeaponActions(state, input);
  tickAmmoTransferActions(state, input);
}
