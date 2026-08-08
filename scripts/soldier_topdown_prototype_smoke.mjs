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
  'src/soldier-topdown/rig/core.ts',
  'src/soldier-topdown/rig/prims.ts',
  'src/soldier-topdown/rig/weapons.ts',
  'src/soldier-topdown/rig/poses.ts',
  'src/soldier-topdown/rig/render.ts',
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
for (const token of [
  "crouch:'crouch_idle'",
  "crouchMove:'crouch_walk'",
  "crouchRun:'crouch_run'",
  "proneAim:'prone_aim'",
  "standAim:'aim_stand'",
  "crouchAim:'aim_crouch'",
  "ppsh41:'ppsh'",
  'showSkeleton',
]) {
  if (!renderer.includes(token)) throw new Error(`missing rig adapter token ${token}`);
}

const core = read('src/soldier-topdown/rig/core.ts');
for (const joint of ['hip: pt()','chest: pt()','neck: pt()','head: pt()','shL: pt()','shR: pt()','elL: pt()','elR: pt()','hdL: pt()','hdR: pt()','hipL: pt()','hipR: pt()','knL: pt()','knR: pt()','ftL: pt()','ftR: pt()','wpn: pt()','wpnA: 0']) {
  if (!core.includes(joint)) throw new Error(`missing rig joint ${joint}`);
}

const page = read('src/soldier-topdown/SoldierPrototypePage.ts');
for (const token of ['bodyDirection','attentionDirection','weaponDirection','24','32','48','64']) {
  if (!page.includes(token)) throw new Error(`missing page control token ${token}`);
}
if (!page.includes('function deg(')) {
  throw new Error('degree conversion helper must be a hoisted function because gallery boot runs before helper declarations');
}
if (page.includes('const deg =')) {
  throw new Error('degree conversion helper must not use a temporal-dead-zone const declaration');
}

const vite = read('vite.config.ts');
if (!vite.includes('soldier-topdown-prototype.html')) throw new Error('vite input missing soldier prototype');

console.log('soldier top-down prototype contract: PASS');
