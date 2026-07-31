import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const sources=await Promise.all([
 'src/combat-lab/parameters/CombatLabQuickParameterTypes.ts',
 'src/combat-lab/parameters/CombatLabQuickParameterRegistry.ts',
 'src/combat-lab/parameters/CombatLabQuickParameterPreferencesStore.ts',
].map((path)=>readFile(path,'utf8')));
const module=await compile(`function resolveProductionAimFactors(){return {aimQualityPerSecond:1};}\n${sources.map(stripImports).join('\n')}`);
class MemoryStorage{map=new Map();getItem(k){return this.map.get(k)??null;}setItem(k,v){this.map.set(k,v);}removeItem(k){this.map.delete(k);}}
const storage=new MemoryStorage();
const store=new module.CombatLabQuickParameterPreferencesStore({storage});
const defaults=['accuracy.dispersion_multiplier','accuracy.aim_time_seconds'];
assert.deepEqual(store.get('exp','role-a',defaults),defaults);
store.set('exp','role-a',['accuracy.shooting_skill','missing','accuracy.dispersion_multiplier','accuracy.shooting_skill']);
store.set('exp','role-b',['accuracy.weapon_proficiency']);
assert.deepEqual(store.get('exp','role-a',[]),['accuracy.shooting_skill','accuracy.dispersion_multiplier']);
assert.deepEqual(store.get('exp','role-b',[]),['accuracy.weapon_proficiency']);
assert.notEqual(module.buildCombatLabQuickParameterPreferenceKey('exp','role-a'),module.buildCombatLabQuickParameterPreferenceKey('exp','role-b'));
storage.setItem('real-wargame.combat-lab.quick-parameters.v1','{broken');
const recovered=new module.CombatLabQuickParameterPreferencesStore({storage});
assert.deepEqual(recovered.snapshot(),{schemaVersion:1,byExperimentAndRole:{}});
console.log('Combat Lab quick parameter preferences smoke passed.');
function stripImports(value){return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/mg,'').replace(/^import ['"][^'"]+['"];?\n/mg,'');}
async function compile(source){const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);}
