import { Container } from 'pixi.js';
import type { TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

export class PixiViewConeRenderer {
  readonly container = new Container();

  render(_map: TacticalMap, _units: UnitModel[], _selectedUnitIds: string[]): void {
    this.container.removeChildren();
  }
}
