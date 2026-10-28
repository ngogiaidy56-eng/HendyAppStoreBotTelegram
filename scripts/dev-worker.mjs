import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=new Set(['platform-api','telegram-bot','queue-processor','edge-router','self-healing-bot']);
const target=String(process.argv[2]||'').trim();
if(!targets.has(target)){console.error('Usage: node scripts/dev-worker.mjs <platform-api|telegram-bot|queue-processor|edge-router|self-healing-bot>');process.exit(2);}
const workerDir=path.join(root,'workers',target);
const configPath=path.join(workerDir,'wrangler.toml');
const localConfigPath=path.join(workerDir,'wrangler.local.generated.toml');
await access(configPath);
try{await access(localConfigPath);throw new Error('A local generated Wrangler config already exists. Stop the other local dev process before starting another instance for '+target+'.');}
catch(error){if(error?.code!=='ENOENT')throw error;}
const original=await readFile(configPath,'utf8');
const temporary=original.replaceAll('REPLACE_WITH_D1_DATABASE_ID','11111111-1111-4111-8111-111111111111').replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID','11111111111111111111111111111111');
if(temporary.includes('REPLACE_WITH_'))throw new Error('Could not resolve all local-only placeholders for '+target+'.');
await writeFile(localConfigPath,temporary);
console.log('Starting local Wrangler dev for '+target+' with a temporary config. Production wrangler.toml is not modified.');
let exitCode=1;
try{
 const command=process.platform==='win32'?'pnpm.cmd':'pnpm';
 const child=spawn(command,['exec','wrangler','dev','--config',path.relative(root,localConfigPath)],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'inherit',shell:process.platform==='win32'});
 exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code===null?(signal==='SIGINT'?130:1):code));});
}finally{
 await rm(localConfigPath,{force:true});
 console.log('Removed temporary local config; original production config was preserved.');
}
process.exitCode=exitCode;
