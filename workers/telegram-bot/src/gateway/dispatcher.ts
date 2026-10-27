import { sendMessage, escapeHtml } from '../utils/telegram-api';
import { isAdmin } from './auth-guard';
import { isMaintenanceEnabled } from './maintenance-check';
import { referralMessage } from '../modules/referral-module';
import { menuKeyboard } from '../modules/menu-module';
interface Env { BOT_TOKEN:string; BOT_USERNAME?:string; APP_URL:string; ADMIN_URL:string; ADMIN_TELEGRAM_IDS?:string; DB:D1Database; BOT_WEBHOOK_SECRET?:string }
export async function dispatch(update:any, env:Env) {
  const msg=update?.message; if(!msg?.chat?.id || !msg?.from || msg.chat.type!=='private') return;
  const text=String(msg.text||'').trim(); const userId=String(msg.from.id); const chatId=msg.chat.id;
  const start=text.match(/^\/start(?:\s+(.+))?$/);
  if(start) {
    const payload=start[1]||'';
    const ref=payload.match(/^ref_(\d{1,24})$/);
    const now=Math.floor(Date.now()/1000);
    // Register every /start user, not only referrals, so bot and Mini App share one user record.
    await env.DB.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,language_code,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,language_code=excluded.language_code,updated_at=excluded.updated_at`)
      .bind(userId,msg.from.username||null,msg.from.first_name||'',msg.from.last_name||'',msg.from.language_code||null,now,now).run();
    if(ref && ref[1]!==userId) {
      const referred=await env.DB.prepare('SELECT id FROM users WHERE telegram_id=?').bind(userId).first<any>();
      const owner=await env.DB.prepare('SELECT id FROM users WHERE telegram_id=?').bind(ref[1]).first<any>();
      if(referred && owner) {
        const config=await env.DB.prepare("SELECT value_json FROM bot_configs WHERE config_key='referral_reward_vnd'").first<any>();
        let reward=2000;try{if(config)reward=Number(JSON.parse(config.value_json));}catch{reward=2000;}
        reward=Math.max(0,Math.min(Number.isSafeInteger(reward)?reward:2000,1000000));
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO referrals(referrer_user_id,referred_user_id,reward_vnd,created_at) VALUES(?,?,?,?)').bind(owner.id,referred.id,reward,now),
          env.DB.prepare('UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND changes()=1').bind(reward,owner.id),
          env.DB.prepare('UPDATE referrals SET rewarded_at=? WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at IS NULL AND changes()=1').bind(now,owner.id,referred.id),
          env.DB.prepare("INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at) SELECT ?, 'referral', ?, ?, 'Thưởng giới thiệu bạn mới', ? WHERE EXISTS(SELECT 1 FROM referrals WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at=?)").bind(owner.id,reward,`REFERRAL:${owner.id}:${referred.id}`,now,owner.id,referred.id,now)
        ]);
      }
    }
    if(await isMaintenanceEnabled(env) && !isAdmin(userId,env)) { await sendMessage(env,chatId,'Hệ thống đang bảo trì. Vui lòng thử lại sau.'); return; }
    const name=escapeHtml(msg.from.first_name||'bạn');
    await sendMessage(env,chatId,`Xin chào <b>${name}</b>! Mở Hendy Store để mua code, quản lý ví, điểm danh và nhận thông báo.`,menuKeyboard(env.APP_URL)); return;
  }
  if(text==='/referral') { await sendMessage(env,chatId,await referralMessage(env,userId)); return; }
  if(text==='/balance' || text==='💰 Số dư') { const row=await env.DB.prepare('SELECT balance_vnd FROM users WHERE telegram_id=?').bind(userId).first<any>(); await sendMessage(env,chatId,`Số dư hiện tại: <b>${new Intl.NumberFormat('vi-VN').format(row?.balance_vnd||0)} VNĐ</b>.`);return; }
  if(text==='/admin') { if(!isAdmin(userId,env)){await sendMessage(env,chatId,'Tài khoản không có quyền quản trị.');return;}await sendMessage(env,chatId,'Mở Admin Studio:',{inline_keyboard:[[{text:'Admin Studio',web_app:{url:env.ADMIN_URL}}]]});return; }
  if(await isMaintenanceEnabled(env) && !isAdmin(userId,env)) { await sendMessage(env,chatId,'Hệ thống đang bảo trì. Vui lòng thử lại sau.'); return; }
  if(text==='/shop'||text==='🛍 Mở cửa hàng'){await sendMessage(env,chatId,'Mở Mini App:',{inline_keyboard:[[{text:'Mở Hendy Store',web_app:{url:env.APP_URL}}]]});return;}
  if(text==='/help'||text==='❓ Trợ giúp'){await sendMessage(env,chatId,'/start — menu\n/shop — cửa hàng\n/balance — số dư\n/referral — mời bạn bè\n/admin — quản trị');}
}
