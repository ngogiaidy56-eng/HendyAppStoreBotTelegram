import { routeApi, handleBinaryDownload } from '../workers/platform-api/src/routes/api.js';
import { HttpError, json, nowSeconds } from '../workers/platform-api/src/utils/http.js';
import { dispatch } from '../workers/telegram-bot/src/gateway/dispatcher';
import { processBroadcast } from '../workers/queue-processor/src/jobs/bot-broadcast';
import { processBankSync } from '../workers/queue-processor/src/jobs/bank-sync';
import { processOtaBuild } from '../workers/queue-processor/src/jobs/ota-build';
import { MAX_ATTEMPTS, retryDelaySeconds, isRetryable } from '../workers/queue-processor/src/utils/retry-handler';

type Env = {
  DB: any; ARTIFACTS: any; JOBS: any; DEDUPE?: any; ASSETS: { fetch(r: Request): Promise<Response> };
  BOT_TOKEN?: string; BOT_WEBHOOK_SECRET?: string; SESSION_SECRET?: string;
  GITHUB_TOKEN?: string; GITHUB_WEBHOOK_SECRET?: string; WEBHOOK_SECRET?: string;
  GITHUB_OWNER?: string; GITHUB_REPO?: string; APP_URL?: string; ADMIN_URL?: string;
  CORS_ORIGINS?: string; [key: string]: any;
};

