import { appendFile } from 'node:fs/promises';
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!/^[a-f0-9]{32}$/i.test(accountId))throw new Error('CLOUDFLARE_ACCOUNT_ID must be the 32-character Account ID.');
if(token.length<20)throw new Error('CLOUDFLARE_API_TOKEN is required as a GitHub Actions secret.');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId);
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
async function api(endpoint,init={}){
 const response=await fetch(base+endpoint,{...init,headers:{...headers,...(init.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success===false){const detail=(data.errors||[]).map(x=>x.message).filter(Boolean).join('; ');throw new Error('Cloudflare API '+(init.method||'GET')+' '+endpoint+' failed ('+response.status+')'+(detail?': '+detail:'')+'. Check token permissions.');}
 return data.result;
}
async function ensureD1(){
 const list=await api('/d1/database?per_page=100');let item=(list||[]).find(x=>x.name==='hendyappstore-db');
 if(!item){item=await api('/d1/database',{method:'POST',body:JSON.stringify({name:'hendyappstore-db',primary_location_hint:'apac'})});console.log('Created D1 hendyappstore-db.');}
 else console.log('Using D1 hendyappstore-db.');
 if(!item?.uuid)throw new Error('Cloudflare did not return D1 UUID.');return item.uuid;
}
async function ensureKv(){
 const list=await api('/storage/kv/namespaces?per_page=100');let item=(list||[]).find(x=>x.title==='hendy-appstore-dedupe');
 if(!item){item=await api('/storage/kv/namespaces',{method:'POST',body:JSON.stringify({title:'hendy-appstore-dedupe'})});console.log('Created KV hendy-appstore-dedupe.');}
 else console.log('Using KV hendy-appstore-dedupe.');
 if(!item?.id)throw new Error('Cloudflare did not return KV ID.');return item.id;
}
async function ensureR2(){
 const result=await api('/r2/buckets');const buckets=result?.buckets||(Array.isArray(result)?result:[]);
 if(buckets.some(x=>x.name==='hendy-app-releases')){console.log('Using R2 hendy-app-releases.');return;}
 await api('/r2/buckets',{method:'POST',body:JSON.stringify({name:'hendy-app-releases'})});console.log('Created R2 hendy-app-releases.');
}
async function ensureQueue(name){
 const list=await api('/queues');
 if((list||[]).some(x=>x.queue_name===name)){console.log('Using Queue '+name+'.');return;}
 await api('/queues',{method:'POST',body:JSON.stringify({queue_name:name})});console.log('Created Queue '+name+'.');
}
async function output(name,value){
 const line=name+'='+String(value).replace(/[\r\n]/g,'')+'\n';
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,line);else console.log(line.trim());
}
const [d1Id,kvId]=await Promise.all([ensureD1(),ensureKv()]);
await ensureR2();await ensureQueue('hendy-jobs');await ensureQueue('hendy-jobs-dlq');
await output('d1_id',d1Id);await output('kv_id',kvId);
console.log('D1, KV, R2 and Queue resources are ready.');
