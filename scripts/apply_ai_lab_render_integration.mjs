import fs from 'node:fs';

function replace(file, from, to) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}: ${from}`);
  fs.writeFileSync(file, source.replace(from, to), 'utf8');
}

replace('src/rendering/PixiApp.ts',
`import { HtmlOverlayRenderer } from './HtmlOverlayRenderer';
import { PixiCoverDirectionRenderer } from './PixiCoverDirectionRenderer';`,
`import { HtmlOverlayRenderer } from './HtmlOverlayRenderer';
import { PixiAwarenessHeatmapRenderer } from './PixiAwarenessHeatmapRenderer';
import { PixiCoverDirectionRenderer } from './PixiCoverDirectionRenderer';`);
replace('src/rendering/PixiApp.ts',
`import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';`,
`import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiThreatEditorRenderer } from './PixiThreatEditorRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';`);
replace('src/rendering/PixiApp.ts',
`  private readonly mapRenderer = new PixiMapRenderer();
  private readonly viewConeRenderer = new PixiViewConeRenderer();`,
`  private readonly mapRenderer = new PixiMapRenderer();
  private readonly awarenessHeatmapRenderer = new PixiAwarenessHeatmapRenderer();
  private readonly viewConeRenderer = new PixiViewConeRenderer();`);
replace('src/rendering/PixiApp.ts',
`  private readonly coverDirectionRenderer = new PixiCoverDirectionRenderer();
  private readonly unitRenderer = new PixiUnitRenderer();`,
`  private readonly coverDirectionRenderer = new PixiCoverDirectionRenderer();
  private readonly threatEditorRenderer = new PixiThreatEditorRenderer();
  private readonly unitRenderer = new PixiUnitRenderer();`);
replace('src/rendering/PixiApp.ts',
`      this.mapRenderer.container,
      this.viewConeRenderer.container,`,
`      this.mapRenderer.container,
      this.awarenessHeatmapRenderer.container,
      this.viewConeRenderer.container,`);
replace('src/rendering/PixiApp.ts',
`      this.coverDirectionRenderer.container,
      this.unitRenderer.container,`,
`      this.coverDirectionRenderer.container,
      this.threatEditorRenderer.container,
      this.unitRenderer.container,`);
replace('src/rendering/PixiApp.ts',
`    this.orderRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
    this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);
    this.coverDirectionRenderer.render(this.state);`,
`    this.awarenessHeatmapRenderer.render(this.state);
    this.orderRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
    this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);
    this.coverDirectionRenderer.render(this.state);
    this.threatEditorRenderer.render(this.state);`);

replace('src/core/testing/AiLabInteraction.ts',
`  setAiLabStatus,
  setAiLabTool,`,
`  setAiLabPanel,
  setAiLabStatus,
  setAiLabTool,`);
replace('src/core/testing/AiLabInteraction.ts',
`    setAiLabStatus(state, \`Выбран боец: \${unit.labels.ru}. Его можно перетащить.\`);`,
`    setAiLabPanel(state, 'fighter');
    setAiLabStatus(state, \`Выбран боец: \${unit.labels.ru}. Его можно перетащить.\`);`);
replace('src/core/testing/AiLabInteraction.ts',
`    runtime.drag = createThreatDrag(zone, 'move', grid);
    setAiLabStatus(state, \`Выбрана угроза: \${zone.labels.ru}. Потяните источник или ручку.\`);`,
`    runtime.drag = createThreatDrag(zone, 'move', grid);
    setAiLabPanel(state, 'threat');
    setAiLabStatus(state, \`Выбрана угроза: \${zone.labels.ru}. Потяните источник или ручку.\`);`);
replace('src/core/testing/AiLabInteraction.ts',
`    runtime.drag = {
      kind: 'object',`,
`    setAiLabPanel(state, 'cover');
    runtime.drag = {
      kind: 'object',`);

console.log('AI lab render integration applied');
