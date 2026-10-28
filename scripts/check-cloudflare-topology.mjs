import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const production=process.argv.includes('--production');
const workers=[
 {dir:'platform-api',name:'hendy-platform-api',main:'src/index.js',bindings:['[[d1_databases]]','binding = "DB"','[[r2_buckets]]','binding = "ARTIFACTS"','[[queues.producers]]','binding = "JOBS"','ADMIN_LIVE_SESSIONS']},
 {dir:'telegram-bot',name:'hendy-telegram-bot',main:'src/index.ts',bindings:['[[d1_databases]]','binding = "DB"']},
 {dir:'queue-processor',name:'hendy-queue-processor',main:'src/index.ts',bindings:['[[d1_databases]]','binding = "DB"','[[queues.producers]]','[[queues.consumers]]','dead_letter_queue = "hendy-jobs-dlq"','ADMIN_LIVE_SESSIONS']},
 {dir:'edge-router',name:'hendy-edge-router',main:'src/index.ts',bindings:['[[d1_databases]]','binding = "DB"','[[services]]','binding = "PLATFORM_API"','service = "hendy-platform-api"']},
 {dir:'self-healing-bot',name:'hendy-self-healing-bot',main:'src/index.ts',bindings:['[[kv_namespaces]]','binding = "DEDUPE"']},
];
const pages=[{dir:'apps/web-admin',name:'@hendy/web-admin'},{dir:'apps/mini-app',name:'@hendy/mini-app'},{dir:'apps/web-user',name:'@hendy/web-user'}];
const errors=[];
for(const worker of workers){
 const configPath=path.join(root,'workers',worker.dir,'wrangler.toml');
 const entryPath=path.join(root,'workers',worker.dir,worker.main);
 if(!existsSync(configPath)){errors.push('Missing Wrangler config for '+worker.name);continue;}
 if(!existsSync(entryPath))errors.push('Missing entrypoint '+path.relative(root,entryPath));
 const config=readFileSync(configPath,'utf8');
 if(!config.includes('name = "'+worker.name+'"'))errors.push('Unexpected Worker name in '+path.relative(root,configPath));
 for(const binding of worker.bindings)if(!config.includes(binding))errors.push(worker.name+' missing binding/config '+binding);
 if(production&&config.includes('REPLACE_WITH_'))errors.push(worker.name+' still has a REPLACE_WITH_ resource placeholder');
 const manifestPath=path.join(root,'workers',worker.dir,'package.json');
 if(!existsSync(manifestPath))errors.push('Missing package.json for '+worker.name);
 else{const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));if(!manifest.scripts?.dev||!manifest.scripts?.deploy)errors.push(worker.name+' must define dev and deploy scripts');}
}
for(const page of pages){const manifestPath=path.join(root,page.dir,'package.json'),htmlPath=path.join(root,page.dir,'index.html');if(!existsSync(manifestPath)||!existsSync(htmlPath))errors.push('Missing Pages source files for '+page.name);else{const m=JSON.parse(readFileSync(manifestPath,'utf8'));if(!m.scripts?.build)errors.push(page.name+' is missing a build script');}}
const apiConfig=readFileSync(path.join(root,'workers/platform-api/wrangler.toml'),'utf8');
if(apiConfig.includes('ADMIN_LIVE_SESSIONS')&&!readFileSync(path.join(root,'workers/platform-api/src/index.js'),'utf8').includes('AdminLiveSession'))errors.push('API Durable Object class is not exported');
const queueConfig=readFileSync(path.join(root,'workers/queue-processor/wrangler.toml'),'utf8');
if(queueConfig.includes('ADMIN_LIVE_SESSIONS')&&!queueConfig.includes('script_name = "hendy-platform-api"'))errors.push('Queue Processor must bind AdminLiveSession from hendy-platform-api');
const deploy=readFileSync(path.join(root,'.github/workflows/deploy-cloudflare.yml'),'utf8');
if(!deploy.includes('Deploy self-healing Worker'))errors.push('Deploy workflow does not deploy the fifth Worker');
if(!deploy.includes('GITHUB_WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}'))errors.push('Deploy workflow must expose GITHUB_WEBHOOK_SECRET to secret validation');
if(errors.length){console.error('Cloudflare topology validation failed:\n'+errors.map(e=>' - '+e).join('\n'));process.exit(1);}
console.log('Validated five Worker configs, required bindings, three Pages manifests and production workflow.');
if(!production)console.log('Resource placeholders are allowed in local config validation. Run with --production after provisioning.');
