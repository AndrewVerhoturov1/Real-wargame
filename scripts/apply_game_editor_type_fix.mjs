import fs from 'node:fs';

// Triggered after the workflow exists on the preview branch.
const file = 'src/ui/GameEditorWorkbench.ts';
let source = fs.readFileSync(file, 'utf8');
const from = `function collapsibleNumbers<T extends Record<string, number>>(
  title: string,
  fields: Array<[keyof T, string]>,
  record: T,
): HTMLElement {
  const details = document.createElement('details');
  details.className = 'game-editor-details';
  const summary = document.createElement('summary');
  summary.textContent = title;
  const content = document.createElement('div');
  content.className = 'game-editor-details-body';
  for (const [key, label] of fields) {
    content.append(numberField(label, record[key], 0, 100, 1, (value) => { record[key] = value; }));
  }
  details.append(summary, content);
  return details;
}`;
const to = `function collapsibleNumbers<T extends object>(
  title: string,
  fields: Array<[keyof T, string]>,
  record: T,
): HTMLElement {
  const details = document.createElement('details');
  details.className = 'game-editor-details';
  const summary = document.createElement('summary');
  summary.textContent = title;
  const content = document.createElement('div');
  content.className = 'game-editor-details-body';
  for (const [key, label] of fields) {
    const current = Number(record[key]);
    content.append(numberField(label, current, 0, 100, 1, (value) => {
      (record as unknown as Record<keyof T, number>)[key] = value;
    }));
  }
  details.append(summary, content);
  return details;
}`;
if (!source.includes(from)) throw new Error('Expected collapsibleNumbers block was not found.');
source = source.replace(from, to);
fs.writeFileSync(file, source, 'utf8');
