import { appendFile } from 'node:fs/promises';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const ghToken=String(process.env.HENDY_GITHUB_TOKEN||'').trim();
const repository=String(process.env.GITHUB_REPOSITORY||'ngogiaidy56-eng/HendyAppStoreBotTelegram').trim();
const [owner,repo]=repository.split('/');
if(!token||!/^[a-f0-9]{32}$/i.test(accountId))throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId);
const headers={authorization:'Bearer '+token,accept:'application/json','content-type':'application/json'};
async function cf(endpoint,init={}){
 const response=await fetch(base+endpoint,{...init,headers:{...headers,...(init.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success===false){const error=new Error('Cloudflare API '+(init.method||'GET')+' '+endpoint+' failed ('+response.status+'): '+(data.errors||[]).map(x=>x.message).join('; '));error.status=response.status;throw error;}
 return data.result;
}
function httpsOrigin(value,label){
 let u;try{u=new URL(String(value||'').trim())}catch{throw new Error(label+' is not a valid URL.')}
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error(label+' must be an HTTPS origin only.');
 return u.origin;
}
async function ensureProject(name){
 try{return await cf('/pages/projects/'+encodeURIComponent(name));}
 catch(e){if(e.status!==404)throw e;}
 try{const p=await cf('/pages/projects',{method:'POST',body:JSON.stringify({name,production_branch:'main'})});console.log('Created Pages project '+name+'.');return p;}
 catch(e){try{return await cf('/pages/projects/'+encodeURIComponent(name));}catch{throw e;}}
}
async function projectUrl(project,override,label){
 if(override)return httpsOrigin(override,label);
 try{
  const domains=await cf('/pages/projects/'+encodeURIComponent(project.name)+'/domains');
  const custom=(domains||[]).find(d=>d.status==='active'&&d.name&&!String(d.name).toLowerCase().endsWith('.pages.dev'));
  if(custom)return 'https://'+custom.name;
 }catch(e){console.warn('Could not query custom domains for '+project.name+'; using pages.dev.');}
 const listed=Array.isArray(project.domains)?project.domains:[];
 const custom=listed.find(x=>typeof x==='string'&&!x.toLowerCase().endsWith('.pages.dev'));
 if(custom)return httpsOrigin(custom.startsWith('http')?custom:'https://'+custom,label);
 const sub=String(project.subdomain||project.name).replace(/^https?:\/\//i,'').replace(/\/$/,'');
 return 'https://'+(sub.endsWith('.pages.dev')?sub:sub+'.pages.dev');
}
async function workerSubdomain(){
 const override=String(process.env.WORKER_SUBDOMAIN||'').trim();
 if(override)return override.replace(/\.workers\.dev$/i,'');
 const result=await cf('/workers/subdomain');
 const sub=String(result?.subdomain||'').trim();
 if(!sub)throw new Error('No workers.dev subdomain found. Set WORKER_SUBDOMAIN or WORKER_API_URL in GitHub Actions Variables.');
 return sub;
}
const specs=[
 {key:'miniapp',name:String(process.env.MINIAPP_PAGES_PROJECT||'hendy-mini-app'),override:process.env.MINIAPP_DOMAIN_OVERRIDE,label:'MINIAPP_DOMAIN_OVERRIDE'},
 {key:'admin',name:String(process.env.ADMIN_PAGES_PROJECT||'hendy-web-admin'),override:process.env.ADMIN_DOMAIN_OVERRIDE,label:'ADMIN_DOMAIN_OVERRIDE'},
 {key:'web_user',name:String(process.env.WEB_USER_PAGES_PROJECT||'hendy-web-user'),override:process.env.WEB_USER_DOMAIN_OVERRIDE||process.env.STOREFRONT_DOMAIN_OVERRIDE,label:'WEB_USER_DOMAIN_OVERRIDE'}
];
const pageUrls={};
for(const spec of specs){const p=await ensureProject(spec.name);pageUrls[spec.key]=await projectUrl(p,spec.override,spec.label);}
const apiOverride=String(process.env.WORKER_API_URL||'').trim();
const botOverride=String(process.env.TELEGRAM_BOT_WORKER_URL||'').trim();
const healingOverride=String(process.env.SELF_HEALING_WORKER_URL||'').trim();
let sub='';
if(!apiOverride||!botOverride||!healingOverride)sub=await workerSubdomain();
const apiUrl=apiOverride?httpsOrigin(apiOverride,'WORKER_API_URL'):'https://hendy-platform-api.'+sub+'.workers.dev';
const botUrl=botOverride?httpsOrigin(botOverride,'TELEGRAM_BOT_WORKER_URL'):'https://hendy-telegram-bot.'+sub+'.workers.dev';
const healingUrl=healingOverride?httpsOrigin(healingOverride,'SELF_HEALING_WORKER_URL'):'https://hendy-self-healing-bot.'+sub+'.workers.dev';
const cors=[...new Set([pageUrls.miniapp,pageUrls.admin,pageUrls.web_user])].map(x=>new URL(x).origin).join(',');
const values={
 api_url:apiUrl,telegram_bot_url:botUrl,telegram_webhook_url:botUrl+'/telegram/webhook',self_healing_worker_url:healingUrl,
 miniapp_url:pageUrls.miniapp,admin_url:pageUrls.admin,web_user_url:pageUrls.web_user,cors_origins:cors
};
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,Object.entries(values).map(([k,v])=>k+'='+String(v).replace(/[\r\n]/g,'')).join('\n')+'\n');
for(const [k,v] of Object.entries(values))console.log(k+'='+v);
if(ghToken){
 const ghHeaders={authorization:'Bearer '+ghToken,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'};
 async function gh(endpoint,init={}){const r=await fetch('https://api.github.com/repos/'+owner+'/'+repo+endpoint,{...init,headers:{...ghHeaders,...(init.headers||{})}});if(!r.ok)throw new Error('GitHub API '+endpoint+' failed ('+r.status+')');if(r.status===204)return null;return r.json();}
 try{
  const list=await gh('/actions/variables?per_page=100');const names=new Set((list.variables||[]).map(x=>x.name));
  const vars={VITE_API_BASE_URL:apiUrl,API_WORKER_URL:apiUrl,WORKER_API_URL:apiUrl,TELEGRAM_BOT_WORKER_URL:botUrl,SELF_HEALING_WORKER_URL:healingUrl,APP_URL:pageUrls.miniapp,ADMIN_URL:pageUrls.admin,STOREFRONT_URL:pageUrls.web_user,MINIAPP_PUBLIC_URL:pageUrls.miniapp,ADMIN_PUBLIC_URL:pageUrls.admin,STOREFRONT_PUBLIC_URL:pageUrls.web_user,CORS_ORIGINS:cors};
  for(const [name,value] of Object.entries(vars)){const body=JSON.stringify({name,value});if(names.has(name))await gh('/actions/variables/'+encodeURIComponent(name),{method:'PATCH',body});else{await gh('/actions/variables',{method:'POST',body});names.add(name);}}
  console.log('Persisted Pages/Worker URLs as GitHub Actions Variables.');
 }catch(e){console.warn('GitHub Variables not updated; this run still uses detected outputs. '+String(e.message||e));}
}
