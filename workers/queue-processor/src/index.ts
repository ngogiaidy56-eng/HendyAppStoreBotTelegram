import { processBankSync } from './jobs/bank-sync';
import { processOtaBuild } from './jobs/ota-build';
import { MAX_ATTEMPTS, retryDelaySeconds, isRetryable } from './utils/retry-handler';
interface Env { DB:D1Database; JOBS?:Queue; ADMIN_LIVE_SESSIONS?:DurableObjectNamespace; GITHUB_TOKEN?:string; GITHUB_OWNER?:string; GITHUB_REPO?:string; BANK_SYNC_URL?:string; BANK_SYNC_SECRET?:string }
async function publishQueueStatus(env:Env,event:{action:string;targetId:string;status:'queued'|'processing'|'completed'|'retry'|'dead_letter'}){if(!env.ADMIN_LIVE_SESSIONS)return;try{const id=env.ADMIN_LIVE_SESSIONS.idFromName('hendy-admin-live-stream');await env.ADMIN_LIVE_SESSIONS.get(id).fetch('https://admin-live.internal/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'queue',at:Math.floor(Date.now()/1000),action:event.action,targetType:'queue_job',targetId:event.targetId,status:event.status})});}catch(error){console.warn('admin_live_queue_event_failed',{error:(error as Error)?.message||'unknown'});}}
async function handleJob(message:any,env:Env){
 const jobId=String(message.body?.jobId||'');if(!/^[a-z0-9-]{36}$/i.test(jobId))throw new Error('invalid job id');
 const now=Math.floor(Date.now()/1000);
 const job=await env.DB.prepare("SELECT id,job_type,payload_json,attempts FROM queue_jobs WHERE id=? AND status='pending' AND available_at<=?").bind(jobId,now).first<any>();
 if(!job)return;
 const claim=await env.DB.prepare("UPDATE queue_jobs SET status='processing',updated_at=? WHERE id=? AND status='pending' AND available_at<=?").bind(now,jobId,now).run();
 if(!Number(claim.meta?.changes||0))return; // Another queue delivery already claimed this job.
 await publishQueueStatus(env,{action:job.job_type,targetId:jobId,status:'processing'});
 try{
  const payload=JSON.parse(job.payload_json||'{}');
  if(job.job_type==='bank_sync') { await processBankSync(payload,env); await env.DB.prepare("UPDATE queue_jobs SET status='completed',updated_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),jobId).run(); await publishQueueStatus(env,{action:job.job_type,targetId:jobId,status:'completed'}); }
  else if(job.job_type==='ota_build') { await processOtaBuild(payload,env); await env.DB.prepare("UPDATE queue_jobs SET status='completed',updated_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),jobId).run(); await publishQueueStatus(env,{action:job.job_type,targetId:jobId,status:'completed'}); }
  else throw new Error(`unsupported job type: ${job.job_type}`);
 }catch(error){
  const attempts=Number(job.attempts||0)+1;const messageText=String((error as Error)?.message||'job failed').slice(0,500);const now=Math.floor(Date.now()/1000);
  if(attempts>=MAX_ATTEMPTS||!isRetryable(error)){
   await env.DB.batch([
    env.DB.prepare("UPDATE queue_jobs SET status='dead_letter',attempts=?,last_error=?,updated_at=? WHERE id=?").bind(attempts,messageText,now,jobId),
    env.DB.prepare('INSERT OR IGNORE INTO dead_letter_jobs(job_id,job_type,payload_json,attempts,error_message,failed_at) VALUES(?,?,?,?,?,?)').bind(jobId,job.job_type,job.payload_json,attempts,messageText,now),
   ]);
   console.error('job_moved_to_dead_letter',{jobId,jobType:job.job_type,attempts});
   await publishQueueStatus(env,{action:job.job_type,targetId:jobId,status:'dead_letter'});
   return; // Persisted in D1 DLQ; acknowledge the current queue message.
  }
  if(!env.JOBS) throw error;
  await env.DB.prepare("UPDATE queue_jobs SET status='pending',attempts=?,last_error=?,available_at=?,updated_at=? WHERE id=?").bind(attempts,messageText,now+retryDelaySeconds(attempts),now,jobId).run();
  await env.JOBS.send({jobId},{delaySeconds:retryDelaySeconds(attempts)});
  await publishQueueStatus(env,{action:job.job_type,targetId:jobId,status:'retry'});
  // Internal retry is now enqueued; return normally so Cloudflare does not also retry this message.
 }
}
export default {
 async queue(batch:MessageBatch<any>,env:Env){for(const message of batch.messages){try{await handleJob(message,env);message.ack();}catch(error){console.error('queue_job_failed',{error:(error as Error)?.message||'unknown'});message.retry();}}},
 async fetch(request:Request,env:Env){const url=new URL(request.url);if(url.pathname==='/health')return Response.json({ok:true,service:'hendy-queue-processor'});return Response.json({error:'not_found'},{status:404});}
};
