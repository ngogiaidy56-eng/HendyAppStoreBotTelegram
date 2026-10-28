const token=String(process.env.HENDY_GITHUB_TOKEN||'').trim();
const secret=String(process.env.GITHUB_WEBHOOK_SECRET||'').trim();
const repository=String(process.env.GITHUB_REPOSITORY||'ngogiaidy56-eng/HendyAppStoreBotTelegram').trim();
const endpoint=String(process.env.SELF_HEALING_WORKER_URL||'').trim().replace(/\/+$/,'');
if(!token)throw new Error('HENDY_GITHUB_TOKEN is required to configure the self-healing webhook.');
if(!secret)throw new Error('GITHUB_WEBHOOK_SECRET is required to configure the self-healing webhook.');
if(!endpoint)throw new Error('SELF_HEALING_WORKER_URL is required.');
let parsed;
try{parsed=new URL(endpoint)}catch{throw new Error('SELF_HEALING_WORKER_URL is not a valid URL.')}
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('SELF_HEALING_WORKER_URL must be an HTTPS origin.');
const [owner,repo]=repository.split('/');
if(!owner||!repo)throw new Error('GITHUB_REPOSITORY must be owner/repository.');
const target=endpoint+'/github/webhook';
const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'};
async function request(path,init={}){
 const response=await fetch('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+path,{...init,headers:{...headers,...(init.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('GitHub webhook API failed ('+response.status+') at '+path+': '+String(data.message||'unknown error')+'. Check repository Webhooks read/write permission on HENDY_GITHUB_TOKEN.');
 return data;
}
const hooks=await request('/hooks?per_page=100');
const existing=(hooks||[]).find(h=>String(h.config?.url||'').replace(/\/+$/,'')===target)
 ||(hooks||[]).find(h=>String(h.config?.url||'').endsWith('/github/webhook'));
const body={name:'web',active:true,events:['workflow_run'],config:{url:target,content_type:'json',secret,insecure_ssl:'0'}};
if(existing){
 await request('/hooks/'+existing.id,{method:'PATCH',body:JSON.stringify(body)});
 console.log('Updated GitHub self-healing webhook id '+existing.id+'.');
}else{
 const created=await request('/hooks',{method:'POST',body:JSON.stringify(body)});
 console.log('Created GitHub self-healing webhook id '+created.id+'.');
}
console.log('Webhook endpoint: '+target);
