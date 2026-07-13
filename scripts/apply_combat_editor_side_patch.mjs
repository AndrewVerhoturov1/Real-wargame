import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const original = await readFile(path, 'utf8');
  if (original.includes(to)) return false;
  if (!original.includes(from)) throw new Error(`Missing patch anchor: ${label} in ${path}`);
  await writeFile(path, original.replace(from, to), 'utf8');
  return true;
}

const changed = [];

if (await replaceExact(
  'src/core/editor/GameEditorDrafts.ts',
  "import type { UnitHeldItem, UnitType } from '../units/UnitModel';",
  "import type { UnitHeldItem, UnitSide, UnitType } from '../units/UnitModel';",
  'unit side import',
)) changed.push('draft import');

if (await replaceExact(
  'src/core/editor/GameEditorDrafts.ts',
  `export interface UnitCreationDraft {\n  name: string;\n  type: UnitType;`,
  `export interface UnitCreationDraft {\n  name: string;\n  side: UnitSide;\n  type: UnitType;`,
  'unit draft side',
)) changed.push('draft side');

if (await replaceExact(
  'src/core/editor/GameEditorDrafts.ts',
  `  state.editor.unitType = drafts.unit.type;\n  state.editor.zoneShape = drafts.threat.shape;`,
  `  state.editor.unitType = drafts.unit.type;\n  state.editor.unitSide = drafts.unit.side;\n  state.editor.zoneShape = drafts.threat.shape;`,
  'legacy side sync',
)) changed.push('side sync');

if (await replaceExact(
  'src/core/editor/GameEditorDrafts.ts',
  `    unit: {\n      name: 'Боец',\n      type: 'infantry_squad',`,
  `    unit: {\n      name: 'Боец',\n      side: state.editor.unitSide,\n      type: 'infantry_squad',`,
  'default unit side',
)) changed.push('default side');

if (await replaceExact(
  'src/ui/GameEditorWorkbench.ts',
  "import type { UnitHeldItem, UnitModel, UnitType } from '../core/units/UnitModel';",
  "import type { UnitHeldItem, UnitModel, UnitSide, UnitType } from '../core/units/UnitModel';",
  'workbench side import',
)) changed.push('workbench import');

if (await replaceExact(
  'src/ui/GameEditorWorkbench.ts',
  `const UNIT_TYPE_OPTIONS: Array<[UnitType, string]> = [\n  ['infantry_squad', 'Пехотинец'], ['scout_team', 'Разведчик'], ['support_team', 'Поддержка'],\n];`,
  `const UNIT_TYPE_OPTIONS: Array<[UnitType, string]> = [\n  ['infantry_squad', 'Пехотинец'], ['scout_team', 'Разведчик'], ['support_team', 'Поддержка'],\n];\nconst UNIT_SIDE_OPTIONS: Array<[UnitSide, string]> = [['blue', 'Свои'], ['red', 'Противник']];`,
  'side options',
)) changed.push('side options');

if (await replaceExact(
  'src/ui/GameEditorWorkbench.ts',
  `    panelHeading('Новый боец', 'Профиль заполняет характеристики разумными значениями. После этого любое поле можно изменить вручную.'),\n    textField('Имя', draft.name, (value) => { draft.name = value; }),\n    selectField('Тип', UNIT_TYPE_OPTIONS, draft.type, (value) => { draft.type = value; syncLegacyEditorFields(state); }),`,
  `    panelHeading('Новый боец', 'Профиль заполняет характеристики разумными значениями. После этого любое поле можно изменить вручную.'),\n    textField('Имя', draft.name, (value) => { draft.name = value; }),\n    selectField('Сторона', UNIT_SIDE_OPTIONS, draft.side, (value) => {\n      draft.side = value;\n      syncLegacyEditorFields(state);\n      rerender();\n    }),\n    selectField('Тип', UNIT_TYPE_OPTIONS, draft.type, (value) => { draft.type = value; syncLegacyEditorFields(state); }),`,
  'side field',
)) changed.push('side field');

if (await replaceExact(
  'src/ui/GameEditorWorkbench.ts',
  `  Object.assign(draft, {\n    name: unit.labels.ru,\n    type: unit.type,`,
  `  Object.assign(draft, {\n    name: unit.labels.ru,\n    side: unit.side,\n    type: unit.type,`,
  'copy unit side',
)) changed.push('copy side');

if (await replaceExact(
  'src/ui/GameEditorWorkbench.ts',
  `function applyUnitDraft(unit: UnitModel, draft: GameEditorDrafts['unit']): void {\n  unit.labels = { en: draft.name || unit.id, ru: draft.name || unit.id };\n  unit.type = draft.type;`,
  `function applyUnitDraft(unit: UnitModel, draft: GameEditorDrafts['unit']): void {\n  unit.labels = { en: draft.name || unit.id, ru: draft.name || unit.id };\n  unit.side = draft.side;\n  unit.type = draft.type;`,
  'apply unit side',
)) changed.push('apply side');

if (await replaceExact(
  'src/ui/TacticalWorkspace.ts',
  "import { applyInitialStateToRuntime, type UnitModel, type UnitSide } from '../core/units/UnitModel';",
  "import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';",
  'remove side import',
)) changed.push('remove side import');

if (await replaceExact(
  'src/ui/TacticalWorkspace.ts',
  `        <label class="editor-unit-side-control"><span>Сторона бойца</span><select data-action="editor-unit-side"><option value="blue">Свои</option><option value="red">Противник</option></select></label>\n`,
  '',
  'remove top side control',
)) changed.push('remove top side control');

if (await replaceExact(
  'src/ui/TacticalWorkspace.ts',
  `  const editorUnitSide = q<HTMLSelectElement>('[data-action="editor-unit-side"]');\n`,
  '',
  'remove side query',
)) changed.push('remove side query');

if (await replaceExact(
  'src/ui/TacticalWorkspace.ts',
  `  editorUnitSide.value = state.editor.unitSide;\n  editorUnitSide.addEventListener('change', () => {\n    state.editor.unitSide = (editorUnitSide.value === 'red' ? 'red' : 'blue') as UnitSide;\n    state.editor.lastMessage = state.editor.unitSide === 'red' ? 'Новые бойцы будут противниками.' : 'Новые бойцы будут своими.';\n    onChanged();\n  });\n`,
  '',
  'remove side listener',
)) changed.push('remove side listener');

if (await replaceExact(
  'src/ui/TacticalWorkspace.ts',
  `    editorUnitSide.closest<HTMLElement>('.editor-unit-side-control')!.hidden = mode !== 'editor';\n`,
  '',
  'remove side layout sync',
)) changed.push('remove side layout sync');

console.log(JSON.stringify({ changed }));
