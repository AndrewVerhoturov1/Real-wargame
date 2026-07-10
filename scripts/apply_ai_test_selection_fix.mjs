import fs from 'node:fs';

const replacements = [
  {
    file: 'src/input/BoardInputController.ts',
    from: "import { setVisibilityProbe } from '../core/ui/RuntimeUiState';",
    to: "import {\n  getAiTestLabSelectionTarget,\n  selectAiTestLabTargetAtPosition,\n} from '../core/testing/AiTestLabSelection';\nimport { setVisibilityProbe } from '../core/ui/RuntimeUiState';",
  },
  {
    file: 'src/input/BoardInputController.ts',
    from: "    if (!this.isDragSelecting && distance(this.leftStartGrid, grid) >= DRAG_SELECT_THRESHOLD_CELLS) {",
    to: "    if (getAiTestLabSelectionTarget(this.state)) {\n      return;\n    }\n\n    if (!this.isDragSelecting && distance(this.leftStartGrid, grid) >= DRAG_SELECT_THRESHOLD_CELLS) {",
  },
  {
    file: 'src/input/BoardInputController.ts',
    from: "    if (this.isDragSelecting && this.state.selectionBox) {\n      updateSelectionBox(this.state, grid);",
    to: "    const labSelectionTarget = getAiTestLabSelectionTarget(this.state);\n    if (!this.isDragSelecting && labSelectionTarget) {\n      selectAiTestLabTargetAtPosition(this.state, grid);\n      this.clearLeftPointer(event.pointerId);\n      return;\n    }\n\n    if (this.isDragSelecting && this.state.selectionBox) {\n      updateSelectionBox(this.state, grid);",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';",
    to: "import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';\nimport {\n  setAiTestLabSelectionTarget,\n  type AiTestLabSelectionTarget,\n} from '../core/testing/AiTestLabSelection';",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "type LabTab = 'fighter' | 'threat' | 'cover' | 'test';",
    to: "type LabTab = 'fighter' | 'threat' | 'cover' | 'test';\n\nfunction selectionTargetForTab(tab: LabTab): AiTestLabSelectionTarget {\n  if (tab === 'fighter') return 'fighter';\n  if (tab === 'threat') return 'threat';\n  if (tab === 'cover') return 'cover';\n  return null;\n}",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "  let statusMessage = 'Выберите бойца, угрозу или укрытие на карте.';\n\n  const render = () => {",
    to: "  let statusMessage = 'Выберите бойца, угрозу или укрытие на карте.';\n\n  setAiTestLabSelectionTarget(state, null);\n  root.addEventListener('toggle', () => {\n    setAiTestLabSelectionTarget(state, root.open ? selectionTargetForTab(activeTab) : null);\n  });\n\n  const render = () => {",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "      activeTab = id;\n      for (const item of tabRow.querySelectorAll('button')) item.classList.remove('active');",
    to: "      activeTab = id;\n      setAiTestLabSelectionTarget(state, root.open ? selectionTargetForTab(activeTab) : null);\n      for (const item of tabRow.querySelectorAll('button')) item.classList.remove('active');",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "    container.append(createHint('Выберите зону опасности в редакторе карты. Обычную зону можно превратить в направленный огонь.'));",
    to: "    container.append(createHint('Щёлкните по сектору или его источнику прямо на карте. Редактор карты включать не нужно.'));",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "    container.append(createHint('Выберите предмет на карте. Защита действует только когда предмет находится между угрозой и бойцом.'));",
    to: "    container.append(createHint('Щёлкните по предмету прямо на карте. Угроза и боец останутся выбранными для проверки направления защиты.'));",
  },
  {
    file: 'src/ui/AiTestLabControls.ts',
    from: "  container.append(createTitle(`${object.labels?.ru ?? object.kind} — ${object.id}`));\n  container.append(createNumberControl('Физическая защита, 0–100'",
    to: "  container.append(createTitle(`${object.labels?.ru ?? object.kind} — ${object.id}`));\n  container.append(createHint('У укрытия нет навсегда заданной стороны: она определяется выбранной угрозой. Красная стрелка показывает направление огня, зелёная стрелка на карте показывает защищённую сторону.'));\n  container.append(createNumberControl('Физическая защита, 0–100'",
  },
  {
    file: 'src/rendering/PixiApp.ts',
    from: "import { PixiMapRenderer } from './PixiMapRenderer';",
    to: "import { PixiCoverDirectionRenderer } from './PixiCoverDirectionRenderer';\nimport { PixiMapRenderer } from './PixiMapRenderer';",
  },
  {
    file: 'src/rendering/PixiApp.ts',
    from: "  private readonly overlayRenderer = new PixiOverlayRenderer();\n  private readonly unitRenderer = new PixiUnitRenderer();",
    to: "  private readonly overlayRenderer = new PixiOverlayRenderer();\n  private readonly coverDirectionRenderer = new PixiCoverDirectionRenderer();\n  private readonly unitRenderer = new PixiUnitRenderer();",
  },
  {
    file: 'src/rendering/PixiApp.ts',
    from: "      this.overlayRenderer.container,\n      this.unitRenderer.container,",
    to: "      this.overlayRenderer.container,\n      this.coverDirectionRenderer.container,\n      this.unitRenderer.container,",
  },
  {
    file: 'src/rendering/PixiApp.ts',
    from: "    this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);\n    this.unitRenderer.render",
    to: "    this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);\n    this.coverDirectionRenderer.render(this.state);\n    this.unitRenderer.render",
  },
];

for (const replacement of replacements) {
  const source = fs.readFileSync(replacement.file, 'utf8');
  const occurrences = source.split(replacement.from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${replacement.file}: expected one occurrence, found ${occurrences}: ${replacement.from}`);
  }
  fs.writeFileSync(replacement.file, source.replace(replacement.from, replacement.to), 'utf8');
  console.log(`patched ${replacement.file}`);
}
