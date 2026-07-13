import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const root=process.cwd(),out=path.join(root,'.tmp-ai-plan-runtime-smoke'),entry=path.join(out,'run.mjs');
await rm(out,{recursive:true,force:true});
try { await build({root,logLevel:'warn',build:{ssr:path.join(root,'scripts','ai_plan_runtime_smoke.ts'),outDir:out,emptyOutDir:true,minify:false,rollupOptions:{output:{entryFileNames:'run.mjs',format:'es'}}}}); await import(`${pathToFileURL(entry).href}?run=${Date.now()}`); }
finally { await rm(out,{recursive:true,force:true}); }
