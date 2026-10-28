import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const defaultPorts = { 'platform-api':8787, 'queue-processor':8788, 'edge-router':8789, 'self-healing-bot':8790 };
const targets=new Set(Object.keys(defaultPorts));
const target=String(process.argv[2]||'').trim();
if(!targets.has(target)){console.error('Usage: node scripts/dev-worker.mjs <platform-api|queue-processor|edge-router|self-healing-bot> [--port 8787]');process.exit(2);}
const portIndex=process.argv.indexOf('--port');
const port=portIndex>=0?Number(process.argv[portIndex+1]):defaultPorts[target];
if(!Number.isInteger(port)||port<1024||port>65535){console.error('--port must be an integer between 1024 and 65535.');process.exit(2);}
const workerDir=path.join(root,'workers',target);
const configPath=path.join(workerDir,'wrangler.toml');
const localConfigPath=path.join(workerDir,'wrangler.local.generated.toml');
await access(configPath);
try{await access(localConfigPath);throw new Error('A local generated Wrangler config already exists. Stop the other local dev process for '+target+'.');}
catch(error){if(error?.code!=='ENOENT')throw error;}
const original=await readFile(configPath,'utf8');
const temporary=original.replaceAll('REPLACE_WITH_D1_DATABASE_ID','11111111-1111-4111-8111-111111111111').replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID','11111111111111111111111111111111');
if(temporary.includes('REPLACE_WITH_'))throw new Error('Could not resolve all local-only placeholders for '+target+'.');
await writeFile(localConfigPath,temporary);
console.log('Starting '+target+' at http://127.0.0.1:'+port+' with a temporary local-only Wrangler config.');
console.log('The worker may still require local bindings and secrets; no production resource is modified.');
let exitCode=1;
try{
 const command=process.platform==='win32'?'pnpm.cmd':'pnpm';
 const child=spawn(command,['exec','wrangler','dev','--config',path.relative(root,localConfigPath),'--port',String(port)],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'inherit',shell:process.platform==='win32'});
 exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code===null?(signal==='SIGINT'?130:1):code));});
}finally{
 await rm(localConfigPath,{force:true});
 console.log('Removed temporary local config; original production config was preserved.');
}
process.exitCode=exitCode;
