import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const paths = [
  'src/combat-lab/parameters/CombatLabQuickParameterTypes.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterRegistry.ts',
  'src/combat-lab/parameters/CombatLabParticipantParameterMutations.ts',
];
const files = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
assert.doesNotMatch(files[1], /\b(document|window|HTMLElement)\b/, 'The registry must remain DOM-free.');
const source = `function resolveProductionAimFactors(){return {aimQualityPerSecond:0.5};}\n${files.map(stripImports).join('\n')}`;
const module = await compile(source);
const descriptors = module.listCombatLabQuickParameterDescriptors();
assert.equal(descriptors.length, 6);
assert.equal(new Set(descriptors.map((item) => item.id)).size, descriptors.length);
for (const item of descriptors) {
  for (const field of ['labelRu', 'categoryRu', 'descriptionRu', 'unitRu']) assert.ok(item[field]);
  assert.ok(item.maximum > item.minimum);
  assert.ok(item.step > 0);
  assert.equal(typeof item.reader, 'function');
  assert.equal(typeof item.writer, 'function');
}
const accuracy = { schemaVersion:1, dispersionMultiplier:1.2, aimTimeSeconds:2, physicalAimThreshold:0.5, shootingSkill:0.6, weaponProficiency:'trained', randomnessMultiplier:1, randomSeed:17, usePhysicalAimThreshold:true };
let experiment = { experimentId:'exp', revision:3, defaults:{seed:17,accuracyOverrides:accuracy}, roles:[
  {roleId:'a',unitId:'u-a',titleRu:'A',parameters:{schemaVersion:1,accuracy:null}},
  {roleId:'b',unitId:'u-b',titleRu:'B',parameters:{schemaVersion:1,accuracy:null}},
] };
const unit = { side:'blue', infantryCombatRuntime:{primaryWeapon:{resolved:{weapon:{weaponClass:'rifle'}},operatorProfile:{shootingSkill:0.7,proficiencyByWeaponClass:{rifle:'trained'}}}} };
const contextFor = (roleId) => ({experiment,role:experiment.roles.find((r)=>r.roleId===roleId),state:{},unit});
let updates = 0;
const port = { get:contextFor, update(roleId,mutation){ updates++; const mutationResult=mutation(contextFor(roleId)); if(!mutationResult)return experiment; experiment={...experiment,revision:experiment.revision+1,roles:experiment.roles.map((role)=>role.roleId===roleId?{...role,...mutationResult.rolePatch}:role)}; return experiment; } };
const beforeOther = experiment.roles[1];
const next = module.applyCombatLabParticipantQuickParameterValues(port,'a',{
  'accuracy.dispersion_multiplier':0.8,
  'accuracy.shooting_skill':82,
});
assert.equal(updates,1,'One Apply must use one mutation transaction.');
assert.equal(next.revision,4);
assert.equal(next.roles[0].parameters.accuracy.dispersionMultiplier,0.8);
assert.equal(next.roles[0].parameters.accuracy.shootingSkill,0.82);
assert.equal(next.roles[0].roleId,'a');
assert.equal(next.roles[0].unitId,'u-a');
assert.equal(next.roles[1],beforeOther,'Unselected fighter must be preserved.');
console.log('Combat Lab quick parameter registry smoke passed.');

function stripImports(value){return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/mg,'').replace(/^import ['"][^'"]+['"];?\n/mg,'');}
async function compile(source){const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);}
