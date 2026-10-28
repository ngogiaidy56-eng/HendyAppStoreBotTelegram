import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempRoot=await mkdtemp(path.join(os.tmpdir(),'hendy-wrangler-dry-run-'));
const dummyD1='00000000-0000-4000-8000-000000000000';
const dummyKv='00000000000000000000000000000000';
const targets=['platform-api','telegram-bot','queue-processor','edge-router','self-healing-bot'];
const restores=[];
try{
 for(const target of targets){
  const configPath=path.join(root,'workers',target,'wrangler.toml');
  const original=await readFile(configPath,'utf8');
  const temporary=original.replaceAll('REPLACE_WITH_D1_DATABASE_ID',dummyD1).replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID',dummyKv);
  if(temporary.includes('REPLACE_WITH_'))throw new Error(target+' has an unresolved resource placeholder');
  restores.push({configPath,original});
  await writeFile(configPath,temporary);
  const outDir=path.join(tempRoot,target);
  console.log('\n--- Wrangler dry-run: '+target+' ---');
  const result=spawnSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',outDir,'--config',path.relative(root,configPath)],{cwd:root,env:{...process.env,CI:'1'},stdio:'inherit',shell:process.platform==='win32'});
  if(result.error)throw new Error('Could not start Wrangler for '+target+': '+result.error.message);
  if(result.status!==0)throw new Error('Wrangler dry-run failed for '+target+' (exit '+result.status+')');
 }
 console.log('\nAll five Worker bundles passed Wrangler dry-run; no deployment was performed.');
}finally{for(const item of restores.reverse())await writeFile(item.configPath,item.original);await rm(tempRoot,{recursive:true,force:true});}
