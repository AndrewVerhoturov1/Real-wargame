import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/core/simulation/SimulationState.ts';
let content = await readFile(path, 'utf8');

const importAnchor = "import { distance, type GridPosition } from '../geometry';";
const importReplacement = "import { getGameEditorDrafts } from '../editor/GameEditorDrafts';\nimport { distance, type GridPosition } from '../geometry';";
if (!content.includes(importReplacement)) {
  if (!content.includes(importAnchor)) throw new Error('Missing GameEditorDrafts import anchor.');
  content = content.replace(importAnchor, importReplacement);
}

const oldBlock = `function spawnEditorUnit(state: SimulationState, grid: GridPosition): void {\n  if (!state.editor.layers.units) {\n    state.editor.lastMessage = 'Слой юнитов скрыт. Включи слой, чтобы создавать юнитов.';\n    return;\n  }\n\n  const index = state.editor.nextUnitIndex;\n  const id = \`editor_unit_\${index}\`;\n  const [unit] = normalizeUnits([\n    {\n      id,\n      label: id,\n      labelRu: \`Юнит \${index}\`,\n      type: state.editor.unitType,\n      side: state.editor.unitSide,\n      x: Math.max(0, Math.floor(grid.x)),\n      y: Math.max(0, Math.floor(grid.y)),\n      behaviorProfile: 'regular',\n    },\n  ]);\n\n  unit.position = grid;\n  state.units.push(unit);\n  state.editor.nextUnitIndex = index + 1;\n  state.editor.selectedObjectId = null;\n  state.editor.selectedZoneId = null;\n  state.editor.drag = null;\n  selectUnit(state, id);\n  state.editor.lastMessage = \`Создан юнит: \${id}\`;\n}`;

const newBlock = `function spawnEditorUnit(state: SimulationState, grid: GridPosition): void {\n  if (!state.editor.layers.units) {\n    state.editor.lastMessage = 'Слой юнитов скрыт. Включи слой, чтобы создавать юнитов.';\n    return;\n  }\n\n  const index = state.editor.nextUnitIndex;\n  const id = \`editor_unit_\${index}\`;\n  const draft = getGameEditorDrafts(state).unit;\n  const label = draft.name.trim() || \`Юнит \${index}\`;\n  const [unit] = normalizeUnits([\n    {\n      id,\n      label,\n      labelRu: label,\n      type: draft.type,\n      side: draft.side,\n      x: Math.max(0, Math.floor(grid.x)),\n      y: Math.max(0, Math.floor(grid.y)),\n      speedCellsPerSecond: draft.speedCellsPerSecond,\n      heldItem: draft.heldItem,\n      facingDegrees: draft.facingDegrees,\n      viewAngleDegrees: draft.viewAngleDegrees,\n      viewRangeCells: draft.viewRangeCells,\n      behaviorProfile: draft.profile,\n      soldier: {\n        traits: { ...draft.traits },\n        condition: { ...draft.condition },\n      },\n      attention: draft.attention,\n      initialState: {\n        posture: draft.posture,\n        stress: draft.stress,\n        suppression: draft.suppression,\n        ammo: Math.round(draft.ammo),\n        weaponReady: draft.weaponReady,\n      },\n    },\n  ]);\n\n  unit.position = grid;\n  state.units.push(unit);\n  state.editor.nextUnitIndex = index + 1;\n  state.editor.selectedObjectId = null;\n  state.editor.selectedZoneId = null;\n  state.editor.drag = null;\n  selectUnit(state, id);\n  state.editor.lastMessage = \`Создан боец: \${label} · \${draft.side === 'red' ? 'Противник' : 'Свои'}\`;\n}`;

if (!content.includes(newBlock)) {
  if (!content.includes(oldBlock)) throw new Error('Missing spawnEditorUnit patch anchor.');
  content = content.replace(oldBlock, newBlock);
}

await writeFile(path, content, 'utf8');
console.log('Unit spawning now consumes the complete editor draft.');
