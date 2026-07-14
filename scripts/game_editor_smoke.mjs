import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function expectIncludes(relativePath, snippets) {
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (content.includes(snippet)) failures.push(`${relativePath}: legacy snippet still present ${JSON.stringify(snippet)}`);
  }
}

expectIncludes('src/core/editor/GameEditorDrafts.ts', [
  'ObjectCreationDraft',
  'UnitCreationDraft',
  'ThreatCreationDraft',
  'TerrainCreationDraft',
  'coverProtection',
  'weaponReady',
  'directionDegrees',
  'brushShape',
  'side: UnitSide',
  'state.editor.unitSide = drafts.unit.side',
  'resetObjectDraftForKind',
  'resetUnitDraftForProfile',
]);

expectIncludes('src/core/editor/GameEditorPlacement.ts', [
  'placeConfiguredEditorEntity',
  "tool === 'spawn_object'",
  "tool === 'spawn_unit'",
  'normalizeUnits',
  'normalizePressureZones',
  'coverProtection: draft.coverProtection',
  'side: draft.side',
  'soldier:',
  'directionDegrees: draft.directionDegrees',
]);
expectExcludes('src/core/editor/GameEditorPlacement.ts', [
  "side: 'player'",
]);

expectIncludes('src/ui/GameEditorWorkbench.ts', [
  "type WorkbenchTab = 'object' | 'unit' | 'threat' | 'terrain' | 'scene'",
  'Настрой шаблон → поставь на карту → выбери и исправь',
  "selectField('Сторона'",
  'draft.side = value',
  'unit.side = draft.side',
  'Ставить предмет',
  'Ставить бойца',
  'Ставить угрозу',
  'Рисовать высоту',
  'Рисовать лес',
  'Взять параметры выбранного',
  'Применить к выбранному',
  'editor-scene-tools-slot',
]);

expectIncludes('src/input/BoardInputController.ts', [
  'placeConfiguredEditorEntity',
  'isSpawnTool',
]);

expectIncludes('src/core/map/MapPaint.ts', [
  "export type TerrainBrushShape = 'circle' | 'square'",
  "shape === 'square'",
]);

expectIncludes('src/main.ts', [
  "import './game-editor.css'",
  'installGameEditorWorkbench',
]);
expectExcludes('src/main.ts', [
  'installEditorControls(',
  'installTerrainBrushControls(',
]);

expectIncludes('src/game-editor.css', [
  '.game-editor-workbench',
  '.game-editor-tabs',
  '.game-editor-field',
  '.game-editor-selected-summary',
]);

if (failures.length > 0) {
  console.error('Unified game editor smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Unified game editor smoke passed.');
