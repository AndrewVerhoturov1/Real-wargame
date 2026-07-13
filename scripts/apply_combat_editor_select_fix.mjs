import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/ui/GameEditorWorkbench.ts';
const source = await readFile(path, 'utf8');
const before = `  select.value = String(value);\n  select.addEventListener('change', () => {\n    const matched = options.find(([candidate]) => String(candidate) === select.value)?.[0];\n    if (matched !== undefined) onChange(matched);\n  });`;
const after = `  select.value = String(value);\n  let committedValue = select.value;\n  const commitSelection = () => {\n    if (select.value === committedValue) return;\n    committedValue = select.value;\n    const matched = options.find(([candidate]) => String(candidate) === select.value)?.[0];\n    if (matched !== undefined) onChange(matched);\n  };\n  select.addEventListener('input', commitSelection);\n  select.addEventListener('change', commitSelection);`;

if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log('Select fix already applied.');
    process.exit(0);
  }
  throw new Error('Expected selectField block was not found.');
}

await writeFile(path, source.replace(before, after), 'utf8');
console.log('Applied robust select input/change synchronization.');
