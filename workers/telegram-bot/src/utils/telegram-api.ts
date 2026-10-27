export async function sendMessage(env: {BOT_TOKEN:string}, chatId: string|number, text: string, replyMarkup?: unknown) {
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',...(replyMarkup?{reply_markup:replyMarkup}:{})})});
  const data = await response.json() as {ok?:boolean;description?:string};
  if (!response.ok || !data.ok) throw new Error(`Telegram API error: ${data.description || response.status}`);
  return data;
}
export function escapeHtml(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
