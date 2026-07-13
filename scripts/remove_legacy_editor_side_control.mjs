import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/ui/TacticalWorkspace.ts';
let content = await readFile(path, 'utf8');
const replacements = [
  [`        <label class="editor-unit-side-control"><span>Сторона бойца</span><select data-action="editor-unit-side"><option value="blue">Свои</option><option value="red">Противник</option></select></label>\n`, ''],
  [`  const editorUnitSide = q<HTMLSelectElement>('[data-action="editor-unit-side"]');\n`, ''],
  [`  editorUnitSide.value = state.editor.unitSide;\n  editorUnitSide.addEventListener('change', () => {\n    state.editor.unitSide = (editorUnitSide.value === 'red' ? 'red' : 'blue') as UnitSide;\n    state.editor.lastMessage = state.editor.unitSide === 'red' ? 'Новые бойцы будут противниками.' : 'Новые бойцы будут своими.';\n    onChanged();\n  });\n`, ''],
  [`    editorUnitSide.closest<HTMLElement>('.editor-unit-side-control')!.hidden = mode !== 'editor';\n`, ''],
];
for (const [from, to] of replacements) {
  if (!content.includes(from)) throw new Error(`Missing legacy side-control anchor: ${from.slice(0, 80)}`);
  content = content.replace(from, to);
}
await writeFile(path, content, 'utf8');
console.log('Removed legacy editor side control.');