const jsonResponse = (value: unknown, status = 200) => Response.json(value, { status });
function cors(request: Request, env: Env): Record<string,string> {
  const origin = request.headers.get('origin');
  const allow = new Set((env.CORS_ORIGINS || '').split(',').map((x: string) => x.trim()).filter(Boolean));
  allow.add(new URL(request.url).origin);
  const headers: Record<string,string> = { vary:'Origin', 'access-control-allow-methods':'GET,HEAD,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers':'Authorization,Content-Type,X-Telegram-Bot-Api-Secret-Token,X-Signature,X-Hub-Signature-256,X-GitHub-Event', 'access-control-max-age':'86400' };
  if (origin && allow.has(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}
function mergeHeaders(response: Response, extra: Record<string,string>) {
  const headers = new Headers(response.headers);
  for (const [k,v] of Object.entries(extra)) headers.set(k,v);
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}
function equal(a:string,b:string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff=0; for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function cleanExpiredUploads(env: Env) {
  const now=nowSeconds();
  const {results}=await env.DB.prepare("SELECT id,r2_key,r2_upload_id FROM release_uploads WHERE status='uploading' AND expires_at<=? LIMIT 50").bind(now).all();
  for(const item of results||[]){
    try { await env.ARTIFACTS.resumeMultipartUpload(item.r2_key,item.r2_upload_id).abort(); }
    catch(error){ console.warn('expired_upload_abort_failed',{uploadId:item.id,error:(error as any)?.message||'unknown'}); continue; }
    await env.DB.batch([
      env.DB.prepare("UPDATE release_uploads SET status='expired' WHERE id=? AND status='uploading'").bind(item.id),
      env.DB.prepare('DELETE FROM release_upload_parts WHERE upload_session_id=?').bind(item.id)
    ]);
  }
}
async function hmacHex(secret:string,body:string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))),v=>v.toString(16).padStart(2,'0')).join('');
}
async function botWebhook(request:Request,env:Env,url:URL) {
  if(request.method!=='POST') return jsonResponse({error:'method_not_allowed'},405);
  if(!env.BOT_WEBHOOK_SECRET||!equal(request.headers.get('x-telegram-bot-api-secret-token')||'',env.BOT_WEBHOOK_SECRET)) return jsonResponse({error:'unauthorized'},401);
  const raw=await request.text();
  if(raw.length>1024*1024) return jsonResponse({error:'body_too_large'},413);
  let update:any; try{update=JSON.parse(raw)}catch{return jsonResponse({error:'invalid_json'},400);}
  await dispatch(update,{...env,APP_URL:env.APP_URL||url.origin+'/miniapp/',ADMIN_URL:env.ADMIN_URL||url.origin+'/admin/'});
  return jsonResponse({ok:true});
}
async function githubWebhook(request:Request,env:Env) {
  const secret=env.GITHUB_WEBHOOK_SECRET||env.WEBHOOK_SECRET||'';
  if(!secret||!env.GITHUB_TOKEN) return jsonResponse({error:'not_configured'},503);
  const raw=await request.text();
  if(raw.length>1024*1024) return jsonResponse({error:'too_large'},413);
  const sig=(request.headers.get('x-hub-signature-256')||'').replace(/^sha256=/,'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(sig)||!equal(sig,await hmacHex(secret,raw))) return jsonResponse({error:'invalid_signature'},401);
  if(request.headers.get('x-github-event')!=='workflow_run') return jsonResponse({ok:true,ignored:true});
  let event:any; try{event=JSON.parse(raw)}catch{return jsonResponse({error:'invalid_json'},400);}
  const run=event.workflow_run, owner=env.GITHUB_OWNER||'ngogiaidy56-eng', repository=env.GITHUB_REPO||'HendyAppStoreBotTelegram';
  if(!run||event.action!=='completed'||run.conclusion!=='failure'||event.repository?.full_name!==owner+'/'+repository||!new Set(['CI Test','Security Checks']).has(run.name)) return jsonResponse({ok:true,ignored:true});
  const key='rerun:'+String(run.id);
  if(env.DEDUPE&&await env.DEDUPE.get(key)) return jsonResponse({ok:true,ignored:true,reason:'already_attempted'});
  const response=await fetch('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repository)+'/actions/runs/'+encodeURIComponent(String(run.id))+'/rerun-failed-jobs',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
  if(!response.ok) return jsonResponse({error:'github_rerun_failed'},502);
  if(env.DEDUPE) await env.DEDUPE.put(key,String(Date.now()),{expirationTtl:1209600});
  return jsonResponse({ok:true,action:'rerun_failed_jobs',runId:String(run.id)});
}
async function asset(request:Request,env:Env,path:string){return env.ASSETS.fetch(new Request(new URL(path,request.url).toString(),request));}
async function frontend(request:Request,env:Env,url:URL) {
  const p=url.pathname;
  if(p==='/admin'||p==='/miniapp') return Response.redirect(url.origin+p+'/',308);
  if(p.startsWith('/admin/')) return p.startsWith('/admin/assets/')||/\.[a-z0-9]{1,8}$/i.test(p)?env.ASSETS.fetch(request):asset(request,env,'/admin/index.html');
  if(p.startsWith('/miniapp/')) return p.startsWith('/miniapp/assets/')||/\.[a-z0-9]{1,8}$/i.test(p)?env.ASSETS.fetch(request):asset(request,env,'/miniapp/index.html');
  const response=await env.ASSETS.fetch(request);
  if(response.status!==404) return response;
  if(request.method==='GET'&&(request.headers.get('accept')||'').includes('text/html')&&!/\.[a-z0-9]{1,8}$/i.test(p)) return asset(request,env,'/index.html');
  return response;
}

async function queueJob(message:any,env:Env) {
  const id=String(message.body?.jobId||'');
  if(!/^[a-z0-9-]{36}$/i.test(id)) throw new Error('invalid job id');
  const now=Math.floor(Date.now()/1000);
  const job=await env.DB.prepare("SELECT id,job_type,payload_json,attempts FROM queue_jobs WHERE id=? AND status='pending' AND available_at<=?").bind(id,now).first();
  if(!job) return;
  const claim=await env.DB.prepare("UPDATE queue_jobs SET status='processing',updated_at=? WHERE id=? AND status='pending' AND available_at<=?").bind(now,id,now).run();
  if(!Number(claim.meta?.changes||0)) return;
  try {
    const payload=JSON.parse(job.payload_json||'{}');
    if(job.job_type==='bot_broadcast') await processBroadcast(job,env,id);
    else if(job.job_type==='bank_sync'){await processBankSync(payload,env);await env.DB.prepare("UPDATE queue_jobs SET status='completed',updated_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),id).run();}
    else if(job.job_type==='ota_build'){await processOtaBuild(payload,env);await env.DB.prepare("UPDATE queue_jobs SET status='completed',updated_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),id).run();}
    else throw new Error('unsupported job type: '+job.job_type);
  } catch(error) {
    const attempts=Number(job.attempts||0)+1, message=String((error as Error)?.message||'job failed').slice(0,500), at=Math.floor(Date.now()/1000);
    if(attempts>=MAX_ATTEMPTS||!isRetryable(error)){
      await env.DB.batch([
        env.DB.prepare("UPDATE queue_jobs SET status='dead_letter',attempts=?,last_error=?,updated_at=? WHERE id=?").bind(attempts,message,at,id),
        env.DB.prepare('INSERT OR IGNORE INTO dead_letter_jobs(job_id,job_type,payload_json,attempts,error_message,failed_at) VALUES(?,?,?,?,?,?)').bind(id,job.job_type,job.payload_json,attempts,message,at)
      ]);
      console.error('job_moved_to_dead_letter',{jobId:id,jobType:job.job_type,attempts}); return;
    }
    const delay=retryDelaySeconds(attempts);
    await env.DB.prepare("UPDATE queue_jobs SET status='pending',attempts=?,last_error=?,available_at=?,updated_at=? WHERE id=?").bind(attempts,message,at+delay,at,id).run();
    await env.JOBS.send({jobId:id},{delaySeconds:delay});
  }
}
async function consume(batch:MessageBatch<any>,env:Env) {
  for(const message of batch.messages){try{await queueJob(message,env);message.ack();}catch(error){console.error('queue_job_failed',{error:(error as Error)?.message||'unknown'});message.retry();}}
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url), headers=cors(request,env);
    if(request.method==='OPTIONS'&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/downloads/')||url.pathname.startsWith('/webhooks/'))){
      if(request.headers.get('origin')&&!headers['access-control-allow-origin']) return json({error:{code:'ORIGIN_NOT_ALLOWED',message:'Origin not allowed'}},403);
      return new Response(null,{status:204,headers});
    }
    try{
      if(url.pathname==='/health'&&request.method==='GET'){const db=await env.DB.prepare('SELECT 1 AS ok').first();return json({ok:db?.ok===1,service:'hendy-app-store-unified',timestamp:nowSeconds()},200,headers);}
      if(url.pathname==='/telegram/health') return jsonResponse({ok:true,service:'hendy-telegram-bot'});
      if(url.pathname==='/queue/health') return jsonResponse({ok:true,service:'hendy-queue-processor'});
      if(url.pathname==='/edge/health') return jsonResponse({ok:true,service:'hendy-edge-router'});
      if(url.pathname==='/telegram/webhook') return mergeHeaders(await botWebhook(request,env,url),headers);
      if(url.pathname==='/github/webhook') return request.method==='POST'?githubWebhook(request,env):jsonResponse({error:'method_not_allowed'},405);
      if(url.pathname.startsWith('/downloads/')) return mergeHeaders(await handleBinaryDownload(request,env,url),headers);
      if(url.pathname.startsWith('/api/')||url.pathname==='/webhooks/bank') return mergeHeaders(await routeApi(request,{...env,APP_URL:env.APP_URL||url.origin+'/miniapp/',ADMIN_URL:env.ADMIN_URL||url.origin+'/admin/'},url),headers);
      return frontend(request,env,url);
    }catch(error){
      const status=error instanceof HttpError?error.status:500;
      if(status>=500) console.error('request_failed',{path:url.pathname,error:(error as any)?.message||'unknown'});
      return json({error:{code:(error as any)?.code||'INTERNAL_ERROR',message:status>=500?'Internal server error':(error as Error).message}},status,headers);
    }
  },
  async queue(batch:MessageBatch<any>,env:Env){await consume(batch,env);},
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(cleanExpiredUploads(env));}
};
