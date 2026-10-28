import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!/^[a-f0-9]{32}$/i.test(accountId)){console.error('Set CLOUDFLARE_ACCOUNT_ID as a Workers Builds build variable.');process.exit(1);}
if(token.length<20){console.error('Set CLOUDFLARE_API_TOKEN as a Workers Builds build secret with D1, KV, R2, Queues and Workers permissions.');process.exit(1);}
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId);
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
async function api(endpoint,init={}){
 const response=await fetch(base+endpoint,{...init,headers:{...headers,...(init.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success===false){const detail=(data.errors||[]).map(x=>x.message).filter(Boolean).join('; ');throw new Error('Cloudflare API '+(init.method||'GET')+' '+endpoint+' failed ('+response.status+')'+(detail?': '+detail:'')+'. Check API token permissions.');}
 return data;
}
async function d1(){const list=await api('/d1/database?name=hendyappstore-db&per_page=100');let item=(list.result||[]).find(x=>x.name==='hendyappstore-db');if(!item){item=(await api('/d1/database',{method:'POST',body:JSON.stringify({name:'hendyappstore-db',primary_location_hint:'apac'})})).result;console.log('Created D1 hendyappstore-db');}if(!item?.uuid)throw new Error('Cloudflare did not return D1 UUID');return item.uuid;}
async function kv(){const list=await api('/storage/kv/namespaces?per_page=100');let item=(list.result||[]).find(x=>x.title==='hendy-appstore-dedupe');if(!item){item=(await api('/storage/kv/namespaces',{method:'POST',body:JSON.stringify({title:'hendy-appstore-dedupe'})})).result;console.log('Created KV hendy-appstore-dedupe');}if(!item?.id)throw new Error('Cloudflare did not return KV ID');return item.id;}
async function r2(){const list=await api('/r2/buckets?name=hendy-app-releases');const buckets=list.result?.buckets||(Array.isArray(list.result)?list.result:[]);if(!buckets.some(x=>x.name==='hendy-app-releases')){await api('/r2/buckets',{method:'POST',body:JSON.stringify({name:'hendy-app-releases'})});console.log('Created R2 hendy-app-releases');}else console.log('Using existing R2 hendy-app-releases');}
async function queue(name){const list=await api('/queues');if((list.result||[]).some(x=>x.queue_name===name)){console.log('Using existing Queue '+name);return;}await api('/queues',{method:'POST',body:JSON.stringify({queue_name:name})});console.log('Created Queue '+name);}
const d1Id=await d1(), kvId=await kv();await r2();await queue('hendy-jobs');await queue('hendy-jobs-dlq');
const configPath=path.join(root,'wrangler.toml'), original=await readFile(configPath,'utf8');
const configured=original.replaceAll('REPLACE_WITH_D1_DATABASE_ID',d1Id).replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID',kvId);
if(configured.includes('REPLACE_WITH_'))throw new Error('Unresolved Wrangler resource placeholder');
await writeFile(configPath,configured);
console.log('Resource IDs injected into this build workspace only.');
