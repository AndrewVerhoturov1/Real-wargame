import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sources = await Promise.all([
  'src/combat-lab/parameters/CombatLabQuickParameterTypes.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterRegistry.ts',
  'src/combat-lab/parameters/CombatLabParticipantParameterMutations.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterPreferencesStore.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterPresets.ts',
  'src/combat-lab/ui/CombatLabQuickParametersPanel.ts',
].map((path) => readFile(path, 'utf8')));
const source = `function resolveProductionAimFactors(){return {aimQualityPerSecond:0.5};}\n${sources.map(stripImports).join('\n')}`;
const module = await compile(source);

class MemoryStorage {
  map = new Map();
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, value); }
  removeItem(key) { this.map.delete(key); }
}
let experiment = { experimentId:'exp', revision:8, defaults:{seed:21,accuracyOverrides:null}, roles:[
  {roleId:'a',unitId:'u-a',titleRu:'Альфа',parameters:{schemaVersion:1,accuracy:null}},
  {roleId:'b',unitId:'u-b',titleRu:'Браво',parameters:{schemaVersion:1,accuracy:null}},
] };
const units = {
  a:{side:'blue',infantryCombatRuntime:{primaryWeapon:{resolved:{weapon:{weaponClass:'rifle'}},operatorProfile:{shootingSkill:0.5,proficiencyByWeaponClass:{rifle:'trained'}}}}},
  b:{side:'red',infantryCombatRuntime:{primaryWeapon:{resolved:{weapon:{weaponClass:'machine_gun'}},operatorProfile:{shootingSkill:0.6,proficiencyByWeaponClass:{machine_gun:'specialist'}}}}},
};
const contextFor = (roleId) => ({experiment,role:experiment.roles.find((role)=>role.roleId===roleId),state:{},unit:units[roleId]});
let mutationCount = 0;
const port = {
  get: contextFor,
  update(roleId, mutation) {
    mutationCount += 1;
    const requested = mutation(contextFor(roleId));
    if (!requested) return experiment;
    experiment = {...experiment,revision:experiment.revision+1,roles:experiment.roles.map((role)=>role.roleId===roleId?{...role,...requested.rolePatch}:role)};
    return experiment;
  },
};
let selection = {kind:'participant',roleId:'a',unitId:'u-a'};
const services = {
  participantMutations: port,
  selection:{get:()=>selection,subscribe:()=>()=>{}},
  draft:{subscribe:()=>()=>{}},
};
const preferences = new module.CombatLabQuickParameterPreferencesStore({storage:new MemoryStorage()});
preferences.set('exp','b',['accuracy.weapon_proficiency','accuracy.dispersion_multiplier']);
const model = new module.CombatLabQuickParametersPanelModel(services, preferences);
model.select(selection);
let snapshot = model.snapshot();
assert.equal(snapshot.roleId,'a');
assert.ok(snapshot.pinnedIds.length >= 4,'Default set must be initialized on first open.');
model.setValue('accuracy.shooting_skill',80);
assert.deepEqual(model.snapshot().dirtyIds,['accuracy.shooting_skill']);
const beforeB = experiment.roles[1];
const changedResult = model.apply();
assert.equal(changedResult.changed,true,'Apply result must report an actual experiment revision.');
assert.equal(changedResult.experiment,experiment);
assert.equal(mutationCount,1,'Panel Apply must make one participant mutation.');
assert.equal(experiment.revision,9);
assert.equal(experiment.roles[0].parameters.accuracy.shootingSkill,0.8);
assert.equal(experiment.roles[1],beforeB,'Panel must not change another fighter.');
const unchangedResult = model.apply();
assert.equal(unchangedResult.changed,false,'No-dirty Apply must report no mutation.');
assert.equal(unchangedResult.experiment,experiment);
assert.equal(mutationCount,1,'No-dirty Apply must not call the participant mutation port.');
selection = {kind:'participant',roleId:'b',unitId:'u-b'};
model.select(selection);
snapshot = model.snapshot();
assert.deepEqual(snapshot.pinnedIds,['accuracy.weapon_proficiency','accuracy.dispersion_multiplier'],'Each fighter must restore its own ordered set.');
model.setLocked(true);
model.setValue('accuracy.dispersion_multiplier',0.4);
assert.equal(model.snapshot().dirtyIds.length,0,'Locked panel must reject tuning edits.');
const lockedResult = model.apply();
assert.equal(lockedResult,null,'Locked Apply must not produce a result.');
assert.equal(mutationCount,1,'Locked Apply must not call the mutation port.');
model.setLocked(false);
model.removePinned('accuracy.weapon_proficiency');
assert.deepEqual(model.snapshot().pinnedIds,['accuracy.dispersion_multiplier']);
model.clearParticipantOverride();
assert.equal(mutationCount,2);
assert.equal(experiment.roles[1].parameters.accuracy,null);
console.log('Combat Lab quick parameters panel behavior smoke passed.');

function stripImports(value) {
  return value
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/mg, '')
    .replace(/^import ['"][^'"]+['"];?\n/mg, '');
}
async function compile(source) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
