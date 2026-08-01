import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stylesheetPaths = [
  'src/ai-node-editor/ai-node-editor.css',
  'src/ai-node-editor/ai-node-editor-ux.css',
];

function listPositiveFixedBodyMinWidths(source) {
  const widths = [];
  const bodyRulePattern = /\bbody\s*\{([^}]*)\}/gi;
  let match;
  while ((match = bodyRulePattern.exec(source)) !== null) {
    const widthMatch = match[1].match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/i);
    if (widthMatch && Number(widthMatch[1]) > 0) widths.push(Number(widthMatch[1]));
  }
  return widths;
}

for (const relativePath of stylesheetPaths) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.deepEqual(
    listPositiveFixedBodyMinWidths(source),
    [],
    `${relativePath}: AI editor body must not enforce a positive fixed min-width`,
  );
}

console.log('AI editor responsive width smoke passed.');
