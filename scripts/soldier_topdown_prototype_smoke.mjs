import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const required = [
  'soldier-topdown-prototype.html',
  'src/soldier-topdown/SoldierRenderer.ts',
  'src/soldier-topdown/SoldierPrototypePage.ts',
  'src/soldier-topdown/soldier-topdown-prototype.css',
];

for (const file of required) {
  if (!exists(file)) throw new Error(`missing ${file}`);
}

const renderer = read('src/soldier-topdown/SoldierRenderer.ts');
for (const pose of ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim']) {
  if (!renderer.includes(`'${pose}'`)) throw new Error(`missing pose ${pose}`);
}
for (const weapon of ['mosin','ppsh41','dp27']) {
  if (!renderer.includes(`'${weapon}'`)) throw new Error(`missing weapon ${weapon}`);
}

const page = read('src/soldier-topdown/SoldierPrototypePage.ts');
for (const token of ['bodyDirection','attentionDirection','weaponDirection','24','32','48','64']) {
  if (!page.includes(token)) throw new Error(`missing page control token ${token}`);
}

const vite = read('vite.config.ts');
if (!vite.includes('soldier-topdown-prototype.html')) throw new Error('vite input missing soldier prototype');

console.log('soldier top-down prototype contract: PASS');
