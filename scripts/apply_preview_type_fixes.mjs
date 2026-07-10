import fs from 'node:fs';

const file = 'src/ai-node-editor/main.ts';
let source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

const guard = "if (!root) throw new Error('AI node editor root is missing.');";
if (!source.includes(guard)) {
  throw new Error(`${file}: root guard not found`);
}
if (!source.includes('const editorRoot = root;')) {
  source = source.replace(guard, `${guard}\nconst editorRoot = root;`);
}

const renderTarget = '  root.innerHTML = `';
if (!source.includes(renderTarget) && !source.includes('  editorRoot.innerHTML = `')) {
  throw new Error(`${file}: render target not found`);
}
source = source.replace(renderTarget, '  editorRoot.innerHTML = `');

fs.writeFileSync(file, source, 'utf8');
console.log(`patched ${file}`);
