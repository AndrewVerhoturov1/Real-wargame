import type { SimulationState } from '../core/simulation/SimulationState';

/**
 * Compatibility surface retained for the radial-order input.
 *
 * Order state is already available in the lower soldier panel and the right
 * inspector. The former body-mounted card duplicated those diagnostics and
 * obscured the map whenever a player command was active, so it deliberately
 * owns no DOM and performs no periodic work.
 */
export class TacticalOrderStatusCard {
  constructor(_state: SimulationState) {}

  update(_force = false): void {}

  destroy(): void {}
}
