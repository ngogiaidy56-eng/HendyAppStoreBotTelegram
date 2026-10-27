export async function telegramCall(env, method, payload) {
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(`Telegram API ${method} failed (${response.status})`);
  return data.result;
}

export async function sendMessage(env, chatId, text, replyMarkup = undefined) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall(env, 'sendMessage', payload);
}
