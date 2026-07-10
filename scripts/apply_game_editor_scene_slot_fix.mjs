import fs from 'node:fs';

// Triggered after the workflow exists on the preview branch.
const file = 'src/ui/GameEditorWorkbench.ts';
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  {
    from: "  const status = document.createElement('div');\n  status.className = 'game-editor-status';\n  let activeTab: WorkbenchTab = 'object';",
    to: "  const status = document.createElement('div');\n  status.className = 'game-editor-status';\n  const sceneToolsSlot = document.createElement('div');\n  sceneToolsSlot.className = 'editor-scene-tools-slot';\n  sceneToolsSlot.hidden = true;\n  let activeTab: WorkbenchTab = 'object';",
  },
  {
    from: "    body.replaceChildren();\n    if (activeTab === 'object') renderObjectPanel(body, state, drafts, onChanged, render);",
    to: "    body.replaceChildren();\n    if (activeTab !== 'scene') {\n      sceneToolsSlot.hidden = true;\n      root.appendChild(sceneToolsSlot);\n    }\n    if (activeTab === 'object') renderObjectPanel(body, state, drafts, onChanged, render);",
  },
  {
    from: "    if (activeTab === 'scene') renderScenePanel(body, state, onChanged, render);",
    to: "    if (activeTab === 'scene') renderScenePanel(body, state, onChanged, render, sceneToolsSlot);",
  },
  {
    from: "  root.append(header, tabRow, body, status);",
    to: "  root.append(header, tabRow, body, status, sceneToolsSlot);",
  },
  {
    from: "function renderScenePanel(\n  target: HTMLElement,\n  state: SimulationState,\n  onChanged: () => void,\n  rerender: () => void,\n): void {",
    to: "function renderScenePanel(\n  target: HTMLElement,\n  state: SimulationState,\n  onChanged: () => void,\n  rerender: () => void,\n  sceneToolsSlot: HTMLElement,\n): void {",
  },
  {
    from: "  const slot = document.createElement('div');\n  slot.className = 'editor-scene-tools-slot';\n  target.append(\n    panelHeading('Сцена', 'Видимость слоёв, сохранение, загрузка и очистка всей испытательной сцены.'),\n    layers,\n    slot,",
    to: "  sceneToolsSlot.hidden = false;\n  target.append(\n    panelHeading('Сцена', 'Видимость слоёв, сохранение, загрузка и очистка всей испытательной сцены.'),\n    layers,\n    sceneToolsSlot,",
  },
];

for (const replacement of replacements) {
  const count = source.split(replacement.from).length - 1;
  if (count !== 1) throw new Error(`Expected one occurrence, found ${count}: ${replacement.from}`);
  source = source.replace(replacement.from, replacement.to);
}

fs.writeFileSync(file, source, 'utf8');
