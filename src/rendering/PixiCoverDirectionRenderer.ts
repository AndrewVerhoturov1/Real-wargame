import { Container } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';

/**
 * Compatibility renderer retained until PixiApp removes the slot.
 *
 * The old selected-object/selected-threat geometry was deleted.
 * Directional protection is now calculated only by the shared soldier awareness fields
 * and visualized through field-driven tactical positions.
 */
export class PixiCoverDirectionRenderer {
  readonly container = new Container();

  render(_state: SimulationState): void {
    if (this.container.children.length > 0) this.container.removeChildren();
    this.container.visible = false;
  }

  destroy(): void {
    this.container.removeChildren();
    this.container.destroy();
  }
}
