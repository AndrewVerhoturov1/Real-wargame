import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TacticalMap } from '../core/map/MapModel';
import { TERRAIN_STYLE } from './terrainStyle';

export class PixiMapRenderer {
  readonly container = new Container();

  private readonly heightTextStyle = new TextStyle({
    fill: 0x1d2418,
    fontFamily: 'Arial, sans-serif',
    fontSize: 10,
    fontWeight: 'bold',
  });

  render(map: TacticalMap): void {
    this.container.removeChildren();

    for (const cell of map.cells) {
      const style = TERRAIN_STYLE[cell.terrain];
      const x = cell.x * map.cellSize;
      const y = cell.y * map.cellSize;
      const graphics = new Graphics();

      graphics.lineStyle(1, 0x1b2417, 0.32);
      graphics.beginFill(style.fill, 1);
      graphics.drawRect(x, y, map.cellSize, map.cellSize);
      graphics.endFill();

      if (cell.height !== 0) {
        const heightLabel = new Text(`${cell.height > 0 ? '+' : ''}${cell.height}`, this.heightTextStyle);
        heightLabel.x = x + 3;
        heightLabel.y = y + 2;
        this.container.addChild(graphics, heightLabel);
      } else {
        this.container.addChild(graphics);
      }
    }

    const border = new Graphics();
    border.lineStyle(3, 0x10160f, 0.85);
    border.drawRect(0, 0, map.width * map.cellSize, map.height * map.cellSize);
    this.container.addChild(border);
  }
}
