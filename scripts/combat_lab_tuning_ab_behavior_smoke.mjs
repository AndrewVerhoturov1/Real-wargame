import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=stripImports(await readFile('src/combat-lab/parameters/CombatLabTuningSnapshotStore.ts','utf8'));
const module=await compile(source);
const role=(id,unitId)=>({roleId:id,unitId,titleRu:id,parameters:{schemaVersion:1,accuracy:null}});
const experiment={experimentId:'exp',revision:4,defaults:{seed:10},roles:[role('a','u-a'),role('b','u-b')]};
const store=new module.CombatLabTuningSnapshotStore();
store.save('A',{experiment,roleId:'a',participantParameterValues:{'accuracy.shooting_skill':50},runtimeSnapshot:{stopReasonRu:'Готово'},visualSnapshot:{seed:10,metrics:{hits:2},finalStateDigest:'digest-a'},timestampMs:1});
store.save('B',{experiment:{...experiment,revision:5},roleId:'a',participantParameterValues:{'accuracy.shooting_skill':70},runtimeSnapshot:{stopReasonRu:'Готово'},visualSnapshot:{seed:11,metrics:{hits:4},finalStateDigest:'digest-b'},timestampMs:2});
let comparison=store.compare({...experiment,revision:5},'a');
assert.equal(comparison.differentSeeds,true);
assert.equal(comparison.invalidReasonRu,null);
assert.equal(comparison.valueRows.find((row)=>row.id==='accuracy.shooting_skill').delta,20);
assert.equal(comparison.metricRows.find((row)=>row.id==='hits').delta,2);
comparison=store.compare({...experiment,revision:6,roles:[role('a','changed')]},'a');
assert.match(comparison.invalidReasonRu,/Состав ролей/);
store.clear();assert.equal(store.compare(experiment,'a'),null);
console.log('Combat Lab tuning A/B behavior smoke passed.');
function stripImports(value){return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/mg,'').replace(/^import ['"][^'"]+['"];?\n/mg,'');}
async function compile(source){const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);}
