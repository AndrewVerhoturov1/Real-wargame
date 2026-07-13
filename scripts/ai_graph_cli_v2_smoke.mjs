import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const dir=await mkdtemp(path.join(tmpdir(),'real-wargame-graph-v2-cli-'));
try {
  const source=path.join(dir,'legacy.json');
  const output=path.join(dir,'graph-v2.json');
  await writeFile(source,JSON.stringify({version:1,id:'cli_legacy',name:'CLI legacy',rootNodeId:'root',blackboardDefaults:{danger:0},legacyField:{keep:true},nodes:[{id:'root',type:'Root',children:['wait']},{id:'wait',type:'Wait',children:[],parameters:{durationSeconds:1,timeoutSeconds:0}}]},null,2));
  const migrate=spawnSync(process.execPath,['scripts/ai_graph_migrate.mjs',source,output],{cwd:root,encoding:'utf8'});
  assert.equal(migrate.status,0,`${migrate.stdout}\n${migrate.stderr}`);
  const graph=JSON.parse(await readFile(output,'utf8'));
  assert.equal(graph.version,2);
  assert.equal(graph.legacyMetadata.legacyField.keep,true);
  const validate=spawnSync(process.execPath,['scripts/validate_ai_graph.mjs',output],{cwd:root,encoding:'utf8'});
  assert.equal(validate.status,0,`${validate.stdout}\n${validate.stderr}`);
  assert.match(validate.stdout,/validation OK/i);
  console.log('Graph v2 CLI smoke passed: migration preserves legacy metadata and shared validator accepts the output.');
} finally { await rm(dir,{recursive:true,force:true}); }
