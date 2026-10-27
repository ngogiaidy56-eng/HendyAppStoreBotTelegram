import { sendMessage } from '../utils/telegram-api';
export async function referralMessage(env:{BOT_USERNAME?:string;DB:D1Database;BOT_TOKEN:string}, telegramId:string) {
 const bot=String(env.BOT_USERNAME||'').replace(/^@/,''); if(!bot) return 'Tính năng giới thiệu chưa được cấu hình.';
 const row=await env.DB.prepare('SELECT COUNT(*) AS total FROM referrals r JOIN users u ON u.id=r.referrer_user_id WHERE u.telegram_id=?').bind(telegramId).first<any>();
 return `Liên kết mời của bạn:\nhttps://t.me/${bot}?start=ref_${telegramId}\nLượt giới thiệu: ${row?.total||0}`;
}
export async function sendReferralInfo(env:any,chatId:string|number,telegramId:string){return sendMessage(env,chatId,await referralMessage(env,telegramId));}
