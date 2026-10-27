import { sendMessage } from '../../../telegram-bot/src/utils/telegram-api';
interface Env { DB:D1Database; BOT_TOKEN:string; JOBS?:Queue }
export async function processBroadcast(job:any, env:Env, jobId:string) {
 const payload=JSON.parse(job.payload_json||'{}'); const cursor=Number(payload.cursor||0);
 const {results}=await env.DB.prepare('SELECT id,telegram_id FROM users WHERE is_banned=0 AND id>? ORDER BY id LIMIT 10').bind(cursor).all<any>();
 let last=cursor; let sent=0; let failed=0;
 for(const user of results){last=user.id;try{await sendMessage(env,user.telegram_id,`<b>${String(payload.title||'Thông báo').replace(/[&<>]/g,'')}</b>\n${String(payload.body||'').replace(/[&<>]/g,'')}`);sent++;}catch(error){failed++;console.warn('broadcast_delivery_failed',{userId:user.id,error:(error as Error)?.message||'unknown'});}}
 if(results.length===10){
  if(!env.JOBS) throw new Error('Queue binding JOBS is required to continue a broadcast');
  await env.DB.prepare("UPDATE queue_jobs SET payload_json=?,status='pending',updated_at=? WHERE id=?").bind(JSON.stringify({...payload,cursor:last}),Math.floor(Date.now()/1000),jobId).run();
  await env.JOBS.send({jobId});
  return {sent,failed,continued:true};
 }
 await env.DB.prepare("UPDATE queue_jobs SET status='completed',updated_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),jobId).run();
 return {sent,failed,continued:false};
}
